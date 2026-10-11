import { unsubscribeToken } from "@/lib/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/mail";
import { AI_SOLUTION_RULE } from "@/lib/plans";

// ── 새 기능 2가지 안내 메일 본문 — 완성된 시험지(v2.5.0, D-041) + AI 해설 출시 기념가(D-040) ──
//
// 처음엔 AI 해설 기념가 단독 메일(2026-10-11)이었으나, 사용자 지시로 발송을 미루고
// 완성된 시험지 출시(2026-10-12)와 한 메일로 묶었다(CHECKLIST 124.7·125.7).
//
// 대상: 마케팅 수신 동의자 한정 (광고성 정보 — 정보통신망법 제50조).
// 제목 "(광고)" + 수신거부 링크 + 발신 사업자 표기 필수. 형식은 autodetect-announce-mail.ts와 같다.
// 발송 경로: /api/admin/ai-solution-promo-announce (서버가 자기 RESEND 키로 발송).
// 문구 원칙(D-040): 가격은 '+1'·'추가'로(변환 포함 1크레딧 오해 방지), 50%·할인·마감·취소선 금지,
// "종료 시 2주 전 미리 공지"는 작게.
// 그림: 둘 다 1008×600(메일에선 520px로 표시) — 시험지 그림은 홈 '완성된 시험지' 카드를 같은 판형으로 렌더한 것.

/** Resend Idempotency-Key 프리픽스 — 같은 배치·같은 사용자 재호출 시 중복 발송 방지 */
export const PROMO_BATCH = "new-features-2026-10-12";

const unit = AI_SOLUTION_RULE.current;

// 사용자 선택(2026-10-12, 후보 A): 본문 썰과 같은 공감형. 가격은 미리보기 문장(PREHEADER)이 맡고, 발신자명이 AI MathOCR라 [AI MathOCR]은 뺐다.
export const PROMO_SUBJECT = "(광고) 시험지, 이제 직접 안 만드셔도 돼요 — AI MathOCR 새 기능 2가지";

const SITE_URL = "https://mathocr.ai.kr";
const EXAM_IMG_URL = `${SITE_URL}/mail/exam-sheet-2026-10.png`;
const AI_IMG_URL = `${SITE_URL}/app-notice/ai-solution-promo-2026-10.png`;
const UTM = "utm_source=email&utm_medium=email&utm_campaign=new_features_2026_10";
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·주소·전화번호)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994";

// 받은편지함 목록에 제목 옆으로 보이는 미리보기 문장(본문에는 보이지 않음)
const PREHEADER = `시험지 직접 만드시던 시간, 이제 [변환하기] 한 번으로 — 해설은 문제당 +${unit}크레딧.`;

const IMG_STYLE =
  "display:block;width:100%;max-width:520px;height:auto;border-radius:14px;border:1px solid #e4e4e7;";
const LABEL_STYLE =
  "display:inline-block;font-size:12px;font-weight:700;color:#5b21b6;background:#ede9fe;border-radius:999px;padding:3px 10px;margin:0 0 10px;";
const H2_STYLE = "font-size:19px;line-height:1.4;margin:18px 0 10px;";

export function buildPromoHtml(userId: string): string {
  const token = unsubscribeToken(userId, "user");
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  return `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADER}</div>
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="font-size:18px;font-weight:700;margin:0 0 20px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <p style="margin:0 0 12px;">안녕하세요, AI MathOCR입니다.</p>
  <p style="margin:0 0 12px;">
    그동안 변환한 문제는 주로 <strong>문제은행</strong>처럼 쓰셨을 거예요. 한글 파일로 받아 두었다가,
    시험을 낼 때면 문제를 골라 붙이고, 단을 나누고, 제목을 달고, 넘친 문제를 다음 쪽으로 옮기고…
    결국 <strong>시험지 모양은 선생님 손으로 직접</strong> 만드셔야 했죠.
  </p>
  <p style="margin:0 0 12px;">
    이번 업데이트부터는 변환할 때 고르기만 하시면 돼요.
    <strong>[완성된 시험지로 받을래요]</strong>를 고르면 문제를 칸에 맞춰 배치하고 제목·로고까지 넣은 시험지가 바로 나와요.
    받자마자 인쇄해서 나눠 주시면 됩니다.
  </p>
  <p style="margin:0 0 28px;">
    여기에 해설 PDF가 없는 문제도 AI가 해설을 써 드리는 <strong>AI 해설</strong>이,
    지금 <strong style="color:#7c3aed;">출시 기념가로 문제당 ${unit}크레딧만 추가</strong>돼요.
  </p>

  <!-- 1. 완성된 시험지 -->
  <span style="${LABEL_STYLE}">새 기능 ① 완성된 시험지</span>
  <a href="${SITE_URL}/?${UTM}#exam-sheet" style="text-decoration:none;">
    <img src="${EXAM_IMG_URL}" width="520" alt="받자마자 바로 인쇄하는 완성된 시험지 — 문제 길이에 따라 칸에 자동 배치" style="${IMG_STYLE}" />
  </a>
  <h2 style="${H2_STYLE}">이제 시험지는, 고르기만 하세요</h2>
  <p style="margin:0 0 12px;">
    [변환하기]를 누르면 '결과 모양 고르기' 창이 떠요. 지금처럼 고치고 넣고 빼기 쉬운
    <strong>[문제은행으로 저장할래요]</strong>, 바로 인쇄하는 <strong>[완성된 시험지로 받을래요]</strong> 중에서 고르시면 돼요.
  </p>
  <p style="margin:0 0 12px;">
    완성된 시험지를 고르면 문제마다 실제 길이를 재서 짧은 문제는 한 단에 2개, 긴 문제는 1개씩 칸에 넣어요.
    칸을 넘치는 문제가 없도록 마지막에 한 번 더 확인하고, 선택지도 칸 너비에 맞춰 가지런히 정리해요.
  </p>
  <p style="margin:0 0 28px;font-size:14px;color:#3f3f46;">
    · 과목명·시험지 제목·학원 로고·이름 칸·꼬리말을 넣을 수 있어요 ('이 설정 기억하기'를 켜면 다음에도 그대로)<br />
    · 정답과 해설은 시험지 뒤 새 쪽부터 이어져요<br />
    · 문제은행용 파일도 함께 저장돼서, 나중에 문제를 다시 쓰기도 편해요<br />
    · 크레딧은 지금과 똑같아요 — 시험지로 받는다고 더 들지 않아요
  </p>

  <!-- 2. AI 해설 출시 기념가 -->
  <span style="${LABEL_STYLE}">새 기능 ② AI 해설 · 출시 기념가</span>
  <a href="${SITE_URL}/?${UTM}#ai-solution" style="text-decoration:none;">
    <img src="${AI_IMG_URL}" width="520" alt="AI 해설, 문제당 +${unit}크레딧 — 출시 기념가" style="${IMG_STYLE}" />
  </a>
  <h2 style="${H2_STYLE}">해설 PDF가 없어도, <span style="color:#7c3aed;">해설까지 한 번에</span></h2>
  <p style="margin:0 0 12px;">
    해설 PDF가 없는 학교 시험지나 프린트는 그동안 해설을 직접 쓰셔야 했죠.
    이제는 문제 옆 <strong>[💡AI] 칸만 체크</strong>하면, 변환할 때 AI가 문제별 해설을 모의고사 해설처럼 써서
    <strong>[정답 및 해설]에 함께</strong> 넣어 드려요.
  </p>
  <p style="margin:0 0 16px;">
    지금은 출시 기념가로 문제당 ${unit}크레딧만 추가됩니다.
  </p>
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:12px 16px;margin:0 0 12px;text-align:center;font-size:15px;">
    문제 변환 <strong>1크레딧</strong> &nbsp;+&nbsp; AI 해설 <strong style="color:#7c3aed;">${unit}크레딧</strong>
  </div>
  <p style="margin:0 0 28px;font-size:14px;color:#3f3f46;">
    학년을 고르면 그 학년까지 배운 방법으로만 풀고, 수식은 더블클릭하면 바로 고쳐지는 한글 수식으로 들어가요.
    만들지 못한 해설은 크레딧을 돌려드립니다.
  </p>

  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">이렇게 써보세요</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      1️⃣ 앱을 켜서 새 버전 안내가 뜨면 [지금 업데이트]<br />
      2️⃣ 해설이 필요한 문제는 우측 목록의 [💡AI] 칸 체크 (전부라면 [AI 해설 일괄 적용])<br />
      3️⃣ [변환하기] → [완성된 시험지로 받을래요] 또는 [문제은행으로 저장할래요]
    </p>
  </div>
  <a href="${SITE_URL}/?${UTM}#exam-sheet"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    새 기능 자세히 보기
  </a>
  <p style="margin:12px 0 0;text-align:center;font-size:12px;color:#a1a1aa;">
    AI 해설 출시 기념가는 종료 시 2주 전에 미리 알려 드립니다.
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 마케팅 수신에 동의하신 분께 새 소식을 담아 보내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: ${SUPPORT_EMAIL} · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
}
