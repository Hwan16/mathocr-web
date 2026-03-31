import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MathOCR — 수학문제 PDF를 편집 가능한 HWP로",
  description:
    "수식을 이미지가 아닌 수식편집기 객체로 변환합니다. 교재, 시험지를 몇 번의 클릭만으로 HWP 문서로.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.jsdelivr.net/npm/iconify-icon@2.3.0/dist/iconify-icon.min.js" defer />
      </head>
      <body className="antialiased bg-[#0a0a0a] text-zinc-100" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
