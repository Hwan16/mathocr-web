"use client";

import { useState } from "react";

// 만료 임박 크레딧 × 마케팅 수신 미동의 사용자에게 1회 보여주는 동의 권유 배너.
// 화면 내 권유는 정보통신망법 §50의 '전송'이 아니어서 사전동의 규제 대상이 아님
// (KISA 안내서 — 단 메일·앱푸시로 권유하는 것은 규제 대상이므로 금지).
// 문구 규칙: "광고성" 명칭 필수, 확정 시점("7일 전") 금지, 압박형 표현 금지.
// 또한 "동의해야 만료 알림이 온다"는 식의 서술 금지(2026-07-22) — 유료 결제 이력이
// 있는 계정은 미동의 상태에서도 expiry-reminder의 중립형 만료 안내를 이미 받는다.
// 같은 이유로 만료 알림 자체를 권유 대상으로 서술하지 않는다 — 유료 이력 계정에는
// 아직 못 받는 것이 아니라 이미 받고 있는 안내라 방향이 반대인 제안이 된다.
// 권유는 "할인·혜택 소식을 메일로 받기"라는 수신 범위로만 표현한다(잔액 카드의
// "할인·혜택 메일 꺼짐", 계정 설정 토글 "할인·혜택 소식 메일 받기"와 같은 기준).
// 단 헤드라인의 만료 사실("크레딧 N개가 O월 O일에 사라져요")은 모든 계정에 참이고
// 동의 동기의 핵심이므로 유지한다.
// 닫으면 같은 만료 이벤트(expires_at 기준)에는 다시 노출하지 않는다 —
// 새 크레딧 지급으로 만료일이 바뀌면 한 번 더 노출.
const DISMISS_KEY = "mathocr_expiry_optin_dismissed";

export default function ExpiryConsentBanner({
  credits,
  expiresAt,
  onConsented,
}: {
  credits: number;
  expiresAt: string;
  onConsented: () => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "hidden">(
    () => {
      try {
        return localStorage.getItem(DISMISS_KEY) === expiresAt
          ? "hidden"
          : "idle";
      } catch {
        return "idle";
      }
    }
  );
  const [error, setError] = useState("");

  const expiryLabel = new Date(expiresAt).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, expiresAt);
    } catch {
      // 저장 실패 시에도 이번 화면에서는 숨긴다
    }
    setState("hidden");
  }

  async function handleConsent() {
    if (state === "saving") return;
    setState("saving");
    setError("");
    try {
      const res = await fetch("/api/account/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opt_in: true }),
      });
      if (res.ok) {
        setState("done");
        // 성공 확인을 잠시 보여준 뒤 프로필을 새로고침 — 배너가 즉시 사라지며
        // 성공 메시지를 못 읽는 것을 방지
        setTimeout(() => onConsented(), 2600);
      } else {
        const result = await res.json().catch(() => ({}));
        setError(result.error ?? "설정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setState("idle");
      }
    } catch {
      setError("설정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setState("idle");
    }
  }

  if (state === "hidden") return null;

  if (state === "done") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base">
          ✓
        </span>
        <p className="leading-relaxed">
          <strong className="font-semibold">
            할인·혜택 소식을 메일로 받기로 하셨어요.
          </strong>{" "}
          아래 계정 설정에서 언제든 끌 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base">
            ⏰
          </span>
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-amber-900">
              크레딧 {credits}개가 {expiryLabel}에 사라져요
            </p>
            <p className="mt-0.5 text-zinc-600">
              할인·혜택 소식을 메일로 받아보시겠어요?{" "}
              <span className="text-zinc-400">
                광고성 정보 수신 동의(이메일)이며 언제든 끌 수 있어요.
              </span>
            </p>
            {error && <p className="mt-1 text-xs text-red-600">✗ {error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pl-11 sm:pl-0">
          <button
            type="button"
            onClick={handleConsent}
            disabled={state === "saving"}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {state === "saving" ? "설정 중..." : "메일로 받기"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-600"
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
