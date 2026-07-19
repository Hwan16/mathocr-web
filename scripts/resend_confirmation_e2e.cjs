// 인증 메일 재발송 e2e — 로컬 dev 서버 + 실 Supabase
// 사용법: node scripts/resend_confirmation_e2e.cjs [--base http://localhost:3000] [--mail 받을주소]
//
// 검증 매트릭스:
//   형식: 이메일 없음/형식 오류 → 400
//   실발송: 미인증 시딩 계정 → 200 + GoTrue confirmation_sent_at 갱신(발송 큐 적재 증거)
//   제한: 같은 이메일 60초 내 재요청 → 429 retry_after
//        +alias 변형(정규화 우회 시도) → 429
//   비노출: 없는 이메일 → 200 (계정 존재 여부 마스킹, 메일 미발송)
// ⚠️ 실 DB 대상 — 시딩 계정은 finally에서 삭제하고 0건 재조회로 정리를 검증한다(72.1 P2-3).
//    --mail 로 실제 수신 가능한 주소를 주면 받은편지함 도착까지 사람이 확인할 수 있다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const baseIdx = process.argv.indexOf("--base");
const BASE_URL = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3000";
const mailIdx = process.argv.indexOf("--mail");

const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 시딩 주소: --mail 미지정 시 수신 불가 고유 주소(발송 자체는 GoTrue 기록으로 검증)
const SEED_EMAIL =
  mailIdx > -1
    ? process.argv[mailIdx + 1]
    : `resend-e2e-${crypto.randomBytes(4).toString("hex")}@e2e-invalid.mathocr.ai.kr`;

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

async function callResend(email) {
  const res = await fetch(`${BASE_URL}/api/auth/resend-confirmation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  let userId = null;
  try {
    console.log(`[resend e2e] base=${BASE_URL} seed=${SEED_EMAIL}`);

    // 0) 형식 검증
    let r = await callResend("");
    check("빈 이메일 400", r.status === 400);
    r = await callResend("notanemail");
    check("형식 오류 400", r.status === 400);

    // 1) 미인증 계정 시딩 (메일 발송 없음 — email_confirm:false)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: SEED_EMAIL,
      password: crypto.randomBytes(12).toString("hex"),
      email_confirm: false,
    });
    if (createErr) throw new Error(`시딩 실패: ${createErr.message}`);
    userId = created.user.id;
    const sentBefore = created.user.confirmation_sent_at ?? null;

    // 2) 재발송 → 200 + confirmation_sent_at 이 갱신되어야 함(발송 큐 적재 증거)
    r = await callResend(SEED_EMAIL);
    check("미인증 계정 재발송 200", r.status === 200, JSON.stringify(r));
    const { data: after, error: afterErr } = await admin.auth.admin.getUserById(userId);
    if (afterErr) throw new Error(`조회 실패: ${afterErr.message}`);
    const sentAfter = after.user.confirmation_sent_at ?? null;
    check(
      "confirmation_sent_at 갱신(실발송 증거)",
      !!sentAfter && sentAfter !== sentBefore,
      `before=${sentBefore} after=${sentAfter}`
    );

    // 3) 60초 내 같은 이메일 재요청 → 429
    r = await callResend(SEED_EMAIL);
    check("60초 내 재요청 429", r.status === 429 && r.data.retry_after > 0, JSON.stringify(r));

    // 4) +alias 변형 우회 → 정규화 키에 걸려 429
    const at = SEED_EMAIL.indexOf("@");
    const alias = `${SEED_EMAIL.slice(0, at)}+bypass${SEED_EMAIL.slice(at)}`;
    r = await callResend(alias);
    check("alias 변형 우회 429", r.status === 429, JSON.stringify(r));

    // 5) 없는 이메일 → 200 마스킹 (계정 존재 여부 비노출)
    r = await callResend(`no-such-${crypto.randomBytes(4).toString("hex")}@e2e-invalid.mathocr.ai.kr`);
    check("없는 이메일 200 마스킹", r.status === 200 && r.data.ok === true, JSON.stringify(r));
  } catch (e) {
    fail += 1;
    console.error("  ERROR", e.message);
  } finally {
    // 정리 + 정리 검증 (72.1 P2-3): 삭제 응답 확인 후 0건 재조회
    if (userId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error(`  CLEANUP FAIL: 사용자 삭제 실패 — 수동 삭제 필요 id=${userId} (${delErr.message})`);
        process.exitCode = 1;
      } else {
        const { data: gone } = await admin.auth.admin.getUserById(userId);
        const { data: profileRow } = await admin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (!gone?.user && !profileRow) {
          console.log("  정리 완료 (계정·프로필 0건 재조회 확인)");
        } else {
          console.error(`  CLEANUP FAIL: 잔존 데이터 — 수동 확인 필요 id=${userId}`);
          process.exitCode = 1;
        }
      }
    }
    console.log(`\n[resend e2e] PASS ${pass} / FAIL ${fail}`);
    if (fail > 0) process.exitCode = 1;
  }
})();
