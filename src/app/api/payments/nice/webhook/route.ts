import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";
import { sendAdminAlert } from "@/lib/admin-alert";
import {
  recordApprovedEvent,
  recordGrantFailure,
} from "@/lib/payment-recovery";
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
  cancelledTid?: unknown;
  balanceAmt?: unknown;
  cancels?: unknown;
};

// 나이스 취소·부분취소 status 값 (표기 변형 포함 방어적으로 수용)
const CANCEL_STATUSES = new Set(["cancelled", "canceled", "partialCancelled"]);

type CancelRecordResult = "recorded" | "invalid" | "store_failed";

function asStr(v: unknown): string | null {
  return typeof v === "number" || typeof v === "string" ? String(v) : null;
}

// 이번 통보의 실제 취소액 — NICE 명세상 최상위 amount는 '원결제금액'이고,
// 취소액은 cancels[] 배열의 항목별 amount다. 가장 최근(마지막) 취소 항목을 쓴다.
function latestCancelAmount(cancels: unknown): string | null {
  if (!Array.isArray(cancels) || cancels.length === 0) return null;
  const last = cancels[cancels.length - 1] as { amount?: unknown };
  return asStr(last?.amount);
}

// 취소·부분취소 통보 (LA-06): 자동 회수는 하지 않는다(오회수 위험) —
// payment_events에 저장 + 관리자 메일 경보만. 크레딧·환불 정리는 관리자가
// 결제 내역을 확인해 수동으로 진행한다.
//
// 보안(Codex P1-5): 서명이 유효한 통보만 저장한다 — 공개 엔드포인트라 무효
// 서명 요청을 저장하면 인증 없는 저장소 스팸이 되기 때문. 멱등 키(event_key)로
// 재전송 시 행·경보 중복을 막고, 유효 이벤트 저장 실패는 500으로 재전송을 유도.
async function recordCancelEvent(
  event: WebhookEvent,
  status: string
): Promise<CancelRecordResult> {
  const tid = typeof event.tid === "string" ? event.tid : null;
  const orderId = typeof event.orderId === "string" ? event.orderId : null;
  const amount = asStr(event.amount); // 원결제금액 (서명 계산에 쓰이는 값)
  const ediDate = typeof event.ediDate === "string" ? event.ediDate : "";
  const signature = typeof event.signature === "string" ? event.signature : "";
  const signatureValid =
    !!tid &&
    !!signature &&
    !!ediDate &&
    amount !== null &&
    verifyWebhookSignature({ tid, amount, ediDate, signature });

  // 무효 서명 = 인증 없는 임의 요청. 저장·경보 없이 무시(저장소 스팸 차단).
  if (!signatureValid) {
    console.error(
      "[payments/nice/webhook] 취소 이벤트 서명 무효 — 무시(스팸 방지)",
      { tid, orderId }
    );
    return "invalid";
  }

  const cancelledTid =
    typeof event.cancelledTid === "string" ? event.cancelledTid : null;
  const balanceAmt = asStr(event.balanceAmt);
  const cancelledAmount = latestCancelAmount(event.cancels);
  // 멱등 키: 취소 거래키 우선, 없으면 tid:status
  const eventKey = cancelledTid ?? `${tid}:${status}`;

  const admin = createAdminClient();

  // 신규 삽입일 때만 true (재전송 conflict면 무시되어 false) — 경보 1회 보장
  let isNew = false;
  let stored = false;
  try {
    const { data, error } = await admin
      .from("payment_events")
      .upsert(
        {
          event_key: eventKey,
          event_type: status,
          tid,
          order_id: orderId,
          amount,
          cancelled_amount: cancelledAmount,
          cancelled_tid: cancelledTid,
          balance_amt: balanceAmt,
          signature_valid: true,
          raw: event,
        },
        { onConflict: "event_key", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw new Error(error.message);
    isNew = (data?.length ?? 0) > 0;
    stored = true;
  } catch (upsertError) {
    // 0021 미적용(event_key/취소 컬럼 없음) 폴백 — 기본 컬럼만으로 저장.
    // 멱등은 못 하지만 서명 유효 이벤트만 오므로 스팸은 아니다.
    console.warn(
      "[payments/nice/webhook] upsert 실패 — 기본 컬럼 폴백",
      upsertError instanceof Error ? upsertError.message : String(upsertError)
    );
    const { error: insErr } = await admin.from("payment_events").insert({
      event_type: status,
      tid,
      order_id: orderId,
      amount,
      signature_valid: true,
      raw: event,
    });
    if (insErr) {
      console.error(
        "[payments/nice/webhook] 취소 이벤트 저장 실패",
        insErr.message
      );
      return "store_failed"; // 유효 이벤트 저장 실패 → 500으로 NICE 재전송 유도
    }
    isNew = true; // 폴백 경로는 멱등 판별 불가 → 경보 발송
    stored = true;
  }

  if (stored && isNew) {
    await sendAdminAlert(
      `[MathOCR 결제] 취소 웹훅 수신 (${status}) — 수동 확인 필요`,
      `<p>나이스페이에서 결제 <strong>취소 통보</strong>를 받았습니다.</p>
<p>주문: <strong>${orderId ?? "(없음)"}</strong><br/>거래(tid): ${tid}<br/>
취소 거래키: ${cancelledTid ?? "(없음)"}<br/>
원결제금액: ${amount}원<br/>
이번 취소액: ${cancelledAmount ?? "(응답에 없음 — 전액취소로 추정)"}원<br/>
취소 후 잔액: ${balanceAmt ?? "(없음)"}원<br/>유형: ${status}</p>
<p>크레딧 <strong>자동 회수는 하지 않습니다</strong> — 관리자 페이지에서 해당 사용자의
크레딧·결제 내역을 확인해 수동으로 정리하세요. 원문은 payment_events 테이블에 저장돼 있습니다.</p>`
    );
  }
  return "recorded";
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
    // 성공(0000) 취소만 처리 — 실패한 취소 시도(비-0000)는 돈이 안 움직였으므로
    // "취소 수신" 경보를 내지 않는다(오해 방지). resultCode 미포함도 무시.
    if (event.resultCode !== "0000") {
      console.error(
        "[payments/nice/webhook] 취소 통보 resultCode 비정상 — 무시",
        { status: event.status, resultCode: event.resultCode }
      );
      return ok();
    }
    const result = await recordCancelEvent(event, event.status);
    // 유효 이벤트 저장 실패 → 500(재전송 유도). 무효 서명·정상 저장 → 200 OK.
    if (result === "store_failed") {
      return NextResponse.json({ error: "store failed" }, { status: 500 });
    }
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

  // 승인 확정 기록 (LA-06 복구): 서명 검증된 paid 통보 = 승인이 실제로 있었다는
  // 증거다. return 라우트가 이미 기록했으면 멱등으로 무시된다 — return 프로세스가
  // 승인 직후 죽은 경우도 웹훅이 독립적으로 기록해 미지급 탐지를 보장한다.
  const orderInfo = { tid, orderId, amount: parsed.plan.price };
  await recordApprovedEvent("nice_webhook", orderInfo, parsed.plan);

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
    await recordGrantFailure("nice_webhook", orderInfo, error.message, parsed.plan);
    return NextResponse.json({ error: "grant failed" }, { status: 500 });
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (result?.success === false && result.error !== "duplicate_transaction") {
    console.error(
      "[payments/nice/webhook] 지급 결과 이상:",
      JSON.stringify(result)
    );
    await recordGrantFailure(
      "nice_webhook",
      orderInfo,
      `grant 결과 이상: ${JSON.stringify(result)}`,
      parsed.plan
    );
    return NextResponse.json({ error: "grant rejected" }, { status: 500 });
  }

  // 지급 완료 또는 이미 지급됨(duplicate) — 정상 종료
  return ok();
}
