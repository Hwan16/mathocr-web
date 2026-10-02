// 로만체 수식 표기 예시(정적). 소개 영상의 로만체 장면 구성을 홈페이지 밝은 테마로 옮긴 것.
// rm·it 딱지는 한글 수식에 들어가는 글꼴 명령을 설명하려는 표시일 뿐, 실제 문서에는 보이지 않는다.
//
// ⚠️ globals.css가 `* { font-family }`로 모든 요소에 글꼴을 직접 지정하므로 글꼴은 상속되지 않는다.
//    수식·문서 글꼴은 글자를 담은 요소마다 style로 직접 줘야 한다(부모에만 주면 Pretendard로 나온다).
const MATH = { fontFamily: '"Times New Roman", Times, serif' } as const;
const DOC = { fontFamily: 'Batang, "바탕", AppleMyungjo, "Noto Serif KR", serif' } as const;

function Tok({
  children,
  tag = "rm",
  overline = false,
}: {
  children: string;
  tag?: "rm" | "it";
  overline?: boolean;
}) {
  const italic = tag === "it";
  return (
    <span
      className={
        "relative mx-0.5 inline-block rounded-md px-1 text-[1.4em] leading-[1.15] " +
        (italic ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-zinc-900")
      }
    >
      <span
        className={
          "absolute -top-[15px] left-1/2 -translate-x-1/2 rounded-full px-1.5 font-mono text-[10px] font-bold leading-[15px] text-white " +
          (italic ? "bg-sky-500" : "bg-violet-600")
        }
      >
        {tag}
      </span>
      <span
        className={(italic ? "italic " : "") + (overline ? "border-t-[1.5px] border-current" : "")}
        style={MATH}
      >
        {children}
      </span>
    </span>
  );
}

/** 수식 글꼴 글자 조각. italic이면 변수(이탤릭), 아니면 로만체 */
function M({ children, italic = false, sub = false }: { children: string; italic?: boolean; sub?: boolean }) {
  const cls = italic ? "italic" : "not-italic";
  return sub ? (
    <sub className={cls + " text-[0.7em]"} style={MATH}>{children}</sub>
  ) : (
    <span className={cls} style={MATH}>{children}</span>
  );
}

function Chip({ label, children, italic = false }: { label?: string; children: React.ReactNode; italic?: boolean }) {
  return (
    <span
      className={
        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold text-zinc-700 " +
        (italic ? "border-sky-100 bg-sky-50" : "border-zinc-200 bg-white")
      }
    >
      {label}
      <span className={"text-lg font-normal " + (italic ? "text-sky-700" : "text-zinc-900")}>{children}</span>
    </span>
  );
}

export default function RomanTypeShowcase() {
  return (
    <div
      className="min-w-0 select-none"
      role="img"
      aria-label="로만체 수식 예시: 점 P, 선분 AB, 수선의 발 H, 선분 PH, 단위 cm, 삼각형 PAB는 로만체로, 넓이 S는 이탤릭체로 한글 수식에 들어갑니다."
    >
      <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          <span className="h-3 w-3 rounded-[3px] bg-sky-500" />
          한글 문서 (.hwp) — 변환 결과
        </div>
        <div className="px-4 pb-2 pt-3 text-[13px] leading-[3] text-zinc-800 sm:px-6 sm:text-[15px]">
          <p style={DOC}>
            점 <Tok>P</Tok>에서 선분 <Tok>AB</Tok>에 내린 수선의 발을 <Tok>H</Tok>라 하자.
          </p>
          <p style={DOC}>
            <Tok overline>PH</Tok>
            <span className="text-[1.3em]" style={MATH}> = 3</span>
            <Tok>cm</Tok>일 때, <span className="text-[1.3em]" style={MATH}>△</span>
            <Tok>PAB</Tok>의 넓이를 <Tok tag="it">S</Tok>라 하자.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-6">
          <div className="w-full text-[11px] font-bold leading-snug text-violet-300 min-[420px]:w-auto">
            수식 스크립트{" "}
            <span className="text-amber-300 min-[420px]:block">✨ 자동 입력</span>
          </div>
          <code className="min-w-0 flex-1 whitespace-pre rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-zinc-100 sm:text-base">
            3 <b className="font-mono font-bold text-amber-300">rm</b> {"{cm}"} <span className="font-mono text-zinc-500">it</span>
          </code>
          <span className="text-violet-300">→</span>
          <span className="rounded-lg bg-white px-3 py-1 text-xl leading-snug text-zinc-900" style={MATH}>
            3cm
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs font-bold text-violet-700">로만체</span>
          <Chip label="점"><M>P</M></Chip>
          <Chip label="선분"><M>AB</M></Chip>
          <Chip><M>△ABC</M></Chip>
          <Chip><M>13km</M></Chip>
          <Chip>
            <M italic sub>n</M><M>C</M><M italic sub>r</M>
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs font-bold text-sky-700">이탤릭체</span>
          <Chip label="변수" italic><M italic>x</M></Chip>
          <Chip label="함수" italic>
            <M italic>f</M><M>(</M><M italic>x</M><M>)</M>
          </Chip>
          <Chip label="수열" italic>
            <M italic>a</M><M italic sub>n</M>
          </Chip>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        ※ 이해를 돕기 위해 재구성한 화면입니다. rm·it 표시는 실제 문서에는 보이지 않습니다.
      </p>
    </div>
  );
}
