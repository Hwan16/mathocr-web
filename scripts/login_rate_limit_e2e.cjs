// 로그인 시도 제한 회귀 테스트 (2026-08-12).
//
// 실행: node scripts/login_rate_limit_e2e.cjs
//
// login-rate-limit.ts 의 키 생성·판정 규칙을 참조 구현으로 재현해 검증한다.
// (Upstash 없이 순수 로직만 — 실제 Redis 동작은 rate-limit.ts 의 기존 경로를 재사용)
//
// 검증 목표:
//  1. 이메일 별칭·지메일 점 변형이 같은 키로 접힌다 (우회 방지)
//  2. IP 키와 이메일 키가 독립적으로 동작한다
//  3. 한도 경계값이 의도대로다 (IP 20회/10분, 이메일 5회/10분)
//  4. 이메일 형식이 깨져도 IP 제한은 살아 있다 (fail-open 이 전면 해제가 아님)

const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "src", "lib", "login-rate-limit.ts"),
  "utf-8"
);

// 상수를 소스에서 직접 읽어, 코드가 바뀌면 테스트도 따라가게 한다
function constOf(name) {
  const m = new RegExp(`const ${name}\\s*=\\s*([0-9*\\s]+);`).exec(src);
  if (!m) throw new Error(`${name} 을 찾지 못했다`);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}
const IP_LIMIT = constOf("IP_LIMIT");
const IP_WINDOW_MS = constOf("IP_WINDOW_MS");
const PAIR_LIMIT = constOf("PAIR_LIMIT");
const PAIR_WINDOW_MS = constOf("PAIR_WINDOW_MS");

// normalizeEmailAlias 참조 구현 (email.ts 와 동일 규칙)
const DOT_INSENSITIVE = new Set(["gmail.com", "googlemail.com"]);
function normalizeEmailAlias(email) {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE.has(domain)) local = local.split(".").join("");
  if (!local) return null;
  return `${local}@${domain}`;
}

function keys(ip, email) {
  const normalized = typeof email === "string" ? normalizeEmailAlias(email) : null;
  const ipPart = ip ?? "unknown";
  return {
    ipKey: `login:ip:${ipPart}`,
    pairKey: normalized ? `login:pair:${ipPart}:${normalized}` : null,
  };
}

// ── 메모리 카운터로 peek/bump 시뮬레이션 ──
const counters = new Map();
function peek(key, limit) {
  return (counters.get(key) ?? 0) < limit;
}
function bump(key) {
  counters.set(key, (counters.get(key) ?? 0) + 1);
}
function attempt(ip, email, { success }) {
  const { ipKey, pairKey } = keys(ip, email);
  if (!peek(ipKey, IP_LIMIT)) return "blocked-ip";
  if (pairKey && !peek(pairKey, PAIR_LIMIT)) return "blocked-pair";
  if (success) return "ok";
  bump(ipKey);
  if (pairKey) bump(pairKey);
  return "fail";
}

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`  ✗ ${name} — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);
  }
}

console.log(`설정: IP ${IP_LIMIT}회/${IP_WINDOW_MS / 60000}분, (이메일+IP) ${PAIR_LIMIT}회/${PAIR_WINDOW_MS / 60000}분`);

// 1) 별칭·점 변형이 같은 키로 접힌다
console.log("1) 이메일 변형 정규화");
const k = (e) => keys("1.1.1.1", e).pairKey;
check("plus 별칭", k("a+1@gmail.com"), k("a@gmail.com"));
check("지메일 점", k("a.b@gmail.com"), k("ab@gmail.com"));
check("googlemail", k("a@googlemail.com"), k("a@gmail.com"));
check("대소문자", k("A@Gmail.COM"), k("a@gmail.com"));
check("회사메일 점은 보존", k("a.b@hanwha.com") !== k("ab@hanwha.com"), true);

// 2) (이메일+IP) 한도 — 같은 출처의 집중 추측은 5회로 묶인다
console.log("2) (이메일+IP) 한도");
counters.clear();
for (let i = 0; i < PAIR_LIMIT; i += 1) {
  check(`victim 실패 ${i + 1}`, attempt("1.1.1.1", "victim@gmail.com", { success: false }), "fail");
}
check("victim 6번째 차단", attempt("1.1.1.1", "victim@gmail.com", { success: false }), "blocked-pair");
check("같은 IP 별칭 우회도 차단", attempt("1.1.1.1", "vic.tim+x@gmail.com", { success: false }), "blocked-pair");
check("같은 IP 다른 이메일은 통과", attempt("1.1.1.1", "other@naver.com", { success: false }), "fail");

// 2b) ⚠️ 계정 잠금 공격 불가 — 이 설계의 핵심 안전 속성
//     이메일 단독으로 셌다면 공격자가 피해자 이메일만 알고 5회 실패시켜
//     피해자를 무기한 잠글 수 있었다. (이메일+IP)라 공격자 IP만 소진된다.
console.log("2b) 계정 잠금 공격 불가 확인");
counters.clear();
// 공격자가 피해자 이메일로 자기 IP에서 한도를 다 태운다
for (let i = 0; i < PAIR_LIMIT; i += 1) {
  attempt("6.6.6.6", "victim@gmail.com", { success: false });
}
check("공격자 IP는 차단됨", attempt("6.6.6.6", "victim@gmail.com", { success: false }), "blocked-pair");
// 피해자는 자기 IP에서 정상 로그인 가능해야 한다
check("피해자는 정상 로그인 가능", attempt("1.2.3.4", "victim@gmail.com", { success: true }), "ok");
check("피해자 오타 1회도 정상 처리", attempt("1.2.3.4", "victim@gmail.com", { success: false }), "fail");

// 3) IP 한도 — 이메일을 바꿔가며 시도해도 IP 한도에서 막힌다
console.log("3) IP별 한도 (이메일 로테이션 방어)");
counters.clear();
let blockedAt = null;
for (let i = 0; i < IP_LIMIT + 5; i += 1) {
  const r = attempt("9.9.9.9", `user${i}@naver.com`, { success: false });
  if (r === "blocked-ip" && blockedAt === null) blockedAt = i;
}
check("IP 한도에서 차단 시작", blockedAt, IP_LIMIT);
check("다른 IP는 영향 없음", attempt("8.8.8.8", "user0@naver.com", { success: false }), "fail");

// 4) 성공은 카운트하지 않는다 (공유 IP 뒤 정상 사용자 보호)
console.log("4) 성공은 카운트 제외");
counters.clear();
for (let i = 0; i < 50; i += 1) {
  attempt("7.7.7.7", `teacher${i}@academy.co.kr`, { success: true });
}
check("성공 50회 후에도 통과", attempt("7.7.7.7", "teacher0@academy.co.kr", { success: true }), "ok");

// 5) 이메일 형식이 깨져도 IP 제한은 유효
console.log("5) 잘못된 이메일 — IP 제한 유지");
counters.clear();
check("pairKey 없음", keys("2.2.2.2", "broken").pairKey, null);
let ipBlocked = null;
for (let i = 0; i < IP_LIMIT + 2; i += 1) {
  const r = attempt("2.2.2.2", "broken", { success: false });
  if (r === "blocked-ip" && ipBlocked === null) ipBlocked = i;
}
check("형식 깨져도 IP 한도 작동", ipBlocked, IP_LIMIT);

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
console.log(
  "\n⚠️ 한계: 이 테스트는 login-rate-limit.ts 의 **규칙을 재현한 사본**을 검증한다.\n" +
    "   peekRateLimit/bumpRateLimit 본체와 Upstash 연동은 여기서 실행되지 않으므로,\n" +
    "   PASS 가 실제 동작 보증은 아니다. 실서버에서 '한도+1회 실패 → 429' 를 한 번 확인할 것."
);
process.exit(fail === 0 ? 0 : 1);
