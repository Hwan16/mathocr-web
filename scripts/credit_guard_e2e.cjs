// 크레딧 가드(정확 잔액) e2e 테스트 — Phase 46.1 (실 프로덕션 API 대상)
// 사용법: node scripts/credit_guard_e2e.cjs [BASE_URL]  (기본 https://mathocr.ai.kr)
//
// 검증 시나리오:
//   선차감으로 잔액이 정확히 0이 된 정상 변환은 OCR 프록시를 통과해야 하고(46.1 수정),
//   진행 중 변환이 없는 잔액 0 계정의 직접 호출은 여전히 402로 차단되어야 한다.
//
// OCR 프록시 프로브는 본문 {}를 보낸다 — 가드를 통과하면 400(src 검증 오류),
// 가드에 막히면 402. 실제 Mathpix 호출이 없어 비용이 들지 않는다.
//
// 일회용 계정을 만들고 마지막에 삭제한다.
const fs = require("fs");
const path = require("path");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const BASE_URL = process.argv[2] || "https://mathocr.ai.kr";

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

async function ocrProbe(token) {
  const res = await fetch(`${BASE_URL}/api/ocr/mathpix`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}",
  });
  return res.status;
}

async function main() {
  console.log(`대상: ${BASE_URL}`);
  const ts = Date.now();
  const email = `credit-guard-e2e-${ts}@example.com`;
  const password = `E2e!${ts}#pw`;
  console.log(`테스트 계정: ${email}`);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) throw new Error("계정 생성 실패: " + createErr.message);
  const uid = created.user.id;

  try {
    // profiles 트리거 대기 (가입 5크레딧)
    let profile = null;
    for (let i = 0; i < 10 && !profile; i++) {
      const { data } = await admin.from("profiles").select("credits").eq("id", uid).maybeSingle();
      profile = data;
      if (!profile) await new Promise((r) => setTimeout(r, 300));
    }
    if (!profile) throw new Error("profiles 트리거 생성 실패");
    check("가입 초기 5크레딧", profile.credits === 5, `credits=${profile.credits}`);

    // 로그인 토큰 (데스크톱 앱과 동일한 Bearer 경로)
    const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
    if (signinErr) throw new Error("로그인 실패: " + signinErr.message);
    const token = signin.session.access_token;

    // 1) 잔액과 정확히 같은 5문제 차감 → 잔액 0 + started 변환
    const dres = await fetch(`${BASE_URL}/api/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ problem_count: 5, pdf_name: "credit_guard_e2e.pdf" }),
    });
    const djson = await dres.json().catch(() => ({}));
    check("정확 잔액(5/5) 차감 성공", dres.status === 200 && djson.remaining_credits === 0,
      `status=${dres.status} remaining=${djson.remaining_credits}`);
    const conversionId = djson.conversion_id;

    // 2) 핵심: 잔액 0 + 진행 중 변환 → OCR 프록시가 402가 아니라 400(본문 검증)까지 통과
    const s1 = await ocrProbe(token);
    check("잔액 0 + started 변환 → OCR 게이트 통과 (400)", s1 === 400, `status=${s1} (구버전이면 402)`);

    // 3) 변환 실패 보고 → 자동 환불 5
    const fres = await fetch(`${BASE_URL}/api/conversions/${conversionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "failed" }),
    });
    const fjson = await fres.json().catch(() => ({}));
    check("실패 보고 → 5크레딧 자동 환불", fres.status === 200 && fjson.refunded === 5,
      `status=${fres.status} refunded=${fjson.refunded}`);

    // 4) 가드 본래 목적 유지: 잔액 0 + 진행 중 변환 없음 → 402
    await admin.from("profiles").update({ credits: 0 }).eq("id", uid);
    const s2 = await ocrProbe(token);
    check("잔액 0 + 변환 없음 → OCR 차단 (402)", s2 === 402, `status=${s2}`);

    // 5) 60분 창 검증: 2시간 전 started 변환만 있으면 여전히 402
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { error: insErr } = await admin.from("conversions").insert({
      user_id: uid, pdf_name: "stale.pdf", problem_count: 1, credits_used: 1,
      status: "started", created_at: old,
    });
    if (insErr) throw new Error("stale 변환 삽입 실패: " + insErr.message);
    const s3 = await ocrProbe(token);
    check("오래된(2h) started 변환 → 여전히 402 (60분 창)", s3 === 402, `status=${s3}`);
  } finally {
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    console.log(delErr ? `정리 실패(수동 삭제 필요): ${uid} — ${delErr.message}` : "테스트 계정 삭제 완료");
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("중단:", e.message); process.exit(1); });
