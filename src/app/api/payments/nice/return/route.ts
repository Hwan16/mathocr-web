import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";
import { isPaymentsKilled } from "@/lib/service-flags";
import {
  approvePayment,
  nicepayConfigured,
  verifyAuthSignature,
} from "@/lib/nicepay";

// 나이스페이 결제창(Server 승인) returnUrl — 인증 완료 후 브라우저가 POST로 돌아온다.
//
// 흐름: 서명 검증 → 주문 파싱 → 금액 검증(플랜에서 재계산) → 승인 API → 크레딧 지급(멱등)
//       → 결과 페이지로 303 리다이렉트.
//
// 세션에 의존하지 않는다: 지급 대상은 orderId에 인코딩된 userId로 결정한다(웹훅과 동일).
// 브라우저 최상위 내비게이션 응답이므로 실패도 JSON이 아니라 fail 페이지로 보낸다.
// 지급 단계에서 일시 오류가 나도 웹훅(승인 통보)이 안전망으로 재지급을 시도한다.

function redirectTo(
  request: NextRequest,
  path: string,
  params: Record<string, string>
): NextResponse {
  const url = new URL(path, request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

function fail(request: NextRequest, message: string, code?: string) {
  return redirectTo(request, "/charge/fail", {
    message,
    ...(code ? { code } : {}),
  });
}

export async function POST(request: NextRequest) {
  if (!nicepayConfigured()) {
    return fail(request, "결제 기능이 아직 열리지 않았습니다.");
  }

  // 결제 kill switch (LA-06): 사고 시 관리자가 즉시 신규 승인을 차단한다.
  // 승인 API 호출 전이라 여기서 막히면 카드에서 돈이 빠지지 않는다.
  if (await isPaymentsKilled()) {
    console.error("[payments/nice/return] kill switch 활성 — 승인 차단");
    return fail(
      request,
      "결제가 일시 중단되었습니다. 잠시 후 다시 시도해주세요.",
      "PAYMENTS_PAUSED"
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return fail(request, "결제 결과를 읽을 수 없습니다.");
  }
  const get = (key: string): string => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };

  const authResultCode = get("authResultCode");
  const authResultMsg = get("authResultMsg");
  const tid = get("tid");
  const orderId = get("orderId");
  const amountStr = get("amount");
  const authToken = get("authToken");
  const signature = get("signature");

  if (authResultCode !== "0000") {
    return fail(
      request,
      authResultMsg || "결제 인증에 실패했습니다.",
      authResultCode || "AUTH_FAILED"
    );
  }
  if (!tid || !orderId || !amountStr || !authToken || !signature) {
    return fail(request, "결제 정보가 누락되었습니다.");
  }
  if (!verifyAuthSignature({ authToken, amount: amountStr, signature })) {
    console.error(`[payments/nice/return] 서명 검증 실패: order=${orderId}`);
    return fail(request, "결제 정보 검증에 실패했습니다.");
  }

  const parsed = parseOrderId(orderId);
  if (!parsed) {
    return fail(request, "주문번호 형식이 올바르지 않습니다.");
  }
  if (Number(amountStr) !== parsed.plan.price) {
    console.error(
      `[payments/nice/return] 금액 불일치: order=${orderId} auth=${amountStr} expected=${parsed.plan.price}`
    );
    return fail(request, "결제 금액이 플랜 가격과 일치하지 않습니다.");
  }

  // 승인 — 금액은 플랜에서 재계산한 값을 보낸다. 인증 금액과 다르면 나이스가 거절한다.
  const payment = await approvePayment(tid, parsed.plan.price);
  if (
    !payment ||
    payment.resultCode !== "0000" ||
    payment.status !== "paid" ||
    (typeof payment.amount === "number" &&
      payment.amount !== parsed.plan.price)
  ) {
    console.error(
      `[payments/nice/return] 승인 실패: order=${orderId} code=${payment?.resultCode} status=${payment?.status} msg=${payment?.resultMsg}`
    );
    return fail(
      request,
      payment?.resultMsg ?? "결제 승인에 실패했습니다.",
      payment?.resultCode
    );
  }

  // 승인 응답 주문 결속 대조 (LA-06 방어심화): 응답이 요청과 다른 주문·거래를
  // 가리키면 지급하지 않는다 — 엇갈린 응답으로 다른 주문에 오지급되는 것 방지.
  if (
    (typeof payment.orderId === "string" && payment.orderId !== orderId) ||
    (typeof payment.tid === "string" && payment.tid !== tid)
  ) {
    console.error(
      `[payments/nice/return] 승인 응답 불일치: req order=${orderId} tid=${tid} / resp order=${payment.orderId} tid=${payment.tid}`
    );
    return fail(
      request,
      "결제 승인 응답이 주문 정보와 일치하지 않습니다. 고객센터로 문의해주세요."
    );
  }

  // 크레딧 지급 (원자적 + 멱등: tid)
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_plan_credits", {
    p_user_id: parsed.userId,
    p_credits: parsed.plan.credits,
    p_validity_days: parsed.plan.validityDays,
    p_amount: parsed.plan.price,
    p_transaction_id: tid,
  });

  if (error) {
    // 결제는 완료 — 지급은 웹훅 재전송이 이어받는다. fail 페이지의 안내 문구가
    // "결제됐다면 잠시 후 자동 지급" 케이스를 커버한다.
    console.error("[payments/nice/return] grant 실패:", error.message);
    return fail(
      request,
      "결제는 완료됐으나 크레딧 지급 처리 중 오류가 발생했습니다. 잠시 후 자동으로 재처리됩니다."
    );
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success !== true && result?.error !== "duplicate_transaction") {
    console.error(
      "[payments/nice/return] 지급 결과 이상:",
      JSON.stringify(result)
    );
    return fail(
      request,
      "결제는 완료됐으나 크레딧 지급에 실패했습니다. 문의해주세요."
    );
  }

  return redirectTo(request, "/charge/success", { pg: "nice", orderId });
}
