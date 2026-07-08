// B8 회원 탈퇴 API e2e 테스트 (로컬 dev 서버 + 실 Supabase 대상, 일회용 계정 생성 후 정리)
// 사용법: node scripts/account_delete_e2e.cjs [--happy] [--base http://localhost:3000]
//   기본: 401/400 + fail-safe(0010 마이그레이션 미적용 시 500 + 아무것도 삭제 안 됨) 검증
//   --happy: 0010 적용 후 전체 흐름(탈퇴 성공 + 보존/삭제 상태) 검증
const fs = require("fs");
const path = require("path");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const baseIdx = process.argv.indexOf("--base");
const BASE_URL = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3000";
const HAPPY = process.argv.includes("--happy");

// .env.local 파싱
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

async function main() {
  const ts = Date.now();
  const email = `account-delete-e2e-${ts}@example.com`;
  const password = `E2e!${ts}#pw`;
  console.log(`테스트 계정: ${email} (모드: ${HAPPY ? "happy" : "fail-safe"}, 서버: ${BASE_URL})`);

  // 1) 계정 생성 (트리거가 profiles 자동 생성)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) throw new Error("계정 생성 실패: " + createErr.message);
  const uid = created.user.id;
  let storagePath = null;

  try {
    const { data: profile } = await admin.from("profiles").select("id, credits").eq("id", uid).maybeSingle();
    check("트리거로 profiles 생성됨", !!profile);

    // 2) 테스트 데이터: payments / conversions / conversion_reports + storage 객체
    const txn = `e2e_account_delete_${ts}`;
    const { error: payErr } = await admin.from("payments").insert({
      user_id: uid, amount: 0, credits_added: 1, pg_transaction_id: txn, status: "completed",
    });
    check("payments 테스트 행 삽입", !payErr, payErr?.message);

    const { error: convErr } = await admin.from("conversions").insert({
      user_id: uid, pdf_name: "e2e-test.pdf", problem_count: 1, credits_used: 1, status: "completed",
    });
    check("conversions 테스트 행 삽입", !convErr, convErr?.message);

    const { data: report, error: repErr } = await admin.from("conversion_reports")
      .insert({ user_id: uid, comment: "e2e test" }).select("id").single();
    check("conversion_reports 테스트 행 삽입", !repErr, repErr?.message);
    storagePath = `${uid}/${report.id}/original.png`;
    // 1x1 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const { error: upErr } = await admin.storage.from("reports").upload(storagePath, png, { contentType: "image/png" });
    check("storage 신고 이미지 업로드", !upErr, upErr?.message);
    await admin.from("conversion_reports").update({ original_image_path: storagePath }).eq("id", report.id);

    // 3) 로그인 → 토큰
    const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
    if (signinErr) throw new Error("로그인 실패: " + signinErr.message);
    const token = signin.session.access_token;

    // 4-A) 무인증 → 401
    let res = await fetch(`${BASE_URL}/api/account/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: email }),
    });
    check("무인증 요청 401", res.status === 401, `status=${res.status}`);

    // 4-B) 이메일 불일치 → 400
    res = await fetch(`${BASE_URL}/api/account/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmEmail: "wrong@example.com" }),
    });
    check("이메일 불일치 400", res.status === 400, `status=${res.status}`);

    // 4-C) 올바른 요청 (대문자로 보내 대소문자 무시도 함께 확인)
    res = await fetch(`${BASE_URL}/api/account/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmEmail: email.toUpperCase() }),
    });
    const body = await res.json().catch(() => ({}));

    const { data: userAfter } = await admin.auth.admin.getUserById(uid);
    const { data: payAfter } = await admin.from("payments").select("*").eq("pg_transaction_id", txn).maybeSingle();

    if (!HAPPY) {
      // 마이그레이션 미적용: 500으로 중단 + 아무것도 삭제되지 않아야 함
      check("fail-safe: 500 반환", res.status === 500, `status=${res.status} body=${JSON.stringify(body)}`);
      check("fail-safe: 계정 미삭제", !!userAfter?.user, JSON.stringify(userAfter));
      check("fail-safe: payments 행 보존", !!payAfter);
    } else {
      check("탈퇴 성공 200", res.status === 200 && body.success === true, `status=${res.status} body=${JSON.stringify(body)}`);
      check("auth 계정 삭제됨", !userAfter?.user);
      check("payments 행 보존(user_id null + email 스냅샷)",
        !!payAfter && payAfter.user_id === null && payAfter.email === email,
        JSON.stringify(payAfter));
      const { data: profAfter } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
      check("profiles 삭제됨(cascade)", !profAfter);
      const { data: convAfter } = await admin.from("conversions").select("id").eq("user_id", uid);
      check("conversions 삭제됨(cascade)", (convAfter ?? []).length === 0);
      const { data: repAfter } = await admin.from("conversion_reports").select("id").eq("user_id", uid);
      check("conversion_reports 삭제됨(cascade)", (repAfter ?? []).length === 0);
      const { data: files } = await admin.storage.from("reports").list(`${uid}/${report.id}`);
      check("storage 신고 이미지 삭제됨", (files ?? []).length === 0, JSON.stringify(files));
    }
  } finally {
    // 정리: 남아있으면 계정 삭제(cascade), storage/payments 잔여물 제거
    const { data: still } = await admin.auth.admin.getUserById(uid).catch(() => ({ data: null }));
    if (still?.user) await admin.auth.admin.deleteUser(uid);
    if (storagePath) await admin.storage.from("reports").remove([storagePath]).catch(() => {});
    // happy 모드에서 보존된 payments 테스트 행도 정리 (실데이터 아님)
    await admin.from("payments").delete().like("pg_transaction_id", `e2e_account_delete_%`);
    console.log("정리 완료");
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("스크립트 오류:", e); process.exit(2); });
