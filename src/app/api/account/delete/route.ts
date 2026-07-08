import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// 오입력·자동화 시도 방지: 계정당 10분에 5회
const DELETE_RATE_LIMIT = 5;
const DELETE_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

/**
 * 회원 탈퇴(B8). 마이페이지에서 이메일 재입력 확인 후 호출된다.
 *
 * 처리 순서(순서가 중요):
 *   1) 본인 확인 — body.confirmEmail 이 로그인 계정 이메일과 일치해야 함
 *   2) 결제 기록에 이메일 스냅샷 기록 — 전자상거래법상 5년 보존(개인정보처리방침
 *      제3조). 이 단계가 실패하면(예: 0010 마이그레이션 미적용) 계정 삭제로
 *      진행하지 않는다 → 보존 의무 기록이 유실되는 일이 없다.
 *   3) 오변환 신고 이미지(Storage 'reports' 버킷) 삭제 — DB cascade 로는
 *      Storage 객체가 지워지지 않으므로 명시적으로 제거
 *   4) auth 계정 삭제 → profiles cascade → conversions/error_logs/
 *      conversion_reports 함께 삭제, user_consents/promo_redemptions/payments 는
 *      링크만 해제(SET NULL)되고 이메일 스냅샷으로 보존
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rate = await checkRateLimit(
    `account-delete:${user.id}`,
    DELETE_RATE_LIMIT,
    DELETE_RATE_LIMIT_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "시도가 너무 잦습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: { confirmEmail?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const confirmEmail =
    typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  if (!user.email || confirmEmail !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "이메일이 일치하지 않습니다. 가입 이메일을 정확히 입력해주세요." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 관리자 계정은 셀프 탈퇴 차단 (운영 단일 계정 오삭제 방지)
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role === "admin") {
    return NextResponse.json(
      { error: "관리자 계정은 이 화면에서 탈퇴할 수 없습니다." },
      { status: 403 }
    );
  }

  // 1) 결제 기록 이메일 스냅샷 (실패 시 탈퇴 중단 — 법정 보존 기록 유실 방지)
  const { error: stampError } = await admin
    .from("payments")
    .update({ email: user.email })
    .eq("user_id", user.id);
  if (stampError) {
    console.error("[account/delete] payments email stamp failed", {
      user_id: user.id,
      error: stampError.message,
    });
    return NextResponse.json(
      { error: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  // 2) 신고 이미지 Storage 객체 삭제 (경로는 conversion_reports 행에서 수집)
  const { data: reports, error: reportsError } = await admin
    .from("conversion_reports")
    .select("original_image_path, converted_image_path")
    .eq("user_id", user.id);
  if (reportsError) {
    console.error("[account/delete] report path lookup failed", {
      user_id: user.id,
      error: reportsError.message,
    });
    return NextResponse.json(
      { error: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
  const imagePaths = (reports ?? [])
    .flatMap((r) => [r.original_image_path, r.converted_image_path])
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (imagePaths.length > 0) {
    const { error: storageError } = await admin.storage.from("reports").remove(imagePaths);
    if (storageError) {
      console.error("[account/delete] report image removal failed", {
        user_id: user.id,
        error: storageError.message,
      });
      return NextResponse.json(
        { error: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      );
    }
  }

  // 3) auth 계정 삭제 (profiles 이하 cascade)
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[account/delete] auth user deletion failed", {
      user_id: user.id,
      error: deleteError.message,
    });
    return NextResponse.json(
      { error: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  console.log("[account/delete] account deleted", { user_id: user.id });
  return NextResponse.json({ success: true });
}
