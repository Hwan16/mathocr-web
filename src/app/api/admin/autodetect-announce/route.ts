import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ANNOUNCE_BATCH,
  ANNOUNCE_SUBJECT,
  buildAnnounceHtml,
} from "@/lib/autodetect-announce-mail";
import { REPLY_TO } from "@/lib/mail";

// ── 자동 인식 출시 안내 발송 (2026-07-28 신설) ──
//
// terms-notice와 같은 서버 발송 패턴: RESEND_API_KEY가 Vercel에 Sensitive로
// 저장돼 로컬로 내려받을 수 없으므로, 서버가 자기 키로 발송한다.
//
// 성격: 신기능 이용 유도 = 광고성 정보 (정보통신망법 제50조).
//   ⚠️ terms-notice(전원 발송)와 반대로 **marketing_opt_in=true 동의자에게만** 발송한다.
//   제목 "(광고)" + 수신거부 링크 + 발신 사업자 표기는 본문(lib)에 포함.
//
// 대상: marketing_opt_in=true + email_confirmed_at 존재(미인증·조회 실패는
//   fail-closed 제외 — onboarding-mail cron과 동일 기준) + 차단 도메인 제외.
//
// 보안: CRON_SECRET Bearer 인증. 본문·제목은 코드에 하드코딩이라 호출자가 내용을
//   바꿀 수 없고, Idempotency-Key(배치/사용자)가 24시간 내 중복 발송을 막는다.
//
// 사용:
//   GET /api/admin/autodetect-announce         → dry run (대상만 반환, 발송 없음)
//   GET /api/admin/autodetect-announce?send=1  → 실제 발송
//   둘 다 Authorization: Bearer <CRON_SECRET> 필요

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
/** 동의자 캠페인 상한 — 예상 대상 4명, 폭주 방지 안전망 */
const MAX_RECIPIENTS = 50;
/** Resend 한도 여유 — 건당 간격(ms) */
const SEND_INTERVAL_MS = 600;
/** 메일을 일절 받지 않는 도메인(RFC 7505 null MX 등) — terms-notice와 동일 */
const BLOCKED_DOMAINS = ["mathocr.com"];

type Target = { user_id: string; email: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const send = request.nextUrl.searchParams.get("send") === "1";
  const apiKey = process.env.RESEND_API_KEY;
  // fail-closed — 키 없이 대상만 뽑고 "발송했다"고 오인하는 일을 막는다
  if (send && !apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 503 });
  }

  const admin = createAdminClient();

  // 동의자만 — 광고성 메일이므로 비동의자는 어떤 형태로도 제외
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, marketing_opt_in")
    .eq("marketing_opt_in", true)
    .not("email", "is", null);
  if (profileError) {
    console.error("[autodetect-announce] profiles query failed", profileError);
    return NextResponse.json({ error: "profiles query failed" }, { status: 500 });
  }

  // 이메일 인증 확인 — 미인증·조회 실패는 발송 제외 (fail-closed)
  const targets: Target[] = [];
  const excluded: { email: string | null; reason: string }[] = [];
  for (const p of profiles ?? []) {
    const email = (p.email ?? "").trim();
    if (!email) {
      excluded.push({ email: p.email, reason: "no_email" });
      continue;
    }
    if (BLOCKED_DOMAINS.some((d) => email.toLowerCase().endsWith(`@${d}`))) {
      excluded.push({ email, reason: "blocked_domain" });
      continue;
    }
    let confirmed = false;
    try {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(p.id);
      if (!userError) confirmed = !!userData?.user?.email_confirmed_at;
    } catch {
      // fall through — confirmed=false
    }
    if (!confirmed) {
      excluded.push({ email, reason: "unconfirmed_or_lookup_failed" });
      continue;
    }
    targets.push({ user_id: p.id, email });
  }

  if (targets.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: "recipient count exceeds MAX_RECIPIENTS", count: targets.length },
      { status: 507 }
    );
  }

  const summary = {
    batch: ANNOUNCE_BATCH,
    subject: ANNOUNCE_SUBJECT,
    from: FROM,
    queried_at: new Date().toISOString(),
    recipients: targets.length,
    excluded: excluded.length,
    excluded_by_reason: excluded.reduce<Record<string, number>>((acc, e) => {
      acc[e.reason] = (acc[e.reason] ?? 0) + 1;
      return acc;
    }, {}),
  };

  if (!send) {
    return NextResponse.json({
      dry_run: true,
      ...summary,
      emails: targets.map((t) => t.email),
    });
  }

  const results: {
    user_id: string;
    email: string;
    ok: boolean;
    status: number;
    resend_id: string | null;
    error: string | null;
  }[] = [];

  for (const t of targets) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // 같은 배치·같은 사용자면 항상 같은 키 → 재호출해도 중복 발송 없음
          "Idempotency-Key": `${ANNOUNCE_BATCH}/${t.user_id}`,
        },
        body: JSON.stringify({
          from: FROM,
          reply_to: REPLY_TO,
          to: [t.email], // 반드시 1명씩 — 수신자 상호 노출 방지
          subject: ANNOUNCE_SUBJECT,
          html: buildAnnounceHtml(t.user_id),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      results.push({
        user_id: t.user_id,
        email: t.email,
        ok: res.ok,
        status: res.status,
        resend_id: typeof body?.id === "string" ? body.id : null,
        error: res.ok ? null : JSON.stringify(body).slice(0, 300),
      });
    } catch (e) {
      results.push({
        user_id: t.user_id,
        email: t.email,
        ok: false,
        status: 0,
        resend_id: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await sleep(SEND_INTERVAL_MS);
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  console.info("[autodetect-announce] sent", { batch: ANNOUNCE_BATCH, sent, failed });

  return NextResponse.json({
    dry_run: false,
    ...summary,
    sent,
    failed,
    results,
  });
}
