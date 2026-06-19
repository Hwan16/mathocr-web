// GEO: AI 검색엔진·구글이 서비스를 정확히 이해하도록 구조화 데이터(JSON-LD) 제공.
// 사이트 전역에 들어가는 "안정적인" 정보(회사·사이트·소프트웨어)만 여기 둔다.
// FAQ 등 페이지 콘텐츠 기반 데이터는 내용 확정 후 별도 추가 (docs/SEO-GA.md 참고).

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
    "수학 시험지·교재의 수식을 이미지가 아닌 한글(HWP) 수식편집기 객체로 변환하는 Windows 프로그램. Mathpix와 Claude AI 이중 검증.",
  featureList: [
    "PDF·이미지 수식 OCR",
    "한글(HWP) 수식편집기 객체 변환",
    "Mathpix + Claude AI 이중 검증",
    "시험지 레이아웃·답안 자동 생성",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
    description: "가입 시 5문제 무료 제공, 이후 종량제(문제당 25원). 월 구독 없음.",
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
