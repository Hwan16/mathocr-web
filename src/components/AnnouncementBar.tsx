"use client";

import { useEffect, useRef, useState } from "react";

// 상단 띠 배너 — 새 기능 홍보용. 본문을 가리지 않는 한 줄이라 검색엔진의 '방해 요소' 판정을
// 피한다(전체 화면 팝업 금지, 2026-10-09 사용자 결정). 닫으면 같은 캠페인 키로는 다시 띄우지
// 않는다. 캠페인을 바꿀 때는 CAMPAIGN 키와 문구만 바꾼다.
const CAMPAIGN = "ai-solution-launch-2026-10";
const DISMISS_KEY = "mathocr_announcement_dismissed";

export default function AnnouncementBar() {
  // 첫 렌더에서는 보이고(서버 HTML과 동일), 마운트 후 닫은 기록이 있으면 접는다.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === CAMPAIGN) setVisible(false);
    } catch {
      /* 사생활 보호 모드 등 — 그냥 보여 준다 */
    }
  }, []);

  // 앵커 착지 보정: 배너가 보이는 동안 그 높이를 html의 --announcement-h 로 알린다(globals.css scroll-padding-top).
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty("--announcement-h", `${visible && ref.current ? ref.current.offsetHeight : 0}px`);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, CAMPAIGN);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label="새 기능 안내"
      className="relative z-[60] bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#8B5CF6] text-white"
    >
      <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-12 min-h-11 py-2 flex items-center gap-3">
        <a
          href="#ai-solution"
          className="group flex-1 min-w-0 flex flex-wrap items-center gap-x-2.5 md:gap-x-3 gap-y-1 text-[12px] md:text-sm"
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 ring-1 ring-white/30 px-2.5 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap">
            💡 NEW
          </span>
          <span className="font-semibold whitespace-nowrap">AI 해설 생성 기능 출시</span>
          {/* 폰에서는 한 줄로: 긴 설명 대신 가격만 */}
          <span className="hidden md:inline text-white/85">
            해설 PDF가 없어도 프론티어 AI가 문제별 해설을 만들어 드려요 · 출시 기념 문제당 2크레딧
          </span>
          <span className="md:hidden text-white/85 whitespace-nowrap">문제당 2크레딧</span>
          <span className="hidden lg:inline-flex items-center gap-1 font-semibold underline-offset-4 group-hover:underline whitespace-nowrap">
            자세히 보기
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="안내 닫기"
          className="shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
