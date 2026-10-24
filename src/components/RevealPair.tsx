"use client";

import { useEffect, useRef, type ReactNode } from "react";

// 전/후 비교 한 쌍(원본 figure, 변환된 HWP figure). 원본은 그대로 두고,
// 변환된 HWP가 화면에 들어오면 뒤이어 나타난다(스타일은 globals.css의 [data-reveal]).
// 서버 렌더는 항상 보이는 상태 — 처음부터 화면 안에 있거나 '움직임 줄이기'를 켠 사람에겐 숨기지 않는다.
export default function RevealPair({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pair = ref.current;
    const after = pair?.children[1];
    if (!pair || !after || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (after.getBoundingClientRect().top < window.innerHeight) return;

    pair.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        pair.dataset.reveal = "shown";
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(after);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
