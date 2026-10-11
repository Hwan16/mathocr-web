// 완성된 시험지(v2.5.0) 목업 — 홈페이지 기능 섹션 맨 위 짙은 보라 카드의 오른쪽.
// 다른 쇼케이스와 같은 원칙: 실제 스크린샷이 아니라 사이트 디자인 언어로 그린 목업.
// 연출: ① 1쪽(제목 칸: 로고 · 시험지 제목+과목명 · 이름 칸, 2단 칸 배치, 선택지 한 줄, 꼬리말)
// ② 뒤에 겹친 2쪽(머리 줄: 로고 · 과목명 · 시험지 제목) ③ [변환하기] 때 뜨는 '결과 모양 고르기' 창.
// 앱 출력(src/exam_sheet_writer.py)의 쪽 구성이 바뀌면 디테일만 동기화.
const serif = { fontFamily: '"Times New Roman", "Batang", serif' } as const;

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${small ? "" : "gap-1.5"}`}>
      <span
        className={`inline-flex items-center justify-center rounded-[4px] bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] font-black text-white ${
          small ? "w-3 h-3 text-[7px]" : "w-[18px] h-[18px] text-[10px]"
        }`}
      >
        √
      </span>
      <span className={`font-extrabold tracking-[-0.04em] text-zinc-800 ${small ? "text-[6.5px]" : "text-[9px]"}`}>
        OO수학
      </span>
    </span>
  );
}

function Choices({ items }: { items: string[] }) {
  return (
    <div className="mt-1.5 flex justify-between text-[7.5px] text-zinc-700" style={serif}>
      {items.map((c, i) => (
        <span key={i}>
          {"①②③④⑤"[i]} {c}
        </span>
      ))}
    </div>
  );
}

function Bars({ widths }: { widths: string[] }) {
  return (
    <div className="mt-1 space-y-[5px]">
      {widths.map((w, i) => (
        <div key={i} className="h-[3px] rounded-full bg-zinc-200" style={{ width: w }} />
      ))}
    </div>
  );
}

export default function ExamSheetShowcase() {
  return (
    <div className="relative select-none pt-2 pb-2 md:pb-10">
      <div className="relative mx-auto w-[260px] sm:w-[300px] lg:w-[330px] md:mr-[16%] lg:mr-[18%]">
        {/* 2쪽 — 뒤에 겹쳐 '모든 쪽에 머리 줄'을 보여 준다 */}
        <div
          aria-hidden
          className="absolute inset-0 translate-x-[22%] -translate-y-[4%] rotate-[5deg] rounded-[6px] bg-white/95 shadow-[0_24px_60px_rgba(0,0,0,0.45)] px-[7%] pt-[5%]"
        >
          <div className="flex items-end justify-between border-b border-zinc-800 pb-1">
            <Logo small />
            <span className="text-[9px] font-bold text-zinc-900">수학 영역</span>
            <span className="text-[6px] text-zinc-500">3월 모의고사</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3">
            <div className="pr-1.5">
              <div className="text-[8px] font-bold text-zinc-900" style={serif}>4.</div>
              <Bars widths={["96%", "88%", "92%", "60%"]} />
            </div>
            <div className="border-l border-zinc-300 pl-3">
              <div className="text-[8px] font-bold text-zinc-900" style={serif}>6.</div>
              <Bars widths={["94%", "84%", "70%"]} />
            </div>
          </div>
        </div>

        {/* 1쪽 */}
        <div className="relative aspect-[240/330] rounded-[6px] bg-white text-zinc-900 shadow-[0_30px_70px_rgba(0,0,0,0.5)] px-[7%] pt-[5%] pb-[4%] flex flex-col">
          {/* 제목 칸: 로고 | 시험지 제목 + 과목명 | 이름 칸 */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b-[2.5px] border-zinc-900 pb-2">
            <Logo />
            <div className="text-center leading-tight">
              <div className="text-[7.5px] text-zinc-500">3월 모의고사</div>
              <div className="text-[17px] sm:text-[19px] font-black tracking-[-0.04em]">수학 영역</div>
            </div>
            <div className="flex items-end justify-end gap-1 text-[7.5px] text-zinc-700">
              이름
              <span className="inline-block w-9 border-b border-zinc-800" />
            </div>
          </div>

          {/* 2단 칸 배치 — 왼쪽 단은 짧은 문제 2개, 오른쪽 단은 긴 문제 1개 */}
          <div className="relative mt-3 grid flex-1 grid-cols-2 gap-x-[9%]">
            <span aria-hidden className="absolute left-1/2 top-0 bottom-1 w-px bg-zinc-300" />
            <div className="flex flex-col">
              <div className="h-1/2">
                <div className="text-[8px] leading-[1.55]" style={serif}>
                  <b>1.</b> 함수 <i>f</i>(<i>x</i>) = <i>x</i>³ − 3<i>x</i>의 극댓값은?
                </div>
                <Bars widths={["92%", "58%"]} />
                <Choices items={["−2", "−1", "0", "1", "2"]} />
              </div>
              <div className="h-1/2">
                <div className="text-[8px] leading-[1.55]" style={serif}>
                  <b>2.</b> lim<sub className="text-[5.5px]">x→2</sub> (<i>x</i>² − 4)/(<i>x</i> − 2)의 값은?
                </div>
                <Bars widths={["96%", "84%", "46%"]} />
                <Choices items={["1", "2", "3", "4", "5"]} />
              </div>
            </div>
            <div>
              <div className="text-[8px] leading-[1.55]" style={serif}>
                <b>3.</b> 그림과 같이 곡선 <i>y</i> = <i>x</i>²과 직선 <i>y</i> = 2<i>x</i>로 둘러싸인 부분의 넓이는?
              </div>
              {/* 원점 (30,58), x 1칸 = 18, y 1칸 = 11 — y = x²와 y = 2x, 0 ≤ x ≤ 2 사이를 칠한다 */}
              <svg viewBox="0 0 100 70" className="mt-2 w-[86%] mx-auto" aria-hidden>
                <path d="M30 58 L66 14 Q48 58 30 58 Z" fill="#ddd6fe" />
                <line x1="6" y1="58" x2="96" y2="58" stroke="#a1a1aa" strokeWidth="0.8" />
                <line x1="30" y1="2" x2="30" y2="68" stroke="#a1a1aa" strokeWidth="0.8" />
                <path d="M13.8 49.1 Q42.15 80.3 70.5 2.3" fill="none" stroke="#18181b" strokeWidth="1.1" />
                <line x1="21" y1="69" x2="75" y2="3" stroke="#18181b" strokeWidth="1.1" />
                <text x="25" y="65" fontSize="6" fill="#52525b" fontStyle="italic" style={serif}>O</text>
                <text x="92" y="65" fontSize="6" fill="#52525b" fontStyle="italic" style={serif}>x</text>
                <text x="33" y="7" fontSize="6" fill="#52525b" fontStyle="italic" style={serif}>y</text>
              </svg>
              <Bars widths={["94%", "88%", "62%"]} />
              <Choices items={["⅓", "⅔", "1", "4/3", "5/3"]} />
            </div>
          </div>

          {/* 꼬리말 */}
          <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-1 text-[6.5px] text-zinc-500">
            <span>OO 수학학원</span>
            <span>1 / 4</span>
            <span className="w-8" />
          </div>
        </div>

        {/* 라임 스티커 — 길이별 자동 배치 */}
        <div className="absolute -top-3 -left-4 sm:-left-8 -rotate-[8deg] rounded-full bg-[#D9F99D] px-3 py-1.5 text-[11px] sm:text-[12px] font-extrabold text-[#1B0B45] shadow-[0_8px_20px_rgba(0,0,0,0.3)]">
          문제 길이 따라 자동 배치
        </div>
      </div>

      {/* [변환하기] 때 뜨는 '결과 모양 고르기' 창 */}
      <div className="relative mt-6 md:mt-0 md:absolute md:left-0 md:-bottom-2 lg:-left-4 w-full max-w-[300px] mx-auto md:mx-0 rounded-xl bg-white p-3 text-zinc-900 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
        <div className="mb-2 text-[10px] font-bold text-zinc-500">결과 모양 고르기</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-zinc-200 px-2.5 py-2">
            <span className="mb-1 block w-3 h-3 rounded-full border-[1.5px] border-zinc-300" />
            <span className="block text-[10px] font-bold leading-snug text-zinc-500">
              문제은행으로
              <br />
              저장할래요
            </span>
          </div>
          <div className="rounded-lg border-2 border-[#7C3AED] bg-violet-50 px-2.5 py-2">
            <span className="mb-1 flex w-3 h-3 items-center justify-center rounded-full border-[1.5px] border-[#7C3AED]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]" />
            </span>
            <span className="block text-[10px] font-bold leading-snug text-violet-800">
              완성된 시험지로
              <br />
              받을래요
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
