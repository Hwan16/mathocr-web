import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import TrackedLink from "@/components/TrackedLink";

// 자료실 글 옆·사이에 붙는 기능 소개 한 장 — 남색 머리 + 앱 화면 목업 + 기능 두 줄 + 무료 체험 버튼.
// 목업은 홈 첫 화면 목업(app/page.tsx)을 줄인 그림이다 — 앱 UI가 크게 바뀌면 둘 다 맞춘다.
// (예전 흐린 캡처 사진 카드 2장은 작게 줄이면 알아보기 어려워 2026-10-30 교체)
// ⚠️ 해설 쪽 문구에 'AI 해설' 표현 금지(2026-10-12 원칙) — '해설 생성'. OCR 쪽 'AI 자동 인식'은 유지.

const FEATURES = [
  { key: "autodetect", title: "AI 자동 인식", desc: "문제·그림 영역을 알아서 잡아요", more: "/#features" },
  { key: "solution", title: "해설 생성", desc: "해설지가 없는 문제도 풀이까지", more: "/#ai-solution" },
] as const;

/** 앱 창을 줄인 그림 — 파란 문제 박스 2개, 그 안의 초록 그림 박스. */
function AppMockup() {
  return (
    <div aria-hidden="true" className="rounded-md border border-zinc-300 bg-white overflow-hidden shadow-[0_10px_28px_-10px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-1.5 px-2 h-5 bg-zinc-100 border-b border-zinc-200">
        <img src="/mathocr-icon.png" alt="" width={10} height={10} />
        <span className="text-[7px] text-zinc-500 truncate">AI MathOCR</span>
        <span className="ml-auto text-[7px] text-zinc-400 tracking-[3px]">─□✕</span>
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-200">
        <span className="px-1.5 py-[1px] rounded bg-sky-500 text-white text-[7px] font-semibold">문제</span>
        <span className="px-1.5 py-[1px] rounded border border-zinc-200 text-zinc-500 text-[7px]">그림</span>
        <span className="px-1.5 py-[1px] rounded border border-zinc-200 text-zinc-500 text-[7px]">해설</span>
        <span className="ml-1 px-1.5 py-[1px] rounded bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] text-white text-[7px] font-semibold">
          자동 인식
        </span>
      </div>
      <div className="bg-zinc-100/70 p-2">
        <div className="bg-white border border-zinc-200 p-2 space-y-2.5">
          <div className="border-[1.5px] border-sky-500 px-1.5 pt-2 pb-1.5 relative">
            <span className="absolute -top-[7px] left-1 bg-sky-500 text-white text-[7px] leading-none px-1 py-[2px]">1</span>
            <p className="text-[8px] text-zinc-700 leading-snug">
              1. 방정식 <em>x</em>² − 5<em>x</em> + 6 = 0의 두 근의 합은?
            </p>
            <p className="text-[7px] text-zinc-400 mt-0.5">① 3 ② 4 ③ 5 ④ 6 ⑤ 7</p>
          </div>
          <div className="border-[1.5px] border-sky-500 px-1.5 pt-2 pb-1.5 relative">
            <span className="absolute -top-[7px] left-1 bg-sky-500 text-white text-[7px] leading-none px-1 py-[2px]">2</span>
            <p className="text-[8px] text-zinc-700 leading-snug mb-1.5">
              2. 함수 y = <em>x</em>²의 그래프에서 y = 2일 때 …
            </p>
            <div className="border-[1.5px] border-emerald-500 h-9 flex items-center justify-center relative">
              <span className="absolute -top-[7px] left-1 bg-emerald-500 text-white text-[7px] leading-none px-1 py-[2px]">그림</span>
              <svg width="44" height="26" viewBox="0 0 72 44" className="text-zinc-400">
                <path d="M4 40 L4 4 M4 40 L68 40" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M5 39 Q42 39 65 5" stroke="#1e40af" strokeWidth="2" fill="none" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupButton({ location }: { location: string }) {
  return (
    <TrackedLink
      href="/auth/signup"
      label="sign_up_free_15"
      location={location}
      className="btn-primary block text-center text-sm font-semibold px-4 py-2.5 rounded-lg"
    >
      {SIGNUP_FREE_CREDITS}문제 무료로 해보기
    </TrackedLink>
  );
}

function FeatureList({ location }: { location: string }) {
  return (
    <ul className="space-y-2.5">
      {FEATURES.map((f) => (
        <li key={f.key}>
          <TrackedLink href={f.more} label={`promo_${f.key}`} location={location} className="group flex gap-2.5 items-start">
            <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 mt-[2px] text-[var(--accent)]" aria-hidden="true">
              <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.12" />
              <path d="M4.5 8.2 7 10.5l4.5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-zinc-900 group-hover:underline">{f.title}</span>
              <span className="block text-[12.5px] text-zinc-500 leading-snug">{f.desc}</span>
            </span>
          </TrackedLink>
        </li>
      ))}
    </ul>
  );
}

/** PC(xl 이상) 오른쪽 여백 — 스크롤을 따라 내려온다. */
export function PromoRail({ location }: { location: string }) {
  const loc = `${location}_rail`;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="bg-[var(--ink)] text-white px-4 pt-4 pb-14">
        <p className="text-[12px] text-blue-200/80">시험지를 통째로 옮긴다면</p>
        <p className="text-[17px] font-bold leading-snug mt-1 break-keep">
          PDF·사진 그대로
          <br />
          편집되는 한글 시험지로
        </p>
      </div>
      <div className="px-4 -mt-10">
        <AppMockup />
      </div>
      <div className="p-4 space-y-4">
        <FeatureList location={loc} />
        <SignupButton location={loc} />
        <p className="text-[11px] text-zinc-400 text-center -mt-1">Windows · 한글 2014 이상 · 그림은 무료</p>
      </div>
    </div>
  );
}

/** 휴대폰·태블릿(xl 미만) 본문 중간 — 오른쪽 여백이 없는 화면용. 목업은 넓은 화면(sm 이상)에서만. */
export function PromoInline({ location }: { location: string }) {
  const loc = `${location}_inline`;
  return (
    <aside className="xl:hidden my-10 rounded-xl overflow-hidden border border-zinc-200 bg-white">
      <div className="bg-[var(--ink)] text-white px-5 py-5 sm:grid sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-6 sm:items-center">
        <div>
          <p className="text-[12px] text-blue-200/80">시험지를 통째로 옮긴다면 — AI MathOCR</p>
          <p className="text-[18px] font-bold leading-snug mt-1 break-keep">PDF·사진 그대로 편집되는 한글 시험지로</p>
        </div>
        <div className="hidden sm:block">
          <AppMockup />
        </div>
      </div>
      <div className="p-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-6 sm:items-center">
        <FeatureList location={loc} />
        <SignupButton location={loc} />
      </div>
    </aside>
  );
}
