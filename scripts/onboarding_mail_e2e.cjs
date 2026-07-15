// 온보딩 메일 2통 e2e (2026-07-16, 마케팅 백로그 §6-2 + 0018)
// 사용법: (0018 마이그레이션 적용 + dev 서버 실행 중에) node scripts/onboarding_mail_e2e.cjs
//
// 검증 내용 — onboarding-mail cron dry-run의 발송 판정:
//   1) 인증 + 동의 + 크레딧 보유 신규 가입 → 환영 메일 대상 (send=true)
//   2) 환영 발송 기록 후 → 환영 대상에서 제외 + 리마인드는 아직 아님 (4일 미경과)
//   3) 환영 발송을 4.5일 전으로 소급 → 리마인드 대상 (미사용자)
//   4) 변환 이력 삽입 → 리마인드 제외 (used=true)
//   5) 동의 해제(marketing_opt_in=false) → 두 메일 모두 후보에서 사라짐
//   6) 미인증 계정 → 후보에는 있으나 send=false (fail-closed)
//   7) 환영 발송 7일 초과 소급(구 가입자 시나리오) → 리마인드 stale 제외
// 그리고 expiry-reminder와의 중복 방지:
//   8) 만료 창(7일 내) + 최근 환영 발송 → expiry-reminder 후보에서 제외
//   9) 환영 발송을 8일 전으로 소급 → expiry-reminder 후보에 복귀 (send=marketing)
// 발송은 전부 dry-run — 실메일 0통. 테스트 유저는 마지막에 삭제한다.
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
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function dryRun(route) {
  const res = await fetch(`${BASE_URL}/api/cron/${route}?dry=1`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`${route} dry-run ${res.status}: ${await res.text()}`);
  return res.json();
}

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
const daysAhead = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  const stamp = Date.now();
  const mainEmail = `onboard-e2e-${stamp}@example.com`;
  const unconfEmail = `onboard-e2e-unconf-${stamp}@example.com`;
  const cleanup = [];

  try {
    // ── 준비: 인증된 동의자 (신규 가입 흉내) ──
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: mainEmail,
      password: `E2e!${stamp}`,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    const uid = created.user.id;
    cleanup.push(uid);
    await admin.from("profiles").update({
      marketing_opt_in: true,
      credits: 30,
      expires_at: daysAhead(7),
    }).eq("id", uid);

    // ── 준비: 미인증 동의자 ──
    const { data: created2, error: createErr2 } = await admin.auth.admin.createUser({
      email: unconfEmail,
      password: `E2e!${stamp}b`,
      email_confirm: false,
    });
    if (createErr2) throw createErr2;
    const uid2 = created2.user.id;
    cleanup.push(uid2);
    await admin.from("profiles").update({
      marketing_opt_in: true,
      credits: 5,
      expires_at: daysAhead(7),
    }).eq("id", uid2);

    // 1) 신규 동의자 → 환영 대상
    let d = await dryRun("onboarding-mail");
    let me = d.welcome.candidates.find((c) => c.email === mainEmail);
    check("1. 인증+동의 신규 가입 → 환영 대상", me && me.send === true, me);

    // 6) 미인증 → 후보이나 send=false
    let un = d.welcome.candidates.find((c) => c.email === unconfEmail);
    check("6. 미인증 계정 → 환영 send=false (fail-closed)", un && un.send === false, un);

    // 2) 환영 발송 기록 → 환영 제외 + 리마인드 아직 아님
    await admin.from("profiles").update({ onboarding_welcome_sent_at: new Date().toISOString() }).eq("id", uid);
    d = await dryRun("onboarding-mail");
    me = d.welcome.candidates.find((c) => c.email === mainEmail);
    const rem = d.reminder.candidates.find((c) => c.email === mainEmail);
    check("2a. 환영 발송 기록 → 환영 후보 제외", !me);
    check("2b. 4일 미경과 → 리마인드 후보 아님", !rem);

    // 3) 환영 4.5일 전 소급 → 리마인드 대상
    await admin.from("profiles").update({ onboarding_welcome_sent_at: daysAgo(4.5) }).eq("id", uid);
    d = await dryRun("onboarding-mail");
    let rem2 = d.reminder.candidates.find((c) => c.email === mainEmail);
    check("3. 환영+4.5일·미사용 → 리마인드 대상", rem2 && rem2.send === true && rem2.used === false, rem2);

    // 4) 변환 이력 → 리마인드 제외
    const { data: conv, error: convErr } = await admin.from("conversions").insert({
      user_id: uid, problem_count: 1, credits_used: 1, status: "completed",
    }).select("id").single();
    if (convErr) throw convErr;
    d = await dryRun("onboarding-mail");
    rem2 = d.reminder.candidates.find((c) => c.email === mainEmail);
    check("4. 변환 이력 있음 → 리마인드 send=false (used)", rem2 && rem2.used === true && rem2.send === false, rem2);
    await admin.from("conversions").delete().eq("id", conv.id);

    // 7) 환영 7일 초과 소급 → stale 제외
    await admin.from("profiles").update({ onboarding_welcome_sent_at: daysAgo(7) }).eq("id", uid);
    d = await dryRun("onboarding-mail");
    rem2 = d.reminder.candidates.find((c) => c.email === mainEmail);
    check("7. 환영+7일(6일 초과) → 리마인드 stale 제외", !rem2);

    // 5) 동의 해제 → 전부 제외
    await admin.from("profiles").update({
      marketing_opt_in: false,
      onboarding_welcome_sent_at: null,
    }).eq("id", uid);
    d = await dryRun("onboarding-mail");
    me = d.welcome.candidates.find((c) => c.email === mainEmail);
    check("5. 동의 해제 → 환영 후보에서 제외", !me);
    await admin.from("profiles").update({ marketing_opt_in: true }).eq("id", uid);

    // ── expiry-reminder 중복 방지 ──
    // 만료 창(지금+6.5일)에 넣고 환영을 방금 발송한 상태로
    await admin.from("profiles").update({
      expires_at: daysAhead(6.5),
      onboarding_welcome_sent_at: new Date().toISOString(),
    }).eq("id", uid);
    let e = await dryRun("expiry-reminder");
    let exp = e.recipients.find((c) => c.email === mainEmail);
    check("8. 최근 환영 발송 → 만료 안내 후보 제외", !exp, exp);

    // 환영을 8일 전으로 소급 → 만료 안내 복귀
    await admin.from("profiles").update({ onboarding_welcome_sent_at: daysAgo(8) }).eq("id", uid);
    e = await dryRun("expiry-reminder");
    exp = e.recipients.find((c) => c.email === mainEmail);
    check("9. 환영 8일 전(7일 초과) → 만료 안내 복귀(marketing)", exp && exp.send === "marketing", exp);
  } finally {
    for (const id of cleanup) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.error(`  ⚠️ 테스트 유저 삭제 실패(${id}): ${error.message} — 수동 삭제 필요`);
    }
    console.log(`  (테스트 유저 ${cleanup.length}명 정리 완료)`);
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("e2e 실행 실패:", e);
  process.exit(1);
});
