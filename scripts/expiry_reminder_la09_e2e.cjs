// LA-09 보강 e2e (2026-07-13, CODEX_REVIEW2_FOLLOWUP_PLAN §2-3·§4-2)
// 사용법: (dev 서버 실행 중에) node scripts/expiry_reminder_la09_e2e.cjs
//
// 검증 내용 — expiry-reminder cron dry-run의 발송 판정 매트릭스:
//   1) 미인증 계정 → send=null (광고형·중립형 모두 제외, confirmed=false)
//   2) 인증 + 비동의 + 결제 이력 없음 → send=null (§4-2 결정 (ii))
//   3) 인증 + 비동의 + 결제 완료 이력 → send="neutral"
//   4) 인증 + 마케팅 동의 → send="marketing"
// 그리고 마케팅 동의 인증 후 활성화 (claimPendingMarketingConsent):
//   5) pending_marketing_opt_in 계정이 인증 후 로그인하면
//      profiles.marketing_opt_in=true + user_consents(marketing, agreed=true) 기록
//      + pending 플래그 정리
//   6) 미인증 상태에서는 로그인 자체가 403 (동의 활성화 경로 차단)
// 테스트 유저는 마지막에 삭제한다 (프로덕션 cron 발송 대상이 되지 않도록).
const fs = require("fs");
const path = require("path");
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

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function dryRun() {
  const res = await fetch(`${BASE_URL}/api/cron/expiry-reminder?dry=1`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`dry-run HTTP ${res.status}`);
  return res.json();
}

function findRecipient(body, email) {
  return (body.recipients ?? []).find((r) => r.email === email) ?? null;
}

(async () => {
  const ts = Date.now();
  const email = `seize.win+la09-${ts}@gmail.com`;
  const password = `La09!e2e${ts}`;
  const txn = `e2e_la09_${ts}`;
  let uid = null;

  try {
    // ── 준비: 미인증 + pending 마케팅 동의 + 만료 창(6.5일 뒤) 안의 크레딧 ──
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { pending_marketing_opt_in: true },
    });
    if (createError) throw new Error(`createUser: ${createError.message}`);
    uid = created.user.id;

    // handle_new_user 트리거의 프로필 생성 대기
    let profileReady = false;
    for (let i = 0; i < 10 && !profileReady; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
      profileReady = !!data;
    }
    if (!profileReady) throw new Error("profile not created by trigger");

    const expiresAt = new Date(Date.now() + 6.5 * 24 * 60 * 60 * 1000).toISOString();
    const { error: setupError } = await admin
      .from("profiles")
      .update({ credits: 3, expires_at: expiresAt })
      .eq("id", uid);
    if (setupError) throw new Error(`profile setup: ${setupError.message}`);

    // ── 1) 미인증 → 어떤 메일도 발송 안 함 ──
    let body = await dryRun();
    let r = findRecipient(body, email);
    check("1. 미인증: 창 후보에는 잡힌다", !!r, JSON.stringify(body));
    check("1. 미인증: confirmed=false, send=null",
      r && r.confirmed === false && r.send === null, JSON.stringify(r));

    // ── 6) 미인증 로그인 → 403 (동의 활성화 경로 차단) ──
    let loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    check("6. 미인증 로그인 403", loginRes.status === 403, `HTTP ${loginRes.status}`);
    const { data: pUnconfirmed } = await admin
      .from("profiles").select("marketing_opt_in").eq("id", uid).maybeSingle();
    check("6. 미인증 상태에서 opt_in 비활성 유지", pUnconfirmed?.marketing_opt_in !== true,
      JSON.stringify(pUnconfirmed));

    // ── 인증 처리 ──
    const { error: confirmError } = await admin.auth.admin.updateUserById(uid, {
      email_confirm: true,
    });
    if (confirmError) throw new Error(`confirm: ${confirmError.message}`);

    // ── 2) 인증 + 비동의 + 무결제 → send=null ──
    body = await dryRun();
    r = findRecipient(body, email);
    check("2. 인증+비동의+무결제: confirmed=true, has_paid=false, send=null",
      r && r.confirmed === true && r.has_paid === false && r.send === null,
      JSON.stringify(r));

    // ── 3) 결제 완료 이력 추가 → send=neutral ──
    const { error: payError } = await admin.from("payments").insert([
      { user_id: uid, email, amount: 9900, credits_added: 50, status: "completed", pg_transaction_id: txn },
    ]);
    if (payError) throw new Error(`payment insert: ${payError.message}`);
    body = await dryRun();
    r = findRecipient(body, email);
    check("3. 인증+비동의+유료결제: send=neutral",
      r && r.has_paid === true && r.send === "neutral", JSON.stringify(r));

    // ── 5) 인증 후 로그인 → pending 동의 활성화 ──
    loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    check("5. 인증 후 로그인 성공", loginRes.status === 200, `HTTP ${loginRes.status}`);
    const { data: pAfter } = await admin
      .from("profiles").select("marketing_opt_in").eq("id", uid).maybeSingle();
    check("5. 로그인 후 profiles.marketing_opt_in=true", pAfter?.marketing_opt_in === true,
      JSON.stringify(pAfter));
    const { data: consents } = await admin
      .from("user_consents").select("doc_type, agreed").eq("user_id", uid);
    const marketingRows = (consents ?? []).filter((c) => c.doc_type === "marketing");
    check("5. user_consents(marketing, agreed=true) 1행",
      marketingRows.length === 1 && marketingRows[0].agreed === true,
      JSON.stringify(consents));
    const { data: afterUser } = await admin.auth.admin.getUserById(uid);
    check("5. pending 플래그 정리됨",
      afterUser?.user?.user_metadata?.pending_marketing_opt_in == null,
      JSON.stringify(afterUser?.user?.user_metadata));

    // ── 4) 동의자 → send=marketing ──
    body = await dryRun();
    r = findRecipient(body, email);
    check("4. 인증+동의: send=marketing",
      r && r.marketing_opt_in === true && r.send === "marketing", JSON.stringify(r));
  } finally {
    // 정리 — 테스트 유저가 남으면 프로덕션 cron의 실제 발송 대상이 된다
    if (uid) {
      await admin.from("user_consents").delete().eq("user_id", uid);
      await admin.from("payments").delete().eq("pg_transaction_id", txn);
      const { error: delError } = await admin.auth.admin.deleteUser(uid);
      if (delError) console.error(`⚠️ 테스트 유저 삭제 실패 — 수동 삭제 필요: ${email} (${delError.message})`);
      else console.log(`정리 완료: ${email} 삭제`);
    }
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
