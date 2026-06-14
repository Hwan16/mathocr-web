import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { clampInt } from "@/lib/pagination";
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

// 관리자: 환불 내역 조회 (부분/전액 환불된 변환). 유저별 필터 가능.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 20, 1, 100);
  const userId = searchParams.get("user_id");
  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();
  let query = adminClient
    .from("conversions")
    .select(
      "id, user_id, pdf_name, problem_count, credits_used, refunded_credits, status, created_at, profiles!inner(email)",
      { count: "exact" }
    )
    .gt("refunded_credits", 0)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq("user_id", userId);

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/refunds:GET] query failed", error);
    return NextResponse.json({ error: "반환 내역을 불러오지 못했습니다." }, { status: 500 });
  }

  const refunds = (data ?? []).map((r) => {
    // 임베드된 profiles는 타입 추론상 배열로 잡히지만 user_id→profiles는 1:1이라
    // 런타임에는 단일 객체다.
    const profile = r.profiles as unknown as { email: string | null } | null;
    return {
      id: r.id,
      user_id: r.user_id,
      email: profile?.email ?? null,
      pdf_name: r.pdf_name,
      problem_count: r.problem_count,
      credits_used: r.credits_used,
      refunded_credits: r.refunded_credits,
      status: r.status,
      created_at: r.created_at,
    };
  });

  return NextResponse.json({ refunds, total: count, page, limit });
}
