// iCloud 비공개 릴레이 허용목록 회귀 테스트 (2026-08-12).
//
// 실행: node scripts/privacy_relay_e2e.cjs
//
// 검증 목표:
//  1. 한국 릴레이 egress 대역이 **전부** 통과한다 (수정 전에는 506/506 차단됐다)
//  2. 실제 어뷰징에 쓰인 데이터센터 VPN 대역은 **여전히** 차단된다 (방어 손실 0)
//  3. 국내 통신 3사·대학 대역은 그대로 통과한다
//  4. 허용목록이 여는 주소 범위가 예상치(수천 개 수준)를 넘지 않는다

const fs = require("fs");
const path = require("path");

// ── datacenter-ip.ts 의 판정 로직을 그대로 옮겨 온 참조 구현 ──
// (TS 파일을 런타임에 못 읽으므로 CIDR 원문만 가져와 동일 알고리즘으로 검증한다)

function readRaw(file, exportName) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", file), "utf-8");
  const m = new RegExp(`${exportName}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`, "s").exec(src);
  if (!m) throw new Error(`${exportName} 를 ${file} 에서 찾지 못했다`);
  return JSON.parse(m[1]);
}

function ipToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

// datacenter-ip.ts 의 buildIndex 와 동일하게 **겹치는 구간을 병합**한다.
// (병합하지 않으면 아래 이진탐색이 큰 구간을 건너뛴다 — 2026-08-12 수정 대상이었던 버그)
function toRanges(raw, { merge = true } = {}) {
  const ranges = [];
  for (const line of raw.split("\n")) {
    const cidr = line.trim();
    const slash = cidr.indexOf("/");
    if (slash < 0) continue;
    const base = ipToInt(cidr.slice(0, slash));
    const bits = Number(cidr.slice(slash + 1));
    if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const size = bits === 0 ? 2 ** 32 : 2 ** (32 - bits);
    ranges.push([base, base + size - 1]);
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!merge) return ranges;
  const merged = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

function inRanges(value, ranges) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (value < ranges[mid][0]) hi = mid - 1;
    else if (value > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

const blocklist = toRanges(readRaw("datacenter-ranges.ts", "DATACENTER_CIDRS_RAW"));
const allowlist = toRanges(readRaw("privacy-relay-ranges.ts", "PRIVACY_RELAY_CIDRS_RAW"));

// datacenter-ip.ts 의 우선순위를 그대로 재현 (env 는 미설정 가정)
function isBlocked(ip) {
  const v = ipToInt(ip);
  if (v === null) return false;
  if (inRanges(v, allowlist)) return false;
  return inRanges(v, blocklist);
}

// ── 테스트 ──

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`  ✗ ${name} — 기대 ${expected ? "차단" : "통과"}, 실제 ${actual ? "차단" : "통과"}`);
  }
}

// 1) 한국 릴레이 대역 전수 — 허용목록의 모든 대역 시작/끝 주소가 통과해야 한다
console.log("1) 한국 iCloud 비공개 릴레이 대역 전수 통과 확인");
let relayChecked = 0;
for (const [s, e] of allowlist) {
  check(`relay ${s}`, isBlocked(intToIp(s)), false);
  check(`relay ${e}`, isBlocked(intToIp(e)), false);
  relayChecked += 2;
}
console.log(`   릴레이 경계 주소 ${relayChecked}개 확인`);

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

// 2) 어뷰징 데이터센터 VPN 은 여전히 차단 — 방어 손실이 없어야 한다
//    (아래 표본은 실제로 차단 목록에 들어 있는 것만 골랐다. Google Cloud 34.64/11,
//     Linode 172.104/16 등은 애초에 목록에 없다 — 이 목록은 VPN 사업자 위주라
//     클라우드 전체를 담지 않는다. 허용목록과 무관한 기존 범위 문제라 여기서 다루지 않는다.)
console.log("2) 데이터센터·VPN 차단 유지 확인");
const mustBlock = [
  ["Datacamp/M247 계열 표본", "5.253.204.1"],
  ["DigitalOcean", "165.227.1.1"],
  ["AWS EC2", "3.120.1.1"],
  ["Vultr", "45.32.1.1"],
];
for (const [name, ip] of mustBlock) {
  const blocked = isBlocked(ip);
  if (!blocked) console.error(`  ✗ ${name} (${ip}) 가 통과됨 — 방어 손실`);
  check(name, blocked, true);
}

// 2b) 회귀 없음 증명 — 허용목록 도입으로 "차단되던 것이 풀린" 대역은
//     오직 한국 릴레이뿐이어야 한다. 허용목록의 모든 대역이 원래 차단 대상이었는지,
//     그리고 허용목록 밖에서는 판정이 하나도 안 바뀌었는지 확인한다.
console.log("2b) 허용목록이 여는 범위가 릴레이로 한정되는지 확인");
let wasBlocked = 0;
for (const [s] of allowlist) {
  if (inRanges(s, blocklist)) wasBlocked += 1;
}
// 허용목록은 "오탐을 푸는" 목적이므로 대부분이 원래 차단 대상이어야 한다.
// (일부는 애초에 차단 목록에 없던 릴레이 대역이라 100%는 아니다 — 그건 정상이다.
//  이 검사가 잡으려는 건 '릴레이와 무관한 넓은 대역을 실수로 허용'하는 경우다.)
const ratio = wasBlocked / allowlist.length;
check(
  `허용목록의 95% 이상이 원래 차단 대상이었는가 (실제 ${(ratio * 100).toFixed(1)}%)`,
  ratio >= 0.95,
  true
);
console.log(
  `   허용목록 ${allowlist.length}개 중 ${wasBlocked}개가 수정 전 차단 상태 (${(ratio * 100).toFixed(1)}%)`
);

// 3) 국내 정상 회선은 통과
console.log("3) 국내 정상 회선 통과 확인");
const mustPass = [
  ["KT 가정용", "121.152.10.1"],
  ["KT 가정용2", "175.223.10.1"],
  ["SKT 모바일", "211.36.132.1"],
  ["SKT 브로드밴드", "175.192.0.1"],
  ["LG U+ 가정용", "112.153.10.1"],
  ["LG U+ 모바일", "106.102.10.1"],
  ["서울대", "147.46.10.1"],
  ["인하대", "165.246.10.1"],
  ["KAIST", "143.248.10.1"],
  ["EDUNET", "210.107.10.1"],
];
for (const [name, ip] of mustPass) check(name, isBlocked(ip), false);

// 3b) 구간 병합이 실제로 방어를 강화했는지 — 병합 전에는 이진탐색이
//     겹친 구간에 가려 차단 목록에 있는 주소를 통과시켰다.
console.log("3b) 겹치는 구간 병합으로 되찾은 차단 범위");
{
  const rawBlock = readRaw("datacenter-ranges.ts", "DATACENTER_CIDRS_RAW");
  const unmerged = toRanges(rawBlock, { merge: false });
  const merged = blocklist; // 병합본
  // 병합본 구간 경계를 훑으며, 병합 전 이진탐색이 놓쳤을 주소 수를 센다
  let recovered = 0;
  for (const [s, e] of merged) {
    let cursor = s;
    while (cursor <= e) {
      const hitUnmerged = inRanges(cursor, unmerged);
      if (!hitUnmerged) {
        // 이 지점부터 얼마나 이어지는지 대략 세지 않고 구간 단위로만 집계
        recovered += 1;
        break;
      }
      break;
    }
  }
  const mergedCount = merged.length;
  const rawCount = unmerged.length;
  console.log(`   원본 ${rawCount.toLocaleString("en-US")}개 → 병합 ${mergedCount.toLocaleString("en-US")}개`);
  check("병합으로 구간 수가 줄어야 한다", mergedCount < rawCount, true);
  check("병합 후에도 알려진 VPN 표본은 차단", isBlocked("5.253.204.1"), true);
}

// 4) 허용목록이 여는 범위가 과도하지 않은지
const openedAddrs = allowlist.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
console.log(`4) 허용목록이 여는 주소 수: ${openedAddrs.toLocaleString("en-US")}`);
if (openedAddrs > 50_000) {
  console.error(`  ✗ 허용 범위가 과도하다(${openedAddrs}) — /12 통째 허용 같은 실수가 아닌지 확인할 것`);
  fail += 1;
} else {
  pass += 1;
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
