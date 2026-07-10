"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// ── 얼리버드 안내 팝업 (홈페이지 진입 시) ──
// 2026-07-11 개편: 인스타 구글폼 경로 폐기 → 사이트 안 전용 가입 페이지(/earlybird)로
// 직행. 혜택: 가입 즉시 총 30문제(기본 5 + 보너스 25, 유효 30일), 선착순 200명.
// 숨김 옵션은 "오늘 하루"만 둔다 (사용자 결정 — 장기 숨김은 기회 노출 손해).
// 결제 기능 오픈 후에는 POPUP_ENABLED 를 false 로 바꾸고 earlybird 코드를 비활성화.
const POPUP_ENABLED = true;
// [오늘 하루 보지 않기]로 숨긴 만료 시각(epoch ms)을 브라우저에 저장
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

  function hideForToday() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + DAY_MS));
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
      aria-label="얼리버드 — 지금 가입하면 30문제 무료"
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
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-800 hover:bg-black/5 transition-colors"
          aria-label="닫기"
        >
          ✕
        </button>

        {/* 헤더: 마스코트 (원본 배경과 같은 라벤더 → 흰색 페이드) */}
        <div className="relative bg-[#eae1fc]">
          <img
            src="/earlybird-mascot.webp"
            alt="AI MathOCR 마스코트"
            className="w-full h-48 object-cover object-top"
          />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white" />
          <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-widest bg-violet-600 text-white rounded-full px-3 py-1 shadow-sm">
            EARLY BIRD · 선착순 200명
          </span>
        </div>

        {/* 본문 */}
        <div className="px-7 pb-6 pt-1">
          <h2 className="text-2xl font-bold leading-snug text-zinc-900">
            지금 가입하면{" "}
            <span className="text-violet-700">30문제 무료</span>
          </h2>
          <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
            정식 오픈 전 얼리버드 — 시험지 한 장을 통째로 한글(HWP)로 변환해
            보세요.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li className="flex items-start gap-2">
              <span className="text-[var(--accent)] mt-0.5">✓</span>
              가입 즉시 총 <b>30문제</b> (기본 5 + 보너스 25 · 유효기간 30일)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--accent)] mt-0.5">✓</span>
              정식 오픈 소식을 <b>메일로</b> 가장 먼저 안내
            </li>
          </ul>

          <a
            href="/earlybird"
            onClick={() => trackEvent("earlybird_popup_cta_click")}
            className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold py-3 transition-colors"
          >
            선착순 30문제 받고 시작하기
          </a>
        </div>

        {/* 하단: 오늘 하루만 숨김 (장기 숨김 옵션은 두지 않는다) */}
        <div className="border-t border-zinc-100 px-7 py-3 text-center">
          <button
            type="button"
            onClick={hideForToday}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors py-1"
          >
            오늘 하루 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
