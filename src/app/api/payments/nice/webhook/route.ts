import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";
import { sendAdminAlert } from "@/lib/admin-alert";
import { nicepayConfigured, verifyWebhookSignature } from "@/lib/nicepay";

// 나이스페이 웹훅(URL 통보) — return 승인의 안전망 + 가상계좌 입금 통보.
//
// 신뢰 모델: 페이로드는 위조될 수 있으므로 signature(hex sha256(tid+amount+ediDate+시크릿키))
// 검증을 통과한 경우에만 지급한다. 지급은 grant_plan_credits 멱등 처리라
// return 라우트와 중복 실행돼도 두 번 지급되지 않는다.
//
// 응답 규약(나이스): 성공 처리 시 HTTP 200 + 본문에 문자열 "OK"가 있어야 하며,
// 없으면 실패로 간주하고 재전송한다. 따라서:
//  - 처리 완료/무시 대상 → 200 "OK" (재전송 중단)
//  - 일시 오류(DB 오류 등) → 500 (재전송으로 자가 복구)

function ok(): NextResponse {
  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

type WebhookEvent = {
  resultCode?: unknown;
  status?: unknown;
  tid?: unknown;
  orderId?: unknown;
  amount?: unknown;
  ediDate?: unknown;
  signature?: unknown;
};

// 나이스 취소·부분취소 status 값 (표기 변형 포함 방어적으로 수용)
const CANCEL_STATUSES = new Set(["cancelled", "canceled", "partialCancelled"]);

// 취소·부분취소 통보 (LA-06): 자동 회수는 하지 않는다(오회수 위험) —
// payment_events에 원문 저장 + 관리자 메일 경보만. 크레딧·환불 정리는
// 관리자가 결제 내역을 확인해 수동으로 진행한다.
async function recordCancelEvent(
  event: WebhookEvent,
  status: string
): Promise<void> {
  const tid = typeof event.tid === "string" ? event.tid : null;
  const orderId = typeof event.orderId === "string" ? event.orderId : null;
  const amount =
    typeof event.amount === "number" || typeof event.amount === "string"
      ? String(event.amount)
      : null;
  const ediDate = typeof event.ediDate === "string" ? event.ediDate : "";
  const signature = typeof event.signature === "string" ? event.signature : "";
  const signatureValid =
    !!tid &&
    !!signature &&
    !!ediDate &&
    amount !== null &&
    verifyWebhookSignature({ tid, amount, ediDate, signature });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("payment_events").insert({
      event_type: status,
      tid,
      order_id: orderId,
      amount,
      signature_valid: signatureValid,
      raw: event,
    });
    if (error) {
      console.error(
        "[payments/nice/webhook] 취소 이벤트 저장 실패(0020 미적용?)",
        error.message
      );
    }
  } catch (error) {
    console.error("[payments/nice/webhook] 취소 이벤트 저장 예외", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (signatureValid) {
    await sendAdminAlert(
      `[MathOCR 결제] 취소 웹훅 수신 (${status}) — 수동 확인 필요`,
      `<p>나이스페이에서 결제 <strong>취소 통보</strong>를 받았습니다.</p>
<p>주문: <strong>${orderId ?? "(없음)"}</strong><br/>거래(tid): ${tid}<br/>금액: ${amount}원<br/>유형: ${status}</p>
<p>크레딧 <strong>자동 회수는 하지 않습니다</strong> — 관리자 페이지에서 해당 사용자의
크레딧·결제 내역을 확인해 수동으로 정리하세요. 원문은 payment_events 테이블에 저장돼 있습니다.</p>`
    );
  } else {
    console.error(
      "[payments/nice/webhook] 취소 이벤트 서명 무효 — 경보 생략(위조 의심)",
      { tid, orderId }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!nicepayConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const event = (await request.json().catch(() => null)) as WebhookEvent | null;
  if (!event) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // 취소·부분취소 통보 → 저장 + 관리자 경보 (자동 회수 없음)
  if (typeof event.status === "string" && CANCEL_STATUSES.has(event.status)) {
    await recordCancelEvent(event, event.status);
    return ok();
  }

  // 승인 완료(paid) 외 나머지 이벤트(가상계좌 발급 등)는 처리하지 않는다.
  if (event.resultCode !== "0000" || event.status !== "paid") {
    return ok();
  }

  const { tid, orderId, amount, ediDate, signature } = event;
  if (
    typeof tid !== "string" ||
    !tid ||
    typeof orderId !== "string" ||
    typeof signature !== "string" ||
    typeof ediDate !== "string" ||
    (typeof amount !== "number" && typeof amount !== "string")
  ) {
    return ok(); // 형식이 다른 통보 — 재전송 받아도 결과가 같으므로 종료
  }

  if (!verifyWebhookSignature({ tid, amount, ediDate, signature })) {
    console.error(`[payments/nice/webhook] 서명 검증 실패: tid=${tid}`);
    return ok(); // 위조 의심 — 재전송 유도할 이유가 없다
  }

  const parsed = parseOrderId(orderId);
  if (!parsed) {
    return ok(); // 우리 형식의 주문이 아님 — 무시
  }
  if (Number(amount) !== parsed.plan.price) {
    console.error(
      `[payments/nice/webhook] 금액 불일치: order=${orderId} paid=${amount} expected=${parsed.plan.price}`
    );
    return ok();
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_plan_credits", {
    p_user_id: parsed.userId,
    p_credits: parsed.plan.credits,
    p_validity_days: parsed.plan.validityDays,
    p_amount: parsed.plan.price,
    p_transaction_id: tid,
  });

  if (error) {
    console.error("[payments/nice/webhook] grant 실패:", error.message);
    return NextResponse.json({ error: "grant failed" }, { status: 500 });
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success === false && result.error !== "duplicate_transaction") {
    console.error(
      "[payments/nice/webhook] 지급 결과 이상:",
      JSON.stringify(result)
    );
    return NextResponse.json({ error: "grant rejected" }, { status: 500 });
  }

  // 지급 완료 또는 이미 지급됨(duplicate) — 정상 종료
  return ok();
}
