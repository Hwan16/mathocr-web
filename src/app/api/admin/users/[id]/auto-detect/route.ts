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

// 관리자: 특정 사용자의 자동 인식 사용 이력 — 유저 상세 보기(CS)용.
// 행 1건 = 페이지 1장 분석 (0023_auto_detect_usage). 일자별 묶음 표시는
// 관리자 브라우저 시간대 기준이어야 해서 클라이언트에서 집계한다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  // 기본 200행 = 자동 인식 풀 실행(20페이지) 10회분 — CS 확인용으로 충분
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 200, 1, 500);

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("auto_detect_usage")
    .select("id, problem_count, figure_count, created_at")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin/users/auto-detect:GET] query failed", error);
    return NextResponse.json(
      { error: "자동 인식 사용 이력을 불러오지 못했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ usage: data ?? [] });
}
