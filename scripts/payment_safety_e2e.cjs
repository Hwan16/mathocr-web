// LA-06 결제 안전장치 e2e — kill switch·취소 웹훅 저장·권한 (로컬 dev 서버 + 실 Supabase)
// 사용법: node scripts/payment_safety_e2e.cjs [--base http://localhost:3000]
//
// 검증 매트릭스:
//   권한: status는 공개 / admin 스위치는 무인증·비관리자 403
//   0020 적용 시: 토글 → status·return 라우트 즉시 차단(PAYMENTS_PAUSED) → 해제 → 정상 복귀,
//                updated_by 감사 기록, 취소 웹훅 저장(서명 유효/무효 각 1건) + 유효 건 경보 메일
//   0020 미적용 시: fail-open 검증(admin GET 503, status paused=false, return 미차단)
// ⚠️ 프로덕션 DB의 플래그를 잠깐 토글한다(수 초) — 시작 시 원래 값이 차단 상태면 중단.
//    finally에서 원상복구·검증하고 테스트 행/계정을 전부 삭제한다.
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

async function getStatus() {
  const res = await fetch(`${BASE_URL}/api/payments/status`);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function switchApi(method, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api/admin/payments-switch`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// return 라우트에 빈 폼 POST — kill switch가 켜져 있으면 폼을 읽기도 전에
// PAYMENTS_PAUSED로 리다이렉트되므로 실결제 없이 차단 여부를 판별할 수 있다.
async function probeReturnRoute() {
  const res = await fetch(`${BASE_URL}/api/payments/nice/return`, {
    method: "POST",
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

function webhookSignature(tid, amount, ediDate) {
  return crypto
    .createHash("sha256")
    .update(`${tid}${amount}${ediDate}${env.NICEPAY_SECRET_KEY}`)
    .digest("hex");
}

async function postWebhook(event) {
  const res = await fetch(`${BASE_URL}/api/payments/nice/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const ts = Date.now();
  const userEmail = `payment-safety-e2e-user-${ts}@example.com`;
  const adminEmail = `payment-safety-e2e-admin-${ts}@example.com`;
  const password = `E2e!${ts}#${crypto.randomBytes(8).toString("hex")}`;
  console.log(`테스트 계정: ${userEmail} / ${adminEmail} (서버: ${BASE_URL})`);

  // 0020 적용 여부 + 현재 플래그
  const probe = await admin
    .from("service_flags").select("value").eq("key", "payments_disabled").maybeSingle();
  const has0020 = !probe.error;
  const originalDisabled = has0020 ? probe.data?.value === true : null;
  console.log(`0020: ${has0020 ? "적용됨" : "미적용(fail-open 검증 모드)"} / 현재 플래그: ${originalDisabled}`);
  if (originalDisabled === true) {
    console.error("⚠️ 결제가 이미 차단 상태 — 실사고 대응 중일 수 있어 테스트를 중단합니다.");
    process.exit(3);
  }

  let userUid = null, adminUid = null;
  let flagTouched = false;
  const cancelTids = [];

  try {
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
    let r = await switchApi("GET", null);
    check("스위치 GET 무인증 → 403", r.status === 403, `status=${r.status}`);
    r = await switchApi("GET", userToken);
    check("스위치 GET 비관리자 → 403", r.status === 403, `status=${r.status}`);
    r = await switchApi("POST", userToken, { disabled: true });
    check("스위치 POST 비관리자 → 403", r.status === 403, `status=${r.status}`);

    if (!has0020) {
      // ── fail-open 검증 (0020 미적용) ──
      r = await switchApi("GET", adminToken);
      check("(미적용) 관리자 GET → 503 migration_pending", r.status === 503, JSON.stringify(r));
      const st = await getStatus();
      check("(미적용) status paused=false (fail-open)", st.status === 200 && st.data.paused === false, JSON.stringify(st));
      const ret = await probeReturnRoute();
      check("(미적용) return 라우트 미차단", ret.status === 303 && !ret.location.includes("PAYMENTS_PAUSED"), JSON.stringify(ret));
      const wh = await postWebhook({ status: "cancelled", tid: `e2e_cancel_${ts}_a`, orderId: "mo_x", amount: "1000", ediDate: "x", signature: "bad" });
      check("(미적용) 취소 웹훅 200 OK (저장 실패는 로그만)", wh.status === 200 && wh.text.includes("OK"), JSON.stringify(wh));
      return;
    }

    // ── kill switch 왕복 (0020 적용) ──
    r = await switchApi("GET", adminToken);
    check("관리자 GET → disabled:false", r.status === 200 && r.data.disabled === false && r.data.envForced === false, JSON.stringify(r));

    const st0 = await getStatus();
    check("초기 status paused=false", st0.status === 200 && st0.data.paused === false, JSON.stringify(st0));

    r = await switchApi("POST", adminToken, { disabled: true });
    flagTouched = true;
    check("차단 ON → 200", r.status === 200 && r.data.disabled === true, JSON.stringify(r));

    const st1 = await getStatus();
    check("차단 중 status paused=true", st1.data.paused === true, JSON.stringify(st1));

    const blocked = await probeReturnRoute();
    check("차단 중 return → 303 PAYMENTS_PAUSED", blocked.status === 303 && blocked.location.includes("PAYMENTS_PAUSED"), JSON.stringify(blocked));

    const { data: flagRow } = await admin
      .from("service_flags").select("updated_by").eq("key", "payments_disabled").single();
    check("감사 기록 updated_by=관리자", flagRow?.updated_by === adminUid, JSON.stringify(flagRow));

    r = await switchApi("POST", adminToken, { disabled: false });
    check("차단 OFF → 200", r.status === 200 && r.data.disabled === false, JSON.stringify(r));
    flagTouched = false;

    const st2 = await getStatus();
    check("해제 후 status paused=false", st2.data.paused === false, JSON.stringify(st2));
    const open = await probeReturnRoute();
    check("해제 후 return 정상 경로 복귀(PAUSED 아님)", open.status === 303 && !open.location.includes("PAYMENTS_PAUSED"), JSON.stringify(open));

    // ── 취소 웹훅 저장 + 경보 ──
    if (!env.NICEPAY_SECRET_KEY) {
      console.log("  SKIP  취소 웹훅 (NICEPAY_SECRET_KEY 없음)");
    } else {
      const tidValid = `e2e_cancel_${ts}_valid`;
      const ediDate = new Date().toISOString();
      cancelTids.push(tidValid);
      let wh = await postWebhook({
        status: "cancelled", tid: tidValid, orderId: `mo_e2e_${ts}`, amount: "1000",
        ediDate, signature: webhookSignature(tidValid, "1000", ediDate),
      });
      check("취소 웹훅(서명 유효) → 200 OK", wh.status === 200 && wh.text.includes("OK"), JSON.stringify(wh));
      const { data: evValid } = await admin
        .from("payment_events").select("*").eq("tid", tidValid).maybeSingle();
      check("이벤트 저장 + signature_valid=true (경보 메일 1통 발송됨)", !!evValid && evValid.signature_valid === true && evValid.event_type === "cancelled", JSON.stringify(evValid));

      const tidBad = `e2e_cancel_${ts}_bad`;
      cancelTids.push(tidBad);
      wh = await postWebhook({
        status: "partialCancelled", tid: tidBad, orderId: `mo_e2e_${ts}`, amount: "1000",
        ediDate, signature: "forged",
      });
      check("취소 웹훅(서명 위조) → 200 OK", wh.status === 200 && wh.text.includes("OK"), JSON.stringify(wh));
      const { data: evBad } = await admin
        .from("payment_events").select("*").eq("tid", tidBad).maybeSingle();
      check("위조 건도 저장되되 signature_valid=false (경보 없음)", !!evBad && evBad.signature_valid === false, JSON.stringify(evBad));
    }
  } finally {
    // 플래그 원상복구 (프로덕션 안전 최우선)
    if (has0020) {
      await admin.from("service_flags")
        .update({ value: false, updated_at: new Date().toISOString() })
        .eq("key", "payments_disabled");
      const st = await getStatus().catch(() => null);
      const restored = st?.data?.paused === false;
      console.log(restored ? "플래그 원상복구 확인 (paused=false)" : "⚠️ 플래그 복구 확인 실패 — service_flags를 직접 확인하세요!");
      if (flagTouched && !restored) process.exitCode = 4;
    }
    for (const tid of cancelTids) {
      await admin.from("payment_events").delete().eq("tid", tid);
    }
    if (userUid) await admin.auth.admin.deleteUser(userUid).catch(() => {});
    if (adminUid) await admin.auth.admin.deleteUser(adminUid).catch(() => {});
    if (adminUid) {
      const { data: still } = await admin.auth.admin.getUserById(adminUid).catch(() => ({ data: null }));
      console.log(still?.user ? "⚠️ 관리자 테스트 계정 삭제 실패 — 수동 삭제 필요: " + adminEmail : "정리 완료 (관리자 테스트 계정 삭제 확인)");
    }
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("스크립트 오류:", e); process.exit(2); });
