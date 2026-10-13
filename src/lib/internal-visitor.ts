// 운영자 기기 통계 제외 (2026-10-13).
//
// 배경: 가입 감소 점검 때 GA4의 가입 화면 방문 몇 건이 운영자 본인의 확인
// 방문인지 가릴 수 없었다. 표본이 하루 몇 명 수준이라 본인 방문 1~2건이
// 전환율 판단을 뒤집는다.
//
// 동작: /internal 을 한 번 열면 그 브라우저 localStorage 에 표시가 남고, 이후
// 그 브라우저에서는 GA4(공식 opt-out 플래그)·메타 픽셀·네이버 로그분석이 꺼진다.
// /internal?off=1 로 되돌린다. 브라우저(카톡·쓰레드 인앱 포함)마다 따로 저장된다.
// 가입·결제 같은 DB 지표는 영향이 없다 — 방문 통계에서만 빠진다.

export const INTERNAL_VISITOR_KEY = "mathocr_internal_visitor";
export const INTERNAL_VISITOR_PATH = "/internal";

type InternalWindow = Window & { __mathocrInternal?: boolean };

// 루트 레이아웃에서 beforeInteractive 로 실행되는 인라인 스크립트 본문.
// GA4 opt-out 플래그(window['ga-disable-<ID>'])는 gtag config 보다 먼저 세워야
// 효과가 있어서, 컴포넌트 이펙트가 아니라 하이드레이션 전에 돌린다.
// /internal 페이지 자체는 상태와 무관하게 추적하지 않는다.
export function internalVisitorBootstrap(gaId: string): string {
  return `(function(){try{var k=${JSON.stringify(INTERNAL_VISITOR_KEY)},p=location.pathname;if(p===${JSON.stringify(INTERNAL_VISITOR_PATH)}){if(/[?&]off=1(&|$)/.test(location.search))localStorage.removeItem(k);else localStorage.setItem(k,"1");}if(localStorage.getItem(k)==="1"||p===${JSON.stringify(INTERNAL_VISITOR_PATH)}){window[${JSON.stringify(`ga-disable-${gaId}`)}]=true;window.__mathocrInternal=true;}}catch(e){}})();`;
}

// 메타 픽셀·네이버 로그분석이 로드 전에 확인한다. 저장소 접근이 막힌 환경
// (사생활 보호 모드 등)에서는 일반 방문자로 취급한다(fail-open).
export function isInternalVisitor(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as InternalWindow).__mathocrInternal === true) return true;
  try {
    return window.localStorage.getItem(INTERNAL_VISITOR_KEY) === "1";
  } catch {
    return false;
  }
}
