// 내 파일함(v2.6.0, D-054) 소개용 정적 예시 — 목록 + 오른쪽 상세(첫 문제 미리보기). 목업의 컨트롤은 클릭 대상이 아니다.
// 실제 화면(components/file-box/FileBox.tsx)과 같은 요소만 쓴다: 경로(마이페이지 › 내 파일함), 파일 줄, 남은 기간,
// 상세의 변환·보관·내용, [한글 파일 받기]·[카카오톡], 첫 문제 미리보기.
// 휴대폰 그림은 뺐다 — 휴대폰에서도 된다는 건 본문 글이 말한다(사용자 11-06).
import FolderIcon from "@/components/FolderIcon";

const MATH = { fontFamily: '"Times New Roman", Times, serif' } as const;

function HwpIcon({ className = "h-7 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 28" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d="M3 1.5h12l6 6V25a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 25z" fill="#fff" stroke="#d4d4d8" />
      <path d="M15 1.5V7.5h6" fill="none" stroke="#d4d4d8" />
      <text x="12" y="20" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#2563eb">HWP</text>
    </svg>
  );
}

const KakaoBubble = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
    <path fill="#000" d="M12 3.5c-5.25 0-9.5 3.33-9.5 7.44 0 2.66 1.78 5 4.46 6.31l-.9 3.32c-.08.3.26.53.52.36l3.95-2.6c.48.05.97.08 1.47.08 5.25 0 9.5-3.33 9.5-7.47S17.25 3.5 12 3.5z" />
  </svg>
);

const ROWS = [
  { name: "수학Ⅰ 기말 대비 20제_변환.hwp", meta: "문제 20 · 해설 20", left: "30일 남음", until: "12.06 (일)까지", tone: "normal" },
  { name: "정적분의 활용 변형_변환.hwp", meta: "문제 12 · 해설 12", left: "29일 남음", until: "12.05 (토)까지", tone: "selected" },
  { name: "확률과 통계 3단원_변환.hwp", meta: "문제 18 · 해설 18", left: "6일 남음", until: "11.12 (목)까지", tone: "soon" },
] as const;

function Frac({ n, d }: { n: number; d: number }) {
  return (
    <span className="inline-flex flex-col items-center align-middle text-[9px] leading-none" style={MATH}>
      <span className="px-0.5">{n}</span>
      <span className="w-full border-t border-current px-0.5 pt-px">{d}</span>
    </span>
  );
}

// 넓이 = ∫₁³|x²−4x+3|dx = 4/3 → ②
const CHOICES = [
  <span key="1" style={MATH}>1</span>,
  <Frac key="2" n={4} d={3} />,
  <Frac key="3" n={5} d={3} />,
  <span key="4" style={MATH}>2</span>,
  <Frac key="5" n={7} d={3} />,
];

export default function FileBoxShowcase() {
  return (
    <div
      className="@container min-w-0 select-none"
      role="img"
      aria-label="내 파일함 예시: 홈페이지 마이페이지에서 내 파일함으로 들어가면 변환한 한글 파일이 남은 보관 기간과 함께 보이고, 파일을 누르면 첫 문제 미리보기와 함께 한글 파일 받기·카카오톡 공유 버튼이 나옵니다."
    >
      <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)]">
        <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          <span>마이페이지</span>
          <span className="text-zinc-300" aria-hidden="true">›</span>
          <span className="inline-flex items-center gap-1 font-semibold text-zinc-900">
            <FolderIcon className="h-3.5 w-3.5 text-violet-600" />
            내 파일함
          </span>
        </div>
        {/* 넓으면 목록 | 상세 나란히(실제 PC 화면과 같은 배치), 좁으면 목록 아래 상세 */}
        <div className="grid @[540px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* 목록 */}
          <div className="border-b border-zinc-200 px-3 pb-2 pt-3 @[540px]:border-b-0 @[540px]:border-r">
            <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-400">
              <span>시험지명</span>
              <span>보관 기한</span>
            </div>
            {ROWS.map((r) => (
              <div
                key={r.name}
                className={
                  "flex items-center gap-2 rounded-md border-t border-zinc-100 px-1.5 py-2.5 " +
                  (r.tone === "selected" ? "border-transparent bg-violet-50 ring-1 ring-violet-200" : "")
                }
              >
                <HwpIcon className="h-6 w-5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-zinc-900">{r.name}</div>
                  <div className="text-[10px] text-zinc-500">{r.meta}</div>
                </div>
                <div className={"shrink-0 text-right " + (r.tone === "soon" ? "text-orange-600" : "text-zinc-700")}>
                  <div className="text-[11px] tabular-nums">{r.left}</div>
                  <div className={"text-[10px] tabular-nums " + (r.tone === "soon" ? "" : "text-zinc-400")}>{r.until}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 상세 — 고른 파일(정적분의 활용 변형) */}
          <div className="min-w-0">
            <div className="border-b border-zinc-100 px-4 pb-3.5 pt-4">
              <div className="flex items-start gap-2">
                <HwpIcon className="mt-0.5 h-6 w-5" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-snug text-zinc-900">정적분의 활용 변형_변환.hwp</div>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums">
                    <dt className="text-zinc-400">변환</dt>
                    <dd className="text-zinc-600">11.05 (목) 21:14</dd>
                    <dt className="text-zinc-400">보관</dt>
                    <dd className="text-zinc-600">12.05 (토)까지 · 29일 남음</dd>
                    <dt className="text-zinc-400">내용</dt>
                    <dd className="text-zinc-600">문제 12 · 해설 12 · 46KB</dd>
                  </dl>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <span className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-violet-600 py-2 text-[11px] font-semibold text-white">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 20h14" />
                  </svg>
                  한글 파일 받기
                </span>
                <span className="flex items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#FEE500] px-3 py-2 text-[11px] font-semibold text-black/85">
                  <KakaoBubble />
                  카카오톡
                </span>
              </div>
            </div>
            <div className="px-4 pb-4 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold text-zinc-900">첫 문제 미리보기</span>
                <span className="text-[10px] tabular-nums text-zinc-400">전체 12문제</span>
              </div>
              <div className="mt-2 flex gap-1.5 text-[11.5px] leading-relaxed text-zinc-800">
                <span className="font-semibold">1.</span>
                <div className="min-w-0">
                  곡선 <span className="italic" style={MATH}>y</span> = <span className="italic" style={MATH}>x</span>
                  <sup className="text-[7px]">2</sup> − 4<span className="italic" style={MATH}>x</span> + 3과{" "}
                  <span className="italic" style={MATH}>x</span>축으로 둘러싸인 부분의 넓이는?
                  <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1 tabular-nums">
                    {CHOICES.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span>{"①②③④⑤"[i]}</span>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-zinc-500">나머지 11문제는 한글 파일에서 확인하세요.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
