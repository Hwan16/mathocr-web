// 내 파일함(v2.6.0, D-054) 소개용 정적 예시 — PC 목록 + 휴대폰 받기 화면. 목업의 컨트롤은 클릭 대상이 아니다.
// 실제 화면(components/file-box/FileBox.tsx)과 같은 요소만 쓴다: 경로(마이페이지 › 내 파일함), 파일 줄,
// 남은 기간, 휴대폰 아래 줄의 [한글 파일 받기]·[카카오톡].
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
  <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
    <path fill="#000" d="M12 3.5c-5.25 0-9.5 3.33-9.5 7.44 0 2.66 1.78 5 4.46 6.31l-.9 3.32c-.08.3.26.53.52.36l3.95-2.6c.48.05.97.08 1.47.08 5.25 0 9.5-3.33 9.5-7.47S17.25 3.5 12 3.5z" />
  </svg>
);

const ROWS = [
  { name: "수학Ⅰ 기말 대비 20제_변환.hwp", meta: "문제 20 · 해설 20", left: "30일 남음", until: "12.06 (일)까지", tone: "normal" },
  { name: "정적분의 활용 변형_변환.hwp", meta: "문제 12 · 해설 12", left: "29일 남음", until: "12.05 (토)까지", tone: "selected" },
  { name: "확률과 통계 3단원_변환.hwp", meta: "문제 18 · 해설 18", left: "6일 남음", until: "11.12 (목)까지", tone: "soon" },
] as const;

export default function FileBoxShowcase() {
  return (
    <div
      className="relative min-w-0 select-none"
      role="img"
      aria-label="내 파일함 예시: 홈페이지 마이페이지에서 내 파일함으로 들어가면 변환한 한글 파일이 남은 보관 기간과 함께 보이고, PC와 휴대폰 모두 한글 파일 받기와 카카오톡 공유 버튼으로 받거나 보낼 수 있습니다."
    >
      {/* PC — 내 파일함 목록 */}
      {/* 휴대폰은 목록 아래 오른쪽에 살짝만 겹친다 — 목록의 '남은 기간' 칸을 가리지 않게 */}
      <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)] sm:mr-20 md:mr-8 lg:mr-20">
        <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          <span>마이페이지</span>
          <span className="text-zinc-300" aria-hidden="true">›</span>
          <span className="inline-flex items-center gap-1 font-semibold text-zinc-900">
            <FolderIcon className="h-3.5 w-3.5 text-violet-600" />
            내 파일함
          </span>
        </div>
        <div className="px-3 pb-2 pt-3 sm:px-4">
          <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-400">
            <span>시험지명</span>
            <span>보관 기한</span>
          </div>
          {ROWS.map((r) => (
            <div
              key={r.name}
              className={
                "flex items-center gap-2.5 border-t border-zinc-100 px-1 py-2.5 " + (r.tone === "selected" ? "bg-violet-50/70" : "")
              }
            >
              <HwpIcon />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-zinc-900 sm:text-[13px]">{r.name}</div>
                <div className="text-[10px] text-zinc-500">{r.meta}</div>
              </div>
              <div className={"shrink-0 text-right " + (r.tone === "soon" ? "text-orange-600" : "text-zinc-700")}>
                <div className="text-[11px] tabular-nums">{r.left}</div>
                <div className={"text-[10px] tabular-nums " + (r.tone === "soon" ? "" : "text-zinc-400")}>{r.until}</div>
              </div>
            </div>
          ))}
        </div>
        {/* PC에서도 받기·카카오톡 공유가 된다는 걸 보여 준다(휴대폰 전용으로 오해하지 않게, 사용자 11-06).
            오른쪽 아래는 휴대폰 그림이 겹치는 자리라 버튼은 왼쪽에 둔다 */}
        <div className="flex items-center gap-1.5 border-t border-zinc-100 px-3 py-2.5 sm:px-4">
          <span className="mr-0.5 hidden truncate text-[10px] text-zinc-500 min-[480px]:inline">선택한 파일</span>
          <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            한글 파일 받기
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-[#FEE500] px-2.5 py-1.5 text-[10px] font-semibold text-black/85">
            <KakaoBubble />
            카카오톡
          </span>
        </div>
      </div>

      {/* 휴대폰 — 받기 화면 */}
      {/* 목록이 좁아지는 md~lg(768~1279px)에선 겹치면 PC [카카오톡] 버튼을 가려 겹치지 않게 내린다 */}
      <div className="relative z-10 mx-auto mt-5 w-[200px] sm:-mt-5 sm:mr-0 sm:w-[188px] md:mt-3 xl:-mt-5">
        <div className="overflow-hidden rounded-[22px] border-[5px] border-zinc-900 bg-white shadow-[0_20px_48px_-12px_rgba(24,24,27,0.35)]">
          <div className="border-b border-zinc-100 px-3 py-2 text-[9px] text-zinc-500">‹ 목록</div>
          <div className="px-3 pb-2.5 pt-2.5">
            <div className="flex items-start gap-1.5">
              <HwpIcon className="h-5 w-[18px]" />
              <div className="min-w-0 text-[10px] font-semibold leading-snug text-zinc-900">정적분의 활용 변형_변환.hwp</div>
            </div>
            <div className="mt-1 pl-[24px] text-[8.5px] text-zinc-500">12.05 (토)까지 · 29일 남음</div>
            <div className="mt-2.5 border-t border-zinc-100 pt-2 text-[8.5px] font-semibold text-zinc-700">첫 문제 미리보기</div>
            <div className="mt-1 text-[9px] leading-relaxed text-zinc-700">
              1. 곡선 <span className="italic" style={MATH}>y</span> = <span className="italic" style={MATH}>x</span>
              <sup className="text-[6px]">2</sup> − 4<span className="italic" style={MATH}>x</span> + 3과{" "}
              <span className="italic" style={MATH}>x</span>축으로 둘러싸인 부분의 넓이는?
            </div>
          </div>
          <div className="flex gap-1.5 border-t border-zinc-100 px-2.5 py-2.5">
            <span className="flex flex-1 items-center justify-center whitespace-nowrap rounded-md bg-violet-600 py-1.5 text-[8.5px] font-semibold text-white">
              한글 파일 받기
            </span>
            <span className="flex items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#FEE500] px-2 py-1.5 text-[8.5px] font-semibold text-black/85">
              <KakaoBubble />
              카카오톡
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
