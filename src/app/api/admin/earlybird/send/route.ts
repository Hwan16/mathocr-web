import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";
import { NextRequest, NextResponse } from "next/server";

// 관리자: 얼리버드 오픈 안내 메일 발송 (0015 신청제) — 결제 오픈 날 '딸깍' 버튼의 실체.
//
// - 대상: earlybird_signups 중 미발송(mail_sent_at null)·수신거부 아님(unsubscribed_at null)
// - 내용: 정식 오픈 알림 + 프로모 코드(earlybird — 가입 5 + 코드 25 = 총 30문제, 등록 후 7일)
// - 안전장치: earlybird 코드가 비활성이면 실발송을 거부한다 (죽은 코드를 배달하지 않기 위해
//   오픈 날 순서 강제: ① 관리자 프로모션 탭에서 코드 활성화 → ② 이 버튼)
// - Resend 무료 티어(일 100통) 보호: 한 번에 BATCH_SIZE(90)명씩 — 남으면 응답의
//   remaining 으로 표시되고, 다음 날 버튼을 다시 누르면 이어서 발송된다.
// - dry: true 면 발송 없이 대상·설정 점검만
// - 법적 요건: 제목 (광고) 표기 + 전송자 명시 + 수신거부 링크 (정보통신망법)
// - 혜택 정책(사용자 확정 2026-07-11): 얼리버드 혜택 = 30문제 코드가 전부, 구매 할인 없음

export const dynamic = "force-dynamic";

const BATCH_SIZE = 90;
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
const SITE_URL = "https://mathocr.ai.kr";
const PROMO_CODE = "earlybird";

function buildEmail(applicationId: string) {
  const subject = "(광고) AI MathOCR 정식 오픈 — 얼리버드 30문제 무료 코드가 도착했어요";
  const token = unsubscribeToken(applicationId, "app");
  const unsubUrl = `${SITE_URL}/api/unsubscribe?kind=app&uid=${applicationId}&token=${token}`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="font-size:18px;font-weight:700;margin:0 0 4px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <h1 style="font-size:20px;margin:20px 0 12px;">정식 오픈! 얼리버드 코드를 보내드려요</h1>
  <p style="margin:0 0 16px;">
    안녕하세요, AI MathOCR입니다.<br />
    얼리버드로 기다려주신 덕분에 정식 오픈했습니다. 약속드린
    <strong>총 30문제 무료 코드</strong>를 보내드려요.
  </p>
  <div style="background:#f5f3ff;border-radius:12px;padding:18px 20px;margin:0 0 8px;text-align:center;">
    <p style="margin:0 0 6px;font-size:13px;color:#6d28d9;">얼리버드 프로모션 코드</p>
    <p style="margin:0;font-size:24px;font-weight:800;letter-spacing:2px;color:#7c3aed;">${PROMO_CODE}</p>
  </div>
  <p style="margin:0 0 16px;font-size:13px;color:#52525b;">
    · 신규 가입: 회원가입 화면에서 코드를 입력하면 <strong>기본 5 + 코드 25 = 총 30문제</strong><br />
    · 이미 회원: 마이페이지에서 코드를 입력하면 <strong>+25문제</strong><br />
    · 코드로 받은 크레딧은 등록 후 <strong>7일간</strong> 사용할 수 있어요 (1인 1회)
  </p>
  <a href="${SITE_URL}/auth/signup"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    지금 가입하고 30문제 받기
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 얼리버드 신청 시 수신에 동의하신 분께 발송되는 광고성 정보입니다.<br />
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

  // 코드 상태 — 비활성 코드를 배달하는 사고 방지
  const { data: code } = await adminClient
    .from("promo_codes")
    .select("is_active")
    .eq("code", PROMO_CODE)
    .maybeSingle();
  const codeActive = code?.is_active === true;

  const { data: targets, error, count } = await adminClient
    .from("earlybird_signups")
    .select("id, email", { count: "exact" })
    .is("mail_sent_at", null)
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { error: "대상 조회 실패 — 0015 마이그레이션 적용 여부를 확인하세요: " + error.message },
      { status: 500 }
    );
  }

  const pending = count ?? targets?.length ?? 0;
  const resendKeyConfigured = !!process.env.RESEND_API_KEY;
  const unsubscribeConfigured = !!process.env.CRON_SECRET;

  if (dry) {
    const preview = buildEmail("00000000-0000-0000-0000-000000000000");
    return NextResponse.json({
      dry: true,
      pending,
      batch_size: BATCH_SIZE,
      code_active: codeActive,
      resend_key_configured: resendKeyConfigured,
      unsubscribe_configured: unsubscribeConfigured,
      preview_subject: preview.subject,
      recipients: (targets ?? []).map((t) => t.email),
    });
  }

  if (!codeActive) {
    return NextResponse.json(
      {
        error:
          "earlybird 코드가 비활성 상태입니다 — 먼저 프로모션 탭에서 코드를 활성화하세요 (메일이 죽은 코드를 배달하지 않도록 막았습니다).",
      },
      { status: 409 }
    );
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
    const { subject, html } = buildEmail(t.id);
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
          .from("earlybird_signups")
          .update({ mail_sent_at: new Date().toISOString() })
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
