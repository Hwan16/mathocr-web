"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// 자료실 카드 목록 + 분류 탭. 첫 화면은 서버가 '전체'로 그려 두고(검색 노출용),
// 주소의 ?c=hwp 같은 분류는 화면이 뜬 뒤 적용한다.

export type GuideCard = {
  href: string;
  category: string;
  categoryLabel: string;
  title: string;
  summary: string;
  date: string;
  tone: "violet" | "sky" | "amber" | "rose" | "emerald";
  thumbHtml: string | null; // 서버에서 만든 MathML
  thumbText: string | null;
  thumbImg: { src: string; alt: string } | null;
};

const TONE: Record<GuideCard["tone"], string> = {
  violet: "bg-violet-50 text-violet-900",
  sky: "bg-sky-50 text-sky-900",
  amber: "bg-amber-50 text-amber-900",
  rose: "bg-rose-50 text-rose-900",
  emerald: "bg-emerald-50 text-emerald-900",
};

export default function GuideList({
  cards,
  categories,
}: {
  cards: GuideCard[];
  categories: { id: string; label: string }[];
}) {
  const [active, setActive] = useState("all");

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c && categories.some((x) => x.id === c)) setActive(c);
  }, [categories]);

  function pick(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === "all") url.searchParams.delete("c");
    else url.searchParams.set("c", id);
    window.history.replaceState(null, "", url);
  }

  const shown = active === "all" ? cards : cards.filter((c) => c.category === active);

  const featured = active === "all" ? (shown[0] ?? null) : null;
  const rest = featured ? shown.slice(1) : shown;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-8" role="tablist" aria-label="자료 분류">
        {[{ id: "all", label: "전체" }, ...categories].map((c) => {
          const on = active === c.id;
          const count = c.id === "all" ? cards.length : cards.filter((x) => x.category === c.id).length;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(c.id)}
              className={`text-[13px] px-3.5 py-1.5 rounded-full border transition-colors ${
                on
                  ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {c.label} <span className={on ? "text-blue-200/70" : "text-zinc-400"}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* '전체'일 때 가장 최근 글 하나는 크게 — 목록이 같은 크기 카드만 반복되지 않게 */}
      {featured && (
        <a
          href={featured.href}
          onClick={() => trackEvent("nav_click", { label: `guide_card:${featured.href}` })}
          className="group grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5 md:gap-8 items-center mb-12 pb-12 border-b border-zinc-200"
        >
          <Thumb card={featured} className="aspect-[16/9] rounded-xl" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-[var(--accent)] mb-2">
              {featured.categoryLabel} <span className="text-zinc-300 font-normal mx-1">·</span>
              <span className="text-zinc-400 font-normal">새 글</span>
            </p>
            <p className="text-[22px] md:text-[26px] font-bold text-zinc-900 leading-snug tracking-tight break-keep group-hover:underline underline-offset-4">
              {featured.title}
            </p>
            <p className="text-[15px] text-zinc-600 leading-relaxed mt-3 break-keep">{featured.summary}</p>
            <p className="text-[12.5px] text-zinc-400 mt-4">{featured.date.replace(/-/g, ". ")}.</p>
          </div>
        </a>
      )}

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
        {rest.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              onClick={() => trackEvent("nav_click", { label: `guide_card:${c.href}` })}
              className="group block"
            >
              <Thumb card={c} className="aspect-[16/9] rounded-lg" />
              <p className="text-[12px] font-semibold text-[var(--accent)] mt-4 mb-1.5">{c.categoryLabel}</p>
              <p className="text-[16.5px] font-bold text-zinc-900 leading-snug tracking-tight break-keep group-hover:underline underline-offset-4">
                {c.title}
              </p>
              <p className="text-[13.5px] text-zinc-500 leading-relaxed mt-2 break-keep line-clamp-2">{c.summary}</p>
              <p className="text-[12px] text-zinc-400 mt-2.5">{c.date.replace(/-/g, ". ")}.</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 대표 그림 — 이미지가 없으면 대표 수식이나 짧은 글자를 색 바탕에 그린다. */
function Thumb({ card: c, className }: { card: GuideCard; className: string }) {
  const frame = `block w-full overflow-hidden border border-zinc-200 ${className}`;
  if (c.thumbImg) {
    return (
      <img
        src={c.thumbImg.src}
        alt={c.thumbImg.alt}
        width={720}
        height={405}
        loading="lazy"
        className={`${frame} object-cover bg-white transition-transform`}
      />
    );
  }
  return (
    <div className={`${frame} flex items-center justify-center px-5 ${TONE[c.tone]}`} aria-hidden="true">
      {c.thumbHtml ? (
        <span className="guide-thumb" dangerouslySetInnerHTML={{ __html: c.thumbHtml }} />
      ) : (
        <span className="text-[15px] font-semibold tracking-tight text-center font-mono">{c.thumbText}</span>
      )}
    </div>
  );
}
