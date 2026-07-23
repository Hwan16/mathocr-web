import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";
import { normalizeEmailAlias } from "@/lib/email";
import { REPLY_TO } from "@/lib/mail";

// 만료 크레딧 자동 재지급 (2026-07-22 결정) — vercel.json cron이 매일 1회 호출한다.
//
// 대상: 최근 REGRANT_WINDOW_DAYS일 안에 유효기간이 지났고, 만료 시점 잔여 크레딧이
//       MIN_LOST(10) 이상인 계정. (profiles.credits 는 만료 후에도 다음 충전 전까지
//       만료 당시 값이 남아 있어 "얼마나 날렸는지"를 그대로 읽을 수 있다)
//       9크레딧 이하 손실은 대상이 아니다.
//
//       시간창을 두는 이유(2026-07-22 리뷰): 재지급받은 계정이 그 30크레딧을 다시
//       만료로 날리면 (credits=30, expires_at=지급+7일)로 후보 조건에 영원히 재진입
//       하는데, 이런 '이미 받은' 행이 정렬(만료일 오래된 순) 맨 앞에 누적되면
//       한도(limit)를 전부 차지해 새 대상자가 영영 밀려난다. 최근 만료만 보면
//       이런 행은 30일 뒤 창 밖으로 빠진다. 페이지네이션(아래)은 그 안의 잔여
//       점유도 건너뛴다.
//
// 지급: re_earlybird 코드(30크레딧·유효 7일)를 'system' 소스로 상환(0022).
//   - 계정당 평생 1회 — promo_redemptions 의 user_id 중복 검사가 보장. 재지급분을
//     다시 만료로 날려도 두 번째는 없다(무한 재지급 루프 차단).
//   - normalized_email 도 공개 상환 경로와 동일하게 기록·검사한다 — 탈퇴 후 같은
//     이메일(알리아스 포함)로 재가입해 다시 받는 경로 차단 (2026-07-22 리뷰).
//     수집 단계에서도 같은 검사를 해 가드에 걸릴 행이 지급·메일 슬롯을 매일
//     점유하는 것을 막는다.
//   - 코드는 항상 비활성(is_active=false) — 마이페이지·가입 경로로는 상환 불가.
//
// 메일 분기 (정보통신망법 제50조 — expiry-reminder 와 동일한 LA-09 기준):
//   - marketing_opt_in=true → "(광고)" 제목 + 수신거부 링크 + 발신 사업자 표기로 재지급 안내.
//   - false/null → 메일 없이 조용히 지급만 한다. 혜택 안내는 광고성 정보라서
//     비동의자에게는 어떤 형태로도 보내지 않는다(2026-07-22 법률 검토 — 중립형도 없음).
//   - expiry-reminder 는 재지급 후 7일간 광고형 만료 임박 메일을 건너뛴다
//     (재지급 메일이 만료일을 이미 고지 — 이틀 연속 광고 메일 방지).
//
// 메일 유실 방지 (2026-07-22 리뷰 — 지급은 평생 1회라 메일을 놓치면 영영 못 알린다):
//   - RESEND_API_KEY 미설정: 메일이 필요한 대상이 있으면 지급 전에 503으로 중단.
//   - regrant_mail_due 컬럼 조회 실패(0022 미적용·스키마 캐시 미갱신): 메일 대상이
//     있으면 마커를 기록할 수 없으므로 역시 지급 전에 503으로 중단(fail-closed).
//   - 발송 실패: 메일 대상은 "지급 전에" profiles.regrant_mail_due 에 메일 재료를
//     기록해 두고 발송 성공 시 지운다. 남아 있으면 다음 실행이 재시도한다(최대
//     MAX_MAIL_ATTEMPTS회, 그 사이 수신거부한 계정은 발송 없이 표시만 지운다).
//     지급을 먼저 하면 그 사이에 죽었을 때 다음 실행의 후보 수집이 already_granted 로
//     걸러내 지급도 메일도 영영 재시도되지 않는다(지급은 평생 1회, 발송 이력 테이블도
//     없어 사후 복구 불가) — 그래서 마커가 먼저다(2026-07-22 리뷰).
//   - 마커만 남고 지급이 안 된 상태(마커 기록 직후 크래시)는 재시도 단계가
//     promo_redemptions 로 검증해 발송 없이 마커만 지운다. 그 계정은 같은 실행의
//     후보 수집이 이미 미지급자로 잡아 뒀으므로 (4)에서 정상 지급·발송된다.
//   - 마커 기록 자체가 실패하면 그 계정의 지급을 다음 실행으로 미룬다(메일 없는
//     평생 1회 지급을 만들지 않는다).
//   - 지급 실패 시 마커 롤백은 "DB가 확정적으로 거절한 경우"(rpcError 없이 result 가
//     돌아온 실패 — exhausted·invalid_source 등)에만 한다. supabase-js 는 네트워크
//     오류·타임아웃·게이트웨이 5xx 를 throw 하지 않고 error 로 돌려주는데, 그중에는
//     "RPC 는 커밋됐는데 응답만 유실된" 경우가 섞여 있다. 이때 마커까지 지우면 다음
//     실행의 후보 수집이 already_granted 로 걸러내고 재시도 큐에도 안 잡혀 지급은
//     됐는데 메일만 영영 유실된다(복구 단서 소멸). 그래서 불명확한 실패는 마커를
//     남겨 (3a)/(3)의 지급 검증이 하루 뒤 정확히 판정하게 한다 — 지급 기록이 있으면
//     발송하고, 없으면 발송 없이 마커만 지운다. 그런 계정은 응답에서 grantFailed 가
//     아니라 grantUncertain 으로 따로 센다(다음 실행이 처리할 건 vs 진짜 실패 구분).
//   - attempts 는 "발송 실패"가 아니라 "발송 시도"에 결속한다 — sendMail 직전에 먼저
//     올리고, 그 쓰기가 실패하면 이번 실행은 보내지 않는다(내구성 있는 카운터 없이는
//     광고 메일을 보내지 않는다). 실패에만 결속하면, 발송은 매번 성공하는데 마커
//     제거·봉인 쓰기만 지속적으로 실패하는 계정(문장 타임아웃·row 락 장기 점유 등)에서
//     attempts 가 영원히 0이라 상한도 sent_at 검사도 걸리지 않아 같은 (광고) 메일이
//     매일 무한 재발송된다(정보통신망법 노출). 사전 증가면 최악의 경우에도 중복이
//     확정 상한을 갖는다.
//   - 사전 증가의 부작용은 dispatched 카운터로 보완한다 (2026-07-22 리뷰) — 아래
//     MAX_MAIL_DISPATCHES / MAX_MAIL_ATTEMPTS_HARD 주석 참조.
//   - 발송은 성공했는데 마커 제거가 실패하면 sent_at 을 찍어 "발송 완료"로 봉인한다
//     (정상 경로의 즉시 차단 — 사전 증가 상한은 그 뒤를 받치는 최후 방어선).
//   - 마커에 queued_at(마커를 남긴 시각)을 함께 적어, (3)이 promo_redemptions 의
//     created_at 과 비교해 "그 지급이 이 마커의 지급인지"를 확인한다. 마커보다
//     오래된 지급(user_id 중복 already_redeemed + 롤백 실패 경합)이면 발송하지 않고
//     마커만 지운다 — 마커의 만료일은 이번 실행이 예측해 넣은 값이라 과거 지급에
//     붙이면 "X일까지 유효" 안내가 사실과 달라진다.
//   - 메일 예산: 옵트인 대상 지급은 실행당 MAX_MAILS_PER_RUN 건까지만 — 예산이 차면
//     "지급 자체를" 다음 실행으로 미뤄 메일 없는 지급을 만들지 않는다. (Resend 무료
//     티어 일 100통을 expiry-reminder 등과 나눠 쓴다)
//
// 알려진 격차 (2026-07-22 mock 스위트가 드러낸 것 — scripts/expiry_regrant_state_test.mjs 의
// todo 항목과 1:1 대응한다. 어느 것도 이번 변경으로 생긴 회귀가 아니다):
//   G1. 두 실행이 겹쳐 돌 때, 뒤늦은 쪽이 already_redeemed 를 "DB 확정 거절"로 보고 마커를
//       롤백 삭제하는데 그 마커가 사실은 앞선 실행이 남긴 재시도 단서일 수 있다. 앞선 실행이
//       지급 직후 죽었다면 안내 메일 1통이 영구 유실된다. 근본 해결은 마커에 실행 ID 를 넣고
//       "내가 쓴 마커일 때만 롤백"으로 조건부 삭제하는 것 — 동작 변경이라 별도 결정 필요.
//       현재 완화책은 cron 이 하루 1회라 겹칠 일이 사실상 없다는 점뿐이다.
//   G2. 발송 후 쓰기(마커 제거·sent_at 봉인·dispatched)가 전부 실패하는 row 에서는 하루 넘긴
//       재시도의 중복을 막지 못한다. 멱등키 보존 창(24시간)이 cron 주기와 같아 여기서도 못 막는다.
//       중복은 MAX_MAIL_ATTEMPTS_HARD 회로 확정 상한을 갖는다(무한 재발송은 아님).
//       근본 해결은 발송 이력 테이블 도입 — 별도 결정 필요.
//
// 이메일 인증 게이트: email_confirmed_at 없는 계정은 지급·메일 모두 제외(fail-closed).
//   타인 이메일 가입 계정에 혜택이 쌓이거나 메일이 나가는 경로 차단 (LA-09).
//
// 0022 미적용 상태에서 돌면: RPC가 invalid_source 를 돌려줘 아무것도 지급되지 않는다.
//
// 성능 메모: 후보 수집(1)의 auth.admin.getUserById 순차 호출이 maxDuration(300초)의
//   지배적 비용이다 — 향후 타임아웃 여유가 필요하면 여기를 배치화할 것.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_LOST = 10; // 이 값 미만 손실은 재지급 대상 아님 (2026-07-22 사용자 결정)
const GRANT_CODE = "re_earlybird";
const REGRANT_WINDOW_DAYS = 30; // 이 기간보다 오래전 만료는 대상 아님 (창 점유 방지 + 윈백 적시성)
const PAGE_SIZE = 200;
const MAX_PAGES = 5; // 한 실행이 훑는 최대 후보 수 = 1000
const MAX_GRANTS_PER_RUN = 200;
const MAX_MAILS_PER_RUN = 40; // 신규 지급 메일 상한 (재시도 몫 MAX_RETRY_MAILS 와 별도)
const MAX_RETRY_MAILS = 40;
// 발송 상한이 둘인 이유 (2026-07-22 리뷰 — attempts 사전 증가의 부작용 보완):
//
//   attempts   = sendMail 을 부르기 "직전에" 올리는 값. 반드시 내구성 있게 남는다.
//   dispatched = sendMail 호출까지 "실제로 도달한" 횟수. 호출이 끝난 뒤에 기록하므로
//                크래시·쓰기 실패로 유실될 수 있다(그래서 최선 노력 기록이다).
//
// 사전 증가만 두면, attempts 를 올린 직후 sendMail 호출 전에 프로세스가 죽는 일이
// 반복될 때 실제 발송 없이 상한만 소진돼 정당한 사용자가 재지급 안내를 영영 못 받는다.
// 그렇다고 attempts 를 사후 증가로 되돌리면 무한 재발송 구멍이 되살아난다.
// 그래서 "되돌리기" 대신 카운터를 둘로 나눈다 — 둘 다 단조 증가라 되돌릴 일이 없다.
//
//   포기 조건 = dispatched >= MAX_MAIL_DISPATCHES  또는  attempts >= MAX_MAIL_ATTEMPTS_HARD
//
//   - 정상/발송실패 경로: dispatched 가 attempts 를 따라 올라가 5회에서 멈춘다(기존과 동일).
//   - 사전 증가 직후 크래시 반복: dispatched 가 0에 머물러 8회까지 재시도가 살아 있다
//     → 메일을 영영 못 받는 구멍이 막힌다.
//   - 발송은 되는데 사후 쓰기가 계속 실패: dispatched 도 못 오르지만 attempts 는 오르므로
//     8회에서 확정적으로 멈춘다 → 무한 재발송은 되살아나지 않는다(최악 중복 5→8).
//
// 레거시 마커(dispatched 필드 없음)는 attempts 를 dispatched 로 간주한다(effectiveDispatched)
// — 그 시절 attempts 는 곧 실제 발송 도달 횟수였으므로, 하위 호환으로 기존 5회 상한이 그대로 유지된다.
const MAX_MAIL_DISPATCHES = 5;
const MAX_MAIL_ATTEMPTS_HARD = 8;
// Resend 응답을 기다리는 최대 시간 — 응답 없는 커넥션 하나가 루프 전체(maxDuration 300초)를
// 잡아먹지 못하게 한다. 타임아웃은 발송 실패로 처리되고, 재시도는 멱등키가 받쳐 준다.
const MAIL_TIMEOUT_MS = 15_000;
// 지급 시각(DB now()) 과 마커 시각(앱 서버 Date.now()) 의 시계 오차 허용치.
// 이 안쪽 차이는 "같은 실행의 지급"으로 본다 — 오래된 지급은 최소 하루 전이라 안전.
const GRANT_CLOCK_SKEW_MS = 10 * 60 * 1000;
const SITE_URL = "https://mathocr.ai.kr";
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·주소·전화번호)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatKst(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

// 메일 재시도용 재료 — profiles.regrant_mail_due 에 그대로 저장된다.
// queued_at·sent_at·dispatched 는 이전 버전이 남긴 마커에는 없다(선택 필드) — 없으면 기존 동작 유지.
export type MailDue = {
  lost: number; // 만료로 소멸한 크레딧 수
  lost_at: string; // 만료 시각 ISO
  new_expires: string; // 재지급 크레딧 만료 시각 ISO
  attempts?: number; // 발송 시도 횟수 — sendMail 직전에 증가시킨다(실패 횟수가 아님)
  dispatched?: number; // sendMail 호출까지 실제로 도달한 횟수 — 호출 후 기록(최선 노력)
  queued_at?: string; // 마커를 남긴 시각 ISO — (3)에서 "이 마커의 지급"인지 판별
  sent_at?: string; // 발송 성공 후 마커 제거가 실패한 흔적 — 재발송 금지 표시
};

export function isMailDue(v: unknown): v is MailDue {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lost === "number" &&
    typeof o.lost_at === "string" &&
    typeof o.new_expires === "string"
  );
}

// dispatched 가 없는 레거시 마커는 attempts 를 그대로 dispatched 로 본다.
// 그 시절 attempts 는 "실제 발송에 도달한 횟수"와 같은 뜻이었으므로, 이렇게 해야
// 이미 5회 보낸 레거시 마커가 새 하드 상한(8) 덕에 3회 더 발송되는 일이 없다.
export function effectiveDispatched(due: MailDue): number {
  return due.dispatched ?? due.attempts ?? 0;
}

// 더 이상 보내지 않는다 — 두 상한 중 하나라도 걸리면 포기.
export function isMailExhausted(due: MailDue): boolean {
  return (
    effectiveDispatched(due) >= MAX_MAIL_DISPATCHES ||
    (due.attempts ?? 0) >= MAX_MAIL_ATTEMPTS_HARD
  );
}

// Resend 멱등키 — "안정적"이어야 의미가 있다. 랜덤 값을 쓰면 재시도마다 키가 달라져
// 중복 차단이 전혀 걸리지 않는다. lost_at(만료 시각)은 마커를 만들 때 확정돼 이후 절대
// 바뀌지 않고 레거시 마커에도 항상 들어 있으며, 재지급은 계정당 평생 1회라
// (user_id, lost_at) 하나로 지급 사건이 유일하게 식별된다. (Resend 상한 256자 — 여기선 ~80자)
//
// ⚠️ 한계: Resend 의 멱등키 보존 창은 24시간인데 이 cron 주기도 24시간이다. 따라서 이
//    키는 "같은 실행 안의 중복·접수 후 응답 유실 직후의 재시도"는 확실히 막지만,
//    '다음날 재시도'로 넘어간 중복은 신뢰성 있게 막지 못한다(보존 창이 이미 지났을 수 있음).
//    하루 넘긴 중복의 방어선은 sent_at 봉인이고, 그마저 실패했을 때의 최종 상한이
//    MAX_MAIL_DISPATCHES / MAX_MAIL_ATTEMPTS_HARD 다.
export function mailIdempotencyKey(userId: string, due: MailDue): string {
  return `regrant/${userId}/${due.lost_at}`;
}

// 광고형 (마케팅 동의자 전용) — 재지급 안내 + 이용 유도이므로
// 제목 "(광고)" 표기 + 수신거부 링크 + 발신 사업자 표기를 붙인다.
function buildRegrantEmail(userId: string, due: MailDue, grantCredits: number) {
  const lostDate = formatKst(due.lost_at);
  const newDate = formatKst(due.new_expires);
  const subject = `(광고) [AI MathOCR] 만료된 크레딧 대신 새 ${grantCredits}크레딧을 드렸어요`;
  const token = unsubscribeToken(userId, "user");
  // 영문 병기(Unsubscribe) — 정보통신망법 시행령의 한·영 표기 권고 반영
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="margin:0 0 16px;font-size:15px;">
    보유하셨던 크레딧 <strong>${due.lost}개</strong>가 ${lostDate}에 유효기간 만료로 소멸되었어요.
  </p>
  <p style="margin:0 0 16px;font-size:15px;">
    다시 써보실 수 있도록 <strong>새 크레딧 ${grantCredits}개</strong>를 지급해 드렸어요.
    지금 로그인하면 바로 확인하실 수 있어요.
  </p>
  <p style="margin:0 0 24px;font-size:14px;color:#52525b;">
    새 크레딧의 유효기간은 <strong>${newDate}까지(지급일로부터 7일)</strong>예요.
    이 재지급은 <strong>계정당 1회</strong> 제공되는 프로모션 혜택으로, 이후 만료 시에는
    반복 지급되지 않아요.
  </p>
  <a href="${SITE_URL}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">
    지금 변환해보기
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 마케팅 수신에 동의하신 분께 크레딧 재지급 혜택을 안내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
  return { subject, html };
}

async function sendMail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string
): Promise<boolean> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend 는 POST /emails 에서 Idempotency-Key 를 지원한다(최대 256자, 보존 24시간).
        // 같은 키로 다시 요청하면 실제 발송 없이 원래 응답을 그대로 돌려준다 — 접수는
        // 됐는데 응답만 유실된 경우의 재시도가 두 번째 메일을 만들지 않게 한다.
        // 보존 창이 cron 주기와 같아 '다음날 재시도'까지는 못 막는다(mailIdempotencyKey 주석).
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html }),
      // 응답 없는 커넥션 하나가 뒤의 모든 대상까지 굶기지 않도록 요청 자체에 상한을 둔다.
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

type Candidate = {
  id: string;
  email: string;
  credits: number;
  expires_at: string;
  marketing_opt_in: boolean | null;
};

type Scanned = Candidate & {
  grant: boolean;
  mail: boolean;
  skip: "already_granted" | "unconfirmed" | "mail_budget_deferred" | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 마커·발송 상태 머신 (주입형)
//
// 아래 함수들은 Supabase·Resend 를 직접 부르지 않고 포트(markers/mailer/grants)만
// 통해 움직인다. 라우트는 실제 구현체를 꽂기만 하고, 순서·판정 규칙은 전부 여기에 있다.
// 이렇게 나눠 두면 크래시·중복 실행·응답 유실 같은 경로를 페이크로 재현해 검증할 수 있다
// (scripts/expiry_regrant_state_test.mjs — 운영 DB·실메일 없이 도는 mock 스위트).
// 동작은 분리 전과 동일하다 — 순수 리팩터링 + 이번 리뷰의 두 변경(멱등키·dispatched)만 반영.
// ─────────────────────────────────────────────────────────────────────────────

export type MarkerStore = {
  // true = 저장이 확정됐다. false = (재시도 포함) 저장 실패.
  // 프로세스 사망을 모사할 때만 throw 한다 — 라우트 구현체는 throw 하지 않는다.
  set(userId: string, value: MailDue | null): Promise<boolean>;
};

export type Mailer = {
  send(msg: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }): Promise<boolean>;
};

export type GrantResult = {
  success?: boolean;
  error?: string;
  expires_at?: string;
};

export type GrantStore = {
  // rpcError 는 "DB 가 답을 주지 않은 실패"(네트워크·타임아웃·5xx) — 커밋됐을 수 있다.
  // result 가 돌아온 실패는 DB 가 확정적으로 거절한 것이다.
  redeem(
    userId: string,
    email: string
  ): Promise<{ result: GrantResult | null; rpcError: { message: string } | null }>;
};

export type RegrantDeps = {
  markers: MarkerStore;
  mailer: Mailer;
  grants: GrantStore;
  now: () => number;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

export type SendOutcome = "sent" | "deferred" | "failed";

// 발송 1회 — 시도 기록(사전 증가) → 발송 → 사후 정리.
// deferred = 카운터를 못 올려 이번 실행은 보내지 않음(마커는 그대로라 다음 실행이 이어받는다).
export async function dispatchMail(
  deps: RegrantDeps,
  args: { userId: string; email: string; due: MailDue; grantCredits: number }
): Promise<{ outcome: SendOutcome; sealFailed: boolean }> {
  const { userId, email, due, grantCredits } = args;
  const dispatched = effectiveDispatched(due);
  // 사전 증가 — 보내기 "전에" 시도 횟수를 올린다. 발송 후에 올리면, 이 row 의 쓰기가
  // 지속적으로 실패하는 상황(문장 타임아웃·락 점유)에서 발송은 매번 성공하는데
  // attempts 는 영원히 0이라 상한이 걸리지 않아 같은 광고 메일이 무한 재발송된다.
  // 카운터를 못 올리면 이번 실행은 보내지 않는다 — 다음 실행이 그대로 다시 시도한다.
  // dispatched 를 함께 명시해 두면 다음 실행이 레거시 backfill 을 되풀이하지 않는다.
  const attempted: MailDue = {
    ...due,
    attempts: (due.attempts ?? 0) + 1,
    dispatched,
  };
  if (!(await deps.markers.set(userId, attempted))) {
    deps.warn("[expiry-regrant] 시도 횟수 기록 실패 — 이번 실행 발송 보류", { user_id: userId });
    return { outcome: "deferred", sealFailed: false };
  }

  const { subject, html } = buildRegrantEmail(userId, attempted, grantCredits);
  const ok = await deps.mailer.send({
    to: email,
    subject,
    html,
    idempotencyKey: mailIdempotencyKey(userId, attempted),
  });

  if (ok) {
    // 발송 성공 후 마커 제거 — 제거가 실패하면 "발송 완료"로 봉인한다.
    // 마커를 그대로 두면 (3a)는 지급 기록이 있어 orphan 으로 안 걸리므로, sent_at 으로
    // (3) 진입 즉시 걸러낸다. 두 상한도 함께 채워 이중으로 막지만, 이 봉인 쓰기 자체가
    // 실패해도 사전 증가된 attempts 가 중복을 하드 상한 안으로 묶어 준다.
    if (await deps.markers.set(userId, null)) return { outcome: "sent", sealFailed: false };
    const sealed: MailDue = {
      ...attempted,
      sent_at: new Date(deps.now()).toISOString(),
      attempts: MAX_MAIL_ATTEMPTS_HARD,
      dispatched: MAX_MAIL_DISPATCHES,
    };
    if (await deps.markers.set(userId, sealed)) return { outcome: "sent", sealFailed: false };
    // 해당 row 의 jsonb 쓰기가 계속 실패하는 상태 — 수동 확인이 필요하다.
    deps.warn("[expiry-regrant] 발송 후 마커 봉인 실패 — 재발송 위험", { user_id: userId });
    return { outcome: "sent", sealFailed: true };
  }

  // 발송 실패 — "sendMail 호출까지 도달했다"는 사실만 남긴다(최선 노력).
  // attempts 는 위에서 이미 올렸으므로 여기서 또 올리지 않는다. 이 쓰기가 실패해도
  // 하드 상한(attempts)은 그대로 유효하다 — 그래서 실패를 따로 처리하지 않는다.
  await deps.markers.set(userId, { ...attempted, dispatched: dispatched + 1 });
  return { outcome: "failed", sealFailed: false };
}

export type RetryOutcome =
  | "cleared_invalid" // 수신거부·무효 마커 — 발송 없이 정리
  | "cleared_sent" // 지난 실행에서 발송 완료(sent_at 봉인) — 정리만
  | "cleared_orphan" // 마커만 있고 지급 기록 없음 — 발송 없이 정리
  | "cleared_stale" // 지급이 마커보다 오래됨(과거 지급) — 발송 없이 정리
  | "cleared_exhausted" // 상한 도달 — 포기
  | SendOutcome;

// (3) 미발송 재시도 한 건. grantedAt = promo_redemptions 의 지급 시각(없으면 undefined).
export async function runRetryRow(
  deps: RegrantDeps,
  row: {
    id: string;
    email: string | null;
    marketing_opt_in: boolean | null;
    regrant_mail_due: unknown;
  },
  grantedAt: string | undefined,
  grantCredits: number
): Promise<{ outcome: RetryOutcome; sealFailed: boolean }> {
  const clean = { sealFailed: false } as const;
  const due = row.regrant_mail_due;
  // 그 사이 수신거부한 계정·무효 마커는 발송 없이 표시만 지운다.
  if (!isMailDue(due) || row.marketing_opt_in !== true || !row.email) {
    await deps.markers.set(row.id, null);
    return { outcome: "cleared_invalid", ...clean };
  }
  if (due.sent_at) {
    // 지난 실행에서 발송은 끝났고 마커 제거만 실패한 흔적 — 재발송 없이 지우기만 한다.
    await deps.markers.set(row.id, null);
    return { outcome: "cleared_sent", ...clean };
  }
  if (grantedAt === undefined) {
    // 마커는 있는데 지급 기록이 없다 — 마커 선기록 직후 죽은 흔적. 안내할 지급이
    // 없으니 발송하지 않고 마커만 지운다. 이 계정은 이번 실행의 후보 수집(1)이
    // 이미 미지급자로 잡아 뒀으므로 (4)에서 정상 지급되고 메일도 나간다.
    deps.warn("[expiry-regrant] 마커만 있고 지급 기록 없음 — 발송 없이 마커 제거", {
      user_id: row.id,
    });
    await deps.markers.set(row.id, null);
    return { outcome: "cleared_orphan", ...clean };
  }
  // 지급 기록이 이 마커보다 앞서면 "이 마커가 안내하려던 지급"이 아니다
  // (normalized_email 중복이 아니라 user_id 중복으로 already_redeemed 가 났고,
  //  롤백까지 실패한 경우). 마커의 만료일은 이번 실행이 예측한 값이라 그대로
  // 보내면 없던 지급의 유효기간을 안내하게 된다 — 발송 없이 마커만 지운다.
  const queuedMs = due.queued_at ? Date.parse(due.queued_at) : NaN;
  const grantedMs = Date.parse(grantedAt);
  if (
    Number.isFinite(queuedMs) &&
    Number.isFinite(grantedMs) &&
    grantedMs < queuedMs - GRANT_CLOCK_SKEW_MS
  ) {
    deps.warn("[expiry-regrant] 마커보다 오래된 지급 — 발송 없이 마커 제거", {
      user_id: row.id,
      granted_at: grantedAt,
      queued_at: due.queued_at,
    });
    await deps.markers.set(row.id, null);
    return { outcome: "cleared_stale", ...clean };
  }
  if (isMailExhausted(due)) {
    // 계속 실패하는 주소(반송 등) — 포기하고 마커를 지워 다른 재시도를 막지 않는다.
    deps.warn("[expiry-regrant] 재시도 상한 초과 — 발송 포기", { user_id: row.id });
    await deps.markers.set(row.id, null);
    return { outcome: "cleared_exhausted", ...clean };
  }
  return dispatchMail(deps, {
    userId: row.id,
    email: row.email,
    due,
    grantCredits,
  });
}

export type GrantOutcome =
  | { kind: "marker_failed" }
  | { kind: "grant_failed"; reason: string }
  | { kind: "grant_uncertain"; reason: string }
  | { kind: "already_redeemed" }
  | { kind: "granted"; mail: SendOutcome | "none"; sealFailed: boolean };

// (4) 지급 대상 한 건 — 마커 선기록 → 지급 RPC → 신규 발송.
export async function runGrantTarget(
  deps: RegrantDeps,
  target: { id: string; email: string; credits: number; expires_at: string; mail: boolean },
  ctx: { nowMs: number; nowIso: string; grantCredits: number; validityDays: number }
): Promise<GrantOutcome> {
  // 메일 대상은 "지급 RPC 전에" 재시도 마커를 먼저 남긴다 — 순서를 되돌리지 말 것.
  //   지급 → 마커 순서면 그 사이에 프로세스가 죽었을 때 마커가 없는 채로 지급만
  //   남고, 다음 실행의 후보 수집(1)이 already_granted 로 걸러내 지급도 메일도
  //   영영 재시도되지 않는다(지급은 계정당 평생 1회 + 발송 이력 테이블 없음).
  //   반대 방향(마커만 남고 지급 실패)은 회복된다 — DB가 확정적으로 거절한 실패는
  //   아래에서 즉시 롤백하고, 불명확한 실패(응답 유실 가능)는 마커를 남긴 채
  //   runRetryRow 의 지급 검증이 다음 실행에서 발송 여부를 정확히 판정한다.
  let due: MailDue | null = null;
  if (target.mail) {
    due = {
      lost: target.credits,
      lost_at: target.expires_at,
      // 지급 전이라 RPC가 정할 만료 시각을 아직 모른다 — 같은 규칙(지급일 + validity_days)
      // 으로 예측해 두고, 지급 성공 후 실제 값과 다르면 곧바로 고쳐 쓴다.
      new_expires: new Date(ctx.nowMs + ctx.validityDays * DAY_MS).toISOString(),
      // 이 마커가 "언제의 지급"을 안내하려는 것인지 — 재시도가 과거 지급과 구분할 때 쓴다.
      // 실행 시작 시각이라 실제 마커 기록보다 이르지만, 그 방향은 안전하다
      // (오래된 지급 판정이 보수적으로만 작동한다).
      queued_at: ctx.nowIso,
    };
    if (!(await deps.markers.set(target.id, due))) {
      // 마커를 못 남기면 메일 유실을 감지할 방법이 없다 — 지급도 다음 실행으로 미룬다.
      // 아무것도 쓰지 않았으므로 이 계정은 다음 실행에서 그대로 다시 후보가 된다.
      return { kind: "marker_failed" };
    }
  }

  // 지급 — 실패해도 다른 대상은 계속 처리한다. RPC가 원자적으로
  // (redemption 기록 → 크레딧·유효기간 갱신 → payments 기록)을 수행한다.
  const { result, rpcError } = await deps.grants.redeem(target.id, target.email);
  if (rpcError || result?.success !== true) {
    // 마커 롤백은 "DB가 확정적으로 거절한 경우"에만 — rpcError 없이 result 가
    // 돌아왔다는 건 DB가 답을 줬다는 뜻이라 지급이 없음을 확신할 수 있다
    // (exhausted·invalid_source 등은 여기서 즉시 정리된다).
    //   반대로 rpcError 는 네트워크 오류·타임아웃·5xx 를 포함한다 — supabase-js 는
    //   이것들을 throw 하지 않고 error 로 돌려주므로, RPC 는 커밋됐는데 응답만
    //   유실됐을 수 있다. 그때 마커까지 지우면 다음 실행의 후보 수집이
    //   already_granted 로 걸러내고 재시도 큐에도 안 잡혀 메일이 영영 유실된다.
    if (due && !rpcError) await deps.markers.set(target.id, null);
    const reason = rpcError?.message ?? result?.error ?? "unknown";
    if (rpcError) {
      // 응답만 유실됐을 수 있어 "지급이 커밋됐을 수도 있는" 상태 — 진짜 실패와
      // 섞어 집계하면 다음 실행이 처리할 건과 구분되지 않는다. 별도로 노출한다.
      deps.warn("[expiry-regrant] grant uncertain — 다음 실행이 판정", {
        user_id: target.id,
        reason,
      });
      return { kind: "grant_uncertain", reason };
    }
    // already_redeemed 는 수집 단계와의 경합일 뿐이라 실패로 치지 않는다
    if (result?.error === "already_redeemed") return { kind: "already_redeemed" };
    deps.warn("[expiry-regrant] grant failed", { user_id: target.id, reason });
    return { kind: "grant_failed", reason };
  }

  // 메일 — 마케팅 동의자에게만. 지급은 이미 끝났으므로 메일 실패가 지급을 되돌리지 않는다.
  if (!due) return { kind: "granted", mail: "none", sealFailed: false };
  if (typeof result.expires_at === "string" && result.expires_at !== due.new_expires) {
    // 실제 만료 시각으로 정정 — 재시도로 나가는 메일도 같은 날짜를 쓴다.
    // (만료일 정정은 dispatchMail 의 사전 증가 쓰기에 함께 실린다)
    due = { ...due, new_expires: result.expires_at };
  }
  const sent = await dispatchMail(deps, {
    userId: target.id,
    email: target.email,
    due,
    grantCredits: ctx.grantCredits,
  });
  return { kind: "granted", mail: sent.outcome, sealFailed: sent.sealFailed };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowStartIso = new Date(now - REGRANT_WINDOW_DAYS * DAY_MS).toISOString();

  const supabase = createAdminClient();

  // 마커 갱신 헬퍼 — 실패는 로그만 남긴다(재시도 1회 포함).
  async function setMarker(userId: string, value: MailDue | null): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await supabase
        .from("profiles")
        .update({ regrant_mail_due: value })
        .eq("id", userId);
      if (!error) return true;
      if (attempt === 1) {
        console.warn("[expiry-regrant] mail_due 갱신 실패", {
          user_id: userId,
          clearing: value === null,
          error: error.message,
        });
      }
    }
    return false;
  }

  // (0) 재지급 코드 확인 — 없으면 아무것도 하지 않는다 (0022 마이그레이션 필요)
  const { data: promo, error: promoError } = await supabase
    .from("promo_codes")
    .select("id, credits, validity_days, is_active")
    .eq("code", GRANT_CODE)
    .maybeSingle();
  if (promoError || !promo) {
    return NextResponse.json(
      {
        error: `재지급 코드(${GRANT_CODE}) 조회 실패 — 0022 마이그레이션 적용 여부 확인`,
        detail: promoError?.message ?? "row 없음",
      },
      { status: 500 }
    );
  }
  if (promo.is_active) {
    // 공개 상환이 열려 있으면 코드 유출 시 무제한 지급될 수 있다 — 지급을 멈추고 알린다.
    return NextResponse.json(
      { error: `${GRANT_CODE} 코드가 활성(is_active=true) 상태 — 비활성으로 되돌린 뒤 재실행 필요` },
      { status: 500 }
    );
  }

  // (1) 후보 수집 — 페이지 단위로 훑으면서 제외 사유를 걸러내고 지급 대상을 모은다.
  //     limit 을 먼저 걸고 나중에 거르면 '이미 받은' 행이 창을 점유해 새 대상자가
  //     굶는다(2026-07-22 리뷰) — 반드시 거르면서 모은다.
  const scanned: Scanned[] = [];
  const targets: Scanned[] = [];
  let mailTargets = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, email, credits, expires_at, marketing_opt_in")
      .gte("credits", MIN_LOST)
      .gte("expires_at", windowStartIso)
      .lt("expires_at", nowIso)
      .order("expires_at", { ascending: true })
      .order("id", { ascending: true }) // 같은 만료 시각의 페이지 경계 누락/중복 방지
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const pageRows = (rows ?? []).filter((p): p is Candidate => !!p.email && !!p.expires_at);
    if ((rows ?? []).length === 0) break;

    // 이미 재지급받은 계정 — 페이지 단위 일괄 조회 (계정당 평생 1회).
    // user_id 뿐 아니라 normalized_email 로도 걸러, 탈퇴 후 재가입 계정이
    // RPC 가드에 막힐 걸 알면서 지급·메일 슬롯만 매일 점유하는 것을 막는다.
    const redeemedIds = new Set<string>();
    const redeemedNorms = new Set<string>();
    if (pageRows.length > 0) {
      const { data: reds, error: redsError } = await supabase
        .from("promo_redemptions")
        .select("user_id")
        .eq("promo_code_id", promo.id)
        .in("user_id", pageRows.map((p) => p.id));
      if (redsError) {
        // 중복 여부를 모르면 지급하지 않는다(fail-closed)
        return NextResponse.json(
          { error: `redemptions 조회 실패: ${redsError.message}` },
          { status: 500 }
        );
      }
      for (const r of reds ?? []) {
        if (r.user_id) redeemedIds.add(r.user_id);
      }

      const norms = [
        ...new Set(
          pageRows
            .map((p) => normalizeEmailAlias(p.email))
            .filter((n): n is string => !!n)
        ),
      ];
      if (norms.length > 0) {
        const { data: normReds, error: normError } = await supabase
          .from("promo_redemptions")
          .select("normalized_email")
          .eq("promo_code_id", promo.id)
          .in("normalized_email", norms);
        if (normError) {
          return NextResponse.json(
            { error: `redemptions(normalized) 조회 실패: ${normError.message}` },
            { status: 500 }
          );
        }
        for (const r of normReds ?? []) {
          if (r.normalized_email) redeemedNorms.add(r.normalized_email);
        }
      }
    }

    for (const p of pageRows) {
      if (targets.length >= MAX_GRANTS_PER_RUN) break;

      const norm = normalizeEmailAlias(p.email);
      if (redeemedIds.has(p.id) || (norm && redeemedNorms.has(norm))) {
        scanned.push({ ...p, grant: false, mail: false, skip: "already_granted" });
        continue;
      }

      // 이메일 인증 확인 — 미인증(또는 조회 실패)이면 지급·메일 모두 제외 (fail-closed)
      let confirmed = false;
      try {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(p.id);
        if (userError) {
          console.warn("[expiry-regrant] user lookup failed — skipping (fail-closed)", {
            user_id: p.id,
            error: userError.message,
          });
        } else {
          confirmed = !!userData?.user?.email_confirmed_at;
        }
      } catch (lookupError) {
        console.warn("[expiry-regrant] user lookup threw — skipping (fail-closed)", {
          user_id: p.id,
          error: lookupError instanceof Error ? lookupError.message : String(lookupError),
        });
      }
      if (!confirmed) {
        scanned.push({ ...p, grant: false, mail: false, skip: "unconfirmed" });
        continue;
      }

      const wantsMail = p.marketing_opt_in === true;
      if (wantsMail && mailTargets >= MAX_MAILS_PER_RUN) {
        // 메일 예산 소진 — 메일 없는 지급을 만들지 않도록 지급 자체를 다음 실행으로 미룬다.
        scanned.push({ ...p, grant: false, mail: false, skip: "mail_budget_deferred" });
        continue;
      }

      if (wantsMail) mailTargets += 1;
      const t: Scanned = { ...p, grant: true, mail: wantsMail, skip: null };
      scanned.push(t);
      targets.push(t);
    }

    if (targets.length >= MAX_GRANTS_PER_RUN) break;
    if ((rows ?? []).length < PAGE_SIZE) break;
  }

  // (2) 지난 실행에서 발송하지 못한 메일 (regrant_mail_due 잔존 표시)
  const { data: dueRows, error: dueError } = await supabase
    .from("profiles")
    .select("id, email, marketing_opt_in, regrant_mail_due")
    .not("regrant_mail_due", "is", null)
    // 정렬이 없으면 마커가 한도를 넘게 쌓였을 때 특정 행이 매 실행 밀려날 수 있다
    // (Postgres 의 무정렬 limit 순서는 보장되지 않는다) — 결정적으로 고정한다.
    .order("id", { ascending: true })
    .limit(MAX_RETRY_MAILS);
  const dueColumnMissing = !!dueError && /regrant_mail_due/.test(dueError.message);
  if (dueError && !dueColumnMissing) {
    return NextResponse.json({ error: `mail_due 조회 실패: ${dueError.message}` }, { status: 500 });
  }
  const retryQueue = dueError ? [] : dueRows ?? [];
  // 재시도 중 실제로 API 키·발송이 필요한 것만 (수신거부/무효 마커는 지우기만 하면 됨)
  const actionableRetries = retryQueue.filter(
    (r) => !!r.email && r.marketing_opt_in === true && isMailDue(r.regrant_mail_due)
  );

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      resendKeyConfigured: !!process.env.RESEND_API_KEY, // 운영 점검용 (값은 노출 안 함)
      minLost: MIN_LOST,
      windowDays: REGRANT_WINDOW_DAYS,
      mailDueColumnMissing: dueColumnMissing, // true면 0022 미적용(또는 스키마 캐시 미갱신)
      candidates: scanned.length,
      grantCount: targets.length,
      mailCount: mailTargets,
      mailRetryCount: actionableRetries.length,
      recipients: scanned.map((p) => ({
        email: p.email,
        lost_credits: p.credits,
        expired_at: p.expires_at,
        marketing_opt_in: p.marketing_opt_in === true,
        grant: p.grant,
        mail: p.mail,
        skip: p.skip,
      })),
    });
  }

  // 메일이 필요한 지급이 있는데 마커 컬럼을 못 읽으면(0022 미적용·스키마 캐시 미갱신)
  // 발송 실패를 기록할 수 없다 — 지급 전에 중단한다(fail-closed). 캐시 갱신 후 자연 회복.
  if (dueColumnMissing && mailTargets > 0) {
    return NextResponse.json(
      { error: "regrant_mail_due 컬럼 조회 실패 — 0022 적용·스키마 캐시 갱신 후 재실행", grantCount: targets.length },
      { status: 503 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  // 메일이 필요한 작업이 하나라도 있는데 키가 없으면 지급 전에 중단한다(fail-closed).
  // 지급은 평생 1회라, 메일 없이 지급해 버리면 그 사용자에게는 영영 알릴 수 없다.
  if (!apiKey && (mailTargets > 0 || actionableRetries.length > 0)) {
    return NextResponse.json(
      { error: "RESEND_API_KEY 미설정 — 메일 유실 방지를 위해 지급 전 중단", grantCount: targets.length },
      { status: 503 }
    );
  }

  let granted = 0;
  let mailed = 0;
  let mailRetried = 0;
  let mailOrphaned = 0;
  let mailAlreadySent = 0;
  let mailStale = 0;
  const grantFailed: string[] = [];
  const grantUncertain: string[] = [];
  const mailFailed: string[] = [];
  const markerFailed: string[] = [];
  const mailDeferred: string[] = [];
  const mailSealFailed: string[] = [];

  // 상태 머신에 꽂을 실제 구현체 — 판정·순서는 전부 위쪽 순수 함수가 갖는다.
  const deps: RegrantDeps = {
    markers: { set: setMarker },
    mailer: {
      send: ({ to, subject, html, idempotencyKey }) =>
        sendMail(apiKey as string, to, subject, html, idempotencyKey),
    },
    grants: {
      redeem: async (userId, email) => {
        const { data, error } = await supabase.rpc("redeem_promo_code", {
          p_user_id: userId,
          p_code: GRANT_CODE,
          p_source: "system",
          p_normalized_email: normalizeEmailAlias(email),
        });
        return {
          result: (data as GrantResult | null) ?? null,
          rpcError: error ? { message: error.message } : null,
        };
      },
    },
    now: () => Date.now(),
    warn: (message, meta) => console.warn(message, meta),
  };

  // Resend rate limit(초당 2건) 보호 — 실제로 발송을 시도한 뒤에만 쉰다.
  const rateLimitPause = () => new Promise((r) => setTimeout(r, 600));

  // (3a) 재시도 대상의 "실제 지급 여부 + 지급 시각" 확인 — (4)가 마커를 지급보다
  //      먼저 남기므로 마커만 있고 지급은 안 된 행이 존재할 수 있다(마커 기록 직후
  //      크래시). 그런 계정에 재지급 안내를 보내면 받지도 않은 크레딧을 알리게 된다.
  //      created_at 까지 가져오는 이유: 0022 RPC 는 user_id 중복과 normalized_email
  //      중복 모두에 already_redeemed 를 돌려주므로, "과거에 이미 받은" 계정도 지급
  //      기록이 있는 것으로 보인다. 마커의 만료일은 이번 실행이 예측해 넣은 값이라
  //      과거 지급에 붙이면 안내가 사실과 달라진다 — 시각을 비교해 걸러낸다.
  const retryIds = retryQueue.map((r) => r.id).filter((id): id is string => !!id);
  const retryGrantedAt = new Map<string, string>();
  if (retryIds.length > 0) {
    const { data: retryReds, error: retryRedsError } = await supabase
      .from("promo_redemptions")
      .select("user_id, created_at")
      .eq("promo_code_id", promo.id)
      .in("user_id", retryIds);
    if (retryRedsError) {
      // 지급 여부를 모르면 발송도 마커 정리도 하지 않는다(fail-closed). 지급 전에
      // 중단하므로 이번 실행은 아무것도 바꾸지 않고 다음 실행이 그대로 다시 시도한다.
      return NextResponse.json(
        { error: `redemptions(재시도 검증) 조회 실패: ${retryRedsError.message}`, grantCount: targets.length },
        { status: 500 }
      );
    }
    for (const r of retryReds ?? []) {
      if (!r.user_id) continue;
      // (promo_code_id, user_id) 유니크라 1건이지만, 방어적으로 가장 최근 것을 남긴다.
      const at = typeof r.created_at === "string" ? r.created_at : "";
      const prev = retryGrantedAt.get(r.user_id);
      if (prev === undefined || at > prev) retryGrantedAt.set(r.user_id, at);
    }
  }

  // (3) 미발송 재시도 — 판정은 runRetryRow 가 하고, 여기서는 집계와 rate limit 만 본다.
  for (const row of retryQueue) {
    const { outcome, sealFailed } = await runRetryRow(
      deps,
      row,
      retryGrantedAt.get(row.id),
      promo.credits
    );
    if (sealFailed && row.email) mailSealFailed.push(row.email);
    if (outcome === "cleared_sent") mailAlreadySent += 1;
    else if (outcome === "cleared_orphan") mailOrphaned += 1;
    else if (outcome === "cleared_stale") mailStale += 1;
    else if (outcome === "sent") mailRetried += 1;
    else if (outcome === "deferred" && row.email) mailDeferred.push(row.email);
    else if (outcome === "failed" && row.email) mailFailed.push(row.email);
    if (outcome === "sent" || outcome === "failed") await rateLimitPause();
  }

  // (4) 지급 + 신규 메일 — 순서·롤백 규칙은 runGrantTarget 안에 있다.
  const grantCtx = {
    nowMs: now,
    nowIso,
    grantCredits: promo.credits,
    validityDays: promo.validity_days ?? 7,
  };
  for (const p of targets) {
    const outcome = await runGrantTarget(deps, p, grantCtx);
    if (outcome.kind === "marker_failed") {
      markerFailed.push(p.email);
      continue;
    }
    if (outcome.kind === "grant_uncertain") {
      grantUncertain.push(p.email);
      continue;
    }
    if (outcome.kind === "grant_failed") {
      grantFailed.push(p.email);
      continue;
    }
    if (outcome.kind === "already_redeemed") continue;

    granted += 1;
    if (outcome.sealFailed) mailSealFailed.push(p.email);
    if (outcome.mail === "sent") mailed += 1;
    else if (outcome.mail === "deferred") mailDeferred.push(p.email);
    else if (outcome.mail === "failed") mailFailed.push(p.email);
    if (outcome.mail === "sent" || outcome.mail === "failed") await rateLimitPause();
  }

  return NextResponse.json({
    candidates: scanned.length,
    grantCount: targets.length,
    granted,
    mailed,
    mailRetried,
    mailOrphaned, // 마커만 있고 지급 기록이 없어 발송 없이 정리한 건수
    mailAlreadySent, // 지난 실행에서 발송됐으나 마커 제거만 실패해 이번에 정리한 건수
    mailStale, // 지급 기록이 마커보다 오래돼(과거 지급) 발송 없이 정리한 건수
    grantFailed, // DB가 확정적으로 거절한 지급 (마커도 함께 롤백됨)
    grantUncertain, // 응답 유실 등으로 지급 여부 불명 — 커밋됐을 수 있어 다음 실행이 판정
    mailFailed,
    markerFailed, // 마커를 못 남겨 지급을 다음 실행으로 미룬 계정
    mailDeferred, // 시도 횟수를 못 올려 이번 실행 발송을 보류한 계정 (다음 실행이 재시도)
    mailSealFailed, // 발송 후 마커 제거·봉인이 모두 실패 — 재발송 위험, 수동 확인 필요
  });
}
