"use client";

import { AI_SOLUTION_RULE } from "@/lib/plans";
import { trackEvent } from "@/lib/analytics";

// 해설 생성 출시 기념가 배너(D-040, 2026-10-11 사용자 확정 시안 A "숫자 하나") — 히어로 바로 아래.
// 기념가가 꺼지면(NEXT_PUBLIC_AI_SOLUTION_PROMO=off) 배너 자체가 사라진다.
// 문구 원칙(D-040): 마감 임박·카운트다운·"N% 할인"·취소선 정가는 쓰지 않는다(기만 광고·허위 정가 위험).
// 가격은 '+1'로 — 변환 1크레딧에 더해지는 값임을 보여 준다(빼면 "변환+해설 합쳐 1크레딧"으로 읽힘).
// "종료 시 2주 전 미리 공지"는 작게, 그러나 장식에 가려지지 않게 본문 칸에 둔다.
// 2026-10-12: 화면 문구에서 'AI'를 뺀다(D-043 — "AI가 만든다고 하면 강사들이 믿지 못한다").
// 2026-10-25: 오른쪽의 큰 '+1' 숫자를 뺐다(사용자 — "+1만 강조돼 본질이 안 보인다", 가격은 왼쪽 제목·칩이 이미 말함).
//   대신 '해설지 없음' 문제 카드 → 실제 풀이가 적힌 '정답 및 해설' 카드로 무엇을 받는지 보여 준다. 폰에서도 보인다.
//   같은 날 반복 띠 두 줄도 뺐다(사용자 — "난잡하다"). 띠가 하던 말("문제마다"·"모의고사 해설처럼")은
//   큰 화면에선 해설 카드의 해당 줄을 가리키는 주석으로, 작은 화면에선 카드 아래 한 줄로 둔다.

// 카드 속 수식은 한글 수식처럼 세리프 이탤릭(변수만)
const v = (s: string) => <i className="font-serif">{s}</i>;

export default function AiSolutionPromoBanner() {
  if (!AI_SOLUTION_RULE.launched || !AI_SOLUTION_RULE.promoActive) return null;
  const unit = AI_SOLUTION_RULE.current;

  return (
    <section aria-label="해설 생성 출시 기념가 안내" className="border-b border-zinc-200">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 py-8 lg:py-10">
        <div className="relative overflow-hidden rounded-3xl bg-[#1B0B45] text-white">
          {/* 본문 */}
          <div className="relative z-10 px-6 pt-8 pb-2 sm:px-10 sm:pt-10 lg:px-14 lg:pt-12 xl:pb-12 xl:max-w-[560px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#D9F99D] px-3 py-1 text-[12px] sm:text-[13px] font-extrabold text-[#1B0B45]">
              💡 {AI_SOLUTION_RULE.promoNote}
            </span>
            <h2 className="mt-4 text-[40px] sm:text-[48px] lg:text-[54px] font-black leading-[1.04] tracking-[-0.045em]">
              해설 생성,
              <br />
              문제당 <span className="text-[#D9F99D]">+{unit}</span>크레딧.
            </h2>
            <p className="mt-3 text-[15px] sm:text-[17px] font-medium text-violet-200 leading-relaxed">
              해설 PDF가 없어도 문제별 해설까지 함께 넣어 드려요
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[12px] sm:text-[13px] font-bold leading-none">
              <span className="inline-flex items-center rounded-full border border-[#4C3A8C] px-2.5 py-1.5 text-violet-200">문제 변환 1크레딧</span>
              <span className="inline-flex items-center rounded-full border border-[#D9F99D] bg-[#D9F99D] px-2.5 py-1.5 text-[#1B0B45]">+ 해설 생성 {unit}크레딧</span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href="#ai-solution"
                onClick={() => trackEvent("nav_click", { label: "ai_solution_promo_banner" })}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] sm:text-base font-bold text-[#1B0B45] hover:bg-violet-50 transition-colors"
              >
                해설 생성 보기
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
              <span className="text-[11px] text-violet-300/80">{AI_SOLUTION_RULE.promoFinePrint}</span>
            </div>
          </div>

          {/* 그림: 1280px 미만에선 본문 아래, 그 이상에선 오른쪽 절반 */}
          <div
            aria-hidden
            className="relative h-[270px] sm:h-[300px] lg:h-[300px] xl:absolute xl:inset-y-0 xl:right-0 xl:h-auto xl:w-[58%]"
          >
            {/* 문제(해설지 없음) → 정답 및 해설. 460×240 판(주석 포함 폭 641)을 화면 폭에 맞춰 키우고 줄인다.
                1024 이상은 주석 끝(641px)을 오른쪽 40px에 고정하고 왼쪽으로 키운다 — 배율은 왼쪽 제목과 겹치지 않는 한도
                (1280: 1.05 · 1400: 1.25 · 1536 이상: 1.3, 2026-10-25 사용자 요청 "오른쪽을 더 크게") */}
            <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 lg:top-1/2 lg:left-auto lg:right-[221px] lg:translate-x-0 lg:origin-[641px_50%] w-[460px] h-[240px] scale-[0.77] sm:scale-[0.86] lg:scale-100 xl:scale-105 min-[87.5rem]:scale-[1.25] 2xl:scale-[1.3]">
              <div className="absolute left-0 top-0 w-[250px] -rotate-[4deg] rounded-xl bg-white p-4 text-zinc-900 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-500">시험지</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-bold text-white">해설지 없음</span>
                </div>
                <p className="mt-2.5 text-[13px] leading-[1.6]">
                  <b>18.</b> 함수 {v("f")}({v("x")}) = {v("x")}³ − 3{v("x")}² + {v("a")}의 극댓값과 극솟값의 차는? (단, {v("a")}는 상수이다.)
                </p>
                {/* 보기는 왼쪽 170px 안에 — 오른쪽 해설 카드에 가리지 않게 */}
                <div className="mt-2 flex w-[170px] justify-between text-[12.5px] text-zinc-700">
                  <span>① 2</span><span>② 3</span><span>③ 4</span><span>④ 5</span><span>⑤ 6</span>
                </div>
              </div>

              <div className="absolute right-0 top-[72px] w-[262px] rotate-[3deg] rounded-xl bg-white p-4 text-zinc-900 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-extrabold text-violet-600">정답 및 해설</span>
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">한글 문서</span>
                </div>
                <div className="mt-2 text-[13px] font-bold">18. 정답 ③</div>
                <div className="mt-1.5 space-y-1 text-[13px] leading-[1.6] text-zinc-700">
                  <p>{v("f")}′({v("x")}) = 3{v("x")}² − 6{v("x")} = 3{v("x")}({v("x")} − 2)</p>
                  <p>{v("x")} = 0에서 극대, {v("x")} = 2에서 극소이므로</p>
                  <p>{v("f")}(0) − {v("f")}(2) = {v("a")} − ({v("a")} − 4) = 4</p>
                </div>
              </div>

              {/* 문제 → 해설을 잇는 표시. 해설 카드 글자를 가리지 않게 카드 왼쪽 바깥에 */}
              <div className="absolute left-[64px] top-[176px] -rotate-[3deg] rounded-full bg-violet-600 px-3.5 py-2 text-[13px] font-extrabold text-white shadow-[0_8px_20px_rgba(0,0,0,0.4)] ring-2 ring-[#1B0B45]">
                💡 해설 생성 →
              </div>

              {/* 주석(1024 이상) — 좌표는 위 해설 카드(왼쪽 198·위 72·폭 262·3도 회전)의 '18. 정답'·풀이 줄 높이에 맞춘 값 */}
              <div className="hidden lg:block">
                <span className="absolute left-[462px] top-[124px] h-1.5 w-1.5 rounded-full bg-[#D9F99D]" />
                <span className="absolute left-[468px] top-[126.5px] h-px w-[30px] bg-[#D9F99D]/60" />
                <span className="absolute left-[506px] top-[116px] whitespace-nowrap text-[16px] font-bold text-[#D9F99D]">문제마다</span>

                <span className="absolute left-[459px] top-[189px] h-1.5 w-1.5 rounded-full bg-[#D9F99D]" />
                <span className="absolute left-[465px] top-[191.5px] h-px w-[33px] bg-[#D9F99D]/60" />
                <span className="absolute left-[506px] top-[181px] whitespace-nowrap text-[16px] font-bold text-[#D9F99D]">모의고사 해설처럼</span>
              </div>
            </div>

            {/* 주석(작은 화면) — 카드 아래 한 줄 */}
            <p className="lg:hidden absolute inset-x-0 bottom-5 sm:bottom-6 text-center text-[13px] sm:text-[14px] font-bold text-[#D9F99D]">
              문제마다 · 모의고사 해설처럼
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
