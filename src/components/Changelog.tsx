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
// 숨김은 class="hidden"이 아니라 hidden 속성 — 검색엔진에는 전체가 노출된다.
//
// ⚠️ 구분선은 divide-y를 쓰지 않는다. Tailwind v4의 divide-y는
//    `:where(& > :not(:last-child))`라 [hidden] 항목을 건너뛰지 않는다. 그래서
//    접힌 상태에서는 "마지막으로 보이는 항목의 선 + 버튼의 위쪽 선"이 겹쳐 이중선이 됐다.
//    항목마다 border-b를 주고 버튼에는 위쪽 선을 두지 않는 방식으로 바꿔 해결.
//
// ⚠️ sticky·높이 제한을 쓰지 않는다. 이전 구현은 접힘일 때만 lg:sticky + max-h였는데,
//    ① [더 보기]를 누르는 순간 sticky가 풀려 카드가 스크롤한 거리만큼 통째로 튀고
//       (실측 1280×720에서 300px, 버튼이 화면 밖으로 이탈)
//    ② 세로가 짧은 화면에서 목록이 잘려 미리보기 5건 중 대표 항목(✨자동 인식)이
//       내부 스크롤 아래로 완전히 숨었다.
//    카드가 항상 자기 높이대로 서면 두 문제가 같이 사라진다.
export default function Changelog() {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = CHANGELOG.length - CHANGELOG_PREVIEW_COUNT;

  return (
    <aside>
      {/* overflow-hidden — 없으면 회색 헤더 배경이 카드의 둥근 모서리 밖으로 삐져나온다 */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200 bg-zinc-50">
          <h3 className="font-bold text-zinc-900">업데이트 내역</h3>
          {DOWNLOAD_VERSION && (
            <span className="shrink-0 text-xs font-semibold text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent-border)] rounded-full px-2.5 py-1">
              현재 {DOWNLOAD_VERSION}
            </span>
          )}
        </div>

        <ol>
          {CHANGELOG.map((entry, i) => (
            <li
              key={entry.version}
              hidden={!expanded && i >= CHANGELOG_PREVIEW_COUNT}
              className="px-5 py-4 border-b border-zinc-100"
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
            className="w-full flex items-center justify-center gap-1.5 px-5 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
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
