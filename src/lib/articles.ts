// 자료실(/guides) 카드 목록 — 글을 추가하면 여기 한 줄 + sitemap 날짜만 갱신한다.
// 이 목록이 SEO 정보의 단일 출처이기도 하다: 공유 미리보기(articleSeoMetadata), 글 구조화 데이터
// (components/article/ArticleJsonLd), RSS(/rss.xml)가 모두 여기서 제목·요약·날짜·이미지를 가져간다.
// 주소는 기존 /help/... 를 그대로 쓴다(이미 검색에 잡힌 주소를 바꾸면 순위가 처음부터 다시 쌓인다).

export type ArticleCategory = "exam" | "hwp" | "tool" | "app";

export const ARTICLE_CATEGORIES: { id: ArticleCategory; label: string }[] = [
  { id: "exam", label: "시험지 제작" },
  { id: "hwp", label: "한글 수식" },
  { id: "tool", label: "무료 도구" },
  { id: "app", label: "앱 도움말" },
];

export type Article = {
  href: string;
  category: ArticleCategory;
  title: string;
  summary: string;
  published: string; // 처음 공개한 날 YYYY-MM-DD
  date: string; // 최근 수정일 YYYY-MM-DD
  ogImage?: string; // 공유 미리보기 이미지(jpg 권장, 1200×630 안팎). 없으면 사이트 기본 이미지
  // 썸네일: 대표 이미지(public 경로) · 대표 수식(LaTeX, 서버에서 MathML로 그림) · 짧은 글자 중 하나
  thumb: { img: string; alt: string } | { tex: string } | { text: string };
  thumbTone: "violet" | "sky" | "amber" | "rose" | "emerald";
};

export const ARTICLES: Article[] = [
  {
    href: "/help/math-exam-to-hwp",
    published: "2026-10-14",
    ogImage: "/articles/exam-3ways-og.jpg",
    category: "exam",
    title: "수학 시험지 PDF를 한글(HWP)로 옮기는 3가지 방법",
    summary: "직접 타이핑·타이핑 외주(문제당 400~1,300원)·변환 프로그램을 비용·시간·품질로 비교하고, 문제 수별 계산기로 내 경우를 따져 봅니다.",
    date: "2026-10-14",
    thumb: { img: "/articles/exam-3ways-thumb.webp", alt: "시험지를 한글 문서로 옮기는 세 가지 길 — 스캔·외주·직접 타이핑" },
    thumbTone: "emerald",
  },
  {
    href: "/help/hwp-equation",
    published: "2026-09-25",
    ogImage: "/articles/eq-dict-og.jpg",
    category: "hwp",
    title: "한글(HWP) 수식 입력 방법 — 명령어 69개·단축키 총정리",
    summary: "수식 편집기 여는 법부터 분수·극한·적분·집합·경우의 수까지, 복사 버튼으로 바로 붙여 넣는 명령어 사전.",
    date: "2026-10-14",
    thumb: { img: "/articles/eq-dict-thumb.webp", alt: "마스코트가 수학 기호 키보드 옆에서 수식 문서를 소개하는 그림" },
    thumbTone: "violet",
  },
  {
    href: "/help/latex-to-hwp",
    published: "2026-10-14",
    category: "tool",
    title: "ChatGPT 수식을 한글 수식으로 — 무료 변환기",
    summary: "ChatGPT 답변을 붙여 넣으면 \\frac 같은 LaTeX 수식만 골라 한글 수식 명령어로 바꿔 줍니다. 로그인 없이 무료.",
    date: "2026-10-14",
    thumb: { text: "\\frac{a}{b}  →  {a} over {b}" },
    thumbTone: "sky",
  },
  {
    href: "/help/hwp-launch",
    published: "2026-09-29",
    ogImage: "/articles/hwp-launch-og.jpg",
    category: "app",
    title: "한글 실행·응답 오류 해결 가이드",
    summary: "변환 중 '한글이 응답하지 않아' 문서를 만들지 못했을 때, 인식 결과를 살려 문서를 다시 만드는 방법.",
    date: "2026-10-01",
    thumb: { img: "/articles/hwp-launch-thumb.webp", alt: "멈춘 노트북 화면 옆에서 새로고침과 렌치로 해결하려는 마스코트" },
    thumbTone: "amber",
  },
  {
    href: "/help/hwp-repair",
    published: "2026-07-13",
    ogImage: "/articles/hwp-repair-og.jpg",
    category: "app",
    title: "한글(한컴오피스) 연결 오류 해결 가이드",
    summary: "'한글 설치가 손상되어 연결할 수 없습니다' 오류가 뜰 때 한컴오피스 복구 설치로 해결하는 방법.",
    date: "2026-07-13",
    thumb: { img: "/articles/hwp-repair-thumb.webp", alt: "공구 상자와 렌치로 컴퓨터를 고치고 완료 표시를 받은 마스코트" },
    thumbTone: "rose",
  },
];

export const SITE_URL = "https://mathocr.ai.kr";
export const DEFAULT_OG_IMAGE = "/og-image.jpg";

export function getArticle(href: string): Article {
  const a = ARTICLES.find((x) => x.href === href);
  if (!a) throw new Error(`articles.ts 에 없는 글: ${href}`);
  return a;
}

export function categoryLabel(id: ArticleCategory): string {
  return ARTICLE_CATEGORIES.find((c) => c.id === id)?.label ?? "";
}

/** 글 페이지 metadata 에 펼쳐 넣는 공유 미리보기(Open Graph·Twitter) — 없으면 홈 정보가 그대로 상속된다. */
export function articleSeoMetadata(href: string) {
  const a = getArticle(href);
  const image = { url: `${SITE_URL}${a.ogImage ?? DEFAULT_OG_IMAGE}`, width: 1200, height: a.ogImage ? 675 : 630 };
  return {
    openGraph: {
      type: "article" as const,
      locale: "ko_KR",
      url: `${SITE_URL}${a.href}`,
      siteName: "AI MathOCR",
      title: a.title,
      description: a.summary,
      publishedTime: a.published,
      modifiedTime: a.date,
      images: [image],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: a.title,
      description: a.summary,
      images: [image.url],
    },
  };
}
