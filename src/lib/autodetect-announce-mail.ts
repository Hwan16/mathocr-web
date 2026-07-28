import { unsubscribeToken } from "@/lib/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/mail";

// ── 자동 인식(v2.2.0) 출시 안내 메일 본문 (2026-07-28 캠페인) ──
//
// 대상: 마케팅 수신 동의자 한정 (광고성 정보 — 정보통신망법 제50조).
// 제목 "(광고)" + 수신거부 링크 + 발신 사업자 표기 필수.
// 발송 경로: /api/admin/autodetect-announce (terms-notice와 같은 서버 발송 패턴 —
// RESEND_API_KEY가 Vercel Sensitive라 로컬 스크립트로는 발송 불가).
// 다음 기능 안내 캠페인 때는 이 파일의 BATCH·제목·본문을 교체해 재사용한다.

/** Resend Idempotency-Key 프리픽스 — 같은 배치·같은 사용자 재호출 시 중복 발송 방지 */
export const ANNOUNCE_BATCH = "autodetect-announce-2026-07-28";

export const ANNOUNCE_SUBJECT =
  "(광고) [AI MathOCR] 박스는 이제 AI가 먼저 그려드려요 — ✨ 자동 인식 출시";

const SITE_URL = "https://mathocr.ai.kr";
const HERO_URL = `${SITE_URL}/mail/autodetect-hero.png`;
const UTM = "utm_source=email&utm_medium=email&utm_campaign=autodetect_announce";
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·주소·전화번호)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994";

export function buildAnnounceHtml(userId: string): string {
  const token = unsubscribeToken(userId, "user");
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  return `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <a href="${SITE_URL}/?${UTM}" style="text-decoration:none;">
    <img src="${HERO_URL}" width="520" alt="AI 자동 인식 — 문제·그림 박스 초안이 자동으로 그려진 앱 화면"
         style="display:block;width:100%;max-width:520px;height:auto;border-radius:14px;border:1px solid #e4e4e7;" />
  </a>
  <h1 style="font-size:20px;margin:20px 0 12px;">박스는 이제 <span style="color:#7c3aed;">AI가 먼저</span> 그려드려요</h1>
  <p style="margin:0 0 16px;">안녕하세요, AI MathOCR입니다.</p>
  <p style="margin:0 0 16px;">
    이제 파일을 열고 <strong>[✨ 자동 인식] 버튼 하나면</strong> 문제·그림 박스
    초안이 페이지마다 자동으로 그려집니다. 확인하며 다듬기만 하면 되고,
    <strong style="color:#7c3aed;">크레딧 차감 없이 무료</strong>예요.
  </p>
  <p style="margin:0 0 16px;">
    손글씨 풀이가 가득한 시험지 사진에서도 인쇄된 문제와 그림만 골라 잡아냅니다.
  </p>
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">이렇게 써보세요</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      1️⃣ 앱을 켜면 좌측 하단에 "새 버전" 알림이 떠 있어요 → [지금 설치] (1분이면 끝)<br />
      2️⃣ 파일을 열고 [✨ 자동 인식] 버튼 클릭<br />
      3️⃣ 초안을 확인·다듬고 [변환하기]
    </p>
  </div>
  <a href="${SITE_URL}/?${UTM}#download"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    지금 써보기
  </a>
  <p style="margin:12px 0 0;text-align:center;font-size:13px;color:#71717a;">
    아직 설치 전이라면 위 버튼으로 새로 설치해도 똑같이 쓸 수 있어요.
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 마케팅 수신에 동의하신 분께 새 기능 소식을 담아 보내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: ${SUPPORT_EMAIL} · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
}
