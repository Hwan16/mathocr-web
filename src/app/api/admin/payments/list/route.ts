import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { clampInt } from "@/lib/pagination";
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

// 결제 금액 → 플랜 이름. payments에 플랜 칼럼이 없어 금액으로 역판별한다
// (통계 탭의 planIdByPrice와 같은 방식). 가격 개편 이전 결제는 매칭되지 않으므로
// 그때는 플랜명 없이 금액만 보여준다.
const PLAN_NAME_BY_PRICE = new Map<number, string>(
  PLANS.map((p) => [p.price, p.name])
);

// payments는 "결제"만이 아니라 크레딧 증감 이력 전체가 적재되는 테이블이다.
// 거래 ID 접두사로 무엇 때문에 생긴 행인지 구분한다.
//   promo_         → 프로모션 지급 (0008/0011/0013/0022 — 얼리버드·만료 재지급 포함)
//   admin_grant_   → 관리자 화면 수동 지급 (api/admin/users/[id]/credits)
//   admin_recover_ → 관리자 회수. credits_added가 음수인 유일한 케이스로,
//                    2026-07-16 어뷰징 대응 때 SQL로 직접 넣은 기록이다(코드 경로 없음).
//   report_reward_ → 변환 리포트 보상 (0002)
//   grant_         → 거래 ID 없이 호출된 grant_plan_credits (schema.sql 폴백)
//   그 외 + 금액>0  → 나이스 카드 결제 (거래 ID = PG tid)
function classify(txId: string | null, amount: number) {
  if (txId?.startsWith("promo_")) return "promo" as const;
  if (txId?.startsWith("admin_grant_")) return "admin_grant" as const;
  if (txId?.startsWith("admin_recover_")) return "admin_recover" as const;
  if (txId?.startsWith("report_reward_")) return "report_reward" as const;
  if (amount > 0) return "purchase" as const;
  if (txId?.startsWith("grant_")) return "manual_grant" as const;
  return "other" as const;
}

// 매출 합계용 스캔 설정.
// ⚠️ PostgREST는 range를 아무리 크게 줘도 한 응답에 최대 1000행만 돌려준다.
//    한 방에 .range(0, 9999)로 훑으면 1000행에서 조용히 잘려 합계가 틀린다.
//    그래서 1000행씩 나눠 읽고, 상한에 걸리면 revenue_truncated로 알린다
//    (통계 탭 daily 라우트의 fetchAllRows와 같은 이유·같은 방식).
const REVENUE_PAGE_SIZE = 1000;
const REVENUE_MAX_PAGES = 50; // 안전 상한 = 50,000행

// 관리자: 결제 내역 전체 목록 (최신순).
// 기본은 실제 카드 결제(amount > 0)만 — include=all이면 0원 무료 지급까지 포함한다.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 200);
  const includeFree = searchParams.get("include") === "all";
  const userId = searchParams.get("user_id");
  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();

  let query = adminClient
    .from("payments")
    .select(
      "id, user_id, email, amount, credits_added, pg_transaction_id, status, created_at, profiles(email)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // 탈퇴 회원 행(user_id = null)도 남아야 하므로 profiles는 inner join하지 않는다.
  if (!includeFree) query = query.gt("amount", 0);
  if (userId) query = query.eq("user_id", userId);

  // 매출 합계는 목록 필터(페이지·무료 포함 여부)와 무관하게 실결제 전체 기준.
  // 집계 조건은 통계 탭(stats/daily)과 반드시 같아야 한다 — status='completed' +
  // amount>0. 환불(status='refunded') 건을 여기서만 더하면 두 탭의 매출이 어긋난다.
  // 목록에는 환불 건도 배지와 함께 그대로 보여준다(내역이므로 감추지 않는다).
  async function sumRevenue(): Promise<
    { revenue: number; truncated: boolean } | null
  > {
    let revenue = 0;
    for (let p = 0; p < REVENUE_MAX_PAGES; p++) {
      let q = adminClient
        .from("payments")
        .select("amount")
        .eq("status", "completed")
        .gt("amount", 0)
        .range(p * REVENUE_PAGE_SIZE, (p + 1) * REVENUE_PAGE_SIZE - 1);
      if (userId) q = q.eq("user_id", userId);

      const { data, error } = await q;
      if (error) {
        console.error("[admin/payments/list:GET] revenue query failed", error);
        return null;
      }
      const batch = data ?? [];
      revenue += batch.reduce((sum, r) => sum + (r.amount ?? 0), 0);
      if (batch.length < REVENUE_PAGE_SIZE) return { revenue, truncated: false };
    }
    // 상한까지 꽉 채워 읽었다 = 더 있을 수 있다. 조용히 자르지 않고 알린다.
    return { revenue, truncated: true };
  }

  const [listResult, revenueSum] = await Promise.all([query, sumRevenue()]);

  if (listResult.error) {
    console.error("[admin/payments/list:GET] query failed", listResult.error);
    return NextResponse.json(
      { error: "결제 내역을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
  if (!revenueSum) {
    return NextResponse.json(
      { error: "결제 내역을 불러오지 못했습니다." },
      { status: 500 }
    );
  }

  const payments = (listResult.data ?? []).map((p) => {
    // 임베드된 profiles는 타입 추론상 배열로 잡히지만 user_id→profiles는 1:1이라
    // 런타임에는 단일 객체다. 탈퇴 회원은 user_id가 null이라 여기도 null이며,
    // 그때는 탈퇴 API가 남긴 email 스냅샷(0010)으로 식별한다.
    const profile = p.profiles as unknown as { email: string | null } | null;
    return {
      id: p.id,
      user_id: p.user_id,
      email: profile?.email ?? p.email ?? null,
      // 탈퇴한 회원의 결제인지 UI가 구분해 표기하도록 별도 플래그로 내린다.
      withdrawn: p.user_id === null,
      amount: p.amount,
      credits_added: p.credits_added,
      plan_name: PLAN_NAME_BY_PRICE.get(p.amount) ?? null,
      kind: classify(p.pg_transaction_id, p.amount),
      pg_transaction_id: p.pg_transaction_id,
      status: p.status,
      created_at: p.created_at,
    };
  });

  return NextResponse.json({
    payments,
    total: listResult.count ?? 0,
    revenue: revenueSum.revenue,
    revenue_truncated: revenueSum.truncated,
    page,
    limit,
  });
}
