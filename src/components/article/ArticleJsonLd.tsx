import { DEFAULT_OG_IMAGE, SITE_URL, categoryLabel, getArticle } from "@/lib/articles";

// 자료실 글의 구조화 데이터 — 검색엔진에 '글(Article)'임과 작성·수정일, 대표 이미지,
// '자료실 › 분류 › 글' 경로(BreadcrumbList)를 알린다. 값은 lib/articles.ts 단일 출처.
export default function ArticleJsonLd({ href }: { href: string }) {
  const a = getArticle(href);
  const url = `${SITE_URL}${a.href}`;
  const image = `${SITE_URL}${a.ogImage ?? ("img" in a.thumb ? a.thumb.img : DEFAULT_OG_IMAGE)}`;
  const org = {
    "@type": "Organization",
    name: "AI MathOCR",
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/mathocr-icon.png` },
  };
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: a.summary,
      image: [image],
      datePublished: `${a.published}T09:00:00+09:00`,
      dateModified: `${a.date}T09:00:00+09:00`,
      inLanguage: "ko-KR",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: org,
      publisher: org,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "자료실", item: `${SITE_URL}/guides` },
        { "@type": "ListItem", position: 2, name: categoryLabel(a.category), item: `${SITE_URL}/guides?c=${a.category}` },
        { "@type": "ListItem", position: 3, name: a.title, item: url },
      ],
    },
  ];
  return (
    <script
      type="application/ld+json"
      // JSON-LD는 신뢰된 내부 정적 데이터라 안전
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
