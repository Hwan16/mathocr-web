import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

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

// 관리자: 통계 대시보드 데이터
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const adminClient = createAdminClient();

  const [usersResult, conversionsResult, errorsResult, paymentsResult] =
    await Promise.all([
      adminClient
        .from("profiles")
        .select("*", { count: "exact", head: true }),
      adminClient
        .from("conversions")
        .select("status, problem_count, credits_used, created_at"),
      adminClient
        .from("error_logs")
        .select("*", { count: "exact", head: true })
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
      adminClient
        .from("payments")
        .select("amount, credits_added, status")
        .eq("status", "completed"),
    ]);

  const conversions = conversionsResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  const totalConversions = conversions.length;
  const completedConversions = conversions.filter(
    (c) => c.status === "completed"
  ).length;
  const failedConversions = conversions.filter(
    (c) => c.status === "failed"
  ).length;
  const totalProblems = conversions.reduce(
    (sum, c) => sum + c.problem_count,
    0
  );
  const successRate =
    totalConversions > 0
      ? ((completedConversions / totalConversions) * 100).toFixed(1)
      : "0.0";

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalCreditsSold = payments.reduce(
    (sum, p) => sum + p.credits_added,
    0
  );

  return NextResponse.json({
    users: { total: usersResult.count ?? 0 },
    conversions: {
      total: totalConversions,
      completed: completedConversions,
      failed: failedConversions,
      total_problems: totalProblems,
      success_rate: parseFloat(successRate),
    },
    errors: { last_7_days: errorsResult.count ?? 0 },
    revenue: {
      total: totalRevenue,
      total_credits_sold: totalCreditsSold,
    },
  });
}
