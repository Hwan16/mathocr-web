// 가입 무료 크레딧 인증 후 지급(0027) e2e — 마이그레이션 적용 후 실행할 것
// 사용법: (dev 서버 실행 중에) node scripts/signup_credit_gate_e2e.cjs
// 검증:
//   1) GoTrue 직접 생성 계정(가입 라우트 우회 시뮬레이션) → 크레딧 0, 미지급 상태
//   2) 미인증 상태 앱 로그인(/api/auth/token) → 403, 여전히 크레딧 0
//   3) 이메일 인증 후 첫 로그인 → 15크레딧 + 유효기간 7일 지급
//   4) 재로그인 → 중복 지급 없음 (15 유지)
//   5) 일회용 메일로 우회 가입한 계정은 인증을 마쳐도 지급 거부 (잔액 0 유지)
// ⚠️ 0027 적용 전에 돌리면 1)이 FAIL(가입 즉시 15)하는 것이 정상이다.
// ⚠️ 테스트 주소에 +별칭·지메일 점을 쓰지 말 것 — 지급 단계의 이메일 검사에
//    걸려 3)이 실패한다(그게 의도된 동작).
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
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function getProfile(userId) {
  const { data, error } = await admin
    .from("profiles")
    .select("credits, expires_at, signup_credits_granted_at")
    .eq("id", userId)
    .single();
  if (error) throw new Error("프로필 조회 실패: " + error.message);
  return data;
}

async function appLogin(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const ts = Date.now();
  // 정상 가입자와 동형인 주소 (별칭·점 없음, 비일회용 도메인).
  // example.com은 IANA 예약 도메인이라 실제 메일이 나가지 않는다.
  const email = `mathocr-e2e-scg-${ts}@example.com`;
  const password = `E2e!${ts}#pw`;
  let userId = null;
  let abuserId = null;

  await fetch(BASE_URL).catch(() => {
    throw new Error(`${BASE_URL} 접속 불가 — dev 서버를 먼저 실행하세요`);
  });

  try {
    // 1) GoTrue 직접 생성 (= 가입 라우트 방어를 우회한 계정과 동일한 DB 경로)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });
    if (createErr) throw new Error("직접 생성 실패: " + createErr.message);
    userId = created.user.id;

    const p1 = await getProfile(userId);
    check(
      "직접 생성 계정은 크레딧 0으로 시작 (우회 수익 차단)",
      p1.credits === 0 && p1.signup_credits_granted_at === null,
      JSON.stringify(p1)
    );

    // 2) 미인증 상태 앱 로그인 → 403 + 여전히 0
    const unconfirmed = await appLogin(email, password);
    const p2 = await getProfile(userId);
    check(
      "미인증 로그인 403 + 크레딧 여전히 0",
      unconfirmed.status === 403 && p2.credits === 0,
      JSON.stringify({ status: unconfirmed.status, credits: p2.credits })
    );

    // 3) 이메일 인증 처리 후 첫 로그인 → 15크레딧 + 유효기간 지급
    const { error: confirmErr } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (confirmErr) throw new Error("인증 처리 실패: " + confirmErr.message);

    const first = await appLogin(email, password);
    const p3 = await getProfile(userId);
    const expiresOk =
      p3.expires_at &&
      new Date(p3.expires_at).getTime() > Date.now() + 6 * 24 * 3600 * 1000 &&
      new Date(p3.expires_at).getTime() < Date.now() + 8 * 24 * 3600 * 1000;
    check(
      "인증 후 첫 로그인 → 15크레딧 + 유효기간 약 7일",
      first.status === 200 &&
        p3.credits === 15 &&
        !!p3.signup_credits_granted_at &&
        !!expiresOk,
      JSON.stringify({ status: first.status, ...p3 })
    );
    check(
      "로그인 응답 잔액도 지급 반영",
      first.json?.user?.credits === 15,
      JSON.stringify(first.json?.user)
    );

    // 4) 재로그인 → 중복 지급 없음
    const second = await appLogin(email, password);
    const p4 = await getProfile(userId);
    check(
      "재로그인해도 15 유지 (중복 지급 없음)",
      second.status === 200 && p4.credits === 15,
      JSON.stringify({ status: second.status, credits: p4.credits })
    );

    // 5) 일회용 메일 우회 가입 → 인증을 마쳐도 지급 거부 (지급 단계 이메일 검사)
    const abuseEmail = `mathocr-e2e-ab-${ts}@mailinator.com`;
    const abusePassword = `E2e!${ts}#ab`;
    const { data: abuser, error: abuseErr } = await admin.auth.admin.createUser({
      email: abuseEmail,
      password: abusePassword,
      email_confirm: true, // 일회용 메일함도 인증 링크는 받을 수 있다
    });
    if (abuseErr) throw new Error("우회 계정 생성 실패: " + abuseErr.message);
    abuserId = abuser.user.id;

    const abuseLogin = await appLogin(abuseEmail, abusePassword);
    const pa = await getProfile(abuserId);
    check(
      "일회용 메일 계정은 인증 후에도 지급 거부 (잔액 0)",
      pa.credits === 0 && pa.signup_credits_granted_at === null,
      JSON.stringify({ status: abuseLogin.status, ...pa })
    );
  } finally {
    for (const [label, id] of [["정상", userId], ["우회", abuserId]]) {
      if (!id) continue;
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`  (정리 실패) ${label} user ${id}: ${error.message}`);
      else console.log(`  (정리) ${label} 테스트 유저 삭제 완료`);
    }
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("e2e 실행 오류:", e.message);
  process.exit(1);
});
