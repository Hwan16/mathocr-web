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

// 'accepted'는 일반 상태변경으로 만들 수 없다. 채택은 reward_report() 경로(아래
// reward 분기)로만 일어나며 그때 보상이 함께 지급된다. (DB 0003 제약과 이중 방어)
const STATUS_VIA_PATCH = ["received", "reviewed", "rejected"];
const REPORT_REWARD_CREDITS = 50;

// 관리자: 신고 상태 변경 또는 채택 보상(50크레딧) 지급
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // 1) 채택 보상: 신고자에게 50크레딧 지급 (원자적 + 중복 지급 방지)
  if (body.reward === true) {
    const { data, error } = await adminClient.rpc("reward_report", {
      p_report_id: id,
      p_credits: REPORT_REWARD_CREDITS,
    });

    if (error) {
      console.error("[admin/reports/[id]:PATCH] reward_report failed", error);
      return NextResponse.json({ error: "보상 지급에 실패했습니다." }, { status: 500 });
    }
    if (!data?.success) {
      return NextResponse.json(
        { error: "이미 보상이 지급되었거나 신고를 찾을 수 없습니다." },
        { status: 409 }
      );
    }
    return NextResponse.json({
      success: true,
      rewarded: true,
      credits: REPORT_REWARD_CREDITS,
      new_credits: data.new_credits,
    });
  }

  // 2) 상태 변경 (접수/확인/반려). '채택'은 위 reward 분기로만.
  if (typeof body.status === "string") {
    if (body.status === "accepted") {
      return NextResponse.json(
        { error: "'채택'은 '채택 + 50크레딧 지급'으로만 처리할 수 있습니다." },
        { status: 400 }
      );
    }
    if (!STATUS_VIA_PATCH.includes(body.status)) {
      return NextResponse.json({ error: "올바르지 않은 상태값입니다." }, { status: 400 });
    }
    const { data, error } = await adminClient
      .from("conversion_reports")
      .update({ status: body.status })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/reports/[id]:PATCH] status update failed", error);
      return NextResponse.json({ error: "상태 변경에 실패했습니다." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "신고를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true, status: body.status });
  }

  return NextResponse.json({ error: "status 또는 reward가 필요합니다." }, { status: 400 });
}
