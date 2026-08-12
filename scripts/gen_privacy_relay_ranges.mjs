// iCloud 비공개 릴레이(Private Relay) egress 대역 허용목록 생성기.
//
// 실행: node scripts/gen_privacy_relay_ranges.mjs
// 출력: src/lib/privacy-relay-ranges.ts
//
// 왜 필요한가 (2026-08-12):
//   데이터센터 차단 목록(datacenter-ranges.ts)의 출처인 X4BNet/lists_vpn 은
//   172.224.0.0/12(Akamai 등록 대역)을 통째로 담고 있다. 그런데 이 대역은
//   Akamai가 **Apple iCloud 비공개 릴레이의 egress 파트너**로 쓰는 곳이기도 하다.
//   실측 결과 한국 릴레이 IPv4 대역 506개 중 506개(100%)가 차단되고 있었다 —
//   iCloud+ 구독자가 아이폰·맥 사파리로 가입하면 예외 없이 막혔다는 뜻이다.
//
// 왜 국가를 한국으로 좁히는가:
//   릴레이 전체(41,941개 IPv4 대역)를 허용하면 해외 릴레이 경로까지 열린다.
//   2026-08-08 어뷰징은 전원 해외 데이터센터 VPN이었으므로 해외 경로는 조이는
//   편이 맞다. 한국만 허용하면 열리는 주소가 1,232개뿐이라 방어 손실이 사실상 0이고,
//   실제 고객(국내 강사)의 오탐은 완전히 사라진다.
//   해외 체류 고객 문의가 생기면 아래 COUNTRIES 에 국가 코드를 추가해 재생성한다.
//
// 비공개 릴레이가 어뷰징 도구가 아닌 이유(허용해도 되는 근거):
//   유료 iCloud+ 구독 + Apple ID 결속이 필요하고, 사파리 트래픽에만 적용되며
//   (curl·스크립트로는 못 씀), egress IP는 Apple이 세션 단위로 회전시킨다.
//   무료 데이터센터 VPN처럼 계정 수십 개를 찍는 용도로 쓸 수 없다.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE = "https://mask-api.icloud.com/egress-ip-ranges.csv";
const COUNTRIES = new Set(["KR"]);

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "lib", "privacy-relay-ranges.ts");

// ── CIDR 유틸 (IPv4 전용) ──

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

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function parseCidr(cidr) {
  const slash = cidr.indexOf("/");
  if (slash < 0) return null;
  const base = ipToInt(cidr.slice(0, slash));
  const bits = Number(cidr.slice(slash + 1));
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const size = bits === 0 ? 2 ** 32 : 2 ** (32 - bits);
  return [base, base + size - 1];
}

// 인접·중첩 구간을 합친 뒤 최소 개수의 CIDR로 되돌린다.
function mergeToCidrs(ranges) {
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  const out = [];
  for (let [s, e] of merged) {
    while (s <= e) {
      // 시작 정렬이 허용하는 최대 블록과 남은 길이 중 작은 쪽
      let maxBits = 32;
      while (maxBits > 0) {
        const size = 2 ** (32 - (maxBits - 1));
        if (s % size !== 0 || s + size - 1 > e) break;
        maxBits -= 1;
      }
      out.push(`${intToIp(s)}/${maxBits}`);
      s += 2 ** (32 - maxBits);
      if (s === 0) break; // 32비트 래핑 방어
    }
  }
  return out;
}

// ── 생성 ──

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`egress 목록 내려받기 실패: HTTP ${res.status}`);
  process.exit(1);
}
const csv = await res.text();

const ranges = [];
let totalV4 = 0;
for (const line of csv.split("\n")) {
  const row = line.split(",");
  const cidr = row[0]?.trim();
  const cc = row[1]?.trim();
  if (!cidr || cidr.includes(":")) continue; // 빈 줄·IPv6 제외
  totalV4 += 1;
  if (!COUNTRIES.has(cc)) continue;
  const r = parseCidr(cidr);
  if (r) ranges.push(r);
}

if (ranges.length === 0) {
  console.error("대상 국가 대역이 0개 — 출처 형식이 바뀌었는지 확인 필요. 파일을 덮어쓰지 않는다.");
  process.exit(1);
}

const cidrs = mergeToCidrs(ranges);
const addrCount = cidrs.reduce((sum, c) => sum + 2 ** (32 - Number(c.split("/")[1])), 0);
const today = new Date().toISOString().slice(0, 10);
const countryList = [...COUNTRIES].join(", ");

const body = `// 자동 생성 파일 — 직접 편집하지 말 것. (scripts/gen_privacy_relay_ranges.mjs)
//
// Apple iCloud 비공개 릴레이(Private Relay)의 egress IP 대역 — **허용목록**.
// 데이터센터 차단 목록보다 우선 적용해 정상 고객 오탐을 막는다.
//
// 출처: ${SOURCE} (${today} 기준)
// 대상 국가: ${countryList}
// 병합 후 ${cidrs.length}개 대역 / 주소 ${addrCount.toLocaleString("en-US")}개
//
// 배경: 차단 목록 출처(X4BNet/lists_vpn)가 172.224.0.0/12(Akamai 등록)을 통째로
// 담고 있는데, 이 대역이 iCloud 비공개 릴레이 egress 로도 쓰인다. 이 허용목록이
// 없으면 한국 iCloud+ 사용자가 사파리로 가입할 때 100% 차단된다(2026-08-12 실측).
//
// 갱신: node scripts/gen_privacy_relay_ranges.mjs

export const PRIVACY_RELAY_CIDRS_RAW = ${JSON.stringify(cidrs.join("\n"))};
`;

writeFileSync(OUT, body, "utf-8");
console.log(`IPv4 대역 ${totalV4.toLocaleString("en-US")}개 중 ${countryList} ${ranges.length}개 → 병합 ${cidrs.length}개`);
console.log(`허용되는 주소 수: ${addrCount.toLocaleString("en-US")}`);
console.log(`저장: ${OUT}`);
