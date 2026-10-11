import { unsubscribeToken } from "@/lib/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/mail";
import { AI_SOLUTION_RULE } from "@/lib/plans";

// ── AI 해설 출시 기념가(D-040) 안내 메일 본문 (2026-10-11 캠페인) ──
//
// 대상: 마케팅 수신 동의자 한정 (광고성 정보 — 정보통신망법 제50조).
// 제목 "(광고)" + 수신거부 링크 + 발신 사업자 표기 필수. 형식은 autodetect-announce-mail.ts와 같다.
// 발송 경로: /api/admin/ai-solution-promo-announce (서버가 자기 RESEND 키로 발송).
// 문구 원칙(D-040): 가격은 '+1'·'추가'로(변환 포함 1크레딧 오해 방지), 50%·할인·마감·취소선 금지,
// "종료 시 2주 전 미리 공지"는 작게.

/** Resend Idempotency-Key 프리픽스 — 같은 배치·같은 사용자 재호출 시 중복 발송 방지 */
export const PROMO_BATCH = "ai-solution-promo-2026-10-11";

const unit = AI_SOLUTION_RULE.current;

export const PROMO_SUBJECT = `(광고) [AI MathOCR] AI 해설, 출시 기념가로 문제당 +${unit}크레딧`;

const SITE_URL = "https://mathocr.ai.kr";
const HERO_URL = `${SITE_URL}/app-notice/ai-solution-promo-2026-10.png`;
const UTM = "utm_source=email&utm_medium=email&utm_campaign=ai_solution_promo";
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·주소·전화번호)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994";

export function buildPromoHtml(userId: string): string {
  const token = unsubscribeToken(userId, "user");
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <a href="${SITE_URL}/?${UTM}#ai-solution" style="text-decoration:none;">
    <img src="${HERO_URL}" width="520" alt="AI 해설, 문제당 +${unit}크레딧 — 출시 기념가"
         style="display:block;width:100%;max-width:520px;height:auto;border-radius:14px;border:1px solid #e4e4e7;" />
  </a>
  <h1 style="font-size:20px;margin:20px 0 12px;">해설 PDF가 없어도, <span style="color:#7c3aed;">해설까지 한 번에</span></h1>
  <p style="margin:0 0 16px;">안녕하세요, AI MathOCR입니다.</p>
  <p style="margin:0 0 16px;">
    변환할 때 AI가 문제별 해설을 모의고사 해설처럼 써서 <strong>[정답 및 해설]에 함께</strong> 넣어 드리는
    AI 해설 생성 기능, 지금 <strong style="color:#7c3aed;">출시 기념가로 문제당 ${unit}크레딧만 추가</strong>됩니다.
  </p>
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:12px 16px;margin:0 0 16px;text-align:center;font-size:15px;">
    문제 변환 <strong>1크레딧</strong> &nbsp;+&nbsp; AI 해설 <strong style="color:#7c3aed;">${unit}크레딧</strong>
  </div>
  <p style="margin:0 0 16px;">
    학년을 고르면 그 학년까지 배운 방법으로만 풀고, 수식은 더블클릭하면 바로 고쳐지는 한글 수식으로 들어가요.
    만들지 못한 해설은 크레딧을 돌려드립니다.
  </p>
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">이렇게 써보세요</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      1️⃣ 앱을 켜서 새 버전 안내가 뜨면 [지금 업데이트]<br />
      2️⃣ 파일을 열고 우측 목록의 [💡AI] 칸 체크 (전부라면 [AI 해설 일괄 적용])<br />
      3️⃣ [변환하기]
    </p>
  </div>
  <a href="${SITE_URL}/?${UTM}#ai-solution"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    AI 해설 자세히 보기
  </a>
  <p style="margin:12px 0 0;text-align:center;font-size:12px;color:#a1a1aa;">
    출시 기념가는 종료 시 2주 전에 미리 알려 드립니다.
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 마케팅 수신에 동의하신 분께 새 소식을 담아 보내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: ${SUPPORT_EMAIL} · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
}
