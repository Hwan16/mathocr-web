import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://mathocr.ai.kr";
const SITE_NAME = "AI MathOCR";
const SITE_TITLE = "AI MathOCR — 수학문제 PDF를 편집 가능한 HWP로";
const SITE_DESCRIPTION =
  "수학 시험지·교재의 수식을 이미지가 아닌 한글(HWP) 수식편집기 객체로 변환합니다. PDF·사진을 드래그하면 Mathpix·Claude AI 이중 검증으로 편집 가능한 HWP 시험지 완성. 가입 시 5문제 무료.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | AI MathOCR",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "수학문제 HWP 변환",
    "수식 OCR",
    "PDF HWP 변환",
    "한글 수식편집기",
    "시험지 제작",
    "수식 인식",
    "MathOCR",
    "AI MathOCR",
    "수학 시험지 변환",
    "교재 제작",
    "문제은행",
    "Mathpix",
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
        url: "/mathocr-icon.png",
        width: 600,
        height: 600,
        alt: "AI MathOCR",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/mathocr-icon.png"],
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
      </body>
    </html>
  );
}
