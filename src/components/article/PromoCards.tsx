import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import TrackedLink from "@/components/TrackedLink";

// 자료실 글 옆·사이에 붙는 기능 카드 2장(자동 인식·해설 생성) + 무료 체험 버튼.
// 그림은 실제 앱 화면·실제 변환 결과만 쓴다(홈 사용법 3단계 캡처 / 해설 생성 실제 결과).
// ⚠️ 해설 쪽 문구에 'AI 해설' 표현 금지(2026-10-12 원칙) — '해설 생성'. OCR 쪽 'AI 자동 인식'은 유지.

const CARDS = [
  {
    key: "autodetect",
    tag: "✨ AI 자동 인식",
    title: "PDF를 열면 문제·그림 영역을 알아서",
    desc: "시험지 사진·PDF에서 문제와 그림을 자동으로 잡고, 수식까지 편집 가능한 한글 문서로 바꿔요.",
    img: "/articles/promo-autodetect.webp",
    imgAlt: "AI MathOCR가 시험지 사진에서 문제 영역을 자동으로 잡은 실제 화면",
    w: 600,
    h: 392,
    more: "/#features",
  },
  {
    key: "solution",
    tag: "💡 해설 생성",
    title: "해설지가 없는 문제도 해설까지",
    desc: "문제 변환부터 해설까지 한 번에. 단계별 해설을 붙여 같은 한글 문서에 넣어 드려요.",
    img: "/articles/promo-solution.webp",
    imgAlt: "해설 생성으로 만든 실제 한글 문서 해설",
    w: 600,
    h: 245,
    more: "/#ai-solution",
  },
] as const;

function Card({ card, location }: { card: (typeof CARDS)[number]; location: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <TrackedLink href={card.more} label={`promo_${card.key}`} location={location} className="block group">
        <div className="bg-zinc-100 border-b border-zinc-200">
          <img
            src={card.img}
            alt={card.imgAlt}
            width={card.w}
            height={card.h}
            loading="lazy"
            className="w-full h-auto block"
          />
        </div>
        <div className="p-3.5">
          <p className="text-[11px] font-semibold text-[var(--accent)] mb-1">{card.tag}</p>
          <p className="text-sm font-semibold text-zinc-900 leading-snug group-hover:underline">{card.title}</p>
          <p className="text-[12.5px] text-zinc-500 leading-relaxed mt-1">{card.desc}</p>
        </div>
      </TrackedLink>
    </div>
  );
}

function SignupButton({ location }: { location: string }) {
  return (
    <TrackedLink
      href="/auth/signup"
      label="sign_up_free_15"
      location={location}
      className="btn-primary block text-center text-sm px-4 py-2.5 rounded-lg"
    >
      {SIGNUP_FREE_CREDITS}문제 무료로 해보기
    </TrackedLink>
  );
}

/** PC(xl 이상) 오른쪽 여백 — 스크롤을 따라 내려온다. */
export function PromoRail({ location }: { location: string }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-zinc-400 tracking-wide px-0.5">
        시험지를 통째로 옮긴다면
      </p>
      {CARDS.map((c) => (
        <Card key={c.key} card={c} location={`${location}_rail`} />
      ))}
      <SignupButton location={`${location}_rail`} />
      <p className="text-[11px] text-zinc-400 text-center">Windows · 한글 2014 이상</p>
    </div>
  );
}

/** 휴대폰용 가로형 — 작은 사진 왼쪽, 글 오른쪽(세로로 길어지지 않게). */
function CompactCard({ card, location }: { card: (typeof CARDS)[number]; location: string }) {
  return (
    <TrackedLink
      href={card.more}
      label={`promo_${card.key}`}
      location={location}
      className="group flex gap-3 items-center rounded-lg border border-zinc-200 bg-white p-2.5"
    >
      <img
        src={card.img}
        alt={card.imgAlt}
        width={card.w}
        height={card.h}
        loading="lazy"
        className="w-24 h-16 object-cover object-left-top rounded-md border border-zinc-200 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-[var(--accent)]">{card.tag}</span>
        <span className="block text-[13px] font-semibold text-zinc-900 leading-snug group-hover:underline">
          {card.title}
        </span>
      </span>
    </TrackedLink>
  );
}

/** 휴대폰·태블릿(xl 미만) 본문 중간 — 오른쪽 여백이 없는 화면용. */
export function PromoInline({ location }: { location: string }) {
  return (
    <aside className="xl:hidden my-6 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
      <p className="text-sm font-semibold text-zinc-900 mb-3">시험지를 통째로 옮긴다면 — AI MathOCR</p>
      <div className="grid sm:grid-cols-2 gap-2.5 mb-3">
        {CARDS.map((c) => (
          <CompactCard key={c.key} card={c} location={`${location}_inline`} />
        ))}
      </div>
      <SignupButton location={`${location}_inline`} />
    </aside>
  );
}
