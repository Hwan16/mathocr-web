/**
 * 쿼리스트링의 정수 파라미터를 안전하게 파싱한다.
 * NaN / 음수 / 과도하게 큰 값은 [min, max] 범위로 클램프한다.
 */
export function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
