import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import TrackedLink from "@/components/TrackedLink";

// 자료실 글 본문 조각 — 구역은 상자 대신 구분선·여백으로, 끝은 남색 띠 하나로(2026-10-30).
// 본문 글자는 globals.css 의 .prose-p(16.5px·줄 간격 1.85).

/** 본문 안 글 링크 — 밑줄을 연하게 깔아 두고 올리면 진해진다. */
export const LINK =
  "font-semibold text-[var(--accent)] underline underline-offset-4 decoration-[var(--accent-border)] hover:decoration-[var(--accent)]";

/** 본문 구역. first 는 대표 이미지 띠 바로 아래 첫 구역(위 구분선 없음). */
export function Section({
  id,
  title,
  first,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-6 ${first ? "" : "mt-16 pt-14 border-t border-zinc-200"}`}>
      <h2 className="text-[24px] md:text-[28px] font-bold text-zinc-900 tracking-tight leading-snug mb-6 break-keep">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** 글 맨 위 요약 — 글 안에서 유일한 바탕색 상자. */
export function SummaryBox({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] p-6 md:p-8">
      <h2 className="text-[20px] font-bold text-zinc-900 tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  );
}

/** 번호 단계 — 남색 동그라미 번호 + 제목 + 본문. */
export function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-white text-[14px] font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[18px] font-bold text-zinc-900 tracking-tight break-keep">{title}</h3>
        <div className="prose-p mt-1.5">{children}</div>
      </div>
    </li>
  );
}

/** 주의 한 줄 — 되돌리기 어려운 일·놓치면 손해인 일에만. */
export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[15px] text-red-800 leading-relaxed break-keep">
      <strong className="font-semibold">주의</strong> — {children}
    </p>
  );
}

/** 자주 묻는 질문 — 접었다 펴는 목록. */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-zinc-200 border-y border-zinc-200">
      {items.map((f) => (
        <details key={f.q} className="group py-4">
          <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-zinc-900 break-keep">{f.q}</h3>
            <span className="text-zinc-400 transition-transform group-open:rotate-45 leading-none text-xl">+</span>
          </summary>
          <p className="text-[15px] text-zinc-600 leading-relaxed mt-2.5 break-keep">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** 글 끝 남색 띠 — 제목·설명 + (선택) 흰 상자 + 가입/사용법 버튼. */
export function EndBand({
  id,
  title,
  location,
  signupLabel,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  location: string;
  signupLabel?: string; // 가입 버튼 문구. 기본 '시험지로 N문제 무료 변환해 보기'
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 mt-16 rounded-2xl bg-[var(--ink)] text-white p-6 md:p-9">
      <h2 className="text-[22px] md:text-[26px] font-bold tracking-tight mb-3 break-keep">{title}</h2>
      <div className="text-[15.5px] text-blue-100/85 leading-relaxed break-keep [&_strong]:text-white">{children}</div>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <TrackedLink
          href="/auth/signup"
          label="sign_up_free_15"
          location={location}
          className="text-[15px] font-bold px-5 py-3 rounded-lg text-center bg-white text-[var(--ink)] hover:bg-blue-50 transition-colors"
        >
          {signupLabel ?? `시험지로 ${SIGNUP_FREE_CREDITS}문제 무료 변환해 보기`}
        </TrackedLink>
        <TrackedLink
          href="/#guide"
          label="guide_video"
          location={location}
          className="text-[15px] px-5 py-3 rounded-lg text-center border border-white/30 text-white hover:bg-white/10 transition-colors"
        >
          사용법 영상 보기
        </TrackedLink>
      </div>
    </section>
  );
}
