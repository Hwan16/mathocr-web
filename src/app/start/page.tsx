"use client";

// 시작 안내(/start) — 이메일 인증을 마친 사람이 첫 로그인 직후 도착하는 페이지.
// 배경(2026-07-23 점검): 가입 38명 중 17명(44.7%)이 변환 0건. 릴스·인스타 유입은
// 전원 휴대폰인데, 인증을 마쳐도 "Windows PC에서 프로그램을 받으라"는 안내를
// 받을 통로가 없었다(안내 메일은 마케팅 동의자 한정 → 동의율 5%).
// 이 페이지는 기기를 감지해 PC에는 다운로드 버튼을, 휴대폰에는 "PC에서 여는
// 방법"(링크 복사)을 먼저 보여준다. 로그인 여부와 무관하게 공개 페이지다.

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { DOWNLOAD_URL, DOWNLOAD_LABEL } from "@/lib/download";
import DownloadGuideModal from "@/components/DownloadGuideModal";

const START_URL = "https://mathocr.ai.kr/start";

function PcCard({
  first,
  onDownload,
}: {
  first: boolean;
  onDownload: () => void;
}) {
  return (
    <div
      className={`card rounded-2xl p-7 shadow-sm ${
        first ? "border-2 border-[var(--accent)]/30" : ""
      }`}
    >
      <div className="text-2xl mb-2" aria-hidden>
        💻
      </div>
      <h2 className="text-lg font-bold text-zinc-900 mb-2">
        지금 PC로 보고 계시다면
      </h2>
      <p className="text-sm text-zinc-600 leading-relaxed mb-5">
        아래 버튼으로 설치 파일을 받고, 설치 후 앱에서{" "}
        <strong className="text-zinc-900">가입한 이메일로 로그인</strong>하면
        바로 변환할 수 있어요.
      </p>
      <a
        href={DOWNLOAD_URL}
        onClick={onDownload}
        className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold"
      >
        Windows용 다운로드
        <span className="opacity-75 font-normal">{DOWNLOAD_LABEL}</span>
      </a>
      <div className="mt-4 text-xs text-zinc-500 space-y-1">
        <p>Windows 10 / 11 · 정품 한글(한컴오피스) 필요 · 한글 2014 이상 권장</p>
        <p>한글 뷰어(무료)로는 변환되지 않습니다</p>
      </div>
    </div>
  );
}

function MobileCard({ first }: { first: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(START_URL);
      setCopied(true);
      trackEvent("start_copy_link");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 주소를 직접 길게 눌러 복사하도록 안내만 남긴다
    }
  }

  return (
    <div
      className={`card rounded-2xl p-7 shadow-sm ${
        first ? "border-2 border-[var(--accent)]/30" : ""
      }`}
    >
      <div className="text-2xl mb-2" aria-hidden>
        📱
      </div>
      <h2 className="text-lg font-bold text-zinc-900 mb-2">
        휴대폰으로 보고 계시다면
      </h2>
      <p className="text-sm text-zinc-600 leading-relaxed mb-5">
        이 프로그램은 <strong className="text-zinc-900">Windows PC에서 실행</strong>
        돼요. 아래 주소를 PC 브라우저에서 열면 이 안내를 그대로 다시 볼 수
        있습니다.
      </p>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm font-mono text-zinc-800 select-all overflow-x-auto whitespace-nowrap">
          mathocr.ai.kr/start
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="btn-primary shrink-0 px-5 rounded-lg text-sm font-semibold"
        >
          {copied ? "복사됨!" : "복사"}
        </button>
      </div>
      <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
        💡 복사한 링크를 카카오톡 <strong>&ldquo;나와의 채팅&rdquo;</strong>에
        보내두면 PC에서 열기 편해요.
      </p>
    </div>
  );
}

export default function StartPage() {
  // null = 아직 감지 전(SSR 포함) → PC 우선 순서로 렌더. 감지 후 순서만 바뀐다.
  const [device, setDevice] = useState<"pc" | "mobile" | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setDevice(mobile ? "mobile" : "pc");
    trackEvent("start_view", { device: mobile ? "mobile" : "pc" });
  }, []);

  function handleDownload() {
    trackEvent("app_download", { version: DOWNLOAD_LABEL, source: "start" });
    // 코드서명 미적용 상태라 브라우저 보안 경고가 뜬다 — 유지 절차 안내 모달
    setGuideOpen(true);
  }

  const mobileFirst = device === "mobile";

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/mathocr-icon.png" alt="" width={28} height={28} />
            <span className="font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <a
            href="/dashboard"
            className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            마이페이지
          </a>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="text-4xl mb-4" aria-hidden>
            🎉
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            가입 완료! 이제 프로그램만 설치하면 돼요
          </h1>
          <p className="text-sm md:text-base text-zinc-600 leading-relaxed">
            크레딧은 이 계정에 지급되어 있어요 —{" "}
            <a
              href="/dashboard"
              className="text-[var(--accent)] font-medium hover:underline"
            >
              마이페이지에서 확인
            </a>
            <br />
            시험지 변환은 Windows PC 프로그램에서 진행됩니다.
          </p>
        </div>

        <div className="space-y-4">
          {mobileFirst ? (
            <>
              <MobileCard first />
              <PcCard first={false} onDownload={handleDownload} />
            </>
          ) : (
            <>
              <PcCard first onDownload={handleDownload} />
              <MobileCard first={false} />
            </>
          )}
        </div>

        {/* 설치 3단계 미니 가이드 */}
        <div className="mt-8 card rounded-2xl p-7 shadow-sm">
          <h2 className="text-base font-bold text-zinc-900 mb-4">
            설치는 3단계면 끝나요
          </h2>
          <ol className="space-y-3 text-sm text-zinc-600 leading-relaxed">
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span>설치 파일을 다운로드해 실행합니다.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span>
                브라우저에 보안 경고가 뜨면{" "}
                <strong className="text-zinc-900">[유지] → [그래도 계속]</strong>
                을 누르면 됩니다. (아직 서명 등록 전이라 뜨는 정상 안내예요)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span>
                앱을 열고 <strong className="text-zinc-900">가입한 이메일로 로그인</strong>
                하면 바로 변환을 시작할 수 있어요.
              </span>
            </li>
          </ol>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400">
          막히는 부분이 있으면{" "}
          <a href="/help/usage" className="underline hover:text-zinc-600">
            사용법 안내
          </a>
          나{" "}
          <a href="/#faq" className="underline hover:text-zinc-600">
            자주 묻는 질문
          </a>
          을 확인해주세요.
        </p>
      </main>

      <DownloadGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
