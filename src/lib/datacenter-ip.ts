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
import { PRIVACY_RELAY_CIDRS_RAW } from "./privacy-relay-ranges";

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
function buildIndex(raw: string) {
  const ranges: [number, number][] = [];
  for (const line of raw.split("\n")) {
    const r = cidrToRange(line);
    if (r) ranges.push(r);
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // ⚠️ 겹치는 구간을 반드시 병합한다 (2026-08-12 수정).
  //
  // 아래 이진탐색은 "시작값 오름차순 + 서로 겹치지 않음"을 전제한다. 목록에
  // 포함 관계가 있으면(예: 5.183.0.0/16 과 그 안의 5.183.102.0/24) 큰 구간이
  // 작은 구간에 가려져 **영영 방문되지 않는다** — mid 가 작은 구간에 떨어지면
  // value > ends[mid] 로 판단해 오른쪽으로만 가기 때문이다.
  //
  // 실측(2026-08-12): 원본 48,936개 중 1,103개가 앞 구간과 겹쳐 있었고,
  // 그 결과 **차단 목록에 있는데도 통과하던 주소가 1,213,488개**였다.
  // 병합하면 29,799개로 줄면서 판정이 정확해지고 탐색도 빨라진다.
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    // 인접(+1)도 합친다 — 판정 결과는 같고 구간 수만 줄어든다.
    if (last && s <= last[1] + 1) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }

  const starts = new Uint32Array(merged.length);
  const ends = new Uint32Array(merged.length);
  merged.forEach(([s, e], i) => {
    starts[i] = s;
    ends[i] = e;
  });
  return { starts, ends };
}

const BUILT_IN = buildIndex(DATACENTER_CIDRS_RAW);

// iCloud 비공개 릴레이 egress 허용목록 (2026-08-12).
// 차단 목록의 출처가 172.224.0.0/12(Akamai 등록)을 통째로 담고 있는데, 이 대역이
// 릴레이 egress 로도 쓰여 한국 iCloud+ 사용자가 사파리로 가입하면 100% 막혔다.
// 릴레이는 유료 구독 + Apple ID 결속 + 사파리 한정 + Apple의 IP 회전이라
// 계정 대량 생성 도구로 쓸 수 없어, 허용해도 어뷰징 채산성이 살아나지 않는다.
const PRIVACY_RELAY = buildIndex(PRIVACY_RELAY_CIDRS_RAW);

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
 * 우선순위: 기능 OFF > ALLOWED_IP_CIDRS(해제) > BLOCKED_IP_CIDRS(추가)
 *          > 비공개 릴레이 허용목록 > 내장 차단 목록
 * 판정 불가(IP 없음·IPv6·형식 오류)는 false — 정상 사용자를 막지 않는다(fail-open).
 *
 * ⚠️ env 두 개는 Vercel 특성상 값을 바꾼 뒤 **재배포해야 반영된다**(기존 배포는
 * 빌드 시점 값을 유지). 긴급 대응 절차는 docs/AD_SETUP_GUIDE.md 참조.
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
  // 비공개 릴레이는 차단 목록보다 우선 — 정상 고객 오탐 방지
  if (inSortedRanges(value, PRIVACY_RELAY.starts, PRIVACY_RELAY.ends)) return false;
  return inSortedRanges(value, BUILT_IN.starts, BUILT_IN.ends);
}

/** 내장 대역 수 — 배포 후 목록이 실제로 실렸는지 확인용 */
export function datacenterRangeCount(): number {
  return BUILT_IN.starts.length;
}

/** 비공개 릴레이 허용 대역 수 — 배포 후 허용목록이 실렸는지 확인용 */
export function privacyRelayRangeCount(): number {
  return PRIVACY_RELAY.starts.length;
}
