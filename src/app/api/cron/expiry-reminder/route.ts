import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 크레딧 만료 임박 안내 (F9) — vercel.json cron이 매일 1회 호출한다.
//
// 대상: 크레딧을 보유하고 유효기간 만료가 REMIND_BEFORE_DAYS일 앞으로 다가온
// 사용자. 조회 창을 [만료 6일 전, 7일 전)으로 잡아 매일 실행 시 사용자당
// 정확히 한 번만 발송된다. (재충전으로 만료일이 미래로 옮겨지면 새 만료일이
// 다가올 때 다시 안내되는데, 이는 의도된 동작)
//
// 정책(2026-07-09 확정): 만료 후 연장·복구는 없다. 이 메일은 소멸 예정 "안내"와
// "만료 전 충전 시 잔여 크레딧도 새 유효기간으로 연장"이라는 재구매 유도만 한다.
// 약관 제6조가 이 사전 안내를 전제하므로 cron 등록을 해제하지 말 것.

export const dynamic = "force-dynamic";

const REMIND_BEFORE_DAYS = 7;
const MAX_PER_RUN = 200; // 안전 상한 (Resend 무료 티어 일 100통 — 초과 시 플랜 확인)
const CHARGE_URL = "https://mathocr.ai.kr/charge";
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";

function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function buildEmail(credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const subject = `[AI MathOCR] 보유 크레딧 ${credits}개가 ${dateStr}에 만료됩니다`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
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
  </p>
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
    본 메일은 보유 크레딧의 만료 예정을 알려드리는 서비스 안내 메일입니다.<br />
    문의: aimathocr.official@gmail.com · <a href="https://mathocr.ai.kr" style="color:#a1a1aa;">mathocr.ai.kr</a>
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
    .select("id, email, credits, expires_at")
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
      window: { start: windowStart, end: windowEnd },
      count: targets.length,
      recipients: targets.map((p) => ({
        email: p.email,
        credits: p.credits,
        expires_at: p.expires_at,
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
    const { subject, html } = buildEmail(p.credits, p.expires_at);
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
