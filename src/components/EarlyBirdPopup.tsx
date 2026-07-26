"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import AutoDetectShowcase from "@/components/AutoDetectShowcase";

// ── 홈 진입 팝업: 얼리버드 안내 → (종료 후) 신규 기능 안내 ──
// 2026-07-11 가입 직결 개편(사용자 결정): 신청제 폐기 — 팝업 CTA가 가입 페이지
// (?promo=earlybird)로 직행한다. 선착순은 코드의 max_uses로 제어.
// 2026-07-12 지급 시점 변경(LA-02): 지급은 "이메일 인증 완료 후 첫 로그인"으로
// 이동 — 미인증 가입이 선착순을 소진하지 못하게 하고, 문구도 이에 맞춤.
// 2026-07-12 소진 자동 숨김(Codex 리뷰): 표시 전에 validate-promo로 코드 상태를
// 확인해 소진·비활성이면 얼리버드는 띄우지 않는다 (표시광고 리스크 차단).
// 2026-07-26 신규 기능 팝업(사용자 결정): 얼리버드 코드가 비활성/소진으로
// 확인되면(valid=false) 그 자리에 AI 자동 인식(v2.2.0) 안내를 대신 띄운다.
// 확인 자체가 실패하면 아무것도 띄우지 않는다 (fail-closed 유지).
// 얼리버드 프로모션을 끝낼 때: 관리자에서 earlybird 코드 비활성 → 이 팝업이
// 자동으로 신규 기능 안내로 전환된다 (배포 불필요).
const POPUP_ENABLED = true;
const PROMO_CODE = "earlybird";
// [보지 않기]로 숨긴 만료 시각(epoch ms)을 브라우저에 저장 — 모드별 분리
const EARLYBIRD_STORAGE_KEY = "mathocr_earlybird_popup_hide_until";
const FEATURE_STORAGE_KEY = "mathocr_autodetect_popup_hide_until";
const DAY_MS = 24 * 60 * 60 * 1000;
// 기능 안내는 혜택 광고가 아니라서 길게 숨겨도 손해가 작다 — 30일
const FEATURE_HIDE_MS = 30 * DAY_MS;

type PopupMode = "earlybird" | "feature";

function isHidden(key: string): boolean {
  try {
    const hideUntil = Number(localStorage.getItem(key) ?? 0);
    return Number.isFinite(hideUntil) && Date.now() < hideUntil;
  } catch {
    return false; // localStorage 접근 불가(시크릿 모드 등)는 노출 판단에 영향 없음
  }
}

export default function EarlyBirdPopup() {
  const [mode, setMode] = useState<PopupMode | null>(null);

  useEffect(() => {
    if (!POPUP_ENABLED) return;
    // 미리보기: ?preview_popup=feature — 얼리버드를 끄지 않고도 종료 후
    // 모습(신규 기능 팝업)을 확인할 수 있다 (숨김 저장·추적 이벤트 없음)
    if (
      new URLSearchParams(window.location.search).get("preview_popup") ===
      "feature"
    ) {
      const t = setTimeout(() => setMode("feature"), 300);
      return () => clearTimeout(t);
    }
    // 두 모드 모두 숨김 상태면 서버 확인도 불필요
    if (isHidden(EARLYBIRD_STORAGE_KEY) && isHidden(FEATURE_STORAGE_KEY)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // 코드가 아직 지급 가능한지 확인 → 가능하면 얼리버드, 종료됐으면 신규 기능
    fetch("/api/auth/validate-promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: PROMO_CODE }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (cancelled || !result) return;
        const nextMode: PopupMode = result.valid ? "earlybird" : "feature";
        const storageKey =
          nextMode === "earlybird" ? EARLYBIRD_STORAGE_KEY : FEATURE_STORAGE_KEY;
        if (isHidden(storageKey)) return;
        if (nextMode === "earlybird") {
          // 노출이 확정된 순간 마스코트를 선로딩 — 0.8초 대기 동안 받아 두면
          // 팝업이 뜰 때 이미지가 즉시 그려진다 (모바일 LCP가 이 이미지였음, LA-11)
          const preload = new window.Image();
          preload.src = "/earlybird-mascot.webp";
        }
        timer = setTimeout(() => {
          setMode(nextMode);
          trackEvent(
            nextMode === "earlybird"
              ? "earlybird_popup_shown"
              : "autodetect_popup_shown"
          );
        }, 800);
      })
      .catch(() => {
        // 확인 실패 → 미노출 (fail-closed)
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!mode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMode(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  function hideFor(key: string, ms: number) {
    try {
      localStorage.setItem(key, String(Date.now() + ms));
    } catch {
      // 저장 실패해도 이번 세션에서는 닫는다
    }
    setMode(null);
  }

  if (!mode) return null;

  if (mode === "feature") {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        aria-label="새 기능 — AI 자동 인식"
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setMode(null)} />

        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setMode(null)}
            className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-800 hover:bg-black/5 transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>

          {/* 헤더: 자동 인식 목업 (기능 섹션과 동일 비주얼) */}
          <div className="bg-gradient-to-b from-[#eae1fc] to-white px-6 pt-8 pb-2">
            <AutoDetectShowcase />
          </div>

          {/* 본문 */}
          <div className="px-7 pb-6 pt-4">
            <span className="inline-block text-[11px] font-bold tracking-widest text-violet-700 bg-violet-100 rounded-full px-3 py-1 mb-3">
              NEW · v2.2.0
            </span>
            <h2 className="text-2xl font-bold leading-snug text-zinc-900">
              박스는 이제 <span className="text-violet-700">AI가 먼저</span> 그려드려요
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              [✨ 자동 인식] 버튼 하나면 문제·그림 영역 초안이 자동으로
              그려집니다. 확인하며 다듬기만 하세요 — 크레딧 차감 없이 무료.
            </p>

            <a
              href="/auth/signup"
              onClick={() => trackEvent("autodetect_popup_cta_click")}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold py-3 transition-colors"
            >
              무료로 시작하기
            </a>
          </div>

          <div className="border-t border-zinc-100 px-7 py-3 text-center">
            <button
              type="button"
              onClick={() => hideFor(FEATURE_STORAGE_KEY, FEATURE_HIDE_MS)}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors py-1"
            >
              다시 보지 않기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="얼리버드 혜택 — 가입하고 이메일 인증하면 30문제 무료"
    >
      {/* 배경 클릭 = 이번만 닫기 */}
      <div className="absolute inset-0 bg-black/50" onClick={() => setMode(null)} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setMode(null)}
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
            width={800}
            height={758}
            fetchPriority="high"
            className="w-full h-56 object-contain"
          />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white" />
          {/* 2026-07-19 사용자 결정: 인원 수(200명)는 비노출 — "아직 200명도
              안 찼나?"로 읽히는 역효과 방지. 한정성("한정 인원")만 표기.
              선착순 캡 자체는 코드 max_uses로 계속 동작한다. */}
          <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-widest bg-violet-600 text-white rounded-full px-3 py-1 shadow-sm">
            EARLY BIRD · 한정 인원
          </span>
        </div>

        {/* 본문 */}
        <div className="px-7 pb-6 pt-1">
          <h2 className="text-2xl font-bold leading-snug text-zinc-900">
            AI MathOCR <span className="text-violet-700">정식 오픈!</span>
            <br />
            가입하고 인증만 하면{" "}
            <span className="text-violet-700">30문제 무료!</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            얼리버드 혜택 — 가입 후 이메일 인증을 마치면 30크레딧이 바로
            들어와요.
          </p>

          <a
            href="/auth/signup?promo=earlybird"
            onClick={() => trackEvent("earlybird_popup_cta_click")}
            className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold py-3 transition-colors"
          >
            가입하고 30크레딧 받기
          </a>

          {/* 혜택 조건 — CTA와 같은 화면에 상시 노출 (표시광고 중요정보 근접 표시).
              2026-07-16 사용자 요청으로 축소: 배지(한정 인원)·본문(인증 후
              지급)과 중복되는 항목과 크레딧 셈법은 빼고, 팝업 안 어디에도 없는
              제한 조건(사용기한·1인 1회)만 남긴다. 전체 조건은 가입 페이지
              혜택 배너에서 한 번 더 표시된다. "선착순"의 확정 시점은 인증 후
              첫 로그인의 지급 처리 순서이므로 특정 기준 시점을 단정하는
              표현은 쓰지 않는다 (Codex 리뷰 반영) */}
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400 text-center">
            지급 후 7일간 사용 · 1인 1회
          </p>
        </div>

        {/* 하단: 오늘 하루만 숨김 (장기 숨김 옵션은 두지 않는다) */}
        <div className="border-t border-zinc-100 px-7 py-3 text-center">
          <button
            type="button"
            onClick={() => hideFor(EARLYBIRD_STORAGE_KEY, DAY_MS)}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors py-1"
          >
            오늘 하루 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
