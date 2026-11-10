// 불러오는 동안 보여 주는 '윤곽 화면'(스켈레톤) — "로딩 중..." 글자 대신,
// 곧 나타날 화면과 같은 자리에 회색 막대가 은은하게 깜빡인다(사용자 요청 2026-11-10).
// 원칙: 제목·칸 이름처럼 바뀌지 않는 글자는 그대로 보여 주고, 데이터가 들어갈 자리만 회색 막대로.
// 실제 화면의 여백·폭을 그대로 따라 해야 다 불러온 뒤 화면이 덜컥 움직이지 않는다 —
// 원본 화면 배치를 바꾸면 여기도 같이 바꿀 것.
// 깜빡임은 globals.css의 .skeleton(움직임 줄이기 설정이면 멈춘 회색 막대).

import Wordmark from "@/components/Wordmark";

/** 회색 막대 하나. 크기·모양은 className으로(h-4 w-24 rounded-full 등). */
export function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton block rounded-md ${className}`} style={style} />;
}

/** 화면 읽기 프로그램에는 '불러오는 중'으로 한 번만 읽히게 하는 감싸개. */
function Loading({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* ── 마이페이지(/dashboard) ── 원본: app/dashboard/page.tsx */

export function DashboardSkeleton() {
  return (
    <Loading label="마이페이지를 불러오는 중" className="min-h-screen">
      <nav className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={36} height={36} />
            <Wordmark decorative className="h-[13px] shrink-0 w-auto text-zinc-900" />
          </a>
          <div className="flex items-center gap-3 sm:gap-4">
            <Bone className="h-4 w-[72px]" />
            <Bone className="hidden sm:block h-4 w-40" />
            <Bone className="h-4 w-12" />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold mb-8">
          마이페이지
          {/* 모바일에선 제목 아래에 이메일이 한 줄 붙는다 */}
          <Bone className="sm:hidden mt-2 h-4 w-44" />
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">잔여 크레딧</div>
            <Bone className="mt-1 h-8 w-24" />
            <Bone className="mt-3 h-4 w-20" />
          </div>
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">유효기간</div>
            <Bone className="mt-1 h-6 w-32" />
          </div>
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">총 변환 횟수</div>
            <Bone className="mt-1 h-8 w-16" />
          </div>
        </div>

        <div className="bezel-card rounded-2xl p-6 mb-10">
          <h2 className="text-lg font-semibold mb-1">프로모션 코드</h2>
          <p className="text-sm text-zinc-500 mb-4">프로모션 코드가 있다면 입력하고 크레딧을 받으세요.</p>
          <Bone className="h-[42px] max-w-md rounded-xl" />
        </div>

        <div className="bezel-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">변환 이력</h2>
            <Bone className="h-4 w-36" />
          </div>
          <ul>
            {[220, 160, 260, 190, 140].map((w, i) => (
              <li key={i} className="px-6 py-3.5 flex items-center gap-6 border-b border-[var(--border-subtle)] last:border-0">
                <Bone className="h-4 w-[72px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <Bone className="h-4 max-w-full" style={{ width: w }} />
                </span>
                <Bone className="hidden sm:block h-4 w-8 shrink-0" />
                <Bone className="hidden sm:block h-4 w-8 shrink-0" />
                <Bone className="h-5 w-11 shrink-0 rounded-full" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Loading>
  );
}

/** 마이페이지 아래 '크레딧 지급 내역' 카드의 목록 자리. */
export function CreditHistorySkeleton() {
  return (
    <Loading label="크레딧 지급 내역을 불러오는 중">
      <ul className="divide-y divide-[var(--border-subtle)]">
        {["w-36", "w-28", "w-32"].map((w, i) => (
          <li key={i} className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
            <Bone className={`h-4 ${w}`} />
            <div className="flex items-center gap-4 shrink-0">
              <Bone className="h-4 w-8" />
              <Bone className="hidden sm:block h-3.5 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/* ── 크레딧 충전(/charge) ── 원본: app/charge/page.tsx (보유 크레딧 줄 + 요금제 카드 3개) */

export function ChargeSkeleton() {
  return (
    <Loading label="충전 화면을 불러오는 중">
      <div className="card rounded-xl p-5 bg-white mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Bone className="h-5 w-28" />
        <Bone className="h-5 w-40" />
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card rounded-xl p-5 bg-white">
            <Bone className="h-6 w-16 rounded-full mb-3" />
            <Bone className="h-7 w-28 mb-2" />
            <Bone className="h-3.5 w-full max-w-[170px]" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/* ── 내 파일함(/files) ── 원본: components/file-box/FileBox.tsx */

/** 파일 목록 자리 — 실제 줄과 같은 칸 나눔(.row-grid)을 쓴다. */
export function FileListSkeleton() {
  return (
    <Loading label="파일 목록을 불러오는 중">
      <ul className="divide-y divide-[var(--border-subtle)]">
        {["w-56", "w-44", "w-64", "w-40", "w-52", "w-48"].map((w, i) => (
          <li key={i} className="row-grid px-1 py-3">
            <div className="flex justify-center">
              <Bone className="h-4 w-4 rounded" />
            </div>
            <div className="min-w-0 flex items-center gap-3 pl-1">
              <Bone className="h-8 w-7 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <Bone className={`h-4 max-w-full ${w}`} />
                <Bone className="mt-2 h-3 w-24" />
              </div>
            </div>
            <Bone className="hidden sm:block h-4 w-24" />
            <Bone className="hidden sm:block h-5 w-24 rounded-full" />
            <div className="flex justify-center">
              <Bone className="h-5 w-5 rounded" />
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/** 첫 문제 미리보기 자리 — 문제 글 몇 줄. */
export function PreviewSkeleton() {
  return (
    <Loading label="미리보기를 불러오는 중" className="space-y-2.5">
      <Bone className="h-4 w-full" />
      <Bone className="h-4 w-11/12" />
      <Bone className="h-4 w-4/5" />
      <Bone className="h-4 w-2/3" />
      <Bone className="mt-4 h-24 w-40 rounded-lg" />
    </Loading>
  );
}

/* ── 로그인(/auth/login) ── 원본: app/auth/login/page.tsx (주소창 값을 읽기 전 잠깐) */

export function LoginSkeleton() {
  return (
    <Loading label="로그인 화면을 불러오는 중" className="w-full max-w-[400px]">
      <div className="text-center mb-8">
        <a href="/" className="inline-flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mathocr-icon.png" alt="AI MathOCR" width={56} height={56} />
          <Wordmark decorative className="h-[17px] w-auto text-zinc-900" />
        </a>
        <p className="text-zinc-500 text-sm mt-2">계정에 로그인하세요</p>
      </div>
      <div className="card rounded-xl p-8 shadow-sm">
        <div className="space-y-5">
          <div>
            <Bone className="h-4 w-12 mb-2" />
            <Bone className="h-[46px] w-full rounded-lg" />
          </div>
          <div>
            <Bone className="h-4 w-14 mb-2" />
            <Bone className="h-[46px] w-full rounded-lg" />
          </div>
          <div className="flex items-center justify-between">
            <Bone className="h-4 w-28" />
            <Bone className="h-4 w-20" />
          </div>
          <Bone className="h-[44px] w-full rounded-lg" />
        </div>
        <Bone className="mt-6 mx-auto h-4 w-44" />
      </div>
    </Loading>
  );
}
