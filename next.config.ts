import type { NextConfig } from "next";

// ── 웹 방어 헤더 (LA-10, 2026-07-18 도입 → 2026-08-12 전체 강제) ──
//
// **현재 전체 CSP가 강제(enforce) 상태다.** 목록에 없는 출처는 실제로 차단된다.
// 새 외부 서비스(분석 도구·결제사·CDN 등)를 붙일 때는 여기 허용 목록을 함께
// 고쳐야 한다 — 안 고치면 그 기능만 조용히 죽고 화면은 멀쩡해 발견이 늦다.
// 위반은 /api/csp-report 로 계속 보고되므로 배포 후 로그를 확인할 것.
//
// 승격 경위: 2026-07-18 Report-Only 배포 → 관찰 → 2026-08-12 프로덕션 브라우저로
// 홈·결제 페이지 실측해 위반 항목을 전수 확인(메타 픽셀 2종이 유일) → 필요한 출처
// (Supabase Storage 이미지·메타 iframe/form)를 반영하고 승격.
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
// 로컬 개발(next dev)에서만 완화한다 — 운영 빌드에는 절대 들어가지 않는다.
//   · 'unsafe-eval': React 개발 모드가 콜스택 복원 등에 eval 을 쓴다(운영 모드는 안 씀)
//   · ws://localhost: 핫 리로드(HMR) 웹소켓
// 이게 없으면 CSP 강제 후 로컬에서 자동 새로고침이 죽고 콘솔이 에러로 도배된다.
const isDev = process.env.NODE_ENV === "development";
const devScriptSrc = isDev ? " 'unsafe-eval'" : "";
const devConnectSrc = isDev ? " ws://localhost:* http://localhost:*" : "";

const CSP_ENFORCED = [
  "default-src 'self'",
  // ssl.pstatic.net — 네이버 wcslog.js 가 **실행 중에 2차로** 불러오는 모듈
  // (gfp-nac-module/synchronizer.js). 우리 코드에는 이 주소가 없어 번들 정적
  // 분석으로는 안 잡히고, Report-Only 관찰에서도 놓쳤다가 2026-08-12 enforce 승격
  // 직후 프로덕션에서 실제 차단으로 발견했다.
  // ⚠️ 교훈: 서드파티 추적 스크립트는 자기가 또 다른 스크립트를 부른다.
  //    CSP 를 손댈 때는 배포 후 반드시 실제 브라우저로 재확인할 것.
  `script-src 'self' 'unsafe-inline'${devScriptSrc} https://www.googletagmanager.com https://connect.facebook.net https://pay.nicepay.co.kr https://wcs.naver.net https://ssl.pstatic.net`,
  "style-src 'self' 'unsafe-inline'",
  // analytics.google.com(GA4 수집 지역 변형)·www.google.com/co.kr(구글 애즈 전환
  // 링커 핑)은 프로덕션 Report-Only 실관찰(2026-07-18)에서 확인돼 추가 — 빠지면
  // enforce 시 GA4 수집·광고 전환 측정이 깨진다.
  // *.supabase.co — 관리자 신고 이미지가 Storage 서명 URL로 표시된다
  // (admin/reports 의 createSignedUrls). enforce 승격 전 필수 게이트였던 P1-6 항목:
  // 빠진 채 켜면 관리자 화면에서 신고 이미지만 안 보인다.
  // ssl.pstatic.net 병기 — 네이버 모듈이 픽셀 이미지 방식도 쓸 수 있다(정적 CDN이라
  // 데이터를 받는 엔드포인트가 아니므로 허용 위험이 사실상 없다).
  "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com https://www.googletagmanager.com https://*.google-analytics.com https://www.google.com https://www.google.co.kr https://wcs.naver.net https://wcs.naver.com https://ssl.pstatic.net",
  "font-src 'self' data:",
  `connect-src 'self'${devConnectSrc} https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://www.google.com https://www.google.co.kr https://www.facebook.com https://connect.facebook.net https://wcs.naver.net https://wcs.naver.com`,
  // www.facebook.com — 메타 픽셀이 iframe·form POST 폴백 경로를 쓴다.
  // 2026-08-12 프로덕션 실측: enforce 승격 시 위반하는 유일한 항목이 이 둘이었다.
  //
  // 빼고 켜는 안도 검토했으나 채택하지 않았다 — 픽셀의 주 경로(script-src·connect-src·
  // img-src)는 이미 허용돼 있어 빼봐야 **데이터는 계속 나가면서** 콘솔 에러와
  // CSP 리포트만 모든 방문자에게 매번 쌓인다. 즉 '반만 깨진' 상태가 된다.
  // facebook.com 은 이미 3개 지시어에서 신뢰하는 출처라 추가 위험이 사실상 없고,
  // 나중에 메타 광고를 재개할 때 CSP를 다시 손댈 필요도 없어진다.
  // ※ 메타를 완전히 끊으려면 픽셀 ID(NEXT_PUBLIC_META_PIXEL_ID) 제거 + 방침의
  //    국외 이전 고지 개정까지 함께 해야 한다(별건).
  "frame-src 'self' https://*.nicepay.co.kr https://www.facebook.com",
  "form-action 'self' https://*.nicepay.co.kr https://www.facebook.com",
  // 클릭재킹 차단 — 기존에는 Report-Only 가 frame-ancestors 를 무시해서 별도 헤더로
  // 강제했지만, 이제 이 CSP 자체가 강제 모드라 여기로 합친다.
  "frame-ancestors 'none'",
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
          // 2026-08-12 — Report-Only → **강제(enforce) 승격**.
          // 2026-07-18 배포 후 관찰 기간을 거쳐, 프로덕션 브라우저 실측으로 위반
          // 항목을 전수 확인하고(홈·결제 페이지에서 메타 픽셀 2종이 유일) 필요한
          // 출처를 반영한 뒤 승격했다. 이제 목록에 없는 출처는 실제로 차단된다.
          // frame-ancestors 도 이 헤더에 합쳤으므로 별도 CSP 헤더는 두지 않는다.
          { key: "Content-Security-Policy", value: CSP_ENFORCED },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
