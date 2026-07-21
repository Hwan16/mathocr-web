// LA-09 보강 데이터 정리 (2026-07-13, CODEX_REVIEW2_FOLLOWUP_PLAN §2-3·§4-3)
// 가입 체크박스로 marketing_opt_in 이 기록됐지만 이메일 인증을 마치지 않은
// 계정을 pending 으로 강등한다 — 이메일 소유가 확인되지 않은 동의는 무효로
// 보고, 인증 후 첫 로그인 때 claimPendingMarketingConsent 가 재활성화한다.
//
// 사용법: node scripts/la09_demote_unconfirmed_optin.cjs        (dry-run — 조회만)
//         node scripts/la09_demote_unconfirmed_optin.cjs --apply (실제 강등)
//
// 강등 내용 (계정당):
//   1) profiles.marketing_opt_in → false
//   2) user_metadata: marketing_opt_in 제거, pending_marketing_opt_in=true
//   3) user_consents 에 agreed=false 감사 행 (user_agent 로 시스템 처리임을 표시)
const fs = require("fs");
const path = require("path");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APPLY = process.argv.includes("--apply");
const CONSENT_VERSION = "2026-07-21"; // src/lib/consent.ts 와 동일 값
const AUDIT_AGENT = "system:la09-demote-unconfirmed-optin-2026-07-13";

async function listAllUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers p${page}: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }
  return users;
}

(async () => {
  const users = await listAllUsers();
  console.log(`전체 계정: ${users.length}`);

  const unconfirmed = users.filter((u) => !u.email_confirmed_at);
  console.log(`미인증 계정: ${unconfirmed.length}`);

  // profiles.marketing_opt_in 조회 (미인증 계정만)
  const targets = [];
  for (const u of unconfirmed) {
    const metaOptIn = u.user_metadata?.marketing_opt_in === true;
    const { data: profile, error } = await admin
      .from("profiles")
      .select("marketing_opt_in")
      .eq("id", u.id)
      .maybeSingle();
    if (error) throw new Error(`profile ${u.id}: ${error.message}`);
    const profileOptIn = profile?.marketing_opt_in === true;
    if (metaOptIn || profileOptIn) {
      targets.push({ user: u, metaOptIn, profileOptIn, hasProfile: !!profile });
    }
  }

  console.log(`강등 대상 (미인증 + opt_in): ${targets.length}`);
  for (const t of targets) {
    console.log(
      `  - ${t.user.email} (가입 ${t.user.created_at}) meta=${t.metaOptIn} profile=${t.profileOptIn}`
    );
  }

  if (!APPLY) {
    console.log("\ndry-run 종료 — 실제 강등은 --apply 로 실행");
    return;
  }

  for (const t of targets) {
    const u = t.user;
    // (1) 프로필 opt_in 해제
    if (t.hasProfile && t.profileOptIn) {
      const { error } = await admin
        .from("profiles")
        .update({ marketing_opt_in: false })
        .eq("id", u.id);
      if (error) throw new Error(`profile update ${u.id}: ${error.message}`);
    }
    // (2) metadata: 확정 동의 제거 → pending 으로
    const { error: metaError } = await admin.auth.admin.updateUserById(u.id, {
      user_metadata: {
        ...(u.user_metadata ?? {}),
        marketing_opt_in: null,
        pending_marketing_opt_in: true,
      },
    });
    if (metaError) throw new Error(`metadata update ${u.id}: ${metaError.message}`);
    // (3) 감사 행 — 시스템 강등임을 user_agent 로 표시
    const { error: consentError } = await admin.from("user_consents").insert([
      {
        user_id: u.id,
        email: u.email,
        doc_type: "marketing",
        version: CONSENT_VERSION,
        agreed: false,
        ip: null,
        user_agent: AUDIT_AGENT,
      },
    ]);
    if (consentError) throw new Error(`consent insert ${u.id}: ${consentError.message}`);
    console.log(`  강등 완료: ${u.email}`);
  }
  console.log(`\n적용 완료 — ${targets.length}건`);
})().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
