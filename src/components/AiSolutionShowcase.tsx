// AI 해설 생성(v2.4.0) 목업 — 홈페이지 기능 섹션. 다른 쇼케이스와 같은 원칙:
// 실제 스크린샷이 아니라 사이트 디자인 언어(zinc + violet)로 그린 목업.
// 연출: ① 우측 목록의 [💡AI] 체크 ② 변환 뒤 한글 문서 [정답 및 해설]에 들어간 풀이
// ③ 떠 있는 진행 칩(💡 AI 해설 생성 중). 앱 UI가 크게 바뀌면 디테일만 동기화.
const serif = { fontFamily: '"Times New Roman", Times, serif' } as const;

const ROWS: { n: number; answer?: string; solution?: string; ai: "on" | "off" | "blocked" }[] = [
  { n: 1, answer: "②", ai: "on" },
  { n: 2, solution: "해1", ai: "blocked" },
  { n: 3, ai: "on" },
  { n: 4, answer: "15", ai: "off" },
  { n: 5, ai: "on" },
];

export default function AiSolutionShowcase() {
  return (
    <div className="relative select-none">
      {/* 앱 우측 목록 — [💡AI] 칸이 주인공 */}
      <div className="rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)] overflow-hidden">
        <div className="px-4 pt-3.5 pb-3 border-b border-zinc-200">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <span className="text-[11px] text-zinc-500">
              문제 5 · 해설 1 · <span className="text-violet-700 font-semibold">💡 AI 해설 3</span>
            </span>
            <span className="px-2 py-0.5 rounded-md border border-sky-300 bg-sky-50 text-sky-700 text-[10px] font-semibold">
              일괄 객관식
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative" aria-hidden>
              <span className="absolute -inset-1.5 rounded-xl bg-violet-400/40 blur-md animate-pulse" />
              <span className="relative inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] text-white text-[10px] font-bold shadow-sm whitespace-nowrap">
                💡 AI 해설 일괄 적용
              </span>
            </span>
            <span className="text-[9px] font-bold tracking-wide text-violet-700 bg-violet-100 rounded-full px-2 py-0.5">
              NEW
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-violet-700 bg-violet-50 border border-violet-100 rounded-md px-2 py-1">
              학년 <span className="font-semibold">고2</span> ▾
            </span>
          </div>
        </div>

        <div className="px-4 py-2 grid grid-cols-[28px_1fr_36px_40px] items-center text-[10px] font-semibold text-zinc-500 border-b border-zinc-100">
          <span>문항</span>
          <span className="pl-1">답안</span>
          <span className="text-center">해설</span>
          <span className="text-center text-violet-700">💡AI</span>
        </div>
        {ROWS.map((row) => (
          <div
            key={row.n}
            className="px-4 py-2 grid grid-cols-[28px_1fr_36px_40px] items-center border-b border-zinc-100 last:border-b-0"
          >
            <span className="text-[11px] text-sky-600 font-medium">{row.n}</span>
            <span className="pl-1 pr-3">
              <span className="block h-6 rounded-md border border-zinc-200 bg-white px-2 text-[10px] leading-6 text-zinc-500">
                {row.answer ?? <span className="text-zinc-300">답안 입력</span>}
              </span>
            </span>
            <span className="text-center text-[10px] text-violet-600 font-medium">{row.solution ?? ""}</span>
            <span className="flex justify-center">
              {row.ai === "on" ? (
                <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-[#7C3AED] text-white text-[11px] font-black">
                  ✓
                </span>
              ) : row.ai === "blocked" ? (
                <span className="inline-flex w-5 h-5 rounded-md border border-zinc-200 bg-zinc-100" title="해설이 연결된 문제" />
              ) : (
                <span className="inline-flex w-5 h-5 rounded-md border-[1.5px] border-zinc-300 bg-white" />
              )}
            </span>
          </div>
        ))}
      </div>

      {/* 결과: 한글 문서의 [정답 및 해설] — 목록 위로 살짝 겹쳐 '변환 결과'임을 보여 준다 */}
      <div className="relative md:absolute md:-bottom-6 md:-left-6 lg:-left-10 md:w-[78%] mt-4 md:mt-0 rounded-xl border border-zinc-200 bg-white shadow-[0_18px_48px_-12px_rgba(24,24,27,0.28)] overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2 border-b border-zinc-200 bg-zinc-50">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" aria-hidden />
          <span className="text-[10px] text-zinc-500">한글 문서 (.hwp) — 정답 및 해설</span>
        </div>
        <div className="px-4 py-3.5 text-[12px] leading-[1.9] text-zinc-800" style={serif}>
          <p className="font-semibold">3. ②</p>
          <p>
            직각삼각형 ABH에서 피타고라스 정리에 의하여
          </p>
          <p className="pl-4">
            <span className="overline">BH</span> = √(13² − 12²) = 5
          </p>
          <p className="pl-4">
            <span className="overline">HC</span> = 14 − 5 = 9
          </p>
          <p>
            따라서 선분 <span className="overline">AC</span>의 길이는 15이다.
          </p>
        </div>
      </div>

      {/* 진행 칩 — 변환 중 '💡 AI 해설 생성 중' 단계 */}
      <div className="absolute -top-4 right-4 md:-right-4 flex items-center gap-2.5 bg-white border border-zinc-200 rounded-xl pl-2.5 pr-3.5 py-2 shadow-[0_12px_32px_-8px_rgba(24,24,27,0.25)]">
        <span
          className="relative inline-flex w-8 h-8 rounded-full shrink-0"
          style={{ background: "conic-gradient(#7C3AED 0deg 240deg, #EDE9FE 240deg)" }}
          aria-hidden
        >
          <span className="absolute inset-1 rounded-full bg-white flex items-center justify-center text-[9px] font-bold text-violet-700">
            2/3
          </span>
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold text-zinc-800">💡 AI 해설 생성 중</span>
          <span className="block text-[9px] text-zinc-500">문제당 2크레딧 · 출시 기념</span>
        </span>
      </div>
    </div>
  );
}
