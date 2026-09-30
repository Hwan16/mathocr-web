"use client";

// 한글 오류 가이드의 "먼저 최신 버전으로 업데이트" 카드 (2026-10-01).
// 이 페이지에 오는 사람은 대개 한글 오류를 겪은 기존 사용자다. [다시 만들기]는
// v2.3.1부터 있고 한글 오류 대처는 버전마다 보강되므로, 가이드를 따르기 전에
// 최신 버전으로 먼저 유도한다(가이드 그림·단계는 항상 최신 버전 기준).
// 앱 안 업데이트 흐름 = 좌측 하단 '새 버전' 카드 → [지금 설치] → Windows 확인 창(UAC)
// → 무음 설치 후 앱 자동 재실행 (src/gui/main_window.py _on_update_*, src/updater.py
// launch_installer, installer.iss [Run] WizardSilent). 버전 숫자는 download.ts에서
// 자동으로 따라오므로 릴리스 때 이 파일을 고칠 필요가 없다.
// 다운로드 버튼은 홈·/start·마이페이지와 같은 방식(집계 + 보안 경고 안내 모달).

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { DOWNLOAD_URL, DOWNLOAD_LABEL, DOWNLOAD_VERSION } from "@/lib/download";
import DownloadGuideModal from "@/components/DownloadGuideModal";

export default function UpdateCard() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
      <h2 className="text-lg font-semibold text-zinc-900 mb-3">
        먼저 앱을 최신 버전으로 업데이트해 주세요
      </h2>
      <p className="text-sm text-zinc-600 leading-relaxed">
        한글 오류를 해결하는 기능은 새 버전에서 계속 보강되고 있어요. 아래 그림은{" "}
        <strong className="text-zinc-900">최신 버전 기준</strong>입니다. 오류 창에{" "}
        <strong className="text-zinc-900">[다시 만들기]</strong> 버튼이 없거나 그림과 다르게
        보이면 예전 버전이니, 먼저 업데이트해 주세요.
      </p>
      <ul className="mt-4 text-sm text-zinc-600 leading-relaxed space-y-2 list-disc pl-5">
        <li>
          <strong className="text-zinc-900">앱에서 바로:</strong> 앱을 켰을 때 왼쪽 아래에{" "}
          <strong className="text-zinc-900">&lsquo;새 버전&rsquo;</strong> 안내가 뜨면{" "}
          <strong className="text-zinc-900">[지금 설치]</strong>를 누르세요. Windows 확인 창에서
          [예]를 누르면 자동으로 설치되고 앱이 다시 켜집니다.
        </li>
        <li>
          <strong className="text-zinc-900">직접 받기:</strong> 아래 버튼으로 설치 파일을 받아
          실행하면 기존 앱 위에 그대로 설치됩니다.
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={DOWNLOAD_URL}
          onClick={() => {
            trackEvent("app_download", {
              version: DOWNLOAD_LABEL,
              source: "help_hwp_launch",
            });
            // 코드서명 미적용 상태라 브라우저 보안 경고가 뜬다 — 유지 절차 안내 모달
            setGuideOpen(true);
          }}
          className="btn-primary hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
        >
          최신 버전 받기
          <span className="opacity-75 font-normal">{DOWNLOAD_LABEL}</span>
        </a>
        <p className="md:hidden text-sm text-zinc-700 font-medium">
          설치 파일은 PC에서 이 페이지를 열어 받아 주세요.
        </p>
        <p className="text-xs text-zinc-500">
          지금 쓰는 버전은 앱을 켠 첫 화면의 창 맨 위(예: AI MathOCR {DOWNLOAD_VERSION})에서
          확인할 수 있어요.
        </p>
      </div>
      <DownloadGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
