// GEO: AI 검색엔진·구글이 서비스를 정확히 이해하도록 구조화 데이터(JSON-LD) 제공.
// 사이트 전역에 들어가는 "안정적인" 정보(회사·사이트·소프트웨어)는 StructuredData(전역, layout)에,
// 홈 FAQ처럼 특정 페이지 콘텐츠 기반 데이터는 FaqStructuredData(홈 전용, page.tsx)에 둔다.
import { FAQS } from "@/lib/faqs";

const SITE_URL = "https://mathocr.ai.kr";

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "AI MathOCR",
  url: SITE_URL,
  logo: `${SITE_URL}/mathocr-icon.png`,
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "AI MathOCR",
  url: SITE_URL,
  inLanguage: "ko-KR",
};

const softwareApplication = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI MathOCR",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Windows 10, Windows 11",
  url: SITE_URL,
  inLanguage: "ko-KR",
  description:
    "수학 시험지·교재의 수식을 이미지가 아닌 한글(HWP) 수식편집기 객체로 변환하는 Windows 프로그램. 프론티어 AI 이중 검증으로 정확도를 높입니다.",
  featureList: [
    "PDF·이미지 수식 OCR",
    "한글(HWP) 수식편집기 객체 변환",
    "프론티어 AI 이중 검증",
    "시험지 레이아웃·답안 자동 생성",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
    description: "가입 시 5문제 무료 제공. 100문제 19,900원부터 · 월 구독 없음.",
  },
};

export default function StructuredData() {
  const graphs = [organization, website, softwareApplication];
  return (
    <>
      {graphs.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON-LD는 신뢰된 내부 정적 데이터라 안전
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}

// FAQPage — 홈(page.tsx)에서만 렌더한다. 구글 가이드상 FAQ 구조화 데이터는
// 실제 FAQ가 "보이는" 페이지에만 넣어야 하므로 전역 StructuredData에 두지 않는다.
// 질문/답은 화면과 동일한 단일 출처(@/lib/faqs)에서 가져와 둘이 어긋나지 않는다.
const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export function FaqStructuredData() {
  return (
    <script
      type="application/ld+json"
      // JSON-LD는 신뢰된 내부 정적 데이터라 안전
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
    />
  );
}
