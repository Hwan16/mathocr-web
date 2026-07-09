// 0011 프로모션 코드 유효기간(validity_days) e2e 테스트 (실 Supabase RPC 대상)
// 사용법: node scripts/promo_validity_e2e.cjs
//   일회용 계정·코드 생성 → 유효기간 코드 상환(만료일 연장) → 무기간 코드 상환(만료일 유지)
//   → 계정당 1회 규칙 → payments 기록 확인 → 정리(계정 삭제, 코드 비활성화)
// 전제: Supabase SQL Editor 에서 0011_promo_validity.sql 적용 완료
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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const daysFromNow = (iso) => (new Date(iso) - Date.now()) / 86400000;

async function main() {
  const ts = Date.now();
  const email = `promo-validity-e2e-${ts}@example.com`;
  console.log(`테스트 계정: ${email}`);

  // 0) 컬럼 존재 확인 (0011 적용 여부)
  const { error: colErr } = await admin.from("promo_codes").select("validity_days").limit(1);
  if (colErr) throw new Error("0011 미적용으로 보임 (validity_days 조회 실패): " + colErr.message);
  check("promo_codes.validity_days 컬럼 존재", true);

  // 1) 일회용 계정 (트리거: 5크레딧 + 만료 7일)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: `E2e!${ts}#pw`, email_confirm: true,
  });
  if (createErr) throw new Error("계정 생성 실패: " + createErr.message);
  const uid = created.user.id;
  const codeIds = [];

  try {
    // profiles 트리거 대기
    let profile = null;
    for (let i = 0; i < 10 && !profile; i++) {
      const { data } = await admin.from("profiles").select("credits, expires_at").eq("id", uid).maybeSingle();
      profile = data;
      if (!profile) await new Promise((r) => setTimeout(r, 300));
    }
    if (!profile) throw new Error("profiles 트리거 생성 실패");
    check("가입 초기 상태 (5크레딧·만료 ~7일)", profile.credits === 5 && Math.abs(daysFromNow(profile.expires_at) - 7) < 0.5,
      `credits=${profile.credits}, expiry=${daysFromNow(profile.expires_at).toFixed(1)}일`);

    // 2) 유효기간 30일 코드 생성 → 상환
    const codeA = `e2e-validity-${ts}`;
    const { data: rowA, error: insAErr } = await admin.from("promo_codes")
      .insert({ code: codeA, credits: 77, max_uses: 1, validity_days: 30, memo: "e2e 유효기간 테스트 (자동 비활성화됨)" })
      .select("id").single();
    if (insAErr) throw new Error("코드 A 생성 실패: " + insAErr.message);
    codeIds.push(rowA.id);

    const { data: redeemA, error: rpcAErr } = await admin.rpc("redeem_promo_code", {
      p_user_id: uid, p_code: codeA, p_source: "mypage",
    });
    check("유효기간 코드 상환 성공", !rpcAErr && redeemA?.success === true, rpcAErr?.message ?? JSON.stringify(redeemA));
    check("크레딧 지급 (5+77=82)", redeemA?.new_credits === 82, `new_credits=${redeemA?.new_credits}`);
    check("만료일 ~30일로 연장", redeemA?.expires_at && Math.abs(daysFromNow(redeemA.expires_at) - 30) < 0.5,
      `expiry=${redeemA?.expires_at ? daysFromNow(redeemA.expires_at).toFixed(1) : "null"}일`);

    // 3) 같은 코드 재상환 → already_redeemed
    const { data: redeemA2 } = await admin.rpc("redeem_promo_code", {
      p_user_id: uid, p_code: codeA, p_source: "mypage",
    });
    check("계정당 1회 규칙 (already_redeemed)", redeemA2?.success === false && redeemA2?.error === "already_redeemed",
      JSON.stringify(redeemA2));

    // 4) 유효기간 없는 코드 → 크레딧만 지급, 만료일 유지
    const codeB = `e2e-novalidity-${ts}`;
    const { data: rowB, error: insBErr } = await admin.from("promo_codes")
      .insert({ code: codeB, credits: 11, max_uses: 1, memo: "e2e 무기간 테스트 (자동 비활성화됨)" })
      .select("id").single();
    if (insBErr) throw new Error("코드 B 생성 실패: " + insBErr.message);
    codeIds.push(rowB.id);

    const { data: redeemB } = await admin.rpc("redeem_promo_code", {
      p_user_id: uid, p_code: codeB, p_source: "signup",
    });
    check("무기간 코드 상환 성공 (signup 경로)", redeemB?.success === true, JSON.stringify(redeemB));
    check("크레딧 누적 (82+11=93)", redeemB?.new_credits === 93, `new_credits=${redeemB?.new_credits}`);
    check("만료일 유지 (~30일 그대로)", redeemB?.expires_at && Math.abs(daysFromNow(redeemB.expires_at) - 30) < 0.5,
      `expiry=${redeemB?.expires_at ? daysFromNow(redeemB.expires_at).toFixed(1) : "null"}일`);

    // 5) 만료일이 이미 긴 상태(~30일)에서 더 짧은 유효기간(5일) 코드 → 만료일 축소되면 안 됨
    //    (실사용 시나리오: 결제로 60일 확보 후 무료 코드 적용 — 만료일은 절대 줄지 않아야 함)
    const codeC = `e2e-shorter-${ts}`;
    const { data: rowC, error: insCErr } = await admin.from("promo_codes")
      .insert({ code: codeC, credits: 13, max_uses: 1, validity_days: 5, memo: "e2e 축소 방지 테스트 (자동 비활성화됨)" })
      .select("id").single();
    if (insCErr) throw new Error("코드 C 생성 실패: " + insCErr.message);
    codeIds.push(rowC.id);

    const { data: redeemC } = await admin.rpc("redeem_promo_code", {
      p_user_id: uid, p_code: codeC, p_source: "mypage",
    });
    check("짧은 유효기간 코드 상환 성공", redeemC?.success === true, JSON.stringify(redeemC));
    check("만료일 축소 없음 (5일 코드에도 ~30일 유지)", redeemC?.expires_at && Math.abs(daysFromNow(redeemC.expires_at) - 30) < 0.5,
      `expiry=${redeemC?.expires_at ? daysFromNow(redeemC.expires_at).toFixed(1) : "null"}일`);

    // 6) payments 이력 3건
    const { data: pays } = await admin.from("payments")
      .select("credits_added").eq("user_id", uid).like("pg_transaction_id", "promo_%");
    check("payments 프로모션 기록 3건", (pays ?? []).length === 3 &&
      pays.map((p) => p.credits_added).sort((a, b) => a - b).join(",") === "11,13,77",
      JSON.stringify(pays));
  } finally {
    // 정리: 계정 삭제(redemptions.user_id → null) + 코드 비활성화(이력 있어 삭제 불가)
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    for (const id of codeIds) {
      await admin.from("promo_codes").update({ is_active: false }).eq("id", id);
    }
    console.log("정리 완료: 계정 삭제, 테스트 코드 비활성화 (payments 잔여는 탈퇴 보존 정책과 동일)");
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("E2E 실행 오류:", e.message); process.exit(1); });
