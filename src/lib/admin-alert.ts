// 관리자 경보 메일 — ocr-guard의 비용 경보와 같은 채널(Resend → 운영자 지메일).
// 발송 실패는 콘솔 로그로만 남긴다 (경보 때문에 원 요청을 실패시키지 않는다).
const ADMIN_ALERT_EMAIL = "aimathocr.official@gmail.com";
const ALERT_FROM = "AI MathOCR <noreply@mathocr.ai.kr>";

export async function sendAdminAlert(
  subject: string,
  html: string
): Promise<boolean> {
  console.error(`[admin-alert] ${subject}`);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false; // 키 미설정 — 콘솔 경보만

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      // 경보는 부가 기능 — 메일 서버 무응답이 원 요청(결제 등)을 오래 붙잡지 않게 제한
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: ADMIN_ALERT_EMAIL,
        subject,
        html: `<div style="font-family:'Malgun Gothic',sans-serif;line-height:1.7;">${html}</div>`,
      }),
    });
    if (!resp.ok) {
      console.error("[admin-alert] mail rejected", { status: resp.status });
    }
    return resp.ok;
  } catch (error) {
    console.error("[admin-alert] mail failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
