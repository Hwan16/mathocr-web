// LA-06 잔여 e2e — 승인 성공·지급 실패 주문 복구 (로컬 dev 서버 + 실 Supabase)
// 사용법: node scripts/payment_recovery_e2e.cjs [--base http://localhost:3000]
//
// 검증 매트릭스:
//   권한: recovery GET/POST 무인증·비관리자 403
//   기록: 서명 유효 paid 웹훅 → approved 이벤트(+플랜 스냅샷) + 지급(정상 흐름은 pending에 안 뜸)
//         삭제된 사용자의 paid 웹훅 → 500 재전송 유도 + approved·grant_failed 기록
//         + 경보 발송 마커(raw.alert_sent_at, 72.1 P1-4)
//   복구: 수동 시딩한 미지급 approved 이벤트(스냅샷 credits=123 ≠ 현재 플랜 100)
//         → GET pending 노출(스냅샷 기준 플랜·이메일 포함)
//         → POST 재지급 → "스냅샷" 크레딧(123) 증가 + payments 행 + recovered 감사
//         → GET에서 사라짐 → POST 재실행 already:true(멱등, 크레딧 불변)
//   방어: 승인 기록 없는 임의 tid POST → 404
//         스냅샷 없는 과거 approved 이벤트 → recoverable=false + POST 409 수동 안내(72.1 P1-3)
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
      .from("payment_events").select("event_type, raw").eq("tid", tidOk);
    check("approved 이벤트 기록됨", (evOk ?? []).some((e) => e.event_type === "approved"), JSON.stringify(evOk));
    const okSnap = (evOk ?? []).find((e) => e.event_type === "approved")?.raw?.plan_snapshot;
    check("approved 이벤트에 플랜 스냅샷 저장 (credits·validity·price)",
      !!okSnap && okSnap.credits === STARTER.credits && okSnap.price === STARTER.price && okSnap.validity_days === 30,
      JSON.stringify(okSnap));
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
      .from("payment_events").select("event_type, raw").eq("tid", tidFail);
    const types = new Set((evFail ?? []).map((e) => e.event_type));
    check("approved + grant_failed 둘 다 기록", types.has("approved") && types.has("grant_failed"), JSON.stringify([...types]));
    // 경보 발송 마커 (72.1 P1-4): 메일 발송 성공 시 raw.alert_sent_at 기록 —
    // 발송 전이면 다음 재전송에서 재시도된다. Resend 키 없는 환경은 발송 자체가
    // 없으므로 마커 검사를 건너뛴다.
    const failRaw = (evFail ?? []).find((e) => e.event_type === "grant_failed")?.raw;
    if (env.RESEND_API_KEY) {
      check("경보 발송 마커 alert_sent_at 기록 (메일 실발송)", !!failRaw?.alert_sent_at, JSON.stringify(failRaw));
      console.log("  (관리자 경보 메일 1통 실발송됨 — 수신함에서 확인 가능)");
    } else {
      console.log("  (RESEND_API_KEY 없음 — 경보 마커 검사 생략)");
    }
    r = await recoveryApi("GET", adminToken);
    const failItem = (r.data.pending ?? []).find((p) => p.tid === tidFail);
    check("지급 실패 건 pending 노출 + grant_failed 표시", !!failItem && failItem.hasGrantFailed === true, JSON.stringify(failItem));
    // 대상 사용자가 삭제된 주문 — 재지급은 FK 위반으로 실패해야 정상 (남 주문 오지급 없음)
    r = await recoveryApi("POST", adminToken, { tid: tidFail });
    check("삭제된 사용자 재지급 → 500 (지급 불가)", r.status === 500, JSON.stringify(r));

    // ── 복구 흐름: 미지급 approved 이벤트 시딩 → 재지급 → 멱등 ──
    // 스냅샷 credits=123으로 현재 Starter 구성(100)과 다르게 시딩 — 재지급이
    // 현재 플랜이 아니라 "승인 시점 스냅샷"을 따르는지(72.1 P1-3) 증명한다.
    const SNAP = { plan_id: "starter", plan_name: "Starter", credits: 123, validity_days: 30, price: STARTER.price };
    const tidPend = `e2e_recov_${ts}_pend`;
    testTids.push(tidPend);
    const orderPend = buildOrderId(STARTER.id, userUid);
    const { error: seedErr } = await admin.from("payment_events").insert({
      event_key: `${tidPend}:approved`, event_type: "approved",
      tid: tidPend, order_id: orderPend, amount: String(STARTER.price),
      signature_valid: true, raw: { source: "e2e_seed", plan_snapshot: SNAP },
    });
    if (seedErr) throw new Error("이벤트 시딩 실패: " + seedErr.message);

    r = await recoveryApi("GET", adminToken);
    const pendItem = (r.data.pending ?? []).find((p) => p.tid === tidPend);
    check("미지급 건 pending 노출", !!pendItem, JSON.stringify(r.data.pending));
    check("플랜(스냅샷 기준)·이메일 표시 정보 정확",
      !!pendItem && pendItem.planName === "Starter" && pendItem.credits === SNAP.credits && pendItem.userEmail === userEmail && pendItem.recoverable === true,
      JSON.stringify(pendItem));

    const beforeRecover = await getCredits(userUid);
    r = await recoveryApi("POST", adminToken, { tid: tidPend });
    check("재지급 → success + 스냅샷 크레딧(≠현재 플랜)", r.status === 200 && r.data.success === true && r.data.credits === SNAP.credits, JSON.stringify(r));
    const afterRecover = await getCredits(userUid);
    check(`재지급 크레딧 반영 (+${SNAP.credits} — 스냅샷 우선)`, afterRecover === beforeRecover + SNAP.credits, `before=${beforeRecover} after=${afterRecover}`);
    const { data: payRow } = await admin
      .from("payments").select("amount, credits_added, status").eq("pg_transaction_id", tidPend);
    check("payments 행 생성 (금액·스냅샷 크레딧·completed)",
      (payRow ?? []).length === 1 && payRow[0].amount === STARTER.price && payRow[0].credits_added === SNAP.credits && payRow[0].status === "completed",
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

    // ── 방어: 스냅샷 없는 과거 승인 기록 → 자동 재지급 거부·수동 안내 (72.1 P1-3) ──
    const tidLegacy = `e2e_recov_${ts}_legacy`;
    testTids.push(tidLegacy);
    const { error: legacySeedErr } = await admin.from("payment_events").insert({
      event_key: `${tidLegacy}:approved`, event_type: "approved",
      tid: tidLegacy, order_id: buildOrderId(STARTER.id, userUid),
      amount: String(STARTER.price), signature_valid: true,
      raw: { source: "e2e_seed_legacy" }, // 스냅샷 도입 전 기록 재현
    });
    if (legacySeedErr) throw new Error("legacy 시딩 실패: " + legacySeedErr.message);
    r = await recoveryApi("GET", adminToken);
    const legacyItem = (r.data.pending ?? []).find((p) => p.tid === tidLegacy);
    check("스냅샷 없는 건 recoverable=false + 수동 사유 표시",
      !!legacyItem && legacyItem.recoverable === false && String(legacyItem.manualReason ?? "").includes("스냅샷"),
      JSON.stringify(legacyItem));
    const beforeLegacy = await getCredits(userUid);
    r = await recoveryApi("POST", adminToken, { tid: tidLegacy });
    check("스냅샷 없는 건 재지급 → 409 수동 안내", r.status === 409 && String(r.data.error ?? "").includes("스냅샷"), JSON.stringify(r));
    const afterLegacy = await getCredits(userUid);
    check("409 거부 시 크레딧 불변", afterLegacy === beforeLegacy, `before=${beforeLegacy} after=${afterLegacy}`);

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
