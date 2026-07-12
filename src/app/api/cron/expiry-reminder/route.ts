import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";

// 크레딧 만료 임박 안내 (F9) — vercel.json cron이 매일 1회 호출한다.
//
// 대상: 크레딧을 보유하고 유효기간 만료가 REMIND_BEFORE_DAYS일 앞으로 다가온
// 사용자. 조회 창을 [만료 6일 전, 7일 전)으로 잡아 매일 실행 시 사용자당
// 정확히 한 번만 발송된다. (재충전으로 만료일이 미래로 옮겨지면 새 만료일이
// 다가올 때 다시 안내되는데, 이는 의도된 동작)
//
// 정책(2026-07-09 확정): 만료 후 연장·복구는 없다. 약관 제6조가 이 사전 안내를
// 전제하므로 cron 등록을 해제하지 말 것.
//
// 마케팅 동의 분기 (LA-09, 정보통신망법 제50조):
//   - marketing_opt_in=false/null → 중립형: 만료일·소멸 크레딧 수만 사실 고지
//     (소비자 보호 목적의 서비스 안내 — 충전 유도 CTA·혜택 문구 없음).
//   - marketing_opt_in=true → 재구매 유도 포함: 제목 "(광고)" 표기 + 수신거부
//     링크(kind=user — profiles.marketing_opt_in 해제) + 발신 사업자 표기.

export const dynamic = "force-dynamic";

const REMIND_BEFORE_DAYS = 7;
const MAX_PER_RUN = 200; // 안전 상한 (Resend 무료 티어 일 100통 — 초과 시 플랜 확인)
const SITE_URL = "https://mathocr.ai.kr";
const CHARGE_URL = `${SITE_URL}/charge`;
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·연락처)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호";

function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

// 메일 공통 골격 — 로고 + 만료 사실 고지(크레딧 수·만료일·소멸 안내)까지는
// 동의 여부와 무관한 사실 정보라 두 템플릿이 공유한다.
function factsHtml(credits: number, dateStr: string): string {
  return `
  <p style="font-size:18px;font-weight:700;margin:0 0 4px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <h1 style="font-size:20px;margin:20px 0 12px;">크레딧 만료 예정 안내</h1>
  <p style="margin:0 0 16px;">안녕하세요, AI MathOCR입니다.</p>
  <div style="background:#f5f3ff;border-radius:12px;padding:16px 20px;margin:0 0 16px;">
    <p style="margin:0;font-size:15px;">
      보유하신 크레딧 <strong>${credits}개</strong>의 유효기간이<br />
      <strong style="color:#7c3aed;">${dateStr}</strong>까지입니다.
    </p>
  </div>
  <p style="margin:0 0 16px;">
    유효기간이 지나면 남은 크레딧은 자동으로 소멸되며,
    <strong>복구나 환불이 되지 않습니다.</strong>
  </p>`;
}

// 중립형 (마케팅 비동의자) — 소멸 예정 사실만 고지하고 끝낸다.
// 충전 유도 CTA·혜택 문구가 없으므로 광고성 정보가 아니다 → "(광고)" 표기 불요.
function buildNeutralEmail(credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const subject = `[AI MathOCR] 보유 크레딧 ${credits}개가 ${dateStr}에 만료됩니다`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
${factsHtml(credits, dateStr)}
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 보유 크레딧의 만료 예정을 알려드리는 서비스 안내 메일입니다.<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a>
  </p>
</div>`;
  return { subject, html };
}

// 광고형 (마케팅 동의자) — 재구매 유도(연장 안내 + 충전 CTA)를 포함하므로
// 제목 "(광고)" 표기 + 수신거부 링크 + 발신 사업자 표기를 붙인다.
function buildMarketingEmail(userId: string, credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const subject = `(광고) [AI MathOCR] 보유 크레딧 ${credits}개가 ${dateStr}에 만료됩니다`;
  // CRON_SECRET 인증을 통과한 뒤라 토큰은 항상 생성되지만, 만약을 대비해
  // 토큰이 없으면 수신거부 링크 없는 광고 메일이 나가지 않도록 마이페이지로 안내한다.
  const token = unsubscribeToken(userId, "user");
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부</a>`
    : `수신거부: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
${factsHtml(credits, dateStr)}
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">💡 남은 크레딧을 지키는 방법</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      만료 <strong>전에</strong> 크레딧을 새로 충전하시면, 지금 남아 있는
      크레딧도 사라지지 않고 <strong>새로 충전한 크레딧의 유효기간까지 함께
      연장</strong>됩니다. 예를 들어 오늘 30일 플랜을 충전하면, 기존 크레딧도
      오늘부터 30일 뒤까지 그대로 사용하실 수 있습니다.
    </p>
  </div>
  <a href="${CHARGE_URL}"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    충전하고 유효기간 연장하기
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 크레딧 만료 예정 안내와 함께, 마케팅 수신에 동의하신 분께
    충전 혜택 정보를 담아 보내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
  return { subject, html };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = new Date(
    Date.now() + (REMIND_BEFORE_DAYS - 1) * dayMs
  ).toISOString();
  const windowEnd = new Date(
    Date.now() + REMIND_BEFORE_DAYS * dayMs
  ).toISOString();

  const supabase = createAdminClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, credits, expires_at, marketing_opt_in")
    .gt("credits", 0)
    .gte("expires_at", windowStart)
    .lt("expires_at", windowEnd)
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (profiles ?? []).filter((p) => p.email && p.expires_at);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      resendKeyConfigured: !!process.env.RESEND_API_KEY, // 운영 점검용 (값은 노출 안 함)
      window: { start: windowStart, end: windowEnd },
      count: targets.length,
      recipients: targets.map((p) => ({
        email: p.email,
        credits: p.credits,
        expires_at: p.expires_at,
        // 발송 전 분기 확인용 — true면 광고형(수신거부 링크 포함), 아니면 중립형
        marketing_opt_in: p.marketing_opt_in === true,
      })),
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 키가 없으면 발송만 건너뛴다 — cron 자체는 정상 종료해 알람 소음을 줄인다.
    return NextResponse.json(
      { error: "RESEND_API_KEY 미설정 — 발송 건너뜀", count: targets.length },
      { status: 503 }
    );
  }

  let sent = 0;
  const failed: string[] = [];
  for (const p of targets) {
    const { subject, html } =
      p.marketing_opt_in === true
        ? buildMarketingEmail(p.id, p.credits, p.expires_at)
        : buildNeutralEmail(p.credits, p.expires_at);
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to: p.email, subject, html }),
      });
      if (resp.ok) {
        sent += 1;
      } else {
        failed.push(p.email);
      }
    } catch {
      failed.push(p.email);
    }
    // Resend rate limit(초당 2건) 보호
    await new Promise((r) => setTimeout(r, 600));
  }

  return NextResponse.json({ count: targets.length, sent, failed });
}
