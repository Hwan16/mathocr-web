// 0012 가입 출처(UTM) 추적 e2e — 실제 가입 API 경로 검증 (M4, docs/MARKETING_2026-07-10.md)
// 사용법: (dev 서버 실행 중에) node scripts/utm_attribution_e2e.cjs
//   기본 대상 http://localhost:3000 — 배포 후 검증은 E2E_BASE_URL=https://mathocr.ai.kr
// 검증: UTM 포함 가입 → profiles + user_metadata 기록 / UTM 없는 가입 → null(직접 유입)
//   / 대소문자·공백·길이(100자) 정규화. 끝나면 테스트 계정 삭제.
// 전제: Supabase SQL Editor에서 0012_signup_attribution.sql 적용 완료
// 주의: 가입 확인 메일 2통이 seize.win+utm-e2e-*@gmail.com 으로 발송된다(무시하면 됨).
//       가입 API에 IP당 5회/시간 제한이 있어 반복 실행 시 429가 날 수 있다.
const fs = require("fs");
const path = require("path");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

// .env.local 파싱
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

async function signup(body) {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`가입 실패 (${res.status}): ${json.error ?? "?"}`);
  if (!json.user?.id) throw new Error("가입 응답에 user.id 없음: " + JSON.stringify(json));
  return json.user.id;
}

async function getProfileUtm(uid) {
  // 가입 API가 응답 전에 기록을 끝내지만, 혹시 모를 지연에 대비해 짧게 재시도
  for (let i = 0; i < 5; i++) {
    const { data } = await admin
      .from("profiles")
      .select("utm_source, utm_medium, utm_campaign")
      .eq("id", uid)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function main() {
  const ts = Date.now();
  const password = `E2e!${ts}#pw`;
  const uids = [];

  // 0) 컬럼 존재 확인 (0012 적용 여부)
  const { error: colErr } = await admin.from("profiles").select("utm_source").limit(1);
  if (colErr) throw new Error("0012 미적용으로 보임 (utm_source 조회 실패): " + colErr.message);
  check("profiles.utm_source 컬럼 존재", true);

  // 서버 접근 확인
  await fetch(BASE_URL).catch(() => {
    throw new Error(`${BASE_URL} 접속 불가 — dev 서버를 먼저 실행하세요 (npm run dev)`);
  });

  try {
    // 1) UTM 포함 가입 — 정규화(공백·대문자·길이 초과)까지 한 번에 검증
    const longCampaign = "typing-" + "x".repeat(120);
    const uid1 = await signup({
      email: `seize.win+utm-e2e-${ts}a@gmail.com`,
      password,
      agreed_terms: true,
      agreed_privacy: true,
      utm_source: "  NAVER ",
      utm_medium: "CPC",
      utm_campaign: longCampaign,
    });
    uids.push(uid1);

    const utm1 = await getProfileUtm(uid1);
    check("UTM 가입: profiles.utm_source 기록(+소문자·공백 정규화)", utm1?.utm_source === "naver",
      JSON.stringify(utm1));
    check("UTM 가입: utm_medium 기록", utm1?.utm_medium === "cpc", JSON.stringify(utm1));
    check("UTM 가입: utm_campaign 100자 제한",
      typeof utm1?.utm_campaign === "string" &&
      utm1.utm_campaign.length === 100 &&
      utm1.utm_campaign.startsWith("typing-"),
      `len=${utm1?.utm_campaign?.length}`);

    const { data: user1 } = await admin.auth.admin.getUserById(uid1);
    check("UTM 가입: user_metadata 사본 존재(백필용)",
      user1?.user?.user_metadata?.utm_source === "naver",
      JSON.stringify(user1?.user?.user_metadata ?? {}));

    // 2) UTM 없는 가입 → null(직접 유입)
    const uid2 = await signup({
      email: `seize.win+utm-e2e-${ts}b@gmail.com`,
      password,
      agreed_terms: true,
      agreed_privacy: true,
    });
    uids.push(uid2);

    const utm2 = await getProfileUtm(uid2);
    check("일반 가입: utm 3컬럼 모두 null(직접 유입)",
      utm2 !== null && utm2.utm_source === null && utm2.utm_medium === null && utm2.utm_campaign === null,
      JSON.stringify(utm2));

    const { data: user2 } = await admin.auth.admin.getUserById(uid2);
    check("일반 가입: user_metadata에 utm 키 없음",
      user2?.user && !("utm_source" in (user2.user.user_metadata ?? {})),
      JSON.stringify(user2?.user?.user_metadata ?? {}));
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
