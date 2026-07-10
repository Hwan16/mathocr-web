import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";
import { NextRequest, NextResponse } from "next/server";

// 관리자: 얼리버드 오픈 안내 메일 발송 (0014) — 결제 오픈 날 '딸깍' 버튼의 실체.
//
// - 대상: marketing_opt_in = true & earlybird_mail_sent_at is null (중복 발송 불가)
// - Resend 무료 티어(일 100통) 보호: 한 번에 BATCH_SIZE(90)명씩. 남으면 응답의
//   remaining 으로 표시되고, 다음 날 버튼을 다시 누르면 이어서 발송된다.
// - dry: true 면 발송 없이 대상·설정 점검만 (오픈 전 미리 확인용)
// - 법적 요건: 제목 (광고) 표기 + 전송자 명시 + 수신거부 링크 (정보통신망법)
//
// ⚠️ 오픈 직전 확정: OFFER_HTML(얼리버드 구매 혜택 문구)를 실제 혜택으로 교체할 것.

export const dynamic = "force-dynamic";

const BATCH_SIZE = 90;
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
const SITE_URL = "https://mathocr.ai.kr";

// ⚠️ 오픈 직전 확정할 것 (사용자 결정): 얼리버드 구매 혜택의 실제 내용/프로모 코드.
// 아래는 혜택 미확정 상태에서도 보낼 수 있는 기본 문구.
const OFFER_HTML = `
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">🎁 얼리버드 등록자님께</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      정식 오픈을 함께 기다려주셔서 감사합니다. 이제 크레딧 충전이 가능하며,
      얼리버드로 받으신 크레딧은 그대로 사용하실 수 있습니다.
    </p>
  </div>`;

function buildEmail(userId: string, credits: number) {
  const subject = "(광고) AI MathOCR 정식 오픈 — 크레딧 충전이 시작됐어요";
  const token = unsubscribeToken(userId);
  const unsubUrl = `${SITE_URL}/api/unsubscribe?uid=${userId}&token=${token}`;
  const creditsLine =
    credits > 0
      ? `<p style="margin:0 0 16px;">지금 보유하신 크레딧은 <strong>${credits}개</strong>입니다.</p>`
      : "";
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="font-size:18px;font-weight:700;margin:0 0 4px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <h1 style="font-size:20px;margin:20px 0 12px;">정식 오픈 안내</h1>
  <p style="margin:0 0 16px;">
    안녕하세요, AI MathOCR입니다.<br />
    얼리버드로 함께해주신 덕분에 결제 기능을 열고 정식 오픈했습니다.
  </p>
  ${creditsLine}
  ${OFFER_HTML}
  <a href="${SITE_URL}/charge"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    크레딧 충전하러 가기
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 얼리버드 등록 시 수신에 동의하신 분께 발송되는 광고성 정보입니다.<br />
    전송자: 환희에듀테크랩 (AI MathOCR) · 문의: aimathocr.official@gmail.com<br />
    <a href="${unsubUrl}" style="color:#a1a1aa;text-decoration:underline;">수신거부 (무료)</a>
  </p>
</div>`;
  return { subject, html };
}

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body: { dry?: boolean } = await request.json().catch(() => ({}));
  const dry = body.dry === true;

  const adminClient = createAdminClient();

  // 미발송 대상 (0014 컬럼 필요 — 미적용이면 명확한 에러로 안내)
  const { data: targets, error, count } = await adminClient
    .from("profiles")
    .select("id, email, credits", { count: "exact" })
    .eq("marketing_opt_in", true)
    .is("earlybird_mail_sent_at", null)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { error: "대상 조회 실패 — 0014 마이그레이션 적용 여부를 확인하세요: " + error.message },
      { status: 500 }
    );
  }

  const pending = count ?? targets?.length ?? 0;
  const resendKeyConfigured = !!process.env.RESEND_API_KEY;
  const unsubscribeConfigured = !!process.env.CRON_SECRET;

  if (dry) {
    const preview = buildEmail("00000000-0000-0000-0000-000000000000", 30);
    return NextResponse.json({
      dry: true,
      pending,
      batch_size: BATCH_SIZE,
      resend_key_configured: resendKeyConfigured,
      unsubscribe_configured: unsubscribeConfigured,
      preview_subject: preview.subject,
      recipients: (targets ?? []).map((t) => t.email),
    });
  }

  if (!resendKeyConfigured) {
    return NextResponse.json(
      { error: "RESEND_API_KEY 미설정 — Vercel 환경변수를 먼저 등록하세요." },
      { status: 503 }
    );
  }
  if (!unsubscribeConfigured) {
    // 수신거부 링크는 법정 필수 — 서명 비밀 없이는 발송하지 않는다
    return NextResponse.json(
      { error: "CRON_SECRET 미설정 — 수신거부 링크 서명에 필요합니다." },
      { status: 503 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY!;
  let sent = 0;
  const failed: string[] = [];

  for (const t of targets ?? []) {
    if (!t.email) continue;
    const { subject, html } = buildEmail(t.id, t.credits ?? 0);
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to: t.email, subject, html }),
      });
      if (resp.ok) {
        sent += 1;
        // 발송 성공 즉시 기록 — 재클릭·중단 시에도 중복 발송이 없다
        await adminClient
          .from("profiles")
          .update({ earlybird_mail_sent_at: new Date().toISOString() })
          .eq("id", t.id);
      } else {
        failed.push(t.email);
      }
    } catch {
      failed.push(t.email);
    }
    // Resend rate limit(초당 2건) 보호
    await new Promise((r) => setTimeout(r, 600));
  }

  return NextResponse.json({
    pending,
    attempted: targets?.length ?? 0,
    sent,
    failed,
    remaining: Math.max(0, pending - sent),
  });
}
