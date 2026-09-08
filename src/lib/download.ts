// 앱 다운로드 링크의 단일 출처 — 릴리스 시 여기 두 값만 갱신한다.
// 사용처: 홈 다운로드 섹션(page.tsx) · 시작 안내(/start) · 마이페이지 설치 카드(dashboard).
// 릴리스 절차의 "홈페이지 다운로드 링크 갱신" 단계 = 이 파일 수정.
export const DOWNLOAD_URL =
  "https://github.com/Hwan16/mathocr-web/releases/download/v2.2.8/MathOCR-Setup-v2.2.8.exe";
export const DOWNLOAD_LABEL = "v2.2.8 (114MB)";

// 위 URL에서 자동으로 뽑는 현재 버전 태그 (예: "v2.2.8").
// 릴리스 때 따로 갱신할 필요 없이 DOWNLOAD_URL만 바꾸면 따라온다.
// 사용처: 홈 FAQ 옆 업데이트 내역 패널의 "현재 버전" 배지.
export const DOWNLOAD_VERSION =
  DOWNLOAD_URL.match(/\/download\/(v[\d.]+)\//)?.[1] ?? "";
