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
      "id, pdf_name, problem_count, solution_count, credits_used, refunded_credits, status, created_at"
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

  return NextResponse.json({ conversions: data ?? [] });
}
