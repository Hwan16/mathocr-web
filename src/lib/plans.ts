// 요금제 3종 — 가격/유효기간의 단일 출처(Single Source of Truth).
// 가격 페이지가 이 상수를 사용하고, 결제(나이스) 연동 충전 로직도 같은 값을 재사용한다.
//
// ⚠️ 가격 비교 표시 원칙 (2026-07-12 감사 LA-01):
//   취소선 "정가"와 할인율(listPrice/discountPct)은 제거했다 — 실제로 그 가격에
//   판매한 이력이 없어 표시광고법상 '거짓 할인'(종전거래가격 요건 미충족)이 될
//   수 있다. 대신 실재하는 우리 판매가끼리의 단가 비교(savePctVsStarter)만 쓴다.
//   할인 표시를 되살리려면 해당 정가로 상당 기간 실판매한 증빙이 먼저 필요하다.
//
// perUnit: 크레딧당 단가 원 단위 표기(올림 — 실제보다 싸게 보이지 않는 방향).
// savePctVsStarter: Starter 실단가(199원) 대비 절약률, 내림(과장 방지).
//   Basic: 1 - (34900/200)/199 = 12.3% → 12 / Pro: 1 - (69900/500)/199 = 29.7% → 29
// color: 플랜별 강조색(이름 뱃지·절약 뱃지·체크 아이콘에 사용).
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    credits: 100,
    price: 19900,
    validityDays: 30,
    perUnit: 199,
    savePctVsStarter: null,
    featured: false,
    color: "#2563eb", // blue
  },
  {
    id: "basic",
    name: "Basic",
    credits: 200,
    price: 34900,
    validityDays: 30,
    perUnit: 175,
    savePctVsStarter: 12,
    featured: true,
    color: "#7c3aed", // violet (brand accent)
  },
  {
    id: "pro",
    name: "Pro",
    credits: 500,
    price: 69900,
    validityDays: 60,
    perUnit: 140,
    savePctVsStarter: 29,
    featured: false,
    color: "#c026d3", // fuchsia
  },
] as const;

// 가입 시 무료로 지급되는 크레딧(문제) 수. 큰 셀링포인트는 아니라 홈에서는 최소로만 노출.
export const SIGNUP_FREE_CREDITS = 5;
// 무료 크레딧 유효기간(일) — DB의 handle_new_user(0009 마이그레이션)와 반드시 일치시킬 것.
export const SIGNUP_FREE_VALIDITY_DAYS = 7;

// 크레딧 차감 규칙(정책의 단일 출처). 실제 차감 로직은 이미 앱에 반영됨.
// - 문제 1개 = 1 크레딧 / 해설 1개 = 1 크레딧
// - 문제 속 그림 = 차감 없음 / 변환 실패 = 차감 없음
export const CREDIT_RULE = [
  { label: "문제 1개", value: "1 크레딧", free: false },
  { label: "해설 1개", value: "1 크레딧", free: false },
  { label: "문제 속 그림", value: "무료", free: true },
  { label: "변환 실패", value: "차감 없음", free: true },
] as const;
