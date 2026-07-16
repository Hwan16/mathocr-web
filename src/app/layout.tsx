import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import StructuredData from "./structured-data";
import UtmTracker from "@/components/UtmTracker";
import MetaPixel from "@/components/MetaPixel";
import "./globals.css";

// GA4 측정 ID (공개 값 — 모든 페이지 HTML에 노출되는 값이라 비밀 아님)
const GA_MEASUREMENT_ID = "G-N5B03EJ16V";

const SITE_URL = "https://mathocr.ai.kr";
const SITE_NAME = "AI MathOCR";
const SITE_TITLE = "AI MathOCR — 수학문제 OCR, PDF·이미지를 편집 가능한 HWP로";
const SITE_DESCRIPTION =
  "수학문제 OCR 프로그램 AI MathOCR. 시험지·교재 PDF와 사진 속 수식을 이미지가 아닌 한글(HWP) 수식편집기 객체로 변환합니다. 프론티어 AI 이중 검증으로 정확하게, 문제 속 그림은 크레딧 차감 없이 함께.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | AI MathOCR",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "수학문제 OCR",
    "수학문제 HWP 변환",
    "수식 OCR",
    "PDF HWP 변환",
    "이미지 HWP 변환",
    "수학문제 사진 변환",
    "한글 수식편집기",
    "시험지 제작",
    "수식 인식",
    "MathOCR",
    "AI MathOCR",
    "수학 시험지 변환",
    "교재 제작",
    "문제은행",
    "수식 변환기",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "AI MathOCR — 수학문제, 편집 가능한 HWP로",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // 소유확인 메타태그 (구글 서치콘솔 + 네이버 웹마스터 + 메타 도메인 인증).
  // ⚠️ 확인 후에도 메타태그 삭제 금지(재확인 시 필요).
  verification: {
    google: "K6mQzqoBBovnv8ZiY5eTg25m-kKDiVHLM9J_R471IV4",
    other: {
      "naver-site-verification": "e08cf2523d557a661191cfd06828319d7f20d816",
      "facebook-domain-verification": "c3vklo1rp8pajw6pu9l06a8qqzgepg",
    },
  },
  icons: {
    icon: "/mathocr-icon.png",
    shortcut: "/mathocr-icon.png",
    apple: "/mathocr-icon.png",
  },
  formatDetection: {
    telephone: false,
  },
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
        <script src="https://cdn.jsdelivr.net/npm/iconify-icon@2.3.0/dist/iconify-icon.min.js" defer />
      </head>
      <body className="antialiased bg-white text-zinc-900" suppressHydrationWarning>
        {children}
        <StructuredData />
        {/* 가입 출처(UTM) 추적 — 광고 랜딩 페이지가 어디든 잡히도록 전역 마운트 */}
        <UtmTracker />
        {/* 메타 픽셀 — NEXT_PUBLIC_META_PIXEL_ID 설정 시에만 활성 (M6) */}
        <MetaPixel />
      </body>
      {/* GA4: 실제 배포(production)에서만 로드 — 로컬/개발 접속은 추적하지 않음 */}
      {process.env.NODE_ENV === "production" && (
        <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
      )}
    </html>
  );
}
