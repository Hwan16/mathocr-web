import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPLY_TO } from "@/lib/mail";
import {
  OUTAGE_NOTICE_SUBJECT,
  aggregateAffected,
  buildOutageNoticeHtml,
  maskEmail,
  outageNoticeEligibility,
  targetFingerprint,
} from "@/lib/provider-outage";
import { fetchStoppedConversionLogs } from "@/lib/provider-outage-store";

// ── 제공사 장애 복구 안내 메일 (D-059, 2026-11-14) ──
//
// 앱(다음 버전부터)이 제공사 장애로 변환을 멈출 때 "정상화되면 가입하신 이메일로 알려드리겠습니다"를
// 약속한다. 장애가 끝나면(cron outage-watch 가 관리자에게 '정상화 확인' 메일) 이 엔드포인트로
// 그 회원들에게 알린다. 대외 발송이라 항상 dry run 으로 대상을 확인하고 사용자 승인 뒤에 send=1.
//
// 성격: 서비스 이용 관련 안내 = 비광고 → marketing_opt_in 과 무관하게 발송. 본문은
//       provider-outage.ts 에 하드코딩(호출자가 내용을 못 바꿈) — 광고 문장 금지 원칙도 그 파일에.
//
// 대상: since~until 사이 error_logs(conversion_error, category=ai_service_down)의 회원 중
//   - provider_outage=true (서버가 제공사 장애로 표시한 실패 = 앱이 메일을 약속한 회원)
//   - include_legacy=1 이면 구버전 앱 회원도 포함(약속은 안 받았지만 같은 장애로 멈춤).
//     단 하루 한도·인터넷 끊김으로만 멈춘 회원은 제외.
//   - 인증 안 된 이메일·탈퇴자(profiles 없음) 제외
//
//   - 중단된 변환이 아직 환불 전(started)인 회원은 보류 — 본문이 "반환되었습니다"라서
//     (stale-conversions cron 이 3시간 지난 건을 매시 환불하므로 나중에 다시 부르면 된다)
//
// 사용 (Authorization: Bearer <CRON_SECRET>):
//   GET /api/admin/outage-notice?since=<ISO>&until=<ISO>[&include_legacy=1]                        → dry run
//   GET /api/admin/outage-notice?since=<ISO>&until=<ISO>[&include_legacy=1]&send=1&fingerprint=<dry run 값> → 발송
// 발송은 until(복구 확인 시각)과 dry run 의 fingerprint 가 필수 — 승인한 뒤 대상이 늘거나 바뀌면
// 거절한다(Codex 검토 반영). 같은 since·회원이면 같은 Idempotency-Key 라 24시간 안 중복 발송 없음.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
const MAX_RECIPIENTS = 200;
const SEND_INTERVAL_MS = 200;
const MAX_WINDOW_DAYS = 14;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const since = parseIso(params.get("since"));
  const until = parseIso(params.get("until"));
  if (!since) {
    return NextResponse.json({ error: "since(ISO 시각)가 필요합니다." }, { status: 400 });
  }
  if (Date.now() - new Date(since).getTime() > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: `since 는 최근 ${MAX_WINDOW_DAYS}일 안이어야 합니다.` }, { status: 400 });
  }
  const send = params.get("send") === "1";
  const includeLegacy = params.get("include_legacy") === "1";
  const fingerprint = params.get("fingerprint");

  const apiKey = process.env.RESEND_API_KEY;
  if (send && !apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 503 });
  }
  if (send && (!until || !fingerprint)) {
    return NextResponse.json(
      { error: "발송에는 until 과 dry run 결과의 fingerprint 가 필요합니다." },
      { status: 400 }
    );
  }

  const { rows, error: logError, truncated } = await fetchStoppedConversionLogs(since, until ?? undefined);
  if (logError) {
    console.error("[outage-notice] error_logs query failed", { error: logError });
    return NextResponse.json({ error: "error_logs query failed" }, { status: 500 });
  }
  if (truncated) {
    // 일부만 읽힌 채로 고르면 약속받은 회원이 조용히 빠진다 — 기간을 나눠 다시 부를 것
    return NextResponse.json(
      { error: "기록이 너무 많아 일부만 읽혔습니다. since~until 기간을 나눠 다시 확인하세요.", rows: rows.length },
      { status: 507 }
    );
  }

  const members = aggregateAffected(rows);
  const admin = createAdminClient();

  // 중단된 변환의 환불 완료 여부 — 메일이 "반환되었습니다"라고 말하므로 아직 started 인 건이
  // 있는 회원은 보류한다(stale-conversions cron 이 3시간 지난 건을 매시 환불). 조회 실패면 중단.
  const conversionIds = members.flatMap((m) => m.conversion_ids);
  const pendingRefund = new Set<string>();
  if (conversionIds.length > 0) {
    const { data: convs, error: convError } = await admin
      .from("conversions")
      .select("id, status")
      .in("id", conversionIds);
    if (convError) {
      console.error("[outage-notice] conversions query failed", { error: convError.message });
      return NextResponse.json({ error: "conversions query failed" }, { status: 500 });
    }
    for (const c of convs ?? []) if (c.status === "started") pendingRefund.add(c.id);
  }

  const { data: profiles } = members.length
    ? await admin.from("profiles").select("id, email").in("id", members.map((m) => m.user_id))
    : { data: [] as { id: string; email: string | null }[] };
  const emailById = new Map((profiles ?? []).map((p) => [p.id, (p.email ?? "").trim()]));

  type Target = { user_id: string; email: string; first_at: string };
  const targets: Target[] = [];
  const report: Record<string, unknown>[] = [];

  for (const m of members) {
    const verdict = outageNoticeEligibility(m, includeLegacy);
    const email = emailById.get(m.user_id) ?? "";
    let reason = verdict.reason;
    let eligible = verdict.eligible;
    const pending = m.conversion_ids.filter((id) => pendingRefund.has(id)).length;
    if (eligible && !email) {
      eligible = false;
      reason = "no_profile_or_email";
    }
    if (eligible && pending > 0) {
      eligible = false;
      reason = "refund_pending";
    }
    if (eligible) {
      // 소유자 미확인 주소로는 보내지 않는다(terms-notice 와 같은 원칙). 조회 실패도 제외.
      const { data, error } = await admin.auth.admin.getUserById(m.user_id);
      if (error || !data?.user?.email_confirmed_at) {
        eligible = false;
        reason = "unconfirmed_or_lookup_failed";
      }
    }
    report.push({
      user: `${m.user_id.slice(0, 8)}…`,
      email: email ? maskEmail(email) : null,
      first_at: m.first_at,
      last_at: m.last_at,
      failures: m.failures,
      provider_outage: m.provider_outage,
      details: m.details.slice(0, 3),
      pending_refund: pending,
      eligible,
      reason,
    });
    if (eligible) targets.push({ user_id: m.user_id, email, first_at: m.first_at });
  }

  if (targets.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: "recipient count exceeds MAX_RECIPIENTS", count: targets.length },
      { status: 507 }
    );
  }

  const currentFingerprint = targetFingerprint(targets.map((t) => t.user_id));
  const summary = {
    since,
    until,
    include_legacy: includeLegacy,
    subject: OUTAGE_NOTICE_SUBJECT,
    affected: members.length,
    recipients: targets.length,
    held_refund_pending: report.filter((r) => r.reason === "refund_pending").length,
    fingerprint: currentFingerprint,
  };

  if (!send) {
    return NextResponse.json({ dry_run: true, ...summary, members: report });
  }
  if (fingerprint !== currentFingerprint) {
    return NextResponse.json(
      { error: "dry run 뒤 대상이 바뀌었습니다. 다시 확인하고 승인받으세요.", ...summary, members: report },
      { status: 409 }
    );
  }

  const batch = `outage-notice/${since.slice(0, 16)}`;
  const results: { user: string; ok: boolean; status: number; error: string | null }[] = [];
  for (const t of targets) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${batch}/${t.user_id}`,
        },
        body: JSON.stringify({
          from: FROM,
          reply_to: REPLY_TO,
          to: [t.email], // 반드시 1명씩 — 수신자 상호 노출 방지
          subject: OUTAGE_NOTICE_SUBJECT,
          html: buildOutageNoticeHtml(t.first_at),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      results.push({
        user: `${t.user_id.slice(0, 8)}…`,
        ok: res.ok,
        status: res.status,
        error: res.ok ? null : JSON.stringify(body).slice(0, 300),
      });
    } catch (e) {
      results.push({
        user: `${t.user_id.slice(0, 8)}…`,
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await sleep(SEND_INTERVAL_MS);
  }

  const sent = results.filter((r) => r.ok).length;
  console.info("[outage-notice] sent", { batch, sent, failed: results.length - sent });
  return NextResponse.json({ dry_run: false, ...summary, sent, failed: results.length - sent, results });
}
