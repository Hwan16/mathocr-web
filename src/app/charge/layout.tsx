import type { Metadata } from "next";

// 결제 흐름 페이지는 검색엔진에 노출하지 않는다.
export const metadata: Metadata = {
  title: "크레딧 충전 — AI MathOCR",
  robots: { index: false, follow: false },
};

export default function ChargeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
