// 요금제 3종 — 가격/할인/유효기간의 단일 출처(Single Source of Truth).
// 가격 페이지가 이 상수를 사용하고, 추후 결제(토스) 연동 시 충전 로직도 같은 값을 재사용한다.
// 정가 = 250원/문제 기준. 할인 사다리 20 → 30 → 44%.
// color: 플랜별 강조색(이름 뱃지·할인 뱃지·체크 아이콘에 사용).
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    credits: 100,
    listPrice: 25000,
    price: 19900,
    discountPct: 20,
    validityDays: 30,
    perUnit: 199,
    featured: false,
    color: "#2563eb", // blue
  },
  {
    id: "basic",
    name: "Basic",
    credits: 200,
    listPrice: 50000,
    price: 34900,
    discountPct: 30,
    validityDays: 30,
    perUnit: 175,
    featured: true,
    color: "#7c3aed", // violet (brand accent)
  },
  {
    id: "pro",
    name: "Pro",
    credits: 500,
    listPrice: 125000,
    price: 69900,
    discountPct: 44,
    validityDays: 60,
    perUnit: 140,
    featured: false,
    color: "#c026d3", // fuchsia
  },
] as const;

// 가입 시 무료로 지급되는 크레딧(문제) 수. 큰 셀링포인트는 아니라 홈에서는 최소로만 노출.
export const SIGNUP_FREE_CREDITS = 5;

// 크레딧 차감 규칙(정책의 단일 출처). 실제 차감 로직은 이미 앱에 반영됨.
// - 문제 1개 = 1 크레딧 / 해설 1개 = 1 크레딧
// - 문제 속 그림 = 차감 없음 / 변환 실패 = 차감 없음
export const CREDIT_RULE = [
  { label: "문제 1개", value: "1 크레딧", free: false },
  { label: "해설 1개", value: "1 크레딧", free: false },
  { label: "문제 속 그림", value: "무료", free: true },
  { label: "변환 실패", value: "차감 없음", free: true },
] as const;
