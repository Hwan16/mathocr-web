import type { Metadata } from "next";

// report/page.tsx 가 "use client" 라 메타데이터를 직접 못 내보냄.
// 서버 컴포넌트 레이아웃에서 페이지별 메타데이터를 입힌다.
export const metadata: Metadata = {
  title: "변환 오류 신고",
  description:
    "AI MathOCR 변환 실패·오변환을 신고하고 크레딧 반환을 요청하세요.",
  alternates: { canonical: "/report" },
};

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
