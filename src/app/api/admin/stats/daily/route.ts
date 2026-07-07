import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
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

// 일자 경계는 한국시간(KST, UTC+9·서머타임 없음) 기준으로 묶는다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_DAYS = [7, 30, 90];

function kstDateKey(createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

// Supabase(PostgREST)는 한 번에 최대 1000행만 반환하므로 range로 나눠 모두 읽는다.
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[] | null> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await query(page * pageSize, (page + 1) * pageSize - 1);
    if (error) return null;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

interface PurchaseBreakdown {
  total: number;
  starter: number;
  basic: number;
  pro: number;
  other: number;
}

interface DailyRow {
  date: string;
  signups: number;
  conversions: number;
  credits_used: number;
  revenue: number;
  purchases: PurchaseBreakdown;
}

// 관리자: 일자별 지표 (신규가입 / 구매(플랜별) / 변환·크레딧 사용)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const daysParam = parseInt(request.nextUrl.searchParams.get("days") ?? "30");
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;

  // 오늘(KST) 자정 기준으로 days일 전부터 조회
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const kstTodayStartMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
    KST_OFFSET_MS;
  const startMs = kstTodayStartMs - (days - 1) * DAY_MS;
  const startIso = new Date(startMs).toISOString();

  const adminClient = createAdminClient();

  const [signupRows, paymentRows, conversionRows] = await Promise.all([
    fetchAllRows<{ created_at: string }>((from, to) =>
      adminClient
        .from("profiles")
        .select("created_at")
        .gte("created_at", startIso)
        .order("created_at")
        .range(from, to)
    ),
    fetchAllRows<{ created_at: string; amount: number }>((from, to) =>
      adminClient
        .from("payments")
        .select("created_at, amount")
        .eq("status", "completed")
        .gt("amount", 0) // 프로모션·신고보상(amount=0)은 구매가 아님
        .gte("created_at", startIso)
        .order("created_at")
        .range(from, to)
    ),
    fetchAllRows<{ created_at: string; credits_used: number; refunded_credits: number }>(
      (from, to) =>
        adminClient
          .from("conversions")
          .select("created_at, credits_used, refunded_credits")
          .gte("created_at", startIso)
          .order("created_at")
          .range(from, to)
    ),
  ]);

  if (!signupRows || !paymentRows || !conversionRows) {
    return NextResponse.json({ error: "일자별 통계 조회 실패" }, { status: 500 });
  }

  // 기간 내 모든 날짜를 0으로 초기화 (빈 날도 차트에 표시)
  const byDate = new Map<string, DailyRow>();
  for (let i = 0; i < days; i++) {
    const key = new Date(startMs + i * DAY_MS + KST_OFFSET_MS).toISOString().slice(0, 10);
    byDate.set(key, {
      date: key,
      signups: 0,
      conversions: 0,
      credits_used: 0,
      revenue: 0,
      purchases: { total: 0, starter: 0, basic: 0, pro: 0, other: 0 },
    });
  }

  for (const row of signupRows) {
    const day = byDate.get(kstDateKey(row.created_at));
    if (day) day.signups += 1;
  }

  // 플랜 구분은 결제 금액으로 판별 (payments에 플랜 컬럼이 없음)
  const planIdByPrice = new Map<number, "starter" | "basic" | "pro">(
    PLANS.map((p) => [p.price, p.id])
  );
  for (const row of paymentRows) {
    const day = byDate.get(kstDateKey(row.created_at));
    if (!day) continue;
    day.revenue += row.amount;
    day.purchases.total += 1;
    const planId = planIdByPrice.get(row.amount);
    day.purchases[planId ?? "other"] += 1;
  }

  for (const row of conversionRows) {
    const day = byDate.get(kstDateKey(row.created_at));
    if (!day) continue;
    day.conversions += 1;
    // 실사용 크레딧 = 차감분 - 환불분 (실패·부분실패 환불 반영)
    day.credits_used += Math.max(0, row.credits_used - row.refunded_credits);
  }

  return NextResponse.json({ days, daily: Array.from(byDate.values()) });
}
