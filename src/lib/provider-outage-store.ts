// AI 제공사(Claude) 장애 상태 저장·알림 (D-059, 2026-11-14). 흐름 설명은 provider-outage.ts 맨 위.
//
// 상태는 Upstash Redis 에 둔다 — Vercel 서버리스는 인스턴스마다 메모리가 따로라
// 변환 라우트·로그 라우트·cron 이 같은 '장애 중' 표시를 보려면 공유 저장소가 필요하다.
// Redis 가 없거나 응답하지 않으면 조용히 건너뛴다(fail-open) — 장애 알림 때문에
// 변환·로그 요청이 실패하거나 느려지면 안 된다.

import { sendAdminAlert } from "@/lib/admin-alert";
import { bumpRateLimit, peekRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStoppedAlert, type OutageLogRow } from "@/lib/provider-outage";

const KEY_SINCE = "outage:claude:since";
const KEY_DETAIL = "outage:claude:detail";
const KEY_ALERTED = "outage:claude:alerted";
/** 장애 기록 자동 만료 — cron 이 멈춰도 기록이 영원히 남지 않게 */
const TTL_SEC = 7 * 24 * 60 * 60;
const REDIS_TIMEOUT_MS = 2000;
/** 회원 변환 중단 알림 묶음 간격 */
const STOPPED_ALERT_WINDOW_MS = 30 * 60 * 1000;
const STOPPED_ALERT_KEY = "alert:conversion-stopped";

type RedisResult = { result?: unknown; error?: unknown };

async function redis(commands: string[][]): Promise<RedisResult[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[provider-outage] redis http error", { status: res.status });
      return null;
    }
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as RedisResult[]) : null;
  } catch (error) {
    console.warn("[provider-outage] redis unreachable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** 제공사 장애 실패 1건 — 장애 시작 시각은 처음 한 번만 남기고(NX), 원인은 최신으로 덮어쓴다. */
export async function markProviderOutage(detail: string): Promise<void> {
  const ttl = String(TTL_SEC);
  await redis([
    ["SET", KEY_SINCE, new Date().toISOString(), "NX", "EX", ttl],
    ["SET", KEY_DETAIL, detail.slice(0, 200), "EX", ttl],
  ]);
}

export type ProviderOutageState = { since: string; detail: string | null; alerted: boolean };

export async function getProviderOutage(): Promise<ProviderOutageState | null> {
  const results = await redis([["MGET", KEY_SINCE, KEY_DETAIL, KEY_ALERTED]]);
  const values = results?.[0]?.result;
  if (!Array.isArray(values) || typeof values[0] !== "string") return null;
  return {
    since: values[0],
    detail: typeof values[1] === "string" ? values[1] : null,
    alerted: values[2] != null,
  };
}

async function markOutageAlerted(): Promise<void> {
  await redis([["SET", KEY_ALERTED, "1", "EX", String(TTL_SEC)]]);
}

export async function clearProviderOutage(): Promise<void> {
  await redis([["DEL", KEY_SINCE, KEY_DETAIL, KEY_ALERTED]]);
}

/** 앱이 AI 서비스 오류로 변환을 멈췄다고 알려 왔을 때(/api/logs) — 관리자 메일(30분에 1통). */
export async function notifyConversionStopped(input: {
  userId: string;
  conversionId: string | null;
  detail: string;
  providerOutage: boolean;
}): Promise<void> {
  let outage = await getProviderOutage();
  // 앱이 '제공사 장애'로 멈췄는데 서버 기록이 없으면(복구 확인 직후 늦게 온 보고, 기록 저장
  // 실패 등) 다시 남긴다 — cron 이 복구를 확인해 '정상화 확인' 메일이 빠지지 않게(Codex 검토).
  if (!outage && input.providerOutage) {
    await markProviderOutage("앱 보고: 제공사 장애로 변환 중단");
    outage = await getProviderOutage();
  }
  // 회원이 실제로 멈춘 장애만 '정상화 확인' 메일 대상 — 순간 오류는 조용히 지나가게
  if (outage) await markOutageAlerted();

  // 보낸 뒤에만 묶음 칸을 쓴다 — 메일 서버 실패로 30분 동안 알림이 사라지지 않게
  const gate = await peekRateLimit(STOPPED_ALERT_KEY, 1, STOPPED_ALERT_WINDOW_MS);
  if (!gate.allowed) return;

  const { subject, html } = buildStoppedAlert({
    at: new Date(),
    detail: input.detail,
    providerOutage: input.providerOutage,
    outageSince: outage?.since ?? null,
    outageDetail: outage?.detail ?? null,
    userId: input.userId,
    conversionId: input.conversionId,
  });
  if (await sendAdminAlert(subject, html)) {
    await bumpRateLimit(STOPPED_ALERT_KEY, STOPPED_ALERT_WINDOW_MS);
  }
}

const STOPPED_LOG_LIMIT = 5000;

/** since(포함)~until 사이 AI 서비스 오류로 멈춘 변환 기록.
 *  truncated=true 면 상한에 걸려 일부만 읽힌 것 — 회원 메일 발송은 멈춰야 한다. */
export async function fetchStoppedConversionLogs(
  since: string,
  until?: string
): Promise<{ rows: OutageLogRow[]; error: string | null; truncated: boolean }> {
  let query = createAdminClient()
    .from("error_logs")
    .select("user_id, conversion_id, created_at, metadata")
    .eq("error_type", "conversion_error")
    .eq("metadata->>category", "ai_service_down")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(STOPPED_LOG_LIMIT);
  if (until) query = query.lte("created_at", until);
  const { data, error } = await query;
  if (error) return { rows: [], error: error.message, truncated: false };
  const rows = (data ?? []) as OutageLogRow[];
  return { rows, error: null, truncated: rows.length >= STOPPED_LOG_LIMIT };
}
