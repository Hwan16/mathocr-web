import type { Metadata } from "next";

// terms/page.tsx 가 "use client" 라 메타데이터를 직접 못 내보냄.
// 서버 컴포넌트 레이아웃에서 페이지별 메타데이터를 입힌다.
export const metadata: Metadata = {
  title: "이용약관",
  description: "AI MathOCR 서비스 이용약관입니다.",
  alternates: { canonical: "/terms" },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
