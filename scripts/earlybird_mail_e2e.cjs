// 0014 얼리버드 오픈 메일 e2e — 명단 API·발송 dry·권한·수신거부 검증
// 사용법: (dev 서버 실행 중에) node scripts/earlybird_mail_e2e.cjs
// 전제: Supabase SQL Editor에서 0014_earlybird_mail.sql 적용 완료
// 주의: 실제 메일은 발송되지 않는다 (로컬에 RESEND_API_KEY 없음 — 503 경로 검증).
//       일회용 관리자/사용자 계정을 만들었다가 끝나면 삭제한다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function waitProfile(uid) {
  for (let i = 0; i < 10; i++) {
    const { data } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (data) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function unsubToken(uid) {
  return crypto.createHmac("sha256", env.CRON_SECRET)
    .update(`unsubscribe:${uid}`).digest("hex").slice(0, 32);
}

async function main() {
  const ts = Date.now();
  const password = `E2e!${ts}#pw`;
  const uids = [];

  // 0) 0014 적용 확인
  const { error: colErr } = await admin.from("profiles").select("earlybird_mail_sent_at").limit(1);
  if (colErr) throw new Error("0014 미적용으로 보임: " + colErr.message);
  check("profiles.earlybird_mail_sent_at 컬럼 존재", true);
  if (!env.CRON_SECRET) throw new Error("CRON_SECRET 없음 (.env.local)");

  await fetch(BASE_URL).catch(() => {
    throw new Error(`${BASE_URL} 접속 불가 — dev 서버를 먼저 실행하세요`);
  });

  try {
    // 1) 일회용 관리자 + 수신 동의 사용자
    const { data: adm, error: admErr } = await admin.auth.admin.createUser({
      email: `eb-mail-admin-${ts}@example.com`, password, email_confirm: true,
    });
    if (admErr) throw new Error("관리자 계정 생성 실패: " + admErr.message);
    uids.push(adm.user.id);
    await waitProfile(adm.user.id);
    await admin.from("profiles").update({ role: "admin" }).eq("id", adm.user.id);

    const { data: sub, error: subErr } = await admin.auth.admin.createUser({
      email: `eb-mail-sub-${ts}@example.com`, password, email_confirm: true,
    });
    if (subErr) throw new Error("사용자 계정 생성 실패: " + subErr.message);
    uids.push(sub.user.id);
    await waitProfile(sub.user.id);
    await admin.from("profiles").update({ marketing_opt_in: true }).eq("id", sub.user.id);

    // 토큰 발급 (auth-helper의 Bearer 경로)
    const { data: admSession, error: admSignErr } = await anon.auth.signInWithPassword({
      email: adm.user.email, password,
    });
    if (admSignErr) throw new Error("관리자 로그인 실패: " + admSignErr.message);
    const admToken = admSession.session.access_token;

    const { data: subSession } = await anon.auth.signInWithPassword({
      email: sub.user.email, password,
    });
    const subToken = subSession?.session?.access_token;

    // 2) 명단 조회 (관리자)
    const listRes = await fetch(`${BASE_URL}/api/admin/earlybird`, {
      headers: { Authorization: `Bearer ${admToken}` },
    });
    const list = await listRes.json().catch(() => ({}));
    check("명단 API 200 + 동의자 포함", listRes.ok &&
      (list.subscribers ?? []).some((r) => r.email === sub.user.email),
      JSON.stringify({ status: listRes.status, opted_in: list.summary?.opted_in }));
    check("요약 카운트 정상 (opted_in ≥ 1, pending ≥ 1)",
      list.summary?.opted_in >= 1 && list.summary?.mail_pending >= 1,
      JSON.stringify(list.summary));

    // 3) 권한: 일반 사용자는 403
    const forbidRes = await fetch(`${BASE_URL}/api/admin/earlybird`, {
      headers: { Authorization: `Bearer ${subToken}` },
    });
    check("일반 사용자 접근 403", forbidRes.status === 403, `status=${forbidRes.status}`);

    // 4) 발송 dry — 대상·설정 점검 (로컬엔 Resend 키 없음이 정상)
    const dryRes = await fetch(`${BASE_URL}/api/admin/earlybird/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admToken}` },
      body: JSON.stringify({ dry: true }),
    });
    const dry = await dryRes.json().catch(() => ({}));
    check("발송 dry: pending ≥ 1 + (광고) 제목 + 수신거부 서명 설정",
      dryRes.ok && dry.pending >= 1 && String(dry.preview_subject).startsWith("(광고)") &&
      dry.unsubscribe_configured === true,
      JSON.stringify(dry));

    // 5) 실발송: 로컬은 RESEND_API_KEY 없음 → 503 + 발송 기록 없음
    const sendRes = await fetch(`${BASE_URL}/api/admin/earlybird/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admToken}` },
      body: JSON.stringify({ dry: false }),
    });
    const { data: afterSend } = await admin.from("profiles")
      .select("earlybird_mail_sent_at").eq("id", sub.user.id).maybeSingle();
    check("실발송(키 없음): 503 + sent_at 기록 안 됨",
      sendRes.status === 503 && afterSend?.earlybird_mail_sent_at === null,
      `status=${sendRes.status}, sent_at=${afterSend?.earlybird_mail_sent_at}`);

    // 6) 수신거부: GET 확인 페이지(해제 안 됨) → POST 확정(해제) → 철회 감사행
    const token = unsubToken(sub.user.id);
    const getRes = await fetch(`${BASE_URL}/api/unsubscribe?uid=${sub.user.id}&token=${token}`);
    const getHtml = await getRes.text();
    const { data: afterGet } = await admin.from("profiles")
      .select("marketing_opt_in").eq("id", sub.user.id).maybeSingle();
    check("수신거부 GET: 확인 페이지만 (아직 opt_in=true)",
      getRes.ok && getHtml.includes("수신거부 확정") && afterGet?.marketing_opt_in === true,
      JSON.stringify({ status: getRes.status, opt_in: afterGet?.marketing_opt_in }));

    const postRes = await fetch(`${BASE_URL}/api/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ uid: sub.user.id, token }),
    });
    const { data: afterPost } = await admin.from("profiles")
      .select("marketing_opt_in").eq("id", sub.user.id).maybeSingle();
    const { data: withdrawRows } = await admin.from("user_consents")
      .select("agreed").eq("user_id", sub.user.id).eq("doc_type", "marketing").eq("agreed", false);
    check("수신거부 POST: opt_in=false + 철회 감사행(agreed=false)",
      postRes.ok && afterPost?.marketing_opt_in === false && (withdrawRows ?? []).length === 1,
      JSON.stringify({ status: postRes.status, opt_in: afterPost?.marketing_opt_in, rows: withdrawRows?.length }));

    // 7) 위조 토큰 → 400 (해제 안 됨)
    const badRes = await fetch(`${BASE_URL}/api/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ uid: uids[0], token: "0".repeat(32) }),
    });
    check("위조 토큰: 400 거부", badRes.status === 400, `status=${badRes.status}`);
  } finally {
    for (const uid of uids) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    console.log(`정리 완료: 테스트 계정 ${uids.length}개 삭제`);
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("E2E 실행 오류:", e.message); process.exit(1); });
