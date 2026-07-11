import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";
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

export async function POST(request: NextRequest) {
  if (!nicepayConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const event = (await request.json().catch(() => null)) as {
    resultCode?: unknown;
    status?: unknown;
    tid?: unknown;
    orderId?: unknown;
    amount?: unknown;
    ediDate?: unknown;
    signature?: unknown;
  } | null;
  if (!event) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // 승인 완료(paid) 외 이벤트(취소·가상계좌 발급 등)는 지금 단계에서 처리하지 않는다.
  // (취소/환불은 수동 운영 — 토스 웹훅과 동일 정책)
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
