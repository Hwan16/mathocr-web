import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";

// 토스페이먼츠 웹훅 (PAYMENT_STATUS_CHANGED) — 승인 API의 안전망.
//
// 신뢰 모델: 웹훅 페이로드는 위조될 수 있으므로 절대 그대로 믿지 않는다.
// paymentKey만 꺼내 토스 조회 API(시크릿 키 인증)로 결제 상태·주문·금액을
// 재확인한 뒤 지급한다. 지급은 grant_plan_credits 멱등 처리(0009 unique)라
// 승인 API와 중복 실행돼도 두 번 지급되지 않는다.
//
// 응답 정책(토스 재전송 규칙: 미응답/오류 시 최대 7회 재시도):
//  - 처리 완료/무시 대상 → 200 (재전송 중단)
//  - 일시 오류(토스 조회 실패, DB 오류) → 500 (재전송으로 자가 복구)
export async function POST(request: NextRequest) {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let event: {
    eventType?: string;
    data?: { paymentKey?: unknown; status?: unknown };
  };
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (event?.eventType !== "PAYMENT_STATUS_CHANGED") {
    return NextResponse.json({ ignored: true });
  }

  const paymentKey = event.data?.paymentKey;
  if (typeof paymentKey !== "string" || !paymentKey) {
    return NextResponse.json({ error: "paymentKey missing" }, { status: 400 });
  }

  // 완료(DONE) 외 상태는 지금 단계에서 처리하지 않는다 (취소/환불은 수동 운영).
  if (event.data?.status !== "DONE") {
    return NextResponse.json({ ignored: true });
  }

  // 토스에 재조회 — 페이로드 위조 방어의 핵심
  const tossRes = await fetch(
    `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      },
      cache: "no-store",
    }
  );
  if (!tossRes.ok) {
    // 404(가짜 paymentKey)는 무시하고 종료, 그 외(5xx 등)는 재전송 유도
    if (tossRes.status === 404) {
      return NextResponse.json({ ignored: true });
    }
    console.error("[payments/webhook] 토스 조회 실패:", tossRes.status);
    return NextResponse.json({ error: "toss lookup failed" }, { status: 500 });
  }

  const payment = (await tossRes.json().catch(() => null)) as {
    status?: string;
    orderId?: string;
    totalAmount?: number;
  } | null;

  if (payment?.status !== "DONE" || typeof payment.orderId !== "string") {
    return NextResponse.json({ ignored: true });
  }

  const parsed = parseOrderId(payment.orderId);
  if (!parsed) {
    // 우리 형식의 주문이 아님 — 무시
    return NextResponse.json({ ignored: true });
  }

  if (payment.totalAmount !== parsed.plan.price) {
    // 금액 불일치 — 지급하지 않고 기록만 (재전송 받아도 결과 동일하므로 200)
    console.error(
      `[payments/webhook] 금액 불일치: order=${payment.orderId} paid=${payment.totalAmount} expected=${parsed.plan.price}`
    );
    return NextResponse.json({ ignored: true });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_plan_credits", {
    p_user_id: parsed.userId,
    p_credits: parsed.plan.credits,
    p_validity_days: parsed.plan.validityDays,
    p_amount: parsed.plan.price,
    p_transaction_id: paymentKey,
  });

  if (error) {
    console.error("[payments/webhook] grant 실패:", error.message);
    return NextResponse.json({ error: "grant failed" }, { status: 500 });
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success === false && result.error !== "duplicate_transaction") {
    console.error("[payments/webhook] 지급 결과 이상:", JSON.stringify(result));
    return NextResponse.json({ error: "grant rejected" }, { status: 500 });
  }

  // 지급 완료 또는 이미 지급됨(duplicate) — 정상 종료
  return NextResponse.json({ ok: true });
}
