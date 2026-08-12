// 만료 임박 안내 cron 의 발송 판정 로직 검증 (2026-08-12, 0024 대응).
// 실행: node scripts/expiry_reminder_logic_test.cjs
//
// route.ts 의 alreadyReminded() 와 0024 백필이 맞물려 동작하는지 확인한다.
// 특히 "마이그레이션 직후 중복 발송" 사고를 막는지가 핵심.

const DAY = 24 * 60 * 60 * 1000;
const REMIND_BEFORE_DAYS = 7;

// route.ts 의 alreadyReminded 와 동일 규칙
function alreadyReminded(expiresAt, sentAt, usingMarker = true) {
  if (!usingMarker || !sentAt || !expiresAt) return false;
  const windowOpensAt = Date.parse(expiresAt) - REMIND_BEFORE_DAYS * DAY;
  return Date.parse(sentAt) >= windowOpensAt;
}

// 0024 백필 규칙과 동일
function backfill(expiresAt, now) {
  if (Date.parse(expiresAt) < now + 6 * DAY) {
    return new Date(Date.parse(expiresAt) - 7 * DAY).toISOString();
  }
  return null;
}

// cron 조회 창 (마커 경로): now <= expires_at < now + 7d
function inWindow(expiresAt, now) {
  const t = Date.parse(expiresAt);
  return t >= now && t < now + REMIND_BEFORE_DAYS * DAY;
}

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (actual === expected) pass += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${name} — 기대 ${expected}, 실제 ${actual}`);
  }
}

const NOW = Date.parse("2026-08-12T00:00:00Z");
const at = (days) => new Date(NOW + days * DAY).toISOString();

console.log("1) 마이그레이션 직후 — 중복 발송이 없어야 한다");
// 만료 3일 전인 사람: 옛 시스템에서 이미 받았음 → 백필로 발송완료 표시 → 재발송 안 됨
{
  const exp = at(3);
  const sent = backfill(exp, NOW);
  check("만료 3일 전 — 백필됨", sent !== null, true);
  check("만료 3일 전 — 창에 걸림", inWindow(exp, NOW), true);
  check("만료 3일 전 — 재발송 안 함", alreadyReminded(exp, sent), true);
}
// 만료 1일 전도 마찬가지
{
  const exp = at(1);
  const sent = backfill(exp, NOW);
  check("만료 1일 전 — 재발송 안 함", alreadyReminded(exp, sent), true);
}

console.log("2) 오늘의 정상 대상(만료 6~7일 전)은 그대로 발송되어야 한다");
{
  const exp = at(6.5);
  const sent = backfill(exp, NOW);
  check("만료 6.5일 전 — 백필 대상 아님", sent, null);
  check("만료 6.5일 전 — 창에 걸림", inWindow(exp, NOW), true);
  check("만료 6.5일 전 — 발송함", alreadyReminded(exp, sent), false);
}

console.log("3) 발송 실패 후 다음 실행에서 재시도되어야 한다 (기존엔 영구 유실)");
{
  const exp = at(6.5);
  // 어제 창에 걸렸지만 발송 실패 → 마커 없음 → 오늘 다시 대상
  check("마커 없으면 재시도", alreadyReminded(exp, null), false);
  // 하루 지나 만료 5.5일 전이 되어도 넓은 창 안이라 여전히 대상
  const expTomorrow = at(5.5);
  check("다음날에도 창 안", inWindow(expTomorrow, NOW), true);
  check("다음날에도 발송 대상", alreadyReminded(expTomorrow, null), false);
}

console.log("4) 재충전으로 만료일이 밀리면 새 만료일에 다시 안내해야 한다");
{
  const oldExp = at(3);
  const sentAt = backfill(oldExp, NOW); // 옛 만료 기준 발송 기록
  // 30일 플랜 충전 → 만료일이 33일 뒤로
  const newExp = at(33);
  check("새 만료일 기준 재안내 대상", alreadyReminded(newExp, sentAt), false);
  // 단, 새 만료의 창에 아직 안 들어왔으므로 지금은 조회되지 않는다
  check("아직 창 밖 (26일 남음)", inWindow(newExp, NOW), false);
  // 새 만료 7일 전이 되면 창에 들어오고, 발송 대상이 된다
  const laterNow = Date.parse(newExp) - 6.5 * DAY;
  check("새 만료 6.5일 전 — 창 안", inWindow(newExp, laterNow), true);
  check("새 만료 6.5일 전 — 발송함", alreadyReminded(newExp, sentAt), false);
}

console.log("5) 같은 만료일로 두 번 보내지 않는다");
{
  const exp = at(6.5);
  const sentNow = new Date(NOW).toISOString();
  check("방금 보냈으면 재발송 안 함", alreadyReminded(exp, sentNow), true);
}

console.log("6) 0024 미적용(usingMarker=false)이면 기존 동작 그대로");
{
  const exp = at(3);
  check("마커 무시", alreadyReminded(exp, new Date(NOW).toISOString(), false), false);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
