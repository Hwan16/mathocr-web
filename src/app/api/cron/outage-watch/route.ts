import { NextRequest, NextResponse } from "next/server";
import { sendAdminAlert } from "@/lib/admin-alert";
import {
  aggregateAffected,
  buildRecoveredAlert,
  outageNoticeEligibility,
} from "@/lib/provider-outage";
import {
  clearProviderOutage,
  fetchStoppedConversionLogs,
  getProviderOutage,
} from "@/lib/provider-outage-store";

// 제공사(Claude) 장애 복구 확인 cron — vercel.json 에서 10분마다 (D-059, 2026-11-14).
//
// 장애 기록(provider-outage-store)이 있을 때만 Claude 에 아주 짧은 확인 요청을 보낸다
// (평소엔 Redis 조회 1번으로 끝 — 비용 0). 5.5 또는 4.6 중 하나라도 답하면 변환이 다시
// 되는 상태(서버가 5.5 → 4.6 으로 넘겨 쓰므로)라 기록을 지우고, 회원 변환이 실제로
// 멈췄던 장애면 관리자에게 "정상화 확인" 메일을 보낸다. 회원 메일은 여기서 보내지 않는다 —
// 대상 확인 후 사용자 승인을 받아 /api/admin/outage-notice 로 보낸다.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROBE_MODELS = ["claude-sonnet-5-5", "claude-sonnet-4-6"] as const;
const PROBE_TIMEOUT_MS = 20_000;

async function probeClaude(
  apiKey: string
): Promise<{ ok: true; model: string } | { ok: false; failures: string[] }> {
  const failures: string[] = [];
  for (const model of PROBE_MODELS) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        // 입력·출력 합쳐 수십 토큰 — 1회 1원 미만
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply with: ok" }],
        }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok) return { ok: true, model };
      const body = (await res.json().catch(() => ({}))) as { error?: { type?: string } };
      failures.push(`${model} http_${res.status}${body.error?.type ? `:${body.error.type}` : ""}`);
    } catch (error) {
      failures.push(`${model} ${error instanceof Error ? error.name : "error"}`);
    }
  }
  return { ok: false, failures };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const outage = await getProviderOutage();
  if (!outage) return NextResponse.json({ active: false });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });
  }

  const probe = await probeClaude(apiKey);
  if (!probe.ok) {
    console.warn("[outage-watch] still down", { since: outage.since, failures: probe.failures });
    return NextResponse.json({ active: true, recovered: false, since: outage.since, failures: probe.failures });
  }

  const recoveredAt = new Date();
  // 확인 요청을 기다리는 사이 회원 중단 보고가 와서 '알림 대상'으로 바뀌었을 수 있다 —
  // 지우기 직전에 다시 읽는다(Codex 검토 반영).
  const latest = (await getProviderOutage()) ?? outage;

  let affected = 0;
  let eligible = 0;
  let truncated = false;
  if (latest.alerted) {
    const result = await fetchStoppedConversionLogs(latest.since, recoveredAt.toISOString());
    if (result.error) console.error("[outage-watch] error_logs query failed", { error: result.error });
    truncated = result.truncated;
    const members = aggregateAffected(result.rows);
    affected = members.length;
    eligible = members.filter((m) => outageNoticeEligibility(m, false).eligible).length;
    const { subject, html } = buildRecoveredAlert({
      since: latest.since,
      recoveredAt,
      probeModel: probe.model,
      affected,
      eligible,
      truncated,
    });
    // 메일이 실패하면 기록을 남겨 두고 다음 실행(10분 뒤)에 다시 확인·발송한다
    if (!(await sendAdminAlert(subject, html))) {
      console.error("[outage-watch] recovered but admin alert failed — will retry", { since: latest.since });
      return NextResponse.json({ active: true, recovered: true, alert_failed: true, since: latest.since });
    }
  }
  await clearProviderOutage();

  console.info("[outage-watch] recovered", {
    since: latest.since,
    model: probe.model,
    alerted: latest.alerted,
    affected,
    eligible,
    truncated,
  });
  return NextResponse.json({
    active: false,
    recovered: true,
    since: latest.since,
    model: probe.model,
    alerted: latest.alerted,
    affected,
    eligible,
    truncated,
  });
}
