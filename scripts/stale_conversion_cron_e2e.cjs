// 방치 변환 자동 환불 cron e2e — 로컬 dev 서버 + 실 Supabase
// 사용법: node scripts/stale_conversion_cron_e2e.cjs [--base http://localhost:3000]
//
// 검증 매트릭스:
//   인증: 무토큰/틀린 토큰 → 401
//   환불: 4시간 지난 started 변환 → failed 전환 + refunded_credits + 프로필 크레딧 복구
//   보존: 방금 시작한 started 변환 → 그대로(오탐 없음) / completed 변환 → 그대로
//   멱등: cron 재실행 → 이미 처리된 건 재환불 없음(크레딧 불변)
// ⚠️ 실 DB 대상 — cron은 실제 방치 변환도 함께 환불한다(기능의 목적 그 자체).
//    실행 전 실데이터 방치 건수를 출력하고, 시딩 데이터는 finally에서 전량 삭제 후 0건 재조회.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const baseIdx = process.argv.indexOf("--base");
const BASE_URL = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3000";

const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name} ${detail}`);
  }
}

async function callCron(auth) {
  const res = await fetch(`${BASE_URL}/api/cron/stale-conversions`, {
    headers: auth ? { authorization: auth } : {},
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getCredits(userId) {
  const { data } = await admin.from("profiles").select("credits").eq("id", userId).single();
  return data?.credits;
}

async function getConv(id) {
  const { data } = await admin
    .from("conversions")
    .select("status, refunded_credits")
    .eq("id", id)
    .single();
  return data;
}

(async () => {
  let userId = null;
  try {
    console.log(`[stale cron e2e] base=${BASE_URL}`);

    // 0) 실데이터 현황 (cron이 함께 처리할 실제 방치 건 — 기능의 목적)
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { count: realStale } = await admin
      .from("conversions")
      .select("id", { count: "exact", head: true })
      .eq("status", "started")
      .lt("created_at", cutoff);
    console.log(`  (실데이터 방치 변환: ${realStale ?? 0}건 — cron이 함께 환불함)`);

    // 1) 인증
    let r = await callCron(null);
    check("무토큰 401", r.status === 401);
    r = await callCron("Bearer wrong-secret");
    check("틀린 토큰 401", r.status === 401);

    // 2) 시딩: 테스트 유저(프로필 트리거 기본 5크레딧) + 변환 3종
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `stale-cron-e2e-${crypto.randomBytes(4).toString("hex")}@e2e-invalid.mathocr.ai.kr`,
      password: crypto.randomBytes(12).toString("hex"),
      email_confirm: true,
    });
    if (createErr) throw new Error(`시딩 실패: ${createErr.message}`);
    userId = created.user.id;
    // 프로필 트리거 대기
    for (let i = 0; i < 10; i++) {
      if ((await getCredits(userId)) !== undefined) break;
      await new Promise((res) => setTimeout(res, 300));
    }
    const creditsBefore = await getCredits(userId);

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: seeded, error: seedErr } = await admin
      .from("conversions")
      .insert([
        { user_id: userId, pdf_name: "e2e-stale", problem_count: 3, credits_used: 3, status: "started", created_at: fourHoursAgo },
        { user_id: userId, pdf_name: "e2e-fresh", problem_count: 2, credits_used: 2, status: "started", created_at: new Date().toISOString() },
        { user_id: userId, pdf_name: "e2e-done", problem_count: 1, credits_used: 1, status: "completed", created_at: fourHoursAgo },
      ])
      .select("id, pdf_name");
    if (seedErr) throw new Error(`변환 시딩 실패: ${seedErr.message}`);
    const staleId = seeded.find((s) => s.pdf_name === "e2e-stale").id;
    const freshId = seeded.find((s) => s.pdf_name === "e2e-fresh").id;
    const doneId = seeded.find((s) => s.pdf_name === "e2e-done").id;

    // 3) cron 실행
    r = await callCron(`Bearer ${env.CRON_SECRET}`);
    check("cron 200", r.status === 200, JSON.stringify(r));
    check("환불 1건 이상 보고", (r.data.refunded_conversions ?? 0) >= 1, JSON.stringify(r.data));

    // 4) 결과 검증
    const staleAfter = await getConv(staleId);
    check(
      "방치 변환 → failed + 환불 기록 3",
      staleAfter?.status === "failed" && staleAfter?.refunded_credits === 3,
      JSON.stringify(staleAfter)
    );
    const freshAfter = await getConv(freshId);
    check("진행 중 변환 보존 (오탐 없음)", freshAfter?.status === "started", JSON.stringify(freshAfter));
    const doneAfter = await getConv(doneId);
    check("완료 변환 보존", doneAfter?.status === "completed", JSON.stringify(doneAfter));
    const creditsAfter = await getCredits(userId);
    check(
      `프로필 크레딧 복구 (${creditsBefore}→${creditsBefore + 3})`,
      creditsAfter === creditsBefore + 3,
      `actual=${creditsAfter}`
    );

    // 5) 멱등: 재실행해도 이미 failed인 건은 재환불 없음
    r = await callCron(`Bearer ${env.CRON_SECRET}`);
    const creditsAgain = await getCredits(userId);
    check("재실행 멱등 (크레딧 불변)", creditsAgain === creditsBefore + 3, `actual=${creditsAgain}`);
  } catch (e) {
    fail += 1;
    console.error("  ERROR", e.message);
  } finally {
    if (userId) {
      // 유저 삭제 → conversions는 FK cascade. 삭제 응답 확인 후 0건 재조회 (72.1 P2-3)
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error(`  CLEANUP FAIL: 사용자 삭제 실패 — 수동 삭제 필요 id=${userId} (${delErr.message})`);
        process.exitCode = 1;
      } else {
        const { data: gone } = await admin.auth.admin.getUserById(userId);
        const { count: convLeft } = await admin
          .from("conversions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        if (!gone?.user && !convLeft) {
          console.log("  정리 완료 (계정·변환 0건 재조회 확인)");
        } else {
          console.error(`  CLEANUP FAIL: 잔존 데이터 — 수동 확인 필요 id=${userId}`);
          process.exitCode = 1;
        }
      }
    }
    console.log(`\n[stale cron e2e] PASS ${pass} / FAIL ${fail}`);
    if (fail > 0) process.exitCode = 1;
  }
})();
