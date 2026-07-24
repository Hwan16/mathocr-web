import type { NextConfig } from "next";

// ── 웹 방어 헤더 (LA-10, 2026-07-18) ──
//
// 1) 즉시 강제(enforce): 렌더링을 깨뜨릴 수 없는 안전한 헤더만.
//    - frame-ancestors 'none': 다른 사이트가 우리를 iframe에 못 넣음 (클릭재킹 방지)
//    - nosniff / Referrer-Policy / Permissions-Policy
// 2) 전체 CSP는 Report-Only로 먼저 배포 — 위반이 /api/csp-report로 보고되며
//    화면은 절대 깨지지 않는다. 위반 보고가 잠잠해지면 enforce로 승격한다.
//
// CSP 허용 목록 근거 (프론트가 실제 접속하는 외부 호스트 전수 조사):
//  - script: GA(googletagmanager) · 메타 픽셀(connect.facebook.net) · 나이스 결제
//    SDK(pay.nicepay.co.kr). 'unsafe-inline'은 Next 부트스트랩·GA·픽셀 인라인
//    스니펫에 필요 (nonce 전환은 추후 과제).
//  - connect: Supabase(브라우저 SDK) · GA 수집 · 메타 픽셀 수집
//  - frame/form-action: 나이스 결제창(레이어·리다이렉트 양쪽 대비)
//  - 폰트·아이콘은 자체 번들로 전환해 jsDelivr·api.iconify.design 불필요 (LA-10)
//  - 토스 SDK(js.tosspayments.com)는 의도적으로 제외 — 나이스 전환 후 휴면 코드
//  - 네이버 프리미엄 로그분석 — 검색광고 전환 추적 (2026-07-21 선반영).
//    ⚠️ 스크립트와 로그 수집 도메인이 다르다. 2026-07-25 WCS 활성화 직후
//    프로덕션 실측(performance.getEntriesByType('resource'))에서 확인:
//      · 스크립트 로드 = https://wcs.naver.net/wcslog.js  → script-src
//      · 로그 전송     = https://wcs.naver.com/b (initiatorType "beacon")
//                                                → connect-src (sendBeacon)
//    2026-07-22 검토에서 wcs.naver.com 선반영이 "코드에 근거 없음"으로 기각됐던
//    항목 — 실측 근거가 확보돼 추가한다. 빠진 채 enforce로 승격하면 전환 전송만
//    조용히 차단돼 광고 성과가 0으로 보인다(화면은 멀쩡해서 발견이 늦다).
//    img-src에도 병기 — 구형 브라우저에서 픽셀 폴백 가능성 대비.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://pay.nicepay.co.kr https://wcs.naver.net",
  "style-src 'self' 'unsafe-inline'",
  // analytics.google.com(GA4 수집 지역 변형)·www.google.com/co.kr(구글 애즈 전환
  // 링커 핑)은 프로덕션 Report-Only 실관찰(2026-07-18)에서 확인돼 추가 — 빠지면
  // enforce 시 GA4 수집·광고 전환 측정이 깨진다.
  "img-src 'self' data: blob: https://www.facebook.com https://www.googletagmanager.com https://*.google-analytics.com https://www.google.com https://www.google.co.kr https://wcs.naver.net https://wcs.naver.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://www.google.com https://www.google.co.kr https://www.facebook.com https://connect.facebook.net https://wcs.naver.net https://wcs.naver.com",
  "frame-src 'self' https://*.nicepay.co.kr",
  "form-action 'self' https://*.nicepay.co.kr",
  "base-uri 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // frame-ancestors는 Report-Only에서 무시되므로 강제 CSP로만 배포한다.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
