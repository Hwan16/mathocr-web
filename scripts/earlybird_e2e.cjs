// 0013 얼리버드 e2e — 가입 API 경로 + 어뷰징 가드(알리아스·IP) 검증
// 사용법: (dev 서버 실행 중에) node scripts/earlybird_e2e.cjs
// 전제: Supabase SQL Editor에서 0013_earlybird.sql 적용 완료
// 구성:
//   1) 실제 earlybird 코드가 validate-promo에서 열려 있는지 (25크레딧·30일)
//   2) 일회용 클론 코드로 가입 API 풀 경로: 30크레딧(5+25)·만료 ~30일·
//      marketing_opt_in·동의 감사 행·redemption에 normalized_email/ip 기록
//   3) 지메일 알리아스 변형 가입 → 보너스 차단 (promo_error=already_redeemed)
//   4) RPC 직접 호출로 IP 가드: 같은 IP 2회째 성공 → 3회째 ip_limit
// 주의: 확인 메일 2통이 seize.win+eb-*@gmail.com 으로 발송됨(무시하면 됨).
//       실제 earlybird 코드는 소모하지 않는다(클론 코드 사용 — 선착순 200 보존).
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
const daysFromNow = (iso) => (new Date(iso) - Date.now()) / 86400000;

async function signup(body, fakeIp) {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // dev 서버는 x-forwarded-for를 신뢰하므로 테스트 IP 격리에 사용
      "x-forwarded-for": fakeIp,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`가입 실패 (${res.status}): ${json.error ?? "?"}`);
  return json;
}

async function main() {
  const ts = Date.now();
  const password = `E2e!${ts}#pw`;
  const uids = [];
  const codeIds = [];

  // 0) 컬럼·실코드 확인
  const { error: colErr } = await admin.from("promo_redemptions").select("normalized_email, ip").limit(1);
  if (colErr) throw new Error("0013 미적용으로 보임: " + colErr.message);
  check("promo_redemptions.normalized_email/ip 컬럼 존재", true);

  await fetch(BASE_URL).catch(() => {
    throw new Error(`${BASE_URL} 접속 불가 — dev 서버를 먼저 실행하세요`);
  });

  // 1) 실제 earlybird 코드가 열려 있는지 (소모하지는 않음)
  const vres = await fetch(`${BASE_URL}/api/auth/validate-promo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "earlybird" }),
  });
  const vjson = await vres.json().catch(() => ({}));
  check("earlybird 코드 오픈 (25크레딧·유효 30일)",
    vjson.valid === true && vjson.bonus_credits === 25 && vjson.validity_days === 30,
    JSON.stringify(vjson));

  // 2) 클론 코드 생성 (실코드 선착순 보존)
  const cloneCode = `e2e-eb-${ts}`;
  const { data: codeRow, error: codeErr } = await admin.from("promo_codes")
    .insert({ code: cloneCode, credits: 25, max_uses: 200, validity_days: 30, memo: "e2e 얼리버드 가드 테스트 (자동 비활성화됨)" })
    .select("id").single();
  if (codeErr) throw new Error("클론 코드 생성 실패: " + codeErr.message);
  codeIds.push(codeRow.id);

  const IP_A = "203.0.113.87";
  const IP_B = "203.0.113.88";

  try {
    // 3) 얼리버드 경로 가입 (알리아스 base) — IP_A 1회째
    const r1 = await signup({
      email: `seize.win+eb-${ts}a@gmail.com`,
      password,
      promo_code: cloneCode,
      agreed_terms: true,
      agreed_privacy: true,
      marketing_opt_in: true,
    }, IP_A);
    uids.push(r1.user.id);
    check("얼리버드 가입: 보너스 적용 (총 30크레딧 응답)", r1.promo_applied === true && r1.credits === 30,
      JSON.stringify({ promo_applied: r1.promo_applied, credits: r1.credits }));

    const { data: p1 } = await admin.from("profiles")
      .select("credits, expires_at, marketing_opt_in").eq("id", r1.user.id).maybeSingle();
    check("profiles: 크레딧 30 + 만료 ~30일", p1?.credits === 30 && Math.abs(daysFromNow(p1.expires_at) - 30) < 0.5,
      JSON.stringify(p1));
    check("profiles.marketing_opt_in = true", p1?.marketing_opt_in === true, JSON.stringify(p1));

    const { data: consents } = await admin.from("user_consents")
      .select("doc_type").eq("user_id", r1.user.id);
    const docTypes = (consents ?? []).map((c) => c.doc_type).sort().join(",");
    check("동의 감사 행 3종 (terms/privacy/marketing)", docTypes === "marketing,privacy,terms", docTypes);

    const { data: red1 } = await admin.from("promo_redemptions")
      .select("normalized_email, ip").eq("user_id", r1.user.id).maybeSingle();
    check("redemption에 정규화 이메일·IP 기록",
      red1?.normalized_email === "seizewin@gmail.com" && red1?.ip === IP_A,
      JSON.stringify(red1));

    // 4) 알리아스 변형 가입 (점 추가 + 다른 +suffix) — 보너스 차단, 가입은 성공
    const r2 = await signup({
      email: `s.eize.win+eb-${ts}b@gmail.com`,
      password,
      promo_code: cloneCode,
      agreed_terms: true,
      agreed_privacy: true,
      marketing_opt_in: true,
    }, IP_B);
    uids.push(r2.user.id);
    check("알리아스 변형: 가입은 성공, 보너스는 차단",
      r2.promo_applied === false && r2.promo_error === "already_redeemed" && r2.credits === 5,
      JSON.stringify({ promo_applied: r2.promo_applied, promo_error: r2.promo_error, credits: r2.credits }));

    // 5) IP 가드 (RPC 직접): IP_A 2회째 성공 → 3회째 ip_limit
    const { data: u3 } = await admin.auth.admin.createUser({
      email: `eb-e2e-${ts}-c@example.com`, password, email_confirm: true,
    });
    const { data: u4 } = await admin.auth.admin.createUser({
      email: `eb-e2e-${ts}-d@example.com`, password, email_confirm: true,
    });
    uids.push(u3.user.id, u4.user.id);
    // profiles 트리거 대기
    for (const uid of [u3.user.id, u4.user.id]) {
      for (let i = 0; i < 10; i++) {
        const { data } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
        if (data) break;
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const { data: red3 } = await admin.rpc("redeem_promo_code", {
      p_user_id: u3.user.id, p_code: cloneCode, p_source: "signup",
      p_normalized_email: `c${ts}@example.com`, p_ip: IP_A,
    });
    check("같은 IP 2회째: 허용", red3?.success === true, JSON.stringify(red3));

    const { data: red4 } = await admin.rpc("redeem_promo_code", {
      p_user_id: u4.user.id, p_code: cloneCode, p_source: "signup",
      p_normalized_email: `d${ts}@example.com`, p_ip: IP_A,
    });
    check("같은 IP 3회째: ip_limit 차단", red4?.success === false && red4?.error === "ip_limit",
      JSON.stringify(red4));
  } finally {
    for (const uid of uids) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    for (const id of codeIds) {
      await admin.from("promo_codes").update({ is_active: false }).eq("id", id);
    }
    console.log(`정리 완료: 계정 ${uids.length}개 삭제, 클론 코드 비활성화 (redemption 이력은 가드용으로 보존됨)`);
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("E2E 실행 오류:", e.message); process.exit(1); });
