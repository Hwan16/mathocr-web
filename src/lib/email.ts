// 이메일 알리아스 정규화 (0013 — 얼리버드 등 프로모션 중복 수령 방지)
//
// 같은 받은편지함을 가리키는 변형 주소를 하나로 접는다:
//  - 소문자·공백 정리
//  - local part 의 +suffix 제거 (gmail 등 plus addressing: a+1@ == a@)
//  - gmail 계열은 점(.)도 제거 (a.b@gmail.com == ab@gmail.com)
//
// 로그인 이메일 자체는 절대 건드리지 않는다 — 프로모션 혜택 중복 판정에만 쓰는 값.
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

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
