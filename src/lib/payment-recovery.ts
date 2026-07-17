import { createAdminClient } from "@/lib/supabase/admin";
import { sendAdminAlert } from "@/lib/admin-alert";

// ── 승인 성공·지급 실패 주문 복구 (LA-06 잔여) ──
//
// 문제: 나이스 승인(카드 출금)은 성공했는데 크레딧 지급(grant_plan_credits)이
// 실패하면, 웹훅 재전송이라는 안전망은 있지만 그것마저 소진되면 콘솔 로그 외에
// 아무 기록이 남지 않아 "돈은 나갔는데 크레딧이 없는" 주문을 찾을 수 없었다.
//
// 해법: 승인 성공이 확인되는 순간 payment_events에 'approved' 이벤트를 남긴다
// (return·웹훅 양쪽, event_key 멱등). 지급까지 성공하면 payments 테이블에
// pg_transaction_id=tid 행이 생기므로, "approved 이벤트는 있는데 payments 행이
// 없는 tid" = 미지급 주문이다. 관리자 화면이 이 목록을 보여주고 재지급한다.
//
// 원칙:
//  - 기록은 전부 fail-open — 이벤트 기록 실패가 결제·지급 흐름을 막으면 안 된다.
//    (기록이 없어도 기존 안전망(웹훅 500 재전송)은 그대로 동작한다)
//  - 지급 실패는 grant_failed 이벤트로 남기고 관리자 메일 경보를 1회만 보낸다
//    (event_key 유니크로 웹훅 재전송·재시도가 겹쳐도 경보 중복 없음).

type OrderInfo = {
  tid: string;
  orderId: string;
  amount: number;
};

async function upsertEvent(
  eventKey: string,
  eventType: string,
  info: OrderInfo,
  raw: Record<string, unknown>
): Promise<{ isNew: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_events")
    .upsert(
      {
        event_key: eventKey,
        event_type: eventType,
        tid: info.tid,
        order_id: info.orderId,
        amount: String(info.amount),
        // 이 이벤트는 서명 검증을 통과한 흐름(return 인증 서명·웹훅 서명)에서만
        // 기록되므로 true — 취소 웹훅의 위조 판별 필드와 의미를 맞춘다.
        signature_valid: true,
        raw,
      },
      { onConflict: "event_key", ignoreDuplicates: true }
    )
    .select("id");
  if (error) throw new Error(error.message);
  return { isNew: (data?.length ?? 0) > 0 };
}

// 승인 성공 기록 — return 라우트(승인 API 성공 직후)와 웹훅(paid 통보)이 호출.
// 같은 tid는 한 번만 저장된다.
export async function recordApprovedEvent(
  source: "nice_return" | "nice_webhook",
  info: OrderInfo
): Promise<void> {
  try {
    await upsertEvent(`${info.tid}:approved`, "approved", info, { source });
  } catch (e) {
    console.warn(
      "[payment-recovery] approved 이벤트 기록 실패 (흐름은 계속):",
      e instanceof Error ? e.message : String(e)
    );
  }
}

// 지급 실패 기록 + 관리자 경보(최초 1회) — 돈은 나갔는데 크레딧이 안 간 상태.
export async function recordGrantFailure(
  source: "nice_return" | "nice_webhook",
  info: OrderInfo,
  detail: string
): Promise<void> {
  try {
    const { isNew } = await upsertEvent(
      `${info.tid}:grant_failed`,
      "grant_failed",
      info,
      { source, detail }
    );
    if (isNew) {
      await sendAdminAlert(
        "[MathOCR 결제] ⚠️ 결제 승인됐는데 크레딧 지급 실패 — 복구 필요",
        `<p>카드 결제는 <strong>승인 완료</strong>됐지만 크레딧 지급이 실패했습니다.</p>
<p>주문: <strong>${info.orderId}</strong><br/>거래(tid): ${info.tid}<br/>
금액: ${info.amount.toLocaleString()}원<br/>실패 사유: ${detail}<br/>경로: ${source}</p>
<p>웹훅 재전송이 자동 재시도하지만, 계속 실패하면 <strong>관리자 페이지 상단의
"지급 대기 결제" 알림</strong>에서 [크레딧 재지급] 버튼으로 복구하세요.
(재지급은 거래 ID 기준 멱등 — 이미 지급됐다면 중복 지급되지 않습니다)</p>`
      );
    }
  } catch (e) {
    console.warn(
      "[payment-recovery] grant_failed 이벤트 기록 실패 (흐름은 계속):",
      e instanceof Error ? e.message : String(e)
    );
  }
}
