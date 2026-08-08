// 이메일 알리아스 정규화 (0013 — 얼리버드 등 프로모션 중복 수령 방지)
//
// 같은 받은편지함을 가리키는 변형 주소를 하나로 접는다:
//  - 소문자·공백 정리
//  - local part 의 +suffix 제거 (gmail 등 plus addressing: a+1@ == a@)
//  - gmail 계열은 점(.)도 제거 (a.b@gmail.com == ab@gmail.com)
//
// 로그인 이메일 자체는 절대 건드리지 않는다 — 프로모션 혜택 중복 판정에만 쓰는 값.
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * 지메일 주소에 점(.)이 들어있는지 — 가입 차단 판정용 (2026-08-08 사용자 결정).
 *
 * 지메일은 점을 무시해서 a.b@gmail.com 과 ab@gmail.com 이 같은 메일함이다.
 * 즉 메일함 하나로 주소를 무한히 만들어 계정을 찍어낼 수 있다(별칭 + 차단의
 * 다음 우회로). 지메일 계열만 점을 막아 **메일함당 가능한 주소를 하나로 고정**한다.
 *
 * ⚠️ 지메일 계열에만 적용한다. 회사·학교 메일(hanwha.com, sookmyung.ac.kr 등)은
 *    점이 의미를 가져 a.b@ 와 ab@ 가 서로 다른 사람이므로 절대 막으면 안 된다
 *    (실제 고객 ahhyeon.yun@hanwha.com 이 여기 해당).
 *
 * 이미 가입한 계정에는 소급하지 않는다 — 가입 단계에서만 쓰는 판정이다.
 */
const DOT_TRICK_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function isDottedGmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return DOT_TRICK_DOMAINS.has(domain) && local.includes(".");
}

export function normalizeEmailAlias(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  if (domain === "googlemail.com") domain = "gmail.com";

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.split(".").join("");

  if (!local) return null;
  return `${local}@${domain}`;
}
