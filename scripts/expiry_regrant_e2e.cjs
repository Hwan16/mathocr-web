// 만료 크레딧 자동 재지급 e2e (2026-07-22, 0022 + /api/cron/expiry-regrant)
// 사용법: (0022 마이그레이션 적용 + dev 서버 실행 중에) node scripts/expiry_regrant_e2e.cjs
//
// 검증 내용:
//  [dry-run 판정 매트릭스]
//   1) 인증 + 만료 + 15크레딧 + 마케팅 동의 → grant=true, mail=true
//   2) 인증 + 만료 + 15크레딧 + 비동의     → grant=true, mail=false (조용한 지급)
//   3) 인증 + 만료 +  9크레딧             → 후보 자체에서 제외 (MIN_LOST=10)
//   4) 미인증 + 만료 + 20크레딧           → grant=false, skip=unconfirmed (fail-closed)
//   4b) 40일 전 만료 + 15크레딧           → 후보 제외 (REGRANT_WINDOW_DAYS=30 시간창)
//  [RPC 'system' 소스 (0022)]
//   5) system 상환 성공 → 30크레딧, 만료일 ~7일 뒤, payments promo_ 기록
//   6) 같은 유저 재상환 → already_redeemed (계정당 평생 1회)
//   7) 공개 경로(mypage)로 re_earlybird → inactive_code (비활성 코드 차단 유지)
//   8) 엉뚱한 소스('hack') → invalid_source
//  [지급 후 dry-run]
//   9) 상환한 유저는 skip=already_granted 로 바뀐다
//  주의: 실발송(real run)은 호출하지 않는다 — 프로덕션 실사용자에게 지급될 수 있으므로
//        dry-run과 테스트 유저 대상 직접 RPC로만 검증한다.
//  주의: 09:20 KST(00:20 UTC) 전후로는 실행하지 말 것 — 프로덕션 cron 이 같은 시각에
//        돌면서 테스트 유저에게 실제 지급·메일을 할 수 있다(seize.win+ 알리아스라
//        피해는 없지만 검증 결과가 흔들린다).
// 테스트 유저·상환/지급 행은 마지막에 삭제한다 (프로덕션 cron 대상이 되지 않도록).
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
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function dryRun() {
  const res = await fetch(`${BASE_URL}/api/cron/expiry-regrant?dry=1`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`dry-run HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function findRecipient(body, email) {
  return (body.recipients ?? []).find((r) => r.email === email) ?? null;
}

async function makeUser({ tag, confirmed, credits, optIn, expiredDaysAgo = 2 }) {
  const ts = Date.now();
  const email = `seize.win+regrant-${tag}-${ts}@gmail.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: `Regrant!e2e${ts}`,
    email_confirm: confirmed,
  });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const uid = created.user.id;

  let ready = false;
  for (let i = 0; i < 10 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
    ready = !!data;
  }
  if (!ready) throw new Error(`profile not created by trigger (${tag})`);

  const expiredAt = new Date(Date.now() - expiredDaysAgo * 24 * 60 * 60 * 1000).toISOString();
  const { error: upError } = await admin
    .from("profiles")
    .update({ credits, expires_at: expiredAt, marketing_opt_in: optIn })
    .eq("id", uid);
  if (upError) throw new Error(`profile setup(${tag}): ${upError.message}`);
  return { uid, email };
}

(async () => {
  const users = [];
  let promoId = null;
  try {
    const { data: promo } = await admin
      .from("promo_codes")
      .select("id, credits, validity_days, is_active, max_uses")
      .eq("code", "re_earlybird")
      .maybeSingle();
    if (!promo) throw new Error("re_earlybird 코드 없음 — 0022 적용 필요");
    promoId = promo.id;
    check("0. 코드 상태: 비활성 + max_uses 무제한 + 30크레딧·7일",
      promo.is_active === false && promo.max_uses === null &&
      promo.credits === 30 && promo.validity_days === 7,
      JSON.stringify(promo));

    // ── 준비: 판정 매트릭스용 4계정 ──
    const A = await makeUser({ tag: "a", confirmed: true, credits: 15, optIn: true });
    const B = await makeUser({ tag: "b", confirmed: true, credits: 15, optIn: false });
    const C = await makeUser({ tag: "c", confirmed: true, credits: 9, optIn: true });
    const D = await makeUser({ tag: "d", confirmed: false, credits: 20, optIn: true });
    const E = await makeUser({ tag: "e", confirmed: true, credits: 15, optIn: true, expiredDaysAgo: 40 });
    users.push(A, B, C, D, E);

    // ── 1~4) dry-run 판정 ──
    let body = await dryRun();
    let rA = findRecipient(body, A.email);
    let rB = findRecipient(body, B.email);
    let rC = findRecipient(body, C.email);
    let rD = findRecipient(body, D.email);
    check("1. 동의자: grant=true, mail=true", rA && rA.grant === true && rA.mail === true, JSON.stringify(rA));
    check("2. 비동의자: grant=true, mail=false (조용한 지급)",
      rB && rB.grant === true && rB.mail === false, JSON.stringify(rB));
    check("3. 9크레딧: 후보 제외 (MIN_LOST=10)", rC === null, JSON.stringify(rC));
    check("4. 미인증: grant=false, skip=unconfirmed",
      rD && rD.grant === false && rD.skip === "unconfirmed", JSON.stringify(rD));
    const rE = findRecipient(body, E.email);
    check("4b. 40일 전 만료: 시간창(30일) 밖 → 후보 제외", rE === null, JSON.stringify(rE));

    // ── 5) system 상환 성공 ──
    const { data: r5, error: e5 } = await admin.rpc("redeem_promo_code", {
      p_user_id: A.uid, p_code: "re_earlybird", p_source: "system",
    });
    check("5. system 상환 성공", !e5 && r5?.success === true && r5?.credits_granted === 30,
      e5?.message ?? JSON.stringify(r5));
    const { data: pA } = await admin
      .from("profiles").select("credits, expires_at").eq("id", A.uid).maybeSingle();
    const days = pA?.expires_at ? (new Date(pA.expires_at) - Date.now()) / 86400000 : -1;
    check("5. 30크레딧 + 만료일 ~7일 뒤", pA?.credits === 30 && days > 6.9 && days < 7.1,
      JSON.stringify({ ...pA, days }));
    const { data: pay } = await admin
      .from("payments").select("credits_added, pg_transaction_id").eq("user_id", A.uid)
      .like("pg_transaction_id", "promo_%");
    check("5. payments promo_ 기록", (pay ?? []).some((x) => x.credits_added === 30),
      JSON.stringify(pay));

    // ── 6) 재상환 차단 ──
    const { data: r6 } = await admin.rpc("redeem_promo_code", {
      p_user_id: A.uid, p_code: "re_earlybird", p_source: "system",
    });
    check("6. 재상환 → already_redeemed", r6?.error === "already_redeemed", JSON.stringify(r6));

    // ── 7) 공개 경로 차단 유지 ──
    const { data: r7 } = await admin.rpc("redeem_promo_code", {
      p_user_id: B.uid, p_code: "re_earlybird", p_source: "mypage",
    });
    check("7. mypage 상환 → inactive_code", r7?.error === "inactive_code", JSON.stringify(r7));

    // ── 8) 엉뚱한 소스 거부 ──
    const { data: r8 } = await admin.rpc("redeem_promo_code", {
      p_user_id: B.uid, p_code: "re_earlybird", p_source: "hack",
    });
    check("8. 'hack' 소스 → invalid_source", r8?.error === "invalid_source", JSON.stringify(r8));

    // ── 9) 지급 후 dry-run: already_granted ──
    // A는 상환으로 만료일이 미래로 옮겨져 후보에서 빠지는 게 정상이지만,
    // 만료를 다시 과거로 되돌리면(재차 만료 시나리오) skip=already_granted 가 떠야 한다.
    await admin.from("profiles")
      .update({ credits: 30, expires_at: new Date(Date.now() - 86400000).toISOString() })
      .eq("id", A.uid);
    body = await dryRun();
    rA = findRecipient(body, A.email);
    check("9. 재차 만료 시 skip=already_granted",
      rA && rA.grant === false && rA.skip === "already_granted", JSON.stringify(rA));
  } catch (err) {
    fail++;
    console.error("  ERROR ", err.message);
  } finally {
    // ── 정리: 테스트 유저 + 상환·지급 흔적 삭제 (cron 실대상 오염 방지) ──
    for (const u of users) {
      try {
        if (promoId) {
          await admin.from("promo_redemptions")
            .delete().eq("promo_code_id", promoId).eq("user_id", u.uid);
        }
        await admin.from("payments").delete().eq("user_id", u.uid);
        await admin.auth.admin.deleteUser(u.uid);
        console.log(`  cleanup ${u.email}`);
      } catch (e) {
        console.warn(`  cleanup 실패 ${u.email}: ${e.message} — 수동 삭제 필요`);
      }
    }
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})();
