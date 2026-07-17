// LA-06 잔여 e2e — 승인 성공·지급 실패 주문 복구 (로컬 dev 서버 + 실 Supabase)
// 사용법: node scripts/payment_recovery_e2e.cjs [--base http://localhost:3000]
//
// 검증 매트릭스:
//   권한: recovery GET/POST 무인증·비관리자 403
//   기록: 서명 유효 paid 웹훅 → approved 이벤트 + 지급(정상 흐름은 pending에 안 뜸)
//         삭제된 사용자의 paid 웹훅 → 500 재전송 유도 + approved·grant_failed 기록
//   복구: 수동 시딩한 미지급 approved 이벤트 → GET pending 노출(플랜·이메일 포함)
//         → POST 재지급 → 크레딧 증가 + payments 행 생성 + recovered 감사 이벤트
//         → GET에서 사라짐 → POST 재실행 already:true(멱등, 크레딧 불변)
//   방어: 승인 기록 없는 임의 tid POST → 404
// ⚠️ 실 DB 대상 — 테스트 계정·이벤트·payments 행을 finally에서 전부 삭제한다.
//    grant_failed 경로는 관리자 경보 메일 1통을 실제로 발송한다(실발송 검증 겸용).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const baseIdx = process.argv.indexOf("--base");
const BASE_URL = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3000";

const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

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

async function recoveryApi(method, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api/admin/payments/recovery`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function webhookSignature(tid, amount, ediDate) {
  return crypto
    .createHash("sha256")
    .update(`${tid}${amount}${ediDate}${env.NICEPAY_SECRET_KEY}`)
    .digest("hex");
}

async function postPaidWebhook(tid, orderId, amount) {
  const ediDate = new Date().toISOString();
  const res = await fetch(`${BASE_URL}/api/payments/nice/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resultCode: "0000", status: "paid", tid, orderId,
      amount: String(amount), ediDate,
      signature: webhookSignature(tid, String(amount), ediDate),
    }),
  });
  return { status: res.status, text: await res.text() };
}

// orderId 형식: mo_{planId}_{userIdHex32}_{suffix} (lib/payments.ts와 동일)
function buildOrderId(planId, userId) {
  const hex = userId.replace(/-/g, "").toLowerCase();
  return `mo_${planId}_${hex}_e2e${Date.now().toString(36)}`;
}

const STARTER = { id: "starter", credits: 100, price: 19900 };

async function getCredits(uid) {
  const { data } = await admin.from("profiles").select("credits").eq("id", uid).single();
  return data?.credits ?? null;
}

async function main() {
  const ts = Date.now();
  const userEmail = `payment-recovery-e2e-user-${ts}@example.com`;
  const adminEmail = `payment-recovery-e2e-admin-${ts}@example.com`;
  const ghostEmail = `payment-recovery-e2e-ghost-${ts}@example.com`;
  const password = `E2e!${ts}#${crypto.randomBytes(8).toString("hex")}`;
  console.log(`테스트 계정: ${userEmail} / ${adminEmail} (서버: ${BASE_URL})`);

  if (!env.NICEPAY_SECRET_KEY) {
    console.error("NICEPAY_SECRET_KEY 없음 — 웹훅 서명 생성 불가, 중단");
    process.exit(3);
  }

  let userUid = null, adminUid = null, ghostUid = null;
  const testTids = [];

  try {
    // ── 계정 준비 ──
    const { data: u1, error: e1 } = await admin.auth.admin.createUser({
      email: userEmail, password, email_confirm: true,
    });
    if (e1) throw new Error("일반 계정 생성 실패: " + e1.message);
    userUid = u1.user.id;
    const { data: u2, error: e2 } = await admin.auth.admin.createUser({
      email: adminEmail, password, email_confirm: true,
    });
    if (e2) throw new Error("관리자 계정 생성 실패: " + e2.message);
    adminUid = u2.user.id;
    const { error: roleErr } = await admin
      .from("profiles").update({ role: "admin" }).eq("id", adminUid);
    if (roleErr) throw new Error("관리자 role 지정 실패: " + roleErr.message);

    const { data: s1, error: se1 } = await anon.auth.signInWithPassword({ email: userEmail, password });
    if (se1) throw new Error("일반 로그인 실패: " + se1.message);
    const userToken = s1.session.access_token;
    const { data: s2, error: se2 } = await anon.auth.signInWithPassword({ email: adminEmail, password });
    if (se2) throw new Error("관리자 로그인 실패: " + se2.message);
    const adminToken = s2.session.access_token;

    // ── 권한 ──
    let r = await recoveryApi("GET", null);
    check("recovery GET 무인증 → 403", r.status === 403, `status=${r.status}`);
    r = await recoveryApi("GET", userToken);
    check("recovery GET 비관리자 → 403", r.status === 403, `status=${r.status}`);
    r = await recoveryApi("POST", userToken, { tid: "x" });
    check("recovery POST 비관리자 → 403", r.status === 403, `status=${r.status}`);

    // ── 정상 흐름: paid 웹훅 → approved 기록 + 지급 → pending에 안 뜸 ──
    const tidOk = `e2e_recov_${ts}_ok`;
    testTids.push(tidOk);
    const orderOk = buildOrderId(STARTER.id, userUid);
    const before = await getCredits(userUid);
    let wh = await postPaidWebhook(tidOk, orderOk, STARTER.price);
    check("정상 paid 웹훅 → 200 OK", wh.status === 200 && wh.text.includes("OK"), JSON.stringify(wh));
    const after = await getCredits(userUid);
    check(`정상 지급 (크레딧 +${STARTER.credits})`, after === before + STARTER.credits, `before=${before} after=${after}`);
    const { data: evOk } = await admin
      .from("payment_events").select("event_type").eq("tid", tidOk);
    check("approved 이벤트 기록됨", (evOk ?? []).some((e) => e.event_type === "approved"), JSON.stringify(evOk));
    r = await recoveryApi("GET", adminToken);
    check("정상 지급 건은 pending에 없음", r.status === 200 && !(r.data.pending ?? []).some((p) => p.tid === tidOk), JSON.stringify(r.data.pending));

    // ── 지급 실패 흐름: 삭제된 사용자 주문의 paid 웹훅 → 500 + grant_failed 기록 ──
    const { data: u3, error: e3 } = await admin.auth.admin.createUser({
      email: ghostEmail, password, email_confirm: true,
    });
    if (e3) throw new Error("유령 계정 생성 실패: " + e3.message);
    ghostUid = u3.user.id;
    const orderGhost = buildOrderId(STARTER.id, ghostUid);
    const { error: delErr } = await admin.auth.admin.deleteUser(ghostUid);
    if (delErr) throw new Error("유령 계정 삭제 실패: " + delErr.message);
    const ghostGone = ghostUid; ghostUid = null; // 이미 삭제됨 — finally 중복 삭제 방지

    const tidFail = `e2e_recov_${ts}_fail`;
    testTids.push(tidFail);
    wh = await postPaidWebhook(tidFail, orderGhost, STARTER.price);
    check("지급 실패 웹훅 → 500 (재전송 유도)", wh.status === 500, JSON.stringify(wh));
    const { data: evFail } = await admin
      .from("payment_events").select("event_type").eq("tid", tidFail);
    const types = new Set((evFail ?? []).map((e) => e.event_type));
    check("approved + grant_failed 둘 다 기록", types.has("approved") && types.has("grant_failed"), JSON.stringify([...types]));
    console.log("  (관리자 경보 메일 1통 실발송됨 — 수신함에서 확인 가능)");
    r = await recoveryApi("GET", adminToken);
    const failItem = (r.data.pending ?? []).find((p) => p.tid === tidFail);
    check("지급 실패 건 pending 노출 + grant_failed 표시", !!failItem && failItem.hasGrantFailed === true, JSON.stringify(failItem));
    // 대상 사용자가 삭제된 주문 — 재지급은 FK 위반으로 실패해야 정상 (남 주문 오지급 없음)
    r = await recoveryApi("POST", adminToken, { tid: tidFail });
    check("삭제된 사용자 재지급 → 500 (지급 불가)", r.status === 500, JSON.stringify(r));

    // ── 복구 흐름: 미지급 approved 이벤트 시딩 → 재지급 → 멱등 ──
    const tidPend = `e2e_recov_${ts}_pend`;
    testTids.push(tidPend);
    const orderPend = buildOrderId(STARTER.id, userUid);
    const { error: seedErr } = await admin.from("payment_events").insert({
      event_key: `${tidPend}:approved`, event_type: "approved",
      tid: tidPend, order_id: orderPend, amount: String(STARTER.price),
      signature_valid: true, raw: { source: "e2e_seed" },
    });
    if (seedErr) throw new Error("이벤트 시딩 실패: " + seedErr.message);

    r = await recoveryApi("GET", adminToken);
    const pendItem = (r.data.pending ?? []).find((p) => p.tid === tidPend);
    check("미지급 건 pending 노출", !!pendItem, JSON.stringify(r.data.pending));
    check("플랜·이메일 표시 정보 정확",
      !!pendItem && pendItem.planName === "Starter" && pendItem.credits === 100 && pendItem.userEmail === userEmail && pendItem.recoverable === true,
      JSON.stringify(pendItem));

    const beforeRecover = await getCredits(userUid);
    r = await recoveryApi("POST", adminToken, { tid: tidPend });
    check("재지급 → success + 플랜 정보", r.status === 200 && r.data.success === true && r.data.credits === STARTER.credits, JSON.stringify(r));
    const afterRecover = await getCredits(userUid);
    check(`재지급 크레딧 반영 (+${STARTER.credits})`, afterRecover === beforeRecover + STARTER.credits, `before=${beforeRecover} after=${afterRecover}`);
    const { data: payRow } = await admin
      .from("payments").select("amount, credits_added, status").eq("pg_transaction_id", tidPend);
    check("payments 행 생성 (금액·크레딧·completed)",
      (payRow ?? []).length === 1 && payRow[0].amount === STARTER.price && payRow[0].credits_added === STARTER.credits && payRow[0].status === "completed",
      JSON.stringify(payRow));
    const { data: evRec } = await admin
      .from("payment_events").select("event_type, raw").eq("event_key", `${tidPend}:recovered`);
    check("recovered 감사 이벤트 (처리자 기록)", (evRec ?? []).length === 1 && evRec[0].raw?.recovered_by === adminUid, JSON.stringify(evRec));

    r = await recoveryApi("GET", adminToken);
    check("재지급 후 pending에서 제거", !(r.data.pending ?? []).some((p) => p.tid === tidPend), JSON.stringify(r.data.pending));

    r = await recoveryApi("POST", adminToken, { tid: tidPend });
    check("재지급 재실행 → already:true (멱등)", r.status === 200 && r.data.already === true, JSON.stringify(r));
    const afterDup = await getCredits(userUid);
    check("멱등 재실행 크레딧 불변", afterDup === afterRecover, `after=${afterDup}`);

    // ── 방어: 승인 기록 없는 임의 tid ──
    r = await recoveryApi("POST", adminToken, { tid: `no_such_tid_${ts}` });
    check("승인 기록 없는 tid → 404", r.status === 404, JSON.stringify(r));

    void ghostGone;
  } finally {
    for (const tid of testTids) {
      await admin.from("payment_events").delete().eq("tid", tid);
      await admin.from("payments").delete().eq("pg_transaction_id", tid);
    }
    if (userUid) await admin.auth.admin.deleteUser(userUid).catch(() => {});
    if (ghostUid) await admin.auth.admin.deleteUser(ghostUid).catch(() => {});
    if (adminUid) await admin.auth.admin.deleteUser(adminUid).catch(() => {});
    if (adminUid) {
      const { data: still } = await admin.auth.admin.getUserById(adminUid).catch(() => ({ data: null }));
      console.log(still?.user ? "⚠️ 관리자 테스트 계정 삭제 실패 — 수동 삭제 필요: " + adminEmail : "정리 완료 (테스트 계정·이벤트·payments 행 삭제 확인)");
    }
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("스크립트 오류:", e); process.exit(2); });
