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

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-6" role="tablist" aria-label="자료 분류">
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
              className={`text-[13px] px-3 py-1.5 rounded-full border transition-colors ${
                on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {c.label} <span className={on ? "text-zinc-400" : "text-zinc-400"}>{count}</span>
            </button>
          );
        })}
      </div>

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {shown.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              onClick={() => trackEvent("nav_click", { label: `guide_card:${c.href}` })}
              className="group block h-full rounded-xl border border-zinc-200 bg-white overflow-hidden hover:border-zinc-300 hover:shadow-sm transition"
            >
              {c.thumbImg ? (
                <img
                  src={c.thumbImg.src}
                  alt={c.thumbImg.alt}
                  width={720}
                  height={405}
                  loading="lazy"
                  className="block w-full h-36 object-cover bg-white border-b border-zinc-100"
                />
              ) : (
              <div className={`h-36 flex items-center justify-center px-5 ${TONE[c.tone]}`} aria-hidden="true">
                {c.thumbHtml ? (
                  <span className="guide-thumb" dangerouslySetInnerHTML={{ __html: c.thumbHtml }} />
                ) : (
                  <span className="text-[15px] font-semibold tracking-tight text-center font-mono">{c.thumbText}</span>
                )}
              </div>
              )}
              <div className="p-4">
                <p className="text-[11px] font-semibold text-[var(--accent)] mb-1.5 tracking-wide">
                  {c.categoryLabel.toUpperCase()}
                </p>
                <p className="text-[15px] font-semibold text-zinc-900 leading-snug group-hover:underline">{c.title}</p>
                <p className="text-[13px] text-zinc-500 leading-relaxed mt-1.5">{c.summary}</p>
                <p className="text-[12px] text-zinc-400 mt-3">{c.date.replace(/-/g, ". ")}.</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
