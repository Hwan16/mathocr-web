// 가입 기본 프로모션(얼리버드 자동 적용, 2026-07-16) e2e
// 사용법: (dev 서버 실행 중에) node scripts/signup_default_promo_e2e.cjs
// 검증:
//   1) 코드 없이 가입 → user_metadata.pending_promo_code === DEFAULT(earlybird)
//   2) 명시 코드로 가입 → 입력한 코드가 유지 (기본값이 덮어쓰지 않음)
//   3) 공백 코드로 가입 → 기본값 적용 (빈 문자열도 누락되지 않음)
// 주의: 확인 메일이 seize.win+edp-*@gmail.com 으로 발송됨(무시하면 됨).
//       실제 earlybird 코드는 소모하지 않는다(pending 단계까지만 확인).
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
const DEFAULT_PROMO = "earlybird";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function signup(body, fakeIp) {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": fakeIp,
    },
    body: JSON.stringify({
      password: `E2e!${Date.now()}#pw`,
      agreed_terms: true,
      agreed_privacy: true,
      ...body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`가입 실패 (${res.status}): ${json.error ?? "?"}`);
  return json;
}

async function findUser(email) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("listUsers 실패: " + error.message);
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
  return null;
}

async function main() {
  const ts = Date.now();
  const uids = [];
  const codeIds = [];

  await fetch(BASE_URL).catch(() => {
    throw new Error(`${BASE_URL} 접속 불가 — dev 서버를 먼저 실행하세요`);
  });

  try {
    // 1) 코드 없이 가입 → 기본 프로모션이 pending 으로 저장
    const email1 = `seize.win+edp-none-${ts}@gmail.com`;
    await signup({ email: email1 }, `10.99.${ts % 250}.1`);
    const u1 = await findUser(email1);
    check("코드 없이 가입 성공", !!u1);
    if (u1) uids.push(u1.id);
    check(
      `코드 미입력 → pending_promo_code = ${DEFAULT_PROMO}`,
      u1?.user_metadata?.pending_promo_code === DEFAULT_PROMO,
      JSON.stringify(u1?.user_metadata?.pending_promo_code)
    );

    // 2) 명시 코드로 가입 → 입력 코드 유지 (기본값이 덮어쓰지 않음)
    const cloneCode = `e2e-edp-${ts}`;
    const { data: codeRow, error: codeErr } = await admin.from("promo_codes")
      .insert({ code: cloneCode, credits: 10, max_uses: 5, validity_days: 7, memo: "e2e 기본 프로모션 테스트 (자동 비활성화됨)" })
      .select("id").single();
    if (codeErr) throw new Error("클론 코드 생성 실패: " + codeErr.message);
    codeIds.push(codeRow.id);

    const email2 = `seize.win+edp-explicit-${ts}@gmail.com`;
    await signup({ email: email2, promo_code: cloneCode }, `10.99.${ts % 250}.2`);
    const u2 = await findUser(email2);
    if (u2) uids.push(u2.id);
    check(
      "명시 코드 입력 → 해당 코드 유지",
      u2?.user_metadata?.pending_promo_code === cloneCode,
      JSON.stringify(u2?.user_metadata?.pending_promo_code)
    );

    // 3) 공백 코드 → 기본 프로모션 적용
    const email3 = `seize.win+edp-blank-${ts}@gmail.com`;
    await signup({ email: email3, promo_code: "   " }, `10.99.${ts % 250}.3`);
    const u3 = await findUser(email3);
    if (u3) uids.push(u3.id);
    check(
      `공백 코드 → pending_promo_code = ${DEFAULT_PROMO}`,
      u3?.user_metadata?.pending_promo_code === DEFAULT_PROMO,
      JSON.stringify(u3?.user_metadata?.pending_promo_code)
    );
  } finally {
    // 정리: 테스트 유저 삭제 + 클론 코드 비활성화
    for (const id of uids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`  (정리 실패) user ${id}: ${error.message}`);
    }
    for (const id of codeIds) {
      const { error } = await admin.from("promo_codes").update({ is_active: false }).eq("id", id);
      if (error) console.warn(`  (정리 실패) code ${id}: ${error.message}`);
    }
    console.log(`  (정리) 테스트 유저 ${uids.length}명 삭제, 클론 코드 ${codeIds.length}개 비활성화`);
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("e2e 실행 오류:", e.message);
  process.exit(1);
});
