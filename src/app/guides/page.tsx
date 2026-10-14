import type { Metadata } from "next";
import temml from "temml";
// 썸네일 수식 MathML 기본 스타일
import "temml/dist/Temml-Local.css";
import { ARTICLES, ARTICLE_CATEGORIES, SITE_URL } from "@/lib/articles";
import { ArticleHeader, ArticleTopBar } from "@/components/article/ArticleShell";
import { PromoInline, PromoRail } from "@/components/article/PromoCards";
import GuideList, { type GuideCard } from "@/components/article/GuideList";

export const metadata: Metadata = {
  title: "자료실 — 한글 수식·수학 시험지 제작 팁",
  description:
    "한글(HWP) 수식 입력 방법과 명령어 사전, ChatGPT 수식을 한글 수식으로 바꾸는 무료 변환기, 앱 오류 해결 가이드를 모았습니다.",
  alternates: {
    canonical: "/guides",
    // 새 글 알림(RSS) — 네이버 서치어드바이저에 제출해 새 글 수집을 앞당긴다
    types: { "application/rss+xml": [{ url: "/rss.xml", title: "AI MathOCR 자료실" }] },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${SITE_URL}/guides`,
    siteName: "AI MathOCR",
    title: "자료실 — 한글 수식·수학 시험지 제작 팁",
    description: "한글 수식 명령어 사전, ChatGPT 수식 변환기, 시험지를 한글로 옮기는 방법 비교 등 수학 선생님을 위한 자료 모음.",
    images: [{ url: `${SITE_URL}/articles/guides-og.jpg`, width: 1200, height: 675 }],
  },
};

// 목록 구조화 데이터 — 자료실이 어떤 글들을 담고 있는지 검색엔진에 알린다
const itemListJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "AI MathOCR 자료실",
  itemListElement: ARTICLES.map((a, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE_URL}${a.href}`,
    name: a.title,
  })),
};

const CARDS: GuideCard[] = ARTICLES.map((a) => ({
  href: a.href,
  category: a.category,
  categoryLabel: ARTICLE_CATEGORIES.find((c) => c.id === a.category)?.label ?? "",
  title: a.title,
  summary: a.summary,
  date: a.date,
  tone: a.thumbTone,
  thumbHtml: "tex" in a.thumb ? temml.renderToString("\\displaystyle " + a.thumb.tex, { throwOnError: false }) : null,
  thumbText: "text" in a.thumb ? a.thumb.text : null,
  thumbImg: "img" in a.thumb ? { src: a.thumb.img, alt: a.thumb.alt } : null,
}));

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <style>{`
.guide-thumb math{font-size:1.6em}
.guide-thumb math,.guide-thumb math *{font-family:"Cambria Math","STIX Two Math","Latin Modern Math",math}
`}</style>
      <script
        type="application/ld+json"
        // JSON-LD는 신뢰된 내부 정적 데이터라 안전
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <ArticleTopBar location="guides" />
      <ArticleHeader location="guides" />
      <div className="max-w-[1240px] mx-auto px-4 py-10 md:py-14 xl:grid xl:grid-cols-[minmax(0,1fr)_250px] xl:gap-10">
        <main className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">자료실</h1>
          <p className="text-zinc-500 text-sm mt-2 mb-8">
            한글 수식 입력부터 수학 시험지 제작까지, 수학 선생님에게 필요한 팁과 무료 도구를 모았습니다.
          </p>
          <GuideList cards={CARDS} categories={ARTICLE_CATEGORIES} />
          <PromoInline location="guides" />
        </main>
        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <PromoRail location="guides" />
          </div>
        </aside>
      </div>
    </div>
  );
}
