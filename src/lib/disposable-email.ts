// 일회용(임시) 이메일 가입 차단 — 2026-08-08 무료 크레딧 파밍 사고 대응.
//
// 배경: 2026-08-07 22:34~08-08 01:43 사이 29개 계정이 자동 생성되어 얼리버드
//   크레딧 690개를 수령하고 495문제를 변환했다. 전부 일회용 메일 서비스
//   (22.do 계열 colaname/tnbeta/usdtbeta/colabeta·중국 linshiyou) 주소였고,
//   VPN IP를 "IP당 5회/시간" 상한에 정확히 맞춰 갈아타며 기존 방어를 우회했다.
//   IP 제한만으로는 막을 수 없어 가입 자체를 이메일 도메인으로 거른다.
//
// 방침:
//   - 목록은 공개 블록리스트(8,201개)를 내장한다. 6개만 막으면 도메인만 바꿔
//     바로 돌아오므로 넓은 목록이 필요하다.
//   - 상위 도메인까지 거슬러 올라가며 확인한다 (a.b.tempmail.com → tempmail.com).
//   - 오탐(진짜 고객 차단)은 매출 손실이므로 ALLOWED_EMAIL_DOMAINS 로 풀 수 있게
//     한다. 반대로 새 도메인은 BLOCKED_EMAIL_DOMAINS 로 추가.
//     ⚠️ 두 env 모두 저장만으로는 반영되지 않는다 — Vercel 은 기존 배포의 빌드 시점
//     값을 쓰므로 저장 후 Deployments 탭에서 **Redeploy** 까지 눌러야 적용된다.
//
// 주의: 이건 가입 시점의 1차 저지선일 뿐이다. 목록에 없는 신규 도메인은 통과하므로
//   가입 급증 자체를 관찰하는 감시(관리자 통계)와 함께 쓰는 것을 전제한다.

import { DISPOSABLE_DOMAINS_RAW } from "./disposable-domains";

const BUILT_IN = new Set(DISPOSABLE_DOMAINS_RAW.split("\n"));

function envDomains(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean)
  );
}

/** 이메일에서 도메인만 뽑는다. 형식이 이상하면 null. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  // 끝점 제거(예: "example.com.")·최소 형식 검사
  const normalized = domain.replace(/\.$/, "");
  if (!normalized.includes(".") || /\s/.test(normalized)) return null;
  return normalized;
}

/**
 * 일회용 이메일 도메인인지 판정.
 * 우선순위: ALLOWED_EMAIL_DOMAINS(해제) > BLOCKED_EMAIL_DOMAINS(추가) > 내장 목록
 */
export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false; // 형식 오류는 별도 검증의 몫 — 여기서 막지 않는다

  const allow = envDomains("ALLOWED_EMAIL_DOMAINS");
  const extraBlock = envDomains("BLOCKED_EMAIL_DOMAINS");

  // 서브도메인 우회(mail.tempmail.com) 차단 — 라벨을 하나씩 벗기며 확인한다.
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (allow.has(candidate)) return false;
    if (extraBlock.has(candidate) || BUILT_IN.has(candidate)) return true;
  }
  return false;
}

/** 내장 목록 크기 — 배포 후 목록이 실제로 실렸는지 확인용 */
export function disposableListSize(): number {
  return BUILT_IN.size;
}
