"use client";

import { useEffect, useState } from "react";

// 자료실 글 왼쪽 목차 — 지금 읽는 구역을 굵게 표시한다(PC xl 이상에서만 보임).
export default function ArticleToc({ items }: { items: { href: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.href ?? null);

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.href.replace(/^#/, "")))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = els.find((el) => visible.get(el.id));
        if (first) setActive(`#${first.id}`);
      },
      { rootMargin: "-15% 0px -60% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="목차">
      <p className="text-[11px] font-semibold text-zinc-400 tracking-wide mb-2 px-2">목차</p>
      <ol className="space-y-0.5 text-[13px]">
        {items.map((i) => {
          const on = active === i.href;
          return (
            <li key={i.href}>
              <a
                href={i.href}
                className={`block px-2 py-1.5 rounded-md border-l-2 transition-colors ${
                  on
                    ? "border-[var(--accent)] text-zinc-900 font-semibold bg-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {i.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
