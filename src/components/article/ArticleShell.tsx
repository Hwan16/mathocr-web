import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "@/lib/articles";
import TrackedLink from "@/components/TrackedLink";
import ArticleToc from "./ArticleToc";
import { PromoRail } from "./PromoCards";

// 자료실 글 공통 틀 — 맨 위 얇은 띠(따라 내려오지 않음) · 사이트 메뉴 · 경로 표시 ·
// PC(xl 이상)에서는 왼쪽 목차 / 가운데 본문 / 오른쪽 기능 카드(둘 다 스크롤을 따라 내려옴).
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
          className="font-semibold text-[#c4b5fd] hover:text-white whitespace-nowrap"
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
            AI Math<span className="text-[var(--accent)]">OCR</span>
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

export default function ArticleShell({
  location,
  category,
  toc,
  children,
}: {
  location: string;
  category: ArticleCategory;
  toc: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const categoryLabel = ARTICLE_CATEGORIES.find((c) => c.id === category)?.label ?? "";
  return (
    <div className="min-h-screen bg-zinc-50">
      <ArticleTopBar location={location} />
      <ArticleHeader location={location} />
      <div className="max-w-[1240px] mx-auto px-4 py-8 md:py-10 xl:grid xl:grid-cols-[190px_minmax(0,720px)_250px] xl:gap-8 xl:justify-center">
        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <ArticleToc items={toc} />
          </div>
        </aside>
        <div className="w-full max-w-3xl mx-auto xl:max-w-none xl:mx-0 min-w-0">
          <nav aria-label="경로" className="text-[12.5px] text-zinc-500 mb-5">
            <a href="/guides" className="hover:text-zinc-900">
              자료실
            </a>
            <span className="mx-1.5 text-zinc-300">›</span>
            <a href={`/guides?c=${category}`} className="hover:text-zinc-900">
              {categoryLabel}
            </a>
          </nav>
          {children}
          <div className="mt-8 text-center">
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
