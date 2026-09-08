"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { DOWNLOAD_VERSION } from "@/lib/download";
import {
  CHANGELOG,
  CHANGELOG_PREVIEW_COUNT,
  CHANGELOG_TAG_LABEL,
  CHANGELOG_TAG_STYLE,
} from "@/lib/changelog";

// 홈 FAQ 우측 "업데이트 내역" 패널.
// 내용은 @/lib/changelog 단일 출처 — 굵직한 변화만 담는 원칙은 그 파일 상단 주석 참조.
//
// 접힌 상태에서는 최근 CHANGELOG_PREVIEW_COUNT개만 보이고, 나머지는 [더 보기]로 펼친다.
// 숨김은 hidden 속성으로 처리한다(class="hidden"이 아니라) — divide-y가
// :not([hidden]) 기준이라 접었을 때 빈 구분선이 남지 않고, 검색엔진에는 전체가 노출된다.
export default function Changelog() {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = CHANGELOG.length - CHANGELOG_PREVIEW_COUNT;

  return (
    // 접힌 상태에서만 sticky — 펼치면 목록이 화면보다 길어져 끝까지 볼 수 없게 된다.
    <aside className={expanded ? undefined : "lg:sticky lg:top-24"}>
      {/* 접힌 상태에서는 카드 높이를 화면에 맞추고 목록만 스크롤시킨다 —
          제목과 [더 보기] 버튼은 항상 보이게. */}
      <div
        className={`card rounded-xl flex flex-col ${
          expanded ? "" : "lg:max-h-[calc(100vh-7rem)]"
        }`}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200 bg-zinc-50">
          <h3 className="font-bold text-zinc-900">업데이트 내역</h3>
          {DOWNLOAD_VERSION && (
            <span className="shrink-0 text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent-border)] rounded-full px-2.5 py-1">
              현재 {DOWNLOAD_VERSION}
            </span>
          )}
        </div>

        <ol className="min-h-0 overflow-y-auto divide-y divide-zinc-100">
          {CHANGELOG.map((entry, i) => (
            <li
              key={entry.version}
              hidden={!expanded && i >= CHANGELOG_PREVIEW_COUNT}
              className="px-5 py-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-900">
                  {entry.version}
                </span>
                <span
                  className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                    CHANGELOG_TAG_STYLE[entry.tag]
                  }`}
                >
                  {CHANGELOG_TAG_LABEL[entry.tag]}
                </span>
              </div>
              <p className="mt-2 font-semibold text-[15px] text-zinc-900 leading-snug">
                {entry.title}
              </p>
              <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-zinc-600 leading-relaxed marker:text-zinc-300">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        {hiddenCount > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((v) => !v);
              if (!expanded) trackEvent("nav_click", { label: "changelog_more" });
            }}
            className="shrink-0 w-full flex items-center justify-center gap-1.5 border-t border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            {expanded ? "접기" : `지난 업데이트 ${hiddenCount}건 더 보기`}
            <iconify-icon
              icon="solar:alt-arrow-down-linear"
              width="16"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      <p className="mt-3 px-1 text-xs text-zinc-500 leading-relaxed">
        새 버전이 나오면 앱이 알아서 업데이트합니다. 변환 중일 때는 작업이 끝난 뒤에
        설치돼 진행 중인 변환이 끊기지 않습니다.
      </p>
    </aside>
  );
}
