"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// ── 얼리버드 안내 팝업 (홈페이지 진입 시) ──
// 결제 기능 오픈 후에는 POPUP_ENABLED 를 false 로 바꾸면 팝업이 사라진다.
const POPUP_ENABLED = true;
const INSTAGRAM_URL = "https://www.instagram.com/aimathocr.official/";
// [오늘 하루/일주일간 보지 않기]로 숨긴 만료 시각(epoch ms)을 브라우저에 저장
const STORAGE_KEY = "mathocr_earlybird_popup_hide_until";
const DAY_MS = 24 * 60 * 60 * 1000;

export default function EarlyBirdPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!POPUP_ENABLED) return;
    try {
      const hideUntil = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
      if (Number.isFinite(hideUntil) && Date.now() < hideUntil) return;
    } catch {
      // localStorage 접근 불가(시크릿 모드 등)여도 팝업은 띄운다
    }
    const t = setTimeout(() => {
      setVisible(true);
      trackEvent("earlybird_popup_shown");
    }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  function hideFor(ms: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + ms));
    } catch {
      // 저장 실패해도 이번 세션에서는 닫는다
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="결제 기능 오픈 예정 · 얼리버드 안내"
    >
      {/* 배경 클릭 = 이번만 닫기 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setVisible(false)}
      />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors"
          aria-label="닫기"
        >
          ✕
        </button>

        {/* 헤더 */}
        <div className="bg-gradient-to-br from-violet-600 to-fuchsia-500 px-7 pt-7 pb-6 text-white">
          <div className="inline-block text-[11px] font-semibold tracking-widest bg-white/20 rounded-full px-3 py-1 mb-3">
            EARLY BIRD
          </div>
          <h2 className="text-2xl font-bold leading-snug">
            결제 기능, 7월 중 오픈합니다
          </h2>
        </div>

        {/* 본문 */}
        <div className="px-7 py-6">
          <p className="text-sm text-zinc-600 leading-relaxed">
            현재 결제 기능을 준비하고 있어요. 인스타그램{" "}
            <span className="font-semibold text-zinc-800">
              @aimathocr.official
            </span>
            에서 <span className="font-semibold text-zinc-800">얼리버드 신청</span>을
            해주시면,
          </p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li className="flex items-start gap-2">
              <span className="text-[var(--accent)] mt-0.5">✓</span>
              오픈 소식을 <b>메일로</b> 가장 먼저 알려드리고
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--accent)] mt-0.5">✓</span>
              얼리버드 혜택으로 <b>크레딧</b>을 드려요
            </li>
          </ul>

          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("earlybird_popup_cta_click")}
            className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold py-3 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="4.5" />
              <circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            인스타그램에서 얼리버드 신청하기
          </a>
        </div>

        {/* 하단: 보지 않기 옵션 */}
        <div className="border-t border-zinc-100 px-7 py-3 flex items-center justify-between text-xs text-zinc-400">
          <button
            type="button"
            onClick={() => hideFor(DAY_MS)}
            className="hover:text-zinc-600 transition-colors py-1"
          >
            오늘 하루 보지 않기
          </button>
          <span className="text-zinc-200">|</span>
          <button
            type="button"
            onClick={() => hideFor(7 * DAY_MS)}
            className="hover:text-zinc-600 transition-colors py-1"
          >
            일주일간 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
