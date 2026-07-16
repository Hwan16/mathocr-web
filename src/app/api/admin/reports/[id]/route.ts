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
// 이미지 파기를 트리거하는 종결 상태. 'received'(접수)로 되돌릴 때는 파기하지
// 않는다 — 아직 검수 전일 수 있으므로. (채택은 reward 분기에서 별도 파기)
const STATUS_PURGES_IMAGES = ["reviewed", "rejected"];
const REPORT_REWARD_CREDITS = 50;

// 신고 이미지 파기 — 방침 제3조 "신고 검수 및 보상 처리가 완료되면 지체 없이
// 파기" 이행. 종결 상태 확정 후에 호출한다(파기가 먼저 실패해도 상태는 유지).
// Storage 삭제 실패 시 경로를 남겨 두어 같은 버튼 재클릭으로 재시도 가능하고,
// 회원 탈퇴 시 일괄 삭제가 최후 안전망으로 남는다.
type PurgeResult = "purged" | "none" | "failed";

async function purgeReportImages(
  adminClient: ReturnType<typeof createAdminClient>,
  reportId: string
): Promise<PurgeResult> {
  const { data: row, error } = await adminClient
    .from("conversion_reports")
    .select("original_image_path, converted_image_path")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    console.error("[admin/reports/[id]:PATCH] purge path lookup failed", {
      report_id: reportId,
      error: error.message,
    });
    return "failed";
  }

  const paths = [row?.original_image_path, row?.converted_image_path].filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  if (paths.length === 0) return "none"; // 이미 파기됐거나 이미지가 없던 신고

  const { error: rmErr } = await adminClient.storage.from("reports").remove(paths);
  if (rmErr) {
    console.error("[admin/reports/[id]:PATCH] storage purge failed", {
      report_id: reportId,
      error: rmErr.message,
    });
    return "failed";
  }

  const { error: updErr } = await adminClient
    .from("conversion_reports")
    .update({
      original_image_path: null,
      converted_image_path: null,
      images_deleted_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (updErr) {
    // 0019 마이그레이션 미적용(컬럼 없음) 등 — 파기 자체는 끝났으므로 경로만 비운다.
    const { error: fbErr } = await adminClient
      .from("conversion_reports")
      .update({ original_image_path: null, converted_image_path: null })
      .eq("id", reportId);
    if (fbErr) {
      console.error("[admin/reports/[id]:PATCH] purge path clear failed", {
        report_id: reportId,
        error: fbErr.message,
      });
      return "failed";
    }
    console.warn(
      "[admin/reports/[id]:PATCH] images_deleted_at 기록 실패(0019 미적용?) — 경로만 제거",
      updErr.message
    );
  }
  return "purged";
}

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
    const images = await purgeReportImages(adminClient, id);
    return NextResponse.json({
      success: true,
      rewarded: true,
      credits: REPORT_REWARD_CREDITS,
      new_credits: data.new_credits,
      images,
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
    const images = STATUS_PURGES_IMAGES.includes(body.status)
      ? await purgeReportImages(adminClient, id)
      : "kept";
    return NextResponse.json({ success: true, status: body.status, images });
  }

  return NextResponse.json({ error: "status 또는 reward가 필요합니다." }, { status: 400 });
}
