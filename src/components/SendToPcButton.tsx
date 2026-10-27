"use client";

// 폰 → PC 이어 주기 버튼 (docs/MOBILE_TO_PC_PLAN_2026-10-28.md M1)
// 배경: 폰 방문자는 설치할 수 없는데 'Windows용 다운로드'를 누르면 "모바일에서는
// 설치할 수 없습니다"로 끝나는 막다른 길이었다. 휴대폰 공유창(navigator.share)으로
// 카톡 '나와의 채팅'·메일에 주소를 보내 두게 한다 — 카카오 앱 키·가입 불필요.
// 공유창이 없는 브라우저(일부 앱 안 브라우저)는 주소 복사로 대신하고,
// 그것도 막히면 주소를 그대로 보여 줘 길게 눌러 복사하게 한다.
//
// 측정: mobile_share_click(공유창 열기) · mobile_share_copy(복사 대체).
// 보내는 주소에 utm_source=mobile_share 를 붙여 PC에서 열린 방문·가입을 센다.
// 폰에서 처음 들어온 채널(utm_source)은 utm_campaign 으로 넘겨 원래 출처를 잃지 않게 한다.

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { getStoredUtm } from "@/lib/utm";

const SITE = "https://mathocr.ai.kr";

function buildShareUrl(path: string, location: string): string {
  const url = new URL(path, SITE);
  url.searchParams.set("utm_source", "mobile_share");
  url.searchParams.set("utm_medium", location);
  url.searchParams.set("utm_campaign", getStoredUtm()?.utm_source ?? "direct");
  return url.toString();
}

export default function SendToPcButton({
  location,
  path = "/",
  hint,
  className = "",
}: {
  /** 추적용 위치 이름 (hero · download · signup_done) */
  location: string;
  /** PC에서 열 경로 — 가입 전이면 홈, 가입 뒤면 /start(설치 안내) */
  path?: string;
  /** 버튼 아래 작은 안내(평상시). 주변에 이미 설명이 있으면 생략 */
  hint?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [manualUrl, setManualUrl] = useState("");

  async function handleClick() {
    const url = buildShareUrl(path, location);
    if (typeof navigator.share === "function") {
      trackEvent("mobile_share_click", { location });
      try {
        // 카톡은 주소(미리보기 카드)와 text를 말풍선 두 개로 나눠 보낸다 →
        // text는 그 자체로 끝맺는 한 문장으로 쓴다(10-28 사용자 실측: ' · '로 이은 조각 문구가 어색).
        await navigator.share({
          title: "AI MathOCR",
          text:
            path === "/start"
              ? "PC에서 열면 프로그램 설치 안내로 바로 이어져요."
              : "PC에서 열면 수학문제 PDF·사진을 한글(HWP) 파일로 바로 변환할 수 있어요.",
          url,
        });
        return;
      } catch (err) {
        // 사용자가 공유창을 닫은 것은 실패가 아니다
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    trackEvent("mobile_share_copy", { location });
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setManualUrl(url);
      setState("manual");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="btn-outline w-full px-8 py-4 text-base rounded-lg inline-flex items-center justify-center gap-2"
      >
        <iconify-icon icon="solar:share-linear" width="20" />
        내 카톡으로 보내 두기
      </button>
      {(state !== "idle" || hint) && (
        <p className="mt-2.5 text-sm text-zinc-600 leading-relaxed text-center" aria-live="polite">
          {state === "copied" && "주소를 복사했어요. 카톡 '나와의 채팅'에 붙여 넣어 두세요."}
          {state === "manual" && (
            <>
              아래 주소를 길게 눌러 복사해 주세요.
              <span className="block mt-1 font-mono text-xs text-zinc-800 break-all select-all">
                {manualUrl}
              </span>
            </>
          )}
          {state === "idle" && hint}
        </p>
      )}
    </div>
  );
}
