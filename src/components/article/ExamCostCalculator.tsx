"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

// '시험지를 한글로 옮기는 3가지 방법' 글의 시간·비용 계산기.
// 모든 가정(문제당 분·외주 단가·검토 시간)을 방문자가 직접 바꾸게 했다 — 우리가 정한 숫자로 결론을 몰지 않기 위해.
// 변환 프로그램 단가는 우리 요금표(문제당 140~199원)를 쓰고, 그 사실을 화면에 밝힌다.

const PROGRAM_MIN = 140;
const PROGRAM_MAX = 199;

function won(n: number) {
  return `${Math.round(n).toLocaleString()}원`;
}

function duration(min: number) {
  if (min < 60) return `${Math.round(min)}분`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

function Field({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-zinc-800">{label}</span>
        <span className="text-[15px] font-semibold text-zinc-900 tabular-nums">
          {value.toLocaleString()}
          <span className="text-[12px] font-normal text-zinc-500 ml-0.5">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-[var(--accent)]"
      />
      <span className="block text-[11.5px] text-zinc-400 mt-0.5">{hint}</span>
    </label>
  );
}

export default function ExamCostCalculator() {
  const [problems, setProblems] = useState(30);
  const [typingMin, setTypingMin] = useState(5);
  const [outsourceWon, setOutsourceWon] = useState(800);
  const [reviewMin, setReviewMin] = useState(1);
  const [touched, setTouched] = useState(false);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    if (!touched) {
      setTouched(true);
      trackEvent("exam_calc_use", {});
    }
  };

  const rows = [
    {
      name: "직접 타이핑",
      time: duration(problems * typingMin),
      cost: "0원",
      note: "내 시간",
    },
    {
      name: "타이핑 외주",
      time: "보통 며칠",
      cost: won(problems * outsourceWon),
      note: "맡기고 받기까지",
    },
    {
      name: "변환 프로그램",
      time: duration(problems * reviewMin),
      cost: `${won(problems * PROGRAM_MIN)} ~ ${won(problems * PROGRAM_MAX)}`,
      note: "검토 시간 포함",
      highlight: true,
    },
  ];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="p-5 md:p-6 grid sm:grid-cols-2 gap-x-8 gap-y-5 border-b border-zinc-100">
        <Field
          label="옮길 문제 수"
          hint="시험지 한 장은 보통 20~30문제"
          value={problems}
          min={5}
          max={200}
          step={5}
          unit="문제"
          onChange={touch(setProblems)}
        />
        <Field
          label="직접 칠 때 문제당 걸리는 시간"
          hint="수식·그림·보기 박스가 많을수록 길어져요"
          value={typingMin}
          min={1}
          max={15}
          step={1}
          unit="분"
          onChange={touch(setTypingMin)}
        />
        <Field
          label="외주 문제당 단가"
          hint="문제 길이에 따라 400~1,300원 선(2026년 10월 기준 시세)"
          value={outsourceWon}
          min={400}
          max={1300}
          step={50}
          unit="원"
          onChange={touch(setOutsourceWon)}
        />
        <Field
          label="변환 후 검토 시간(문제당)"
          hint="영역 지정·결과 확인에 드는 시간 — 본인 기준으로 바꿔 보세요"
          value={reviewMin}
          min={0.5}
          max={5}
          step={0.5}
          unit="분"
          onChange={touch(setReviewMin)}
        />
      </div>
      <div className="p-5 md:p-6">
        <p className="text-[13px] text-zinc-500 mb-3">
          <strong className="text-zinc-900">{problems}문제</strong>를 옮길 때
        </p>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {rows.map((r) => (
            <div
              key={r.name}
              className={`rounded-lg border p-3.5 ${
                r.highlight ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <p className="text-[12px] font-semibold text-zinc-500">{r.name}</p>
              <p className="text-lg font-bold text-zinc-900 mt-1 tabular-nums">{r.time}</p>
              <p className="text-[13px] text-zinc-700 tabular-nums">{r.cost}</p>
              <p className="text-[11px] text-zinc-400 mt-1">{r.note}</p>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-zinc-400 mt-3 leading-relaxed">
          변환 프로그램 비용은 AI MathOCR 요금표 기준(요금제에 따라 문제당 {PROGRAM_MIN}~{PROGRAM_MAX}원, 그림 무료,
          해설을 함께 변환하면 해설 1개당 같은 금액 추가)입니다. 다른 프로그램은 요금 구조가 다를 수 있어요.
        </p>
      </div>
    </div>
  );
}
