import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TERMS_NOTICE_SUBJECT,
  TERMS_NOTICE_HTML,
  TERMS_NOTICE_BATCH,
} from "@/lib/terms-notice-mail";

// ── 약관 개정 개별 고지 발송 (2026-07-22 신설) ──
//
// 왜 서버에 두는가: 약관 제10조 ③항(2026-08-21 시행)이 "불리하거나 중대한 변경 시
// 기존 이용자에게 등록·인증한 이메일로 개별 고지"를 의무로 정했다. 앞으로 개정 때마다
// 필요한 경로이므로 일회성 스크립트가 아니라 서버 엔드포인트로 만든다.
// RESEND_API_KEY 가 Vercel 에 Sensitive 로 저장돼 로컬로 내려받을 수 없는 것도 이유다
// (서버는 자기 키를 그대로 쓰므로 자격증명을 주고받을 필요가 없다).
//
// 성격: 계약 이행 관련 통지 = 비광고. 그래서 marketing_opt_in 과 무관하게 전원 발송한다.
//       ⚠️ 본문에 프로모션·충전 유도·수신거부 링크를 절대 넣지 마라 — 한 문장이라도
//       섞이면 전체가 광고성 정보가 되어 미동의자 발송이 정보통신망법 제50조 위반이 된다.
//
// 보안: CRON_SECRET Bearer 인증(기존 cron 과 동일). 본문·제목은 코드에 하드코딩이라
//       호출자가 내용을 바꿀 수 없다 — 키가 유출돼도 "같은 법적 고지를 재발송"이
//       최대 피해이고, 그마저 Idempotency-Key 가 24시간 내 중복을 막는다.
//
// 대상: email_confirmed_at 있는 활성 계정.
//   - 마케팅 수신거부자 포함 (계약 통지라 광고가 아님)
//   - 미인증 제외 (소유자 미확인 — 계약 당사자 아닌 제3자에게 가입 사실을 알리게 되고,
//     오타·가짜 주소 반송으로 발신 도메인 평판이 깎이면 인증·결제 메일 도달률까지 떨어진다)
//   - 탈퇴자는 profiles 삭제라 조회에서 자동 제외
//   - BLOCKED_DOMAINS: null MX 등 확정 반송 도메인
//
// 사용:
//   GET /api/admin/terms-notice            → dry run (대상만 반환, 발송 없음)
//   GET /api/admin/terms-notice?send=1     → 실제 발송
//   둘 다 Authorization: Bearer <CRON_SECRET> 필요

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
/** 실수로 전체 발송이 폭주하는 것을 막는 상한. 회원 수가 이를 넘으면 코드를 고쳐 올릴 것. */
const MAX_RECIPIENTS = 200;
/** Resend 한도 여유 — 건당 간격(ms) */
const SEND_INTERVAL_MS = 200;
/** 메일을 일절 받지 않는 도메인(RFC 7505 null MX 등). 보내봐야 확정 반송이라 평판만 깎인다. */
const BLOCKED_DOMAINS = ["mathocr.com"];

type Target = {
  user_id: string;
  email: string;
  marketing_opt_in: boolean | null;
};

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

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, marketing_opt_in");
  if (profileError) {
    console.error("[terms-notice] profiles query failed", profileError);
    return NextResponse.json({ error: "profiles query failed" }, { status: 500 });
  }

  // email_confirmed_at 은 auth.users 에만 있어 페이지 단위로 조회해 합친다.
  // 조회 실패 시 그 계정은 미인증으로 취급(fail-closed) — 기존 cron 3종과 같은 방침.
  const confirmedById = new Map<string, boolean>();
  let lookupFailures = 0;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      lookupFailures += 1;
      break;
    }
    for (const u of data.users) confirmedById.set(u.id, !!u.email_confirmed_at);
    if (data.users.length < 200) break;
  }

  const targets: Target[] = [];
  const excluded: { email: string | null; reason: string }[] = [];
  for (const p of profiles ?? []) {
    const email = (p.email ?? "").trim();
    if (!email) {
      excluded.push({ email: p.email, reason: "no_email" });
    } else if (!confirmedById.get(p.id)) {
      excluded.push({ email, reason: "unconfirmed_or_lookup_failed" });
    } else if (BLOCKED_DOMAINS.some((d) => email.toLowerCase().endsWith(`@${d}`))) {
      excluded.push({ email, reason: "blocked_domain" });
    } else {
      targets.push({ user_id: p.id, email, marketing_opt_in: p.marketing_opt_in });
    }
  }

  if (targets.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: "recipient count exceeds MAX_RECIPIENTS", count: targets.length },
      { status: 507 }
    );
  }

  const summary = {
    batch: TERMS_NOTICE_BATCH,
    subject: TERMS_NOTICE_SUBJECT,
    from: FROM,
    queried_at: new Date().toISOString(),
    recipients: targets.length,
    excluded: excluded.length,
    excluded_by_reason: excluded.reduce<Record<string, number>>((acc, e) => {
      acc[e.reason] = (acc[e.reason] ?? 0) + 1;
      return acc;
    }, {}),
    auth_lookup_failures: lookupFailures,
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
          // 같은 배치·같은 사용자면 항상 같은 키 → 중단 후 재호출해도 중복 발송 없음
          "Idempotency-Key": `${TERMS_NOTICE_BATCH}/${t.user_id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [t.email], // 반드시 1명씩 — 수신자 상호 노출 방지
          subject: TERMS_NOTICE_SUBJECT,
          html: TERMS_NOTICE_HTML,
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
  console.info("[terms-notice] sent", { batch: TERMS_NOTICE_BATCH, sent, failed });

  return NextResponse.json({
    dry_run: false,
    ...summary,
    sent,
    failed,
    results,
  });
}
