// 얼리버드 신규 적용 종료(2026-08-14 사용자 결정).
//
// 광고를 보고 이미 가입했지만 아직 이메일 인증·첫 로그인을 마치지 않은 계정은
// 기존 약속을 지킬 수 있어야 한다. 그래서 DB 코드는 남겨 두되, 공개 검증·신규 가입
// 경로에서는 이 코드를 마감으로 처리하고 아래 시각 이전에 만들어진 pending 계정만
// promo-claim에서 상환을 허용한다.
export const RETIRED_EARLYBIRD_CODE = "earlybird";
export const EARLYBIRD_SIGNUP_CUTOFF = "2026-08-14T00:00:00+09:00";

export function isRetiredSignupPromo(code: string): boolean {
  return code.trim().toLowerCase() === RETIRED_EARLYBIRD_CODE;
}

export function canClaimGrandfatheredEarlybird(
  code: string,
  userCreatedAt: string | null | undefined
): boolean {
  if (!isRetiredSignupPromo(code) || !userCreatedAt) return false;
  const createdAt = Date.parse(userCreatedAt);
  const cutoff = Date.parse(EARLYBIRD_SIGNUP_CUTOFF);
  return Number.isFinite(createdAt) && createdAt < cutoff;
}
