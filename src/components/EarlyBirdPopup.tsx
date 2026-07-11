"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// ── 얼리버드 안내 팝업 (홈페이지 진입 시) ──
// 2026-07-11 가입 직결 개편(사용자 결정): 신청제 폐기 — 팝업 CTA가 가입 페이지
// (?promo=earlybird)로 직행하고, 가입 즉시 30크레딧이 지급된다(선착순은 코드의
// max_uses로 제어). 숨김 옵션은 "오늘 하루"만 둔다 (장기 숨김은 기회 노출 손해).
// 얼리버드 프로모션을 끝낼 때: POPUP_ENABLED=false + 관리자에서 earlybird 코드 비활성.
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
      aria-label="얼리버드 혜택 — 가입 즉시 30문제 무료"
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

        {/* 헤더: 마스코트 — contain으로 전신 노출, 배경은 이미지 자체 그라데이션(라벤더→흰색)과 맞춤 */}
        <div className="relative bg-gradient-to-b from-[#eae1fc] to-white">
          <img
            src="/earlybird-mascot.webp"
            alt="AI MathOCR 마스코트"
            className="w-full h-56 object-contain"
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
            <span className="text-violet-700">30문제 무료!</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            <span className="font-semibold text-zinc-800">AI MathOCR</span>{" "}
            <span className="font-semibold text-violet-700">
              7월 중 정식 Open!
            </span>
            <br />
            <span className="text-zinc-600">
              얼리버드 혜택 — 회원가입만 해도 30문제 크레딧이 즉시 지급돼요.
            </span>
          </p>

          <a
            href="/auth/signup?promo=earlybird"
            onClick={() => trackEvent("earlybird_popup_cta_click")}
            className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold py-3 transition-colors"
          >
            가입하고 30문제 받기
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
