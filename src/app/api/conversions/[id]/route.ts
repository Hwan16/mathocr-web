import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// 변환 상태 업데이트 (완료/실패)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  const { id } = await params;

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  let status: unknown;
  let failedCount: unknown;
  try {
    ({ status, failed_count: failedCount } = await request.json());
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  if (typeof status !== "string" || !["completed", "failed"].includes(status)) {
    return NextResponse.json(
      { error: "유효하지 않은 상태입니다. (completed 또는 failed)" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // 완료 + 실패 개수가 있으면 부분 환불 경로로 처리한다.
  // (started 행 1건만 전환되므로 동시 요청에 의한 이중 환불이 불가능하다.)
  const isPartialRefund =
    status === "completed" &&
    typeof failedCount === "number" &&
    Number.isFinite(failedCount) &&
    failedCount > 0;

  const { data, error } = isPartialRefund
    ? await adminClient.rpc("complete_conversion_with_refund", {
        p_conversion_id: id,
        p_user_id: user.id,
        p_failed_count: Math.floor(failedCount as number),
      })
    : await adminClient.rpc("finalize_conversion", {
        p_conversion_id: id,
        p_user_id: user.id,
        p_status: status,
      });

  if (error) {
    console.error("[conversions:PATCH] finalize failed", error);
    return NextResponse.json(
      { error: "변환 상태를 업데이트하지 못했습니다." },
      { status: 500 }
    );
  }

  if (!data?.success) {
    // not_pending: 이미 처리됐거나(중복) 소유자 행이 아니거나 존재하지 않음
    return NextResponse.json(
      { error: "이미 처리되었거나 찾을 수 없는 변환입니다." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    status,
    refunded: data.refunded ?? 0,
  });
}
