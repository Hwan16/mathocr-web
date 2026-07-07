import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_DAYS = [7, 30, 90];
// Mathpix 이미지 OCR 단가(USD/건). 요금제 변경 시 env로 조정.
const DEFAULT_MATHPIX_UNIT_USD = 0.002;

// 두 API 모두 UTC 자정 기준 일자 버킷을 반환한다 (KST 기준 오전 9시 경계).
function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

// Anthropic Usage & Cost Admin API — 일자별 비용(USD 센트) 집계
async function fetchClaudeDailyCents(
  adminKey: string,
  startingAt: string,
  endingAt: string
): Promise<Map<string, number>> {
  const daily = new Map<string, number>();
  let page: string | null = null;

  for (let i = 0; i < 6; i++) {
    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    url.searchParams.set("starting_at", startingAt);
    url.searchParams.set("ending_at", endingAt);
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "31");
    if (page) url.searchParams.set("page", page);

    const res = await fetch(url, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) {
      // Anthropic이 준 실제 사유를 그대로 노출 (본문에 키는 포함되지 않음).
      const raw = await res.text();
      let detail = "";
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.error?.type || "";
      } catch {
        detail = raw.slice(0, 200);
      }
      console.error(
        `[admin/stats/ai] cost_report failed: HTTP ${res.status} ${detail}`
      );
      // 흔한 원인: 일반 API 키(sk-ant-api...)를 넣은 경우 → Admin 키 안내 추가
      const hint =
        res.status === 401 || res.status === 403
          ? " (Admin 키가 맞는지 확인 — sk-ant-admin01-로 시작해야 함)"
          : "";
      throw new Error(
        `Anthropic cost_report 오류 (HTTP ${res.status})${
          detail ? ` — ${detail}` : ""
        }${hint}`
      );
    }

    const body = await res.json();
    for (const bucket of body.data ?? []) {
      const key = utcDayKey(String(bucket.starting_at ?? ""));
      let cents = 0;
      for (const item of bucket.results ?? []) {
        // amount는 최소 화폐단위(센트)의 십진 문자열
        cents += parseFloat(item.amount ?? "0") || 0;
      }
      daily.set(key, (daily.get(key) ?? 0) + cents);
    }

    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }

  return daily;
}

// Mathpix ocr-usage — 일자별 요청 수 집계
async function fetchMathpixDailyCounts(
  appId: string,
  appKey: string,
  fromDate: string,
  toDate: string
): Promise<Map<string, number>> {
  const url = new URL("https://api.mathpix.com/v3/ocr-usage");
  url.searchParams.set("from_date", fromDate);
  url.searchParams.set("to_date", toDate);
  url.searchParams.set("group_by", "usage_type");
  url.searchParams.set("timespan", "day");

  const res = await fetch(url, { headers: { app_id: appId, app_key: appKey } });
  if (!res.ok) {
    throw new Error(`Mathpix ocr-usage 오류 (HTTP ${res.status})`);
  }

  const body = await res.json();
  const daily = new Map<string, number>();
  for (const record of body.ocr_usage ?? []) {
    const key = utcDayKey(String(record.from_date ?? ""));
    daily.set(key, (daily.get(key) ?? 0) + (Number(record.count) || 0));
  }
  return daily;
}

// 관리자: AI 서비스(Claude·Mathpix) 사용량/비용 대시보드 데이터
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const daysParam = parseInt(request.nextUrl.searchParams.get("days") ?? "30");
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;

  const now = new Date();
  const todayUtcStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const rangeStartMs = todayUtcStartMs - (days - 1) * DAY_MS;
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  // 조회 시작점: 기간 시작과 이번 달 1일 중 더 이른 쪽 (월 누적 계산용)
  const fetchStartMs = Math.min(rangeStartMs, monthStartMs);
  const fetchStartIso = new Date(fetchStartMs).toISOString();
  const endIso = now.toISOString();

  const rangeStartKey = utcDayKey(new Date(rangeStartMs).toISOString());
  const monthStartKey = utcDayKey(new Date(monthStartMs).toISOString());

  // ── Claude (Anthropic Cost API — Admin 키 필요) ──
  const anthropicAdminKey = process.env.ANTHROPIC_ADMIN_KEY;
  let claude:
    | { configured: false }
    | { configured: true; error: string }
    | {
        configured: true;
        daily: { date: string; usd: number }[];
        month_to_date_usd: number;
      };

  if (!anthropicAdminKey) {
    claude = { configured: false };
  } else {
    try {
      const centsByDay = await fetchClaudeDailyCents(
        anthropicAdminKey,
        fetchStartIso,
        endIso
      );
      const daily: { date: string; usd: number }[] = [];
      let monthCents = 0;
      for (const [date, cents] of centsByDay) {
        if (date >= rangeStartKey) daily.push({ date, usd: cents / 100 });
        if (date >= monthStartKey) monthCents += cents;
      }
      daily.sort((a, b) => a.date.localeCompare(b.date));
      claude = { configured: true, daily, month_to_date_usd: monthCents / 100 };
    } catch (error) {
      claude = {
        configured: true,
        error: error instanceof Error ? error.message : "조회 실패",
      };
    }
  }

  // ── Mathpix (기존 서버 키 재사용) ──
  const mathpixAppId = process.env.MATHPIX_APP_ID;
  const mathpixAppKey = process.env.MATHPIX_APP_KEY;
  const unitUsd =
    parseFloat(process.env.MATHPIX_COST_PER_REQUEST ?? "") || DEFAULT_MATHPIX_UNIT_USD;

  let mathpix:
    | { configured: false }
    | { configured: true; error: string }
    | {
        configured: true;
        unit_usd: number;
        daily: { date: string; count: number; est_usd: number }[];
        month_to_date_count: number;
        month_to_date_est_usd: number;
      };

  if (!mathpixAppId || !mathpixAppKey) {
    mathpix = { configured: false };
  } else {
    try {
      const countsByDay = await fetchMathpixDailyCounts(
        mathpixAppId,
        mathpixAppKey,
        fetchStartIso,
        endIso
      );
      const daily: { date: string; count: number; est_usd: number }[] = [];
      let monthCount = 0;
      for (const [date, count] of countsByDay) {
        if (date >= rangeStartKey) {
          daily.push({ date, count, est_usd: count * unitUsd });
        }
        if (date >= monthStartKey) monthCount += count;
      }
      daily.sort((a, b) => a.date.localeCompare(b.date));
      mathpix = {
        configured: true,
        unit_usd: unitUsd,
        daily,
        month_to_date_count: monthCount,
        month_to_date_est_usd: monthCount * unitUsd,
      };
    } catch (error) {
      mathpix = {
        configured: true,
        error: error instanceof Error ? error.message : "조회 실패",
      };
    }
  }

  return NextResponse.json({
    days,
    month: new Date(monthStartMs).toISOString().slice(0, 7),
    claude,
    mathpix,
  });
}
