// 0015 얼리버드 신청제 e2e — 신청 API·중복 차단·관리자 명단·발송 안전장치·수신거부
// 사용법: (dev 서버 실행 중에) node scripts/earlybird_apply_e2e.cjs
// 전제: Supabase SQL Editor에서 0015_earlybird_apply.sql 적용 완료
// 주의: 실제 메일은 발송되지 않는다 (earlybird 코드 비활성 → 409 안전장치 검증).
//       일회용 관리자 계정과 테스트 신청 행을 만들었다가 끝나면 삭제한다.
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

function unsubToken(id) {
  return crypto.createHmac("sha256", env.CRON_SECRET)
    .update(`unsubscribe:app:${id}`).digest("hex").slice(0, 32);
}

async function main() {
  const ts = Date.now();
  const password = `E2e!${ts}#pw`;
  const uids = [];
  const NORM = "seizewin@gmail.com"; // 아래 알리아스들의 정규화 결과

  // 0) 0015 적용 확인
  const { error: colErr } = await admin.from("earlybird_signups").select("id").limit(1);
  if (colErr) throw new Error("0015 미적용으로 보임: " + colErr.message);
  check("earlybird_signups 테이블 존재", true);
  if (!env.CRON_SECRET) throw new Error("CRON_SECRET 없음 (.env.local)");

  await fetch(BASE_URL).catch(() => {
    throw new Error(`${BASE_URL} 접속 불가 — dev 서버를 먼저 실행하세요`);
  });

  // 사전 정리: 같은 정규화 이메일의 잔여 행 제거 (재실행 대비)
  await admin.from("earlybird_signups").delete().eq("normalized_email", NORM);

  try {
    // 1) 접수 상태
    const st = await fetch(`${BASE_URL}/api/earlybird/apply`);
    const stj = await st.json().catch(() => ({}));
    check("접수 상태 open", st.ok && stj.open === true, JSON.stringify(stj));

    // 2) 신청 (UTM 포함)
    const applyEmail = `seize.win+eb-apply-${ts}@gmail.com`;
    const r1 = await fetch(`${BASE_URL}/api/earlybird/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.99" },
      body: JSON.stringify({
        email: applyEmail,
        agreed_marketing: true,
        utm_source: "NAVER",
        utm_medium: "cpc",
        utm_campaign: "typing",
      }),
    });
    check("신청 성공", r1.ok, `status=${r1.status}`);

    const { data: row } = await admin.from("earlybird_signups")
      .select("id, email, normalized_email, utm_source, ip, mail_sent_at, unsubscribed_at")
      .eq("normalized_email", NORM).maybeSingle();
    check("신청 행: 정규화 이메일·UTM 소문자·IP 기록",
      row?.email === applyEmail && row?.normalized_email === NORM &&
      row?.utm_source === "naver" && row?.ip === "203.0.113.99",
      JSON.stringify(row));

    const { data: consents } = await admin.from("user_consents")
      .select("agreed, user_id").eq("email", applyEmail).eq("doc_type", "marketing");
    check("수신 동의 감사행 (user_id null·agreed=true)",
      (consents ?? []).length === 1 && consents[0].agreed === true && consents[0].user_id === null,
      JSON.stringify(consents));

    // 3) 알리아스 변형 중복 신청 → 409 already
    const r2 = await fetch(`${BASE_URL}/api/earlybird/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.98" },
      body: JSON.stringify({ email: `s.eize.win+other-${ts}@gmail.com`, agreed_marketing: true }),
    });
    const r2j = await r2.json().catch(() => ({}));
    check("알리아스 변형 중복 신청 차단 (409 already)",
      r2.status === 409 && r2j.error === "already", JSON.stringify(r2j));

    // 4) 동의 없이 신청 → 400
    const r3 = await fetch(`${BASE_URL}/api/earlybird/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.97" },
      body: JSON.stringify({ email: `eb-noconsent-${ts}@example.com` }),
    });
    check("수신 동의 없는 신청 거부 (400)", r3.status === 400, `status=${r3.status}`);

    // 5) 관리자 명단 + 발송 dry/실발송 안전장치
    const { data: adm } = await admin.auth.admin.createUser({
      email: `eb-apply-admin-${ts}@example.com`, password, email_confirm: true,
    });
    uids.push(adm.user.id);
    for (let i = 0; i < 10; i++) {
      const { data } = await admin.from("profiles").select("id").eq("id", adm.user.id).maybeSingle();
      if (data) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    await admin.from("profiles").update({ role: "admin" }).eq("id", adm.user.id);
    const { data: sess } = await anon.auth.signInWithPassword({ email: adm.user.email, password });
    const token = sess.session.access_token;

    const listRes = await fetch(`${BASE_URL}/api/admin/earlybird`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = await listRes.json().catch(() => ({}));
    check("관리자 명단: 신청자 포함 + 코드 보관 중",
      listRes.ok && (list.applicants ?? []).some((a) => a.email === applyEmail) &&
      list.summary?.earlybird_code_active === false,
      JSON.stringify(list.summary));

    const dryRes = await fetch(`${BASE_URL}/api/admin/earlybird/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dry: true }),
    });
    const dry = await dryRes.json().catch(() => ({}));
    check("발송 dry: pending ≥1 + (광고) 제목 + code_active=false 표시",
      dryRes.ok && dry.pending >= 1 && String(dry.preview_subject).startsWith("(광고)") &&
      dry.code_active === false,
      JSON.stringify(dry));

    const sendRes = await fetch(`${BASE_URL}/api/admin/earlybird/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dry: false }),
    });
    const { data: afterSend } = await admin.from("earlybird_signups")
      .select("mail_sent_at").eq("id", row.id).maybeSingle();
    check("실발송: 코드 보관 중이라 409 차단 + 발송 기록 없음",
      sendRes.status === 409 && afterSend?.mail_sent_at === null,
      `status=${sendRes.status}`);

    // 6) 수신거부 (kind=app, 2단계)
    const t = unsubToken(row.id);
    const g = await fetch(`${BASE_URL}/api/unsubscribe?kind=app&uid=${row.id}&token=${t}`);
    const gHtml = await g.text();
    const { data: afterGet } = await admin.from("earlybird_signups")
      .select("unsubscribed_at").eq("id", row.id).maybeSingle();
    check("수신거부 GET: 확인 페이지만 (아직 미해제)",
      g.ok && gHtml.includes("수신거부 확정") && afterGet?.unsubscribed_at === null,
      `status=${g.status}`);

    const p = await fetch(`${BASE_URL}/api/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ uid: row.id, token: t, kind: "app" }),
    });
    const { data: afterPost } = await admin.from("earlybird_signups")
      .select("unsubscribed_at").eq("id", row.id).maybeSingle();
    const { data: withdraw } = await admin.from("user_consents")
      .select("agreed").eq("email", applyEmail).eq("doc_type", "marketing").eq("agreed", false);
    check("수신거부 POST: unsubscribed_at 기록 + 철회 감사행",
      p.ok && afterPost?.unsubscribed_at !== null && (withdraw ?? []).length === 1,
      JSON.stringify({ status: p.status, unsub: afterPost?.unsubscribed_at, rows: withdraw?.length }));

    // 7) 위조 토큰 → 400
    const bad = await fetch(`${BASE_URL}/api/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ uid: row.id, token: "0".repeat(32), kind: "app" }),
    });
    check("위조 토큰: 400 거부", bad.status === 400, `status=${bad.status}`);
  } finally {
    await admin.from("earlybird_signups").delete().eq("normalized_email", NORM);
    for (const uid of uids) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    console.log("정리 완료: 테스트 신청 행·관리자 계정 삭제");
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("E2E 실행 오류:", e.message); process.exit(1); });
