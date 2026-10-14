// 네이버 프리미엄 로그분석 전환 이벤트 헬퍼 (meta-pixel.ts와 같은 패턴)
// 미설정(NEXT_PUBLIC_NAVER_WCS_ID 없음)·개발 환경에서는 아무것도 하지 않으므로
// 호출부에서 조건 분기 없이 안전하게 쓸 수 있다.
//
// 메타 픽셀과 달리 wcslog.js에는 로드 전 호출을 쌓아주는 공식 큐가 없다.
// 전환 페이지에 직행하면(결제 PG 리다이렉트 등) 스크립트 로드보다 전환 호출이
// 먼저 실행될 수 있어, 자체 큐에 쌓았다가 NaverWcs 컴포넌트가 로드 완료 시 재생한다.

const ACTIVE =
  Boolean(process.env.NEXT_PUBLIC_NAVER_WCS_ID) &&
  process.env.NODE_ENV === "production";

// 전환 유형은 네이버 공식 규격의 예약어를 쓴다: sign_up(회원가입), purchase(구매,
// value=총결제금액·id=주문번호) 등 — https://naver.github.io/conversion-tracking/
type WcsConv = { type: string; value?: string; id?: string };

type WcsWindow = Window & {
  wcs?: { trans?: (conv: WcsConv) => void };
  __naverWcsQueue?: WcsConv[];
};

export function naverWcsTrans(conv: WcsConv) {
  if (typeof window === "undefined" || !ACTIVE) return;
  const w = window as unknown as WcsWindow;
  if (w.wcs?.trans) {
    w.wcs.trans(conv);
  } else {
    (w.__naverWcsQueue ??= []).push(conv);
  }
}

// 루트 레이아웃이 페이지 원본(HTML)에 직접 넣는 공통 스크립트 본문 (2026-10-15).
// 배경: 7-21 전환 추적 신청이 석 달째 '신청중' — 스크립트를 하이드레이션 뒤 동적으로 붙이는
// 방식이라 네이버 설치 확인이 못 알아보는 것으로 추정. 네이버 공식 설치 안내와 같은 모양
// (wcslog.js 직후 wcs_add["wa"] → wcs_do)으로 원본에 둔다. 운영자 기기(/internal)는
// 라이브러리만 받고 기록(wcs_do)은 보내지 않는다 — internal-visitor 부트스트랩이 먼저 세운
// window.__mathocrInternal 과 localStorage 표시를 둘 다 본다.
export function naverWcsInlineScript(wcsId: string, internalKey: string): string {
  return [
    "if(!wcs_add) var wcs_add = {};",
    `wcs_add["wa"] = ${JSON.stringify(wcsId)};`,
    `if(window.wcs && !(window.__mathocrInternal || (function(){try{return localStorage.getItem(${JSON.stringify(internalKey)})==="1"}catch(e){return false}})())) { wcs.inflow("mathocr.ai.kr"); wcs_do(); window.__naverWcsFirstPv = true; }`,
  ].join("\n");
}

// NaverWcs 컴포넌트 전용 — 스크립트 로드 완료 후 밀린 전환 재생
export function flushNaverWcsQueue() {
  if (typeof window === "undefined") return;
  const w = window as unknown as WcsWindow;
  const queue = w.__naverWcsQueue;
  if (!queue || !w.wcs?.trans) return;
  for (const conv of queue.splice(0)) {
    w.wcs.trans(conv);
  }
}
