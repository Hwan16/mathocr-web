// 실제 v2.3.0 입력 흐름을 보여주는 정적 예시. 목업의 컨트롤은 클릭 대상이 아니다.
function RootTwo() {
  return (
    <svg viewBox="0 0 48 38" className="inline-block h-[1.3em] w-[1.65em] align-middle" aria-hidden="true">
      <path d="M2 22 L7 19 L13 32 L21 5 H46" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <text x="25" y="31" fill="currentColor" fontFamily="Cambria, Georgia, serif" fontSize="29">2</text>
    </svg>
  );
}

export function AnswerPanelPreview() {
  return (
    <div className="min-w-0 flex flex-col gap-2.5" role="img" aria-label="답안 입력 예시: 1번은 객관식 3, 2번은 주관식 sqrt(2). fx 버튼으로 수식 입력">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[9px] text-zinc-500">
        <span>문제 2 · 해설 2</span>
        <span className="rounded border border-zinc-200 px-1.5 py-1">유형 일괄 설정</span>
      </div>
      <div className="text-[9px] text-zinc-500">예) 객관식 <span className="text-sky-600">③</span> · 주관식 <span className="text-violet-600">3</span></div>
      <div className="grid grid-cols-[20px_18px_44px_minmax(0,1fr)_22px] gap-1 items-center text-center text-[9px] text-zinc-500">
        <span>문항</span><span>그림</span><span>유형</span><span>답안</span><span>해설</span>
      </div>
      {[false, true].map((formula, i) => (
        <div key={i} className={"grid grid-cols-[20px_18px_44px_minmax(0,1fr)_22px] gap-1 items-center border-t border-zinc-100 py-2 text-center text-[10px] " + (formula ? "bg-violet-50/60" : "")}>
          <span className="text-sky-600">{i + 1}</span>
          <span className="text-emerald-600">{formula ? "✓" : ""}</span>
          <div className="flex gap-1">
            <span className={"flex h-6 w-5 items-center justify-center rounded border " + (formula ? "border-zinc-200 text-zinc-400" : "border-sky-300 bg-sky-50 text-sky-600 font-bold")}>객</span>
            <span className={"flex h-6 w-5 items-center justify-center rounded border " + (formula ? "border-violet-300 bg-violet-50 text-violet-600 font-bold" : "border-zinc-200 text-zinc-500")}>주</span>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <span className={"min-w-0 flex-1 rounded border px-1 py-1 text-left " + (formula ? "border-violet-300 text-violet-600" : "border-zinc-200 text-zinc-700")}>{formula ? "sqrt(2)" : "3"}</span>
            <span className={"shrink-0 rounded px-1 py-1 font-bold " + (formula ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600")}>fx</span>
          </div>
          <span className="text-violet-600">해{i + 1}</span>
        </div>
      ))}
      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-zinc-600">
        <div className="mb-2 text-[9px] text-violet-600">한글에 들어가는 정답 예시</div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>1. <span className="text-sky-600">③</span></span>
          <span>2. <span className="text-violet-700" aria-label="루트 2"><RootTwo /></span></span>
        </div>
      </div>
    </div>
  );
}

export default function AnswerToolsShowcase() {
  return (
    <div className="min-w-0 select-none" role="img" aria-label="수식 답안 입력 예시: sqrt(2)를 입력하면 루트 2로 미리 보고, 한글에서 다시 편집할 수 있는 수식으로 변환됩니다.">
      <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          <span className="font-bold text-violet-600">fx</span>
          수식 답안 입력
          <span className="ml-auto text-zinc-400" aria-hidden="true">×</span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="mb-1 text-lg font-bold text-zinc-900">수식 답안</div>
          <p className="mb-4 text-xs leading-relaxed text-zinc-500">버튼으로 수식 틀을 넣고 숫자나 문자를 입력하세요.</p>
          <div className="mb-3 flex items-center justify-between rounded-lg border border-violet-300 bg-violet-50/40 px-3 py-2.5 text-sm text-zinc-800">
            <span>sqrt(2)<span className="ml-0.5 inline-block h-4 w-px bg-violet-500 align-middle" /></span>
            <span className="text-xs text-zinc-400" aria-hidden="true">×</span>
          </div>
          <div className="mb-5 grid grid-cols-3 gap-1.5 min-[480px]:grid-cols-6 text-center text-xs text-zinc-700">
            {["분수", "√", "xⁿ", "xₙ", "( )", "|x|"].map((label) => (
              <span key={label} className={"rounded-md border px-2 py-2 " + (label === "√" ? "border-violet-300 bg-violet-50 text-violet-700" : "border-zinc-200")}>{label}</span>
            ))}
          </div>
          <div className="mb-2 text-xs font-semibold text-zinc-700">미리보기</div>
          <div className="flex h-24 items-center justify-center rounded-lg border border-zinc-200 text-4xl text-zinc-900"><RootTwo /></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-500">한글에서 다시 편집할 수 있어요.</span>
            <span className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white">수식 적용</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs text-zinc-600">
        <span>객관식 <strong className="font-semibold text-sky-600">3 → ③</strong></span>
        <span className="h-3 w-px bg-violet-200" aria-hidden="true" />
        <span>주관식 <strong className="font-semibold text-violet-600">3 → 3</strong></span>
      </div>
    </div>
  );
}
