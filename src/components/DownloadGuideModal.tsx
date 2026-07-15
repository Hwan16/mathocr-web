"use client";

import { useEffect } from "react";

// ── 다운로드 보안 경고 안내 모달 ──
// 설치 파일이 코드서명 미적용 상태라 Edge 등에서 SmartScreen 평판 경고
// ("일반적으로 다운로드되지 않습니다")가 뜬다. 다운로드 버튼 클릭 시
// 이 모달을 함께 띄워 "정상 안내"임을 알리고 유지 절차를 캡처와 함께
// 보여준다. 코드서명 도입(CHECKLIST 코드서명 항목) 후에는 제거해도 된다.
// 3단계 문구: Edge 버전에 따라 [더보기] 버튼이 있거나, [삭제] 오른쪽
// 아래 화살표(∨) 안에 [그래도 계속]이 숨어 있어 두 경우를 모두 안내한다.

const STEPS = [
  {
    image: "/download-guide/step1.png",
    alt: "Edge 다운로드 알림에서 기타 작업(점 3개) 버튼 위치",
    text: (
      <>
        다운로드 완료 후 브라우저 우측 상단의 알림에서{" "}
        <strong className="font-semibold text-zinc-900">[⋯] 버튼</strong>을
        클릭하세요.
      </>
    ),
  },
  {
    image: "/download-guide/step2.png",
    alt: "메뉴에서 유지 항목 위치",
    text: (
      <>
        메뉴에서{" "}
        <strong className="font-semibold text-zinc-900">[유지]</strong>를
        클릭하세요.
      </>
    ),
  },
  {
    image: "/download-guide/step3.png",
    alt: "삭제 버튼 오른쪽 아래 화살표를 눌러 나오는 그래도 계속 버튼 위치",
    text: (
      <>
        <strong className="font-semibold text-zinc-900">[더보기] 버튼</strong>{" "}
        혹은{" "}
        <strong className="font-semibold text-zinc-900">
          [삭제] 버튼 오른쪽의 아래 화살표(∨) 버튼
        </strong>
        을 클릭한 뒤,{" "}
        <strong className="font-semibold text-zinc-900">[그래도 계속]</strong>
        을 클릭하세요.
      </>
    ),
  },
];

export default function DownloadGuideModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="다운로드 보안 안내"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-800 hover:bg-black/5 transition-colors"
          aria-label="닫기"
        >
          ✕
        </button>

        {/* 헤더 */}
        <div className="px-7 pt-7 pb-4 shrink-0">
          <h2 className="text-xl font-bold text-zinc-900">
            다운로드가 시작되었습니다
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            놀라지 마세요! 브라우저에 아래와 같은{" "}
            <strong className="font-semibold text-zinc-800">
              보안 확인 메시지
            </strong>
            가 나타날 수 있어요. 최근 출시된 프로그램이라 아직 다운로드 기록이
            쌓이지 않아 뜨는 <strong className="font-semibold text-zinc-800">지극히 정상적인 안내</strong>이며,
            파일에는 아무 문제가 없습니다. 아래 순서대로 진행해 주세요.
          </p>
        </div>

        {/* 단계 안내 (스크롤 영역) */}
        <div className="px-7 pb-5 overflow-y-auto space-y-6">
          {STEPS.map((step, i) => (
            <div key={step.image}>
              <div className="flex items-start gap-2.5 mb-2.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-zinc-600">
                  {step.text}
                </p>
              </div>
              <img
                src={step.image}
                alt={step.alt}
                className="w-full rounded-lg border border-zinc-200"
              />
            </div>
          ))}

          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-sm text-zinc-700 leading-relaxed">
            💡 다운로드한 설치 파일을 실행할 때 파란색{" "}
            <strong className="font-semibold">
              &ldquo;Windows의 PC 보호&rdquo;
            </strong>{" "}
            창이 나타나면{" "}
            <strong className="font-semibold">[추가 정보]</strong> →{" "}
            <strong className="font-semibold">[실행]</strong>을 눌러 주세요.
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="border-t border-zinc-100 px-7 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold py-3 transition-colors"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
