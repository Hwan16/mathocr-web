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
// colorHover: color를 한 단계 진하게 — featured 카드의 구매 버튼 hover에 사용.
// featured: 추천 카드(테두리·추천 뱃지·채운 구매 버튼). 2026-07-21 Basic→Pro 이동
//   (단가 최저·유효기간 2배로 추천 근거가 가장 강한 플랜이라 사용자 결정).
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
    color: "#2563eb", // blue-600
    colorHover: "#1d4ed8", // blue-700
  },
  {
    id: "basic",
    name: "Basic",
    credits: 200,
    price: 34900,
    validityDays: 30,
    perUnit: 175,
    savePctVsStarter: 12,
    featured: false,
    color: "#7c3aed", // violet-600 (brand accent)
    colorHover: "#6d28d9", // violet-700
  },
  {
    id: "pro",
    name: "Pro",
    credits: 500,
    price: 69900,
    validityDays: 60,
    perUnit: 140,
    savePctVsStarter: 29,
    featured: true,
    color: "#c026d3", // fuchsia-600
    colorHover: "#a21caf", // fuchsia-700
  },
] as const;

// 가입 시 무료로 지급되는 크레딧(문제) 수. 큰 셀링포인트는 아니라 홈에서는 최소로만 노출.
export const SIGNUP_FREE_CREDITS = 5;
// 무료 크레딧 유효기간(일) — DB의 handle_new_user(0009 마이그레이션)와 반드시 일치시킬 것.
export const SIGNUP_FREE_VALIDITY_DAYS = 7;

// 크레딧 "환산 눈금" — 요금제 카드에 붙여 규모를 가늠하게 하는 보조 표기.
//
// 배경(2026-07-23): 인스타 DM 문의 — "요금제별로 몇 문제 정도 타이핑이 되는지
// 알 수 있을까요? 크레딧이라고만 되어있어 가늠이 안되서요". 요금제 카드는
// "100 크레딧 · 30일"만 말하고, "문제 1개 = 1크레딧"은 아래 별도 표에 있어서
// 방문자가 두 정보를 스스로 연결해야 했다. DM을 보낼 만큼 적극적인 사람이
// 걸린 지점이므로, 그러지 않은 방문자는 그냥 이탈했다고 봐야 한다.
//
// ⚠️ "크레딧"이라는 단어를 없애지 않는 이유: 크레딧은 DB·앱 화면·결제 상품명·
//    영수증·약관 제6조·환불 정책이 모두 쓰는 실제 계산 단위다. 표시만 바꾸면
//    구매 화면·앱·환불 규정의 용어가 서로 달라져 더 혼란스럽다.
// ⚠️ "문제 N개"라고 단정하지 않고 "분량"이라 쓰는 이유: 해설도 1개당 1크레딧을
//    쓰므로(아래 CREDIT_RULE) 해설을 함께 변환하면 문제 수는 줄어든다.
//    단정하면 해설 사용자에게는 과장 표시가 된다.
export function creditsAsProblems(credits: number): string {
  return `문제 ${credits}개 분량`;
}

// 크레딧 차감 규칙(정책의 단일 출처). 실제 차감 로직은 이미 앱에 반영됨.
// - 문제 1개 = 1 크레딧 / 해설 1개 = 1 크레딧
// - 문제 속 그림 = 차감 없음 / 변환 실패 = 차감 없음
export const CREDIT_RULE = [
  { label: "문제 1개", value: "1 크레딧", free: false },
  { label: "해설 1개", value: "1 크레딧", free: false },
  { label: "문제 속 그림", value: "무료", free: true },
  { label: "변환 실패", value: "차감 없음", free: true },
] as const;
