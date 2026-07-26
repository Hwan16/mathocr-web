// AI 자동 인식(v2.2.0) 목업 — 기능 섹션 카드와 홈 팝업(얼리버드 종료 후 대체)이
// 공유한다. 히어로 목업과 같은 원칙: 실제 스크린샷이 아니라 사이트 디자인
// 언어(zinc + violet)로 직접 그린 목업이며, 앱 UI가 크게 바뀌면 디테일만 동기화.
// 핵심 연출: ① 툴바의 [✨ 자동 인식] 버튼 강조(글로우+NEW) ② AI가 그린 초안
// 박스 ③ 우하단 물결 진행 카드(앱의 실제 진행 UI를 도넛으로 단순화).
export default function AutoDetectShowcase() {
  return (
    <div className="rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)] overflow-hidden select-none">
      {/* 툴바 — 자동 인식 버튼이 주인공 */}
      <div className="flex items-center gap-1.5 px-3 h-11 border-b border-zinc-200 bg-white whitespace-nowrap overflow-hidden">
        <span className="px-2 py-1 border border-zinc-200 rounded-md text-[10px] text-zinc-600">
          파일 열기
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-[10px] font-semibold">
          문제
        </span>
        <span className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-500 text-[10px]">
          그림
        </span>
        <span className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-500 text-[10px]">
          해설
        </span>
        <span className="relative ml-2" aria-hidden>
          <span className="absolute -inset-1.5 rounded-xl bg-violet-400/40 blur-md animate-pulse" />
          <span className="relative inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] text-white text-[10px] font-bold shadow-sm">
            ✨ 자동 인식
          </span>
        </span>
        <span className="text-[9px] font-bold tracking-wide text-violet-700 bg-violet-100 rounded-full px-2 py-0.5">
          NEW
        </span>
      </div>

      {/* 뷰어: AI가 그린 초안 박스 + 진행 카드 */}
      <div className="relative p-5 pb-6 bg-zinc-100/70">
        <div className="bg-white border border-zinc-200 p-5 shadow-sm">
          <div className="border-2 border-sky-500 p-3 mb-4 relative">
            <span className="absolute -top-2.5 left-2 bg-sky-500 text-white text-[10px] px-1.5">
              1
            </span>
            <p className="text-[12px] text-zinc-700 leading-relaxed">
              1. 두 벡터 a = (3, −1), b = (−2, 3) 에 대하여 a + kb 가 …
            </p>
            <p className="text-[12px] text-zinc-400 leading-relaxed mt-1">
              ① 1&nbsp;&nbsp;&nbsp;② 2&nbsp;&nbsp;&nbsp;③ 3&nbsp;&nbsp;&nbsp;④
              4&nbsp;&nbsp;&nbsp;⑤ 5
            </p>
          </div>
          <div className="border-2 border-sky-500 p-3 relative">
            <span className="absolute -top-2.5 left-2 bg-sky-500 text-white text-[10px] px-1.5">
              2
            </span>
            <p className="text-[12px] text-zinc-700 leading-relaxed mb-2">
              2. 오른쪽 그림과 같은 정육각형 ABCDEF에서 …
            </p>
            <div className="border-2 border-emerald-500 h-16 w-28 flex items-center justify-center relative">
              <span className="absolute -top-2.5 left-2 bg-emerald-500 text-white text-[10px] px-1.5">
                그림
              </span>
              <svg width="44" height="40" viewBox="0 0 44 40" className="text-zinc-500">
                <polygon
                  points="22,2 40,11 40,29 22,38 4,29 4,11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M4 11 L40 29 M22 2 L22 38" stroke="#7c3aed" strokeWidth="1.2" />
              </svg>
            </div>
          </div>
        </div>

        {/* 진행 카드 — 앱의 물결 진행률을 도넛으로 단순화한 목업 */}
        <div className="absolute bottom-8 right-8 flex items-center gap-3 bg-white border border-zinc-200 rounded-xl pl-3.5 pr-4 py-2.5 shadow-[0_12px_32px_-8px_rgba(24,24,27,0.25)]">
          <span
            className="relative inline-flex w-11 h-11 rounded-full shrink-0"
            style={{ background: "conic-gradient(#7C3AED 0deg 270deg, #EDE9FE 270deg)" }}
            aria-hidden
          >
            <span className="absolute inset-[5px] bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-violet-700">
              75%
            </span>
          </span>
          <span>
            <span className="block text-[11px] font-bold text-zinc-900">자동 인식 중</span>
            <span className="block text-[10px] text-zinc-500 mt-0.5">3/4쪽 분석 중…</span>
          </span>
        </div>
      </div>
    </div>
  );
}
