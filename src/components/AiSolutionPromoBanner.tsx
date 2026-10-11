"use client";

import { AI_SOLUTION_RULE } from "@/lib/plans";
import { trackEvent } from "@/lib/analytics";

// AI 해설 출시 기념가 배너(D-040, 2026-10-11 사용자 확정 시안 A "숫자 하나") — 히어로 바로 아래.
// 기념가가 꺼지면(NEXT_PUBLIC_AI_SOLUTION_PROMO=off) 배너 자체가 사라진다.
// 문구 원칙(D-040): 마감 임박·카운트다운·"N% 할인"·취소선 정가는 쓰지 않는다(기만 광고·허위 정가 위험).
// 가격은 '+1'로 — 변환 1크레딧에 더해지는 값임을 보여 준다(빼면 "변환+해설 합쳐 1크레딧"으로 읽힘).
// "종료 시 2주 전 미리 공지"는 작게, 그러나 장식에 가려지지 않게 본문 칸에 둔다.

const TAPE_A = Array(8).fill("정답 및 해설 · AI 해설 ·").join(" ");
const TAPE_B = Array(6).fill("해설 PDF 없어도 · 문제마다 · 모의고사 해설처럼 ·").join(" ");

const GLASS =
  "bg-[linear-gradient(160deg,#F5F3FF_8%,#C4B5FD_38%,#8B5CF6_62%,#5B21B6_92%)] bg-clip-text text-transparent [filter:drop-shadow(0_24px_36px_rgba(0,0,0,0.45))]";

export default function AiSolutionPromoBanner() {
  if (!AI_SOLUTION_RULE.launched || !AI_SOLUTION_RULE.promoActive) return null;
  const unit = AI_SOLUTION_RULE.current;

  return (
    <section aria-label="AI 해설 출시 기념가 안내" className="border-b border-zinc-200">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-12 py-8 lg:py-10">
        <div className="relative overflow-hidden rounded-3xl bg-[#1B0B45] text-white">
          {/* 본문 */}
          <div className="relative z-10 px-6 pt-8 pb-2 sm:px-10 sm:pt-10 lg:px-14 lg:pt-12 xl:pb-12 xl:max-w-[560px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#D9F99D] px-3 py-1 text-[12px] sm:text-[13px] font-extrabold text-[#1B0B45]">
              💡 {AI_SOLUTION_RULE.promoNote}
            </span>
            <h2 className="mt-4 text-[40px] sm:text-[48px] lg:text-[54px] font-black leading-[1.04] tracking-[-0.045em]">
              AI 해설,
              <br />
              문제당 <span className="text-[#D9F99D]">+{unit}</span>크레딧.
            </h2>
            <p className="mt-3 text-[15px] sm:text-[17px] font-medium text-violet-200 leading-relaxed">
              해설 PDF가 없어도 AI가 문제별 해설을 써 드려요
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[12px] sm:text-[13px] font-bold leading-none">
              <span className="inline-flex items-center rounded-full border border-[#4C3A8C] px-2.5 py-1.5 text-violet-200">문제 변환 1크레딧</span>
              <span className="inline-flex items-center rounded-full border border-[#D9F99D] bg-[#D9F99D] px-2.5 py-1.5 text-[#1B0B45]">+ AI 해설 {unit}크레딧</span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href="#ai-solution"
                onClick={() => trackEvent("nav_click", { label: "ai_solution_promo_banner" })}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] sm:text-base font-bold text-[#1B0B45] hover:bg-violet-50 transition-colors"
              >
                AI 해설 보기
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
              <span className="text-[11px] text-violet-300/80">{AI_SOLUTION_RULE.promoFinePrint}</span>
            </div>
          </div>

          {/* 장식: 1280px 미만에선 본문 아래 띠 영역, 그 이상에선 오른쪽 절반(1024px에선 띠가 제목 뒤로 지나가 산만했음) */}
          <div
            aria-hidden
            className="relative h-44 sm:h-52 lg:h-56 xl:absolute xl:inset-y-0 xl:right-0 xl:h-auto xl:w-[58%] xl:[mask-image:linear-gradient(90deg,transparent,black_22%)]"
          >
            <div className="absolute -left-20 -right-20 top-[46%] xl:top-[40%] h-9 xl:h-11 -rotate-[9deg] bg-[#D9F99D] text-[#1B0B45] flex items-center whitespace-nowrap text-[14px] xl:text-[17px] font-extrabold tracking-[-0.02em]">
              {TAPE_A}
            </div>
            <div className="absolute -left-20 -right-20 top-[24%] xl:top-[26%] h-9 xl:h-11 rotate-[7deg] bg-white/95 text-violet-900 flex items-center whitespace-nowrap text-[14px] xl:text-[17px] font-extrabold tracking-[-0.02em]">
              {TAPE_B}
            </div>
            <div
              className={`absolute right-2 -bottom-10 sm:right-8 lg:right-[260px] xl:right-[230px] xl:bottom-auto xl:-top-6 font-black leading-none tracking-[-0.06em] text-[200px] sm:text-[240px] lg:text-[260px] xl:text-[360px] ${GLASS}`}
            >
              <span className="text-[0.58em] align-[0.42em]">+</span>
              {unit}
            </div>
            {/* 해설지 카드 — PC만 */}
            <div className="hidden lg:block absolute right-12 top-1/2 -translate-y-1/2 w-[210px] rotate-[6deg] rounded-2xl bg-white p-[18px] text-zinc-900 shadow-[0_24px_50px_rgba(0,0,0,0.4)]">
              <div className="text-[12px] font-extrabold text-violet-600">정답 및 해설</div>
              <div className="mt-2.5 text-[13px] font-bold">18. 정답 ③</div>
              <div className="mt-2 font-serif italic text-[14px] text-zinc-700">f′(x) = 3x² − 6x</div>
              <div className="mt-3 h-[7px] w-[88%] rounded bg-violet-100" />
              <div className="mt-2 h-[7px] w-[72%] rounded bg-violet-100" />
              <div className="mt-3 font-serif italic text-[14px] text-zinc-700">∴ x = 0 또는 x = 2</div>
              <div className="mt-3 h-[7px] w-[80%] rounded bg-violet-100" />
              <div className="absolute -right-3.5 -bottom-3.5 -rotate-[8deg] rounded-full bg-violet-600 px-3 py-1.5 text-[12px] font-extrabold text-white">
                💡 AI 해설
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
