// 요금제 3종 — 가격/할인/유효기간의 단일 출처(Single Source of Truth).
// 가격 페이지가 이 상수를 사용하고, 추후 결제(토스) 연동 시 충전 로직도 같은 값을 재사용한다.
// 정가 = 250원/문제 기준. 할인 사다리 20 → 30 → 44%.
export const PLANS = [
  {
    id: "starter",
    name: "스타터",
    credits: 100,
    listPrice: 25000,
    price: 19900,
    discountPct: 20,
    validityDays: 30,
    perUnit: 199,
    featured: false,
  },
  {
    id: "basic",
    name: "베이직",
    credits: 200,
    listPrice: 50000,
    price: 34900,
    discountPct: 30,
    validityDays: 30,
    perUnit: 175,
    featured: true,
  },
  {
    id: "pro",
    name: "프로",
    credits: 500,
    listPrice: 125000,
    price: 69900,
    discountPct: 44,
    validityDays: 60,
    perUnit: 140,
    featured: false,
  },
] as const;

// 가입 시 무료로 지급되는 크레딧(문제) 수. 큰 셀링포인트는 아니라 홈에서는 최소로만 노출.
export const SIGNUP_FREE_CREDITS = 5;

// 크레딧 차감 규칙(홈 안내 문구의 단일 출처). 구현(데스크톱/DB)은 추후 별도 작업.
// - 문제 1개 = 1 크레딧
// - 문제 속 그림 = 차감 없음(무료)
// - 해설 = 문제와 동일하게 1 크레딧
// - 변환 실패 = 차감 없음
export const CREDIT_RULE =
  "크레딧은 문제 1개당 1개 차감됩니다. 문제 속 그림은 몇 개를 넣어도 추가 차감이 없고, 해설까지 변환하면 해설 1개당 1개가 차감됩니다. 변환에 실패한 문제는 차감되지 않습니다.";
