import type { Metadata } from "next";

// 시작 안내는 인증 직후 도착하는 유틸리티 페이지 — 검색 노출 대상이 아니다
// (홈 다운로드 섹션과 내용이 겹쳐 중복 색인 방지 목적도 있음).
export const metadata: Metadata = {
  title: "시작 안내 — AI MathOCR",
  robots: { index: false, follow: false },
};

export default function StartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
