// 데이터센터·VPN IP 가입 차단 — 2026-08-08 어뷰징 사고 3차 방어.
//
// 배경: 이메일 차단(일회용 도메인 → 별칭)은 두더지 잡기였다. 상대가 도메인을
//   하나 사서 캐치올로 돌리면 그 방어들이 전부 무력해진다. 반면 **접속 경로**는
//   바꾸기 어렵다 — "IP당 5회" 제한을 피하려면 IP를 계속 갈아타야 하고,
//   그러려면 데이터센터 VPN이 필요하기 때문이다.
//
// 실측 근거 (2026-08-08, 회원 전수):
//   정상 고객 28명의 가입 IP → 전부 한국 가정용·모바일 회선 (KT·SKT·LG)
//   어뷰징 57계정의 가입 IP → 전부 해외 데이터센터 VPN (Datacamp·M247 등)
//   두 집합의 IP 대역 겹침 0건. 이 목록 적용 시 공격 IP 32개 중 30개 적중,
//   실고객 오탐 0건(유일한 매칭은 이메일 인증도 안 한 유령 계정 1개).
//
// 한계를 분명히 해 둔다: 가정용 프록시(residential proxy)를 돈 주고 쓰면 뚫린다.
//   목표는 완전 차단이 아니라 **채산성 붕괴**다 — 데이터센터 VPN은 사실상 무료지만
//   가정용 프록시는 IP당 과금이라 계정 수십 개를 찍는 경제성이 사라진다.

import { DATACENTER_CIDRS_RAW } from "./datacenter-ranges";

/** 점4개 IPv4만 정수로. 형식이 아니면 null (IPv6·빈값·변형은 판정하지 않는다). */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
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

function cidrToRange(cidr: string): [number, number] | null {
  const slash = cidr.indexOf("/");
  if (slash < 0) return null;
  const base = ipv4ToInt(cidr.slice(0, slash));
  const bits = Number(cidr.slice(slash + 1));
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const size = bits === 0 ? 2 ** 32 : 2 ** (32 - bits);
  return [base, base + size - 1];
}

// 모듈 로드 시 1회만 파싱한다. 약 4.9만 개 대역을 정렬된 TypedArray 두 개로 두고
// 이진 탐색하므로 판정은 O(log n) — 가입 요청에 붙는 비용이 사실상 없다.
const BUILT_IN = (() => {
  const ranges: [number, number][] = [];
  for (const line of DATACENTER_CIDRS_RAW.split("\n")) {
    const r = cidrToRange(line);
    if (r) ranges.push(r);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const starts = new Uint32Array(ranges.length);
  const ends = new Uint32Array(ranges.length);
  ranges.forEach(([s, e], i) => {
    starts[i] = s;
    ends[i] = e;
  });
  return { starts, ends };
})();

function inSortedRanges(
  value: number,
  starts: Uint32Array,
  ends: Uint32Array
): boolean {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (value < starts[mid]) hi = mid - 1;
    else if (value > ends[mid]) lo = mid + 1;
    else return true;
  }
  return false;
}

function envRanges(name: string): [number, number][] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => cidrToRange(s.trim()))
    .filter((r): r is [number, number] => r !== null);
}

/**
 * 데이터센터·VPN IP인지 판정.
 * 우선순위: 기능 OFF > ALLOWED_IP_CIDRS(해제) > BLOCKED_IP_CIDRS(추가) > 내장 목록
 * 판정 불가(IP 없음·IPv6·형식 오류)는 false — 정상 사용자를 막지 않는다(fail-open).
 */
export function isDatacenterIp(ip: string | null): boolean {
  if (process.env.DISABLE_DATACENTER_IP_BLOCK === "true") return false;
  if (!ip) return false;
  const value = ipv4ToInt(ip);
  if (value === null) return false;

  for (const [s, e] of envRanges("ALLOWED_IP_CIDRS")) {
    if (value >= s && value <= e) return false;
  }
  for (const [s, e] of envRanges("BLOCKED_IP_CIDRS")) {
    if (value >= s && value <= e) return true;
  }
  return inSortedRanges(value, BUILT_IN.starts, BUILT_IN.ends);
}

/** 내장 대역 수 — 배포 후 목록이 실제로 실렸는지 확인용 */
export function datacenterRangeCount(): number {
  return BUILT_IN.starts.length;
}
