import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { categoryLabel, getArticle } from "@/lib/articles";
import TrackedLink from "@/components/TrackedLink";
import ArticleToc from "./ArticleToc";
import { PromoRail } from "./PromoCards";
import ArticleJsonLd from "./ArticleJsonLd";

// 자료실 글 공통 틀 — 맨 위 얇은 띠(따라 내려오지 않음) · 사이트 메뉴 · (있으면) 남색 대표 이미지 띠 ·
// PC(xl 이상)에서는 왼쪽 목차 / 가운데 본문 / 오른쪽 기능 카드(둘 다 스크롤을 따라 내려옴).
// 자료실은 잉크 남색 테마(.guide-theme, globals.css) — 홈·앱의 보라와 구분한다(2026-10-30).
// location 은 클릭 기록(cta_click location)의 접두어 — 글마다 다르게 준다.

export function ArticleTopBar({ location }: { location: string }) {
  return (
    <div className="bg-zinc-900 text-white text-[12.5px] md:text-[13px]">
      <div className="max-w-[1240px] mx-auto px-4 py-2 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-center">
        <span className="text-zinc-300">
          수학 시험지 PDF·사진을 <strong className="text-white font-semibold">편집 가능한 한글 수식 문서</strong>로
          자동 변환
        </span>
        <TrackedLink
          href="/auth/signup"
          label="sign_up_free_15"
          location={`${location}_topbar`}
          className="font-semibold text-[#bfdbfe] hover:text-white whitespace-nowrap"
        >
          가입하면 {SIGNUP_FREE_CREDITS}문제 무료 →
        </TrackedLink>
      </div>
    </div>
  );
}

export function ArticleHeader({ location }: { location: string }) {
  return (
    <header className="bg-white border-b border-zinc-200">
      <div className="max-w-[1240px] mx-auto px-4 h-14 flex items-center gap-4">
        <a href="/" className="flex items-center gap-2 shrink-0">
          <img src="/mathocr-icon.png" alt="AI MathOCR" width={28} height={28} />
          <span className="font-bold tracking-tight">
            {/* 로고 보라는 테마와 상관없이 고정 */}
            AI Math<span className="text-[#7c3aed]">OCR</span>
          </span>
        </a>
        <nav className="flex items-center gap-4 text-sm text-zinc-600 ml-2 overflow-x-auto">
          <a href="/guides" className="font-semibold text-zinc-900 whitespace-nowrap">
            자료실
          </a>
          <a href="/#guide" className="hidden sm:inline hover:text-zinc-900 whitespace-nowrap">
            사용법
          </a>
          <a href="/#pricing" className="hidden sm:inline hover:text-zinc-900 whitespace-nowrap">
            가격
          </a>
          <a href="/#download" className="hidden md:inline hover:text-zinc-900 whitespace-nowrap">
            다운로드
          </a>
        </nav>
        <TrackedLink
          href="/auth/signup"
          label="sign_up_free_15"
          location={`${location}_header`}
          className="btn-primary ml-auto text-[13px] px-3.5 py-2 rounded-lg whitespace-nowrap"
        >
          {SIGNUP_FREE_CREDITS}문제 무료
        </TrackedLink>
      </div>
    </header>
  );
}

export type ArticleHero = {
  lead: string; // 제목 아래 한두 문장
  img: string; // 오른쪽(폰은 아래)에 걸치는 실물 그림 — 위쪽이 보이게 잘린다
  alt: string;
  w: number;
  h: number;
};

/** 글 맨 위 남색 띠 — 경로·분류·제목·요약 + 실물 그림이 띠 아래로 걸쳐 잘린다. */
function HeroBand({ href, hero }: { href: string; hero: ArticleHero }) {
  const article = getArticle(href);
  return (
    <section className="bg-[var(--ink)] text-white overflow-hidden">
      <div className="max-w-[1240px] mx-auto px-4 pt-8 md:pt-12 grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-8 md:gap-12 items-end">
        <div className="pb-2 md:pb-14 min-w-0">
          <nav aria-label="경로" className="text-[12.5px] text-blue-200/80 mb-6">
            <a href="/guides" className="hover:text-white">
              자료실
            </a>
            <span className="mx-1.5 text-blue-200/40">›</span>
            <a href={`/guides?c=${article.category}`} className="hover:text-white">
              {categoryLabel(article.category)}
            </a>
          </nav>
          <h1 className="text-[26px] leading-[1.3] md:text-[38px] md:leading-[1.25] font-bold tracking-tight break-keep">
            {article.title}
          </h1>
          <p className="text-blue-100/85 text-[15px] md:text-[16.5px] leading-relaxed mt-4 max-w-[34em] break-keep">
            {hero.lead}
          </p>
          <p className="text-[12.5px] text-blue-200/70 mt-5">
            {categoryLabel(article.category)} · {article.date.replace(/-/g, ". ")}.
          </p>
        </div>
        <div className="min-w-0 h-[150px] md:h-[360px] overflow-hidden">
          <img
            src={hero.img}
            alt={hero.alt}
            width={hero.w}
            height={hero.h}
            className="block w-full h-auto rounded-t-lg bg-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)]"
          />
        </div>
      </div>
    </section>
  );
}

export default function ArticleShell({
  href,
  location,
  toc,
  hero,
  children,
}: {
  href: string; // lib/articles.ts 의 글 주소 — 분류·구조화 데이터를 여기서 찾는다
  location: string;
  toc: { href: string; label: string }[];
  hero?: ArticleHero; // 주면 제목을 띠에서 그린다(글 본문에 h1 을 따로 두지 않는다)
  children: React.ReactNode;
}) {
  const article = getArticle(href);
  const category = article.category;
  return (
    <div className={`guide-theme min-h-screen ${hero ? "bg-white" : "bg-zinc-50"}`}>
      <ArticleJsonLd href={href} />
      <ArticleTopBar location={location} />
      <ArticleHeader location={location} />
      {hero && <HeroBand href={href} hero={hero} />}
      <div
        className={`max-w-[1240px] mx-auto px-4 ${hero ? "py-10 md:py-14" : "py-8 md:py-10"} xl:grid xl:grid-cols-[190px_minmax(0,720px)_250px] xl:gap-8 xl:justify-center`}
      >
        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <ArticleToc items={toc} />
          </div>
        </aside>
        <div className="w-full max-w-3xl mx-auto xl:max-w-none xl:mx-0 min-w-0">
          {!hero && (
            <nav aria-label="경로" className="text-[12.5px] text-zinc-500 mb-5">
              <a href="/guides" className="hover:text-zinc-900">
                자료실
              </a>
              <span className="mx-1.5 text-zinc-300">›</span>
              <a href={`/guides?c=${category}`} className="hover:text-zinc-900">
                {categoryLabel(category)}
              </a>
            </nav>
          )}
          {children}
          <div className="mt-12 text-center">
            <a href="/guides" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
              ← 자료실의 다른 글 보기
            </a>
          </div>
        </div>
        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <PromoRail location={location} />
          </div>
        </aside>
      </div>
    </div>
  );
}
