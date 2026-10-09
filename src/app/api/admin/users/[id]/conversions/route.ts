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

// 관리자: 특정 사용자의 변환 이력 — 유저 상세 보기(CS)용
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 20, 1, 100);

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("conversions")
    .select(
      "id, pdf_name, problem_count, solution_count, ai_solution_count, ai_solution_credits, credits_used, refunded_credits, status, created_at"
    )
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin/users/conversions:GET] query failed", error);
    return NextResponse.json(
      { error: "변환 이력을 불러오지 못했습니다." },
      { status: 500 }
    );
  }

  // AI 해설 생성(v2.4.0~) 누적 — 최근 20건 표와 별개로 이 사용자의 전체 합계를 보여 준다.
  // 실패해도 이력 표는 그대로 돌려준다(합계만 생략).
  let aiSolution: { count: number; credits: number; conversions: number } | null = null;
  const { data: aiRows, error: aiError } = await adminClient
    .from("conversions")
    .select("ai_solution_count, ai_solution_credits")
    .eq("user_id", targetUserId)
    .gt("ai_solution_count", 0)
    .limit(1000);
  if (aiError) {
    console.error("[admin/users/conversions:GET] ai summary failed", aiError);
  } else {
    aiSolution = (aiRows ?? []).reduce(
      (acc, r) => ({
        count: acc.count + (r.ai_solution_count ?? 0),
        credits: acc.credits + (r.ai_solution_credits ?? 0),
        conversions: acc.conversions + 1,
      }),
      { count: 0, credits: 0, conversions: 0 }
    );
  }

  return NextResponse.json({ conversions: data ?? [], aiSolution });
}
