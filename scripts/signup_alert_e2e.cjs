// 가입 급증 알림 e2e (lib/signup-alert.ts) — 2026-08-08 어뷰징 사고 후속.
//
// 사용법:
//   1) web/.env.local 에 임계값을 임시로 낮춘다 (기본 5는 검증에 계정이 너무 많이 필요):
//        SIGNUP_ALERT_THRESHOLD=3
//        SIGNUP_BLOCKED_ALERT_THRESHOLD=3
//   2) dev 서버 실행 후
//        node scripts/signup_alert_e2e.cjs blocked   # 계정 안 만듦
//        node scripts/signup_alert_e2e.cjs surge     # 실계정 1개 생성 → 반드시 정리
//        node scripts/signup_alert_e2e.cjs cleanup   # 위에서 만든 테스트 계정 삭제
//   3) .env.local 에서 임계값 두 줄을 다시 지운다.
//
// 확인 지점은 dev 서버 콘솔이다. RESEND_API_KEY 가 로컬에 없으면 실제 메일은
// 나가지 않고 `[admin-alert] ...` 한 줄만 찍힌다 (sendAdminAlert 의 설계).
//
// ⚠️ 주의 1: dev 서버는 .env.local 을 그대로 쓰므로 **운영 Supabase·Upstash 에 붙는다.**
//   surge 테스트는 운영 DB에 진짜 계정을 만들고 확인 메일도 실제로 발송된다
//   (seize.win 별칭으로 가니 무시하면 됨). 끝나면 cleanup 을 꼭 돌릴 것.
// ⚠️ 주의 2: 경보 중복 억제 키(rl:signupalert:*)도 운영 Upstash 를 공유한다.
//   테스트가 그 시간대의 "1시간에 1통" 슬롯을 소모하므로, 직후 한 시간은
//   운영에서 같은 종류의 경보가 안 갈 수 있다.

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const TEST_EMAIL_RE = /^seize\.win\+sa\d+@gmail\.com$/;
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function signup(email, password) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    // IP당 5회/시간 제한이 일회용 차단보다 먼저 걸리므로 매 요청 IP를 바꾼다
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip() },
    body: JSON.stringify({ email, password, agreed_terms: true, agreed_privacy: true }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function adminClient() {
  const fs = require("fs");
  const path = require("path");
  const WEB = path.join(__dirname, "..");
  const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));
  const env = {};
  for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

(async () => {
  const mode = process.argv[2];

  if (mode === "blocked") {
    const n = 4;
    console.log(`일회용 메일 차단을 ${n}회 발생시킨다 (임계 3 기준 → 마지막 회차에서 경보):`);
    for (let i = 1; i <= n; i++) {
      const r = await signup(`probe${i}${Date.now()}@colaname.com`, "ValidPass123!");
      const ok = r.status === 400 && /일회용/.test(r.json.error ?? "");
      console.log(`  ${i}회차 → ${ok ? "PASS" : "FAIL"} status=${r.status} / ${r.json.error}`);
    }
    console.log("\n기대: 서버 콘솔에 [admin-alert] [MathOCR 어뷰징 차단] 이 **1번만** (중복 억제 확인)");
    return;
  }

  if (mode === "surge") {
    const email = `seize.win+sa${Date.now()}@gmail.com`;
    console.log(`실가입 1건 시도: ${email}`);
    const r = await signup(email, `E2e!${Date.now()}#pw`);
    if (r.status !== 200) {
      console.log(`  FAIL status=${r.status} — 경보 로직이 가입을 깨뜨렸다(심각)`);
      process.exit(1);
    }
    console.log("  PASS — 경보 경로가 붙어도 가입은 200 성공");
    console.log("\n기대: 서버 콘솔에 [admin-alert] [MathOCR 가입 급증] (최근 1시간 가입이 임계 이상일 때)");
    console.log("→ 끝나면 `node scripts/signup_alert_e2e.cjs cleanup` 실행할 것");
    return;
  }

  if (mode === "cleanup") {
    const admin = await adminClient();
    const users = [];
    for (let p = 1; p <= 60; p++) {
      const { data } = await admin.auth.admin.listUsers({ page: p, perPage: 200 });
      users.push(...data.users);
      if (data.users.length < 200) break;
    }
    const targets = users.filter((u) => TEST_EMAIL_RE.test(u.email || ""));
    console.log(`테스트 계정 ${targets.length}건`);
    for (const u of targets) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      const { data: left } = await admin.from("profiles").select("id").eq("id", u.id);
      console.log(`  ${error ? "FAIL " + error.message : "삭제됨"}  ${u.email} (profiles 잔여 ${(left || []).length}건)`);
    }
    return;
  }

  console.log("사용법: node scripts/signup_alert_e2e.cjs blocked|surge|cleanup");
})();
