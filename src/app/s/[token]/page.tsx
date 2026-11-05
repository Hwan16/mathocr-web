import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { isExpired, isShareToken } from "@/lib/file-box";
import { formatMonthDay } from "@/lib/file-box-types";

// 카카오톡 '받기 링크'(D-054) — 받은 사람이 로그인 없이 한글 파일을 받는 화면.
// 보낸 사람 정보(이메일 등)는 보여 주지 않는다. 검색엔진에 올리지 않는다.
export const metadata: Metadata = {
  title: "한글 파일 받기",
  robots: { index: false, follow: false },
  // 주소(토큰)가 곧 받기 권한 — 다른 사이트·저장소로 이동할 때 Referer 로 새지 않게
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let file: { file_name: string; problem_count: number; solution_count: number; expires_at: string } | null = null;
  if (isShareToken(token)) {
    const { data } = await createAdminClient()
      .from("stored_files")
      .select("file_name, problem_count, solution_count, expires_at, file_deleted_at, uploaded_at, deleted_at")
      .eq("share_token", token)
      .maybeSingle();
    if (data && data.uploaded_at && !data.deleted_at && !data.file_deleted_at && !isExpired(data.expires_at)) file = data;
  }

  return (
    <main className="min-h-screen bg-zinc-50 flex flex-col items-center px-4 py-10">
      <a href="/" className="flex items-center gap-2 mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mathocr-icon.png" alt="" width={32} height={32} />
        <span className="text-base font-bold tracking-tight">
          AI Math<span className="text-[var(--accent)]">OCR</span>
        </span>
      </a>
      <div className="card w-full max-w-md rounded-xl p-6 sm:p-7">
        {file ? (
          <>
            <p className="text-xs text-zinc-500">공유받은 한글 파일</p>
            <h1 className="mt-1 text-lg font-semibold leading-snug break-words">{file.file_name}</h1>
            <p className="mt-2 text-sm text-zinc-500 tabular-nums">
              문제 {file.problem_count}
              {file.solution_count ? ` · 해설 ${file.solution_count}` : ""} ·{" "}
              {formatMonthDay(new Date(file.expires_at))}까지 받을 수 있어요
            </p>
            <a
              href={`/api/share/${token}`}
              className="btn-primary mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm"
            >
              한글 파일 받기
            </a>
            <ul className="mt-5 space-y-1.5 text-xs leading-relaxed text-zinc-500">
              <li>· 한글(HWP) 파일이라 한컴오피스 한글이나 한컴오피스 뷰어로 열 수 있어요.</li>
              <li>· 카카오톡 안에서 받아지지 않으면 오른쪽 위 메뉴에서 &lsquo;다른 브라우저로 열기&rsquo;를 눌러 주세요.</li>
            </ul>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">받을 수 없는 파일이에요</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              보관 기간이 지났거나 보낸 분이 파일을 지웠어요. 보낸 분께 다시 보내 달라고 요청해 주세요.
            </p>
          </>
        )}
      </div>
      <p className="mt-8 text-xs text-zinc-400">
        <a href="/" className="underline underline-offset-2 hover:text-zinc-600">
          AI MathOCR
        </a>{" "}
        — 사진·PDF 수학 시험지를 한글 파일로 바꿔 주는 프로그램
      </p>
    </main>
  );
}
