// 해설 생성 — 실제 학교 시험지 사진(3번, 학교명 잘라냄) → 실제 변환 결과(문제 + 정답 및 해설) 그대로.
// 'AI가 써 준다'는 말 대신 결과물로 보여 준다(D-043, 2026-10-12 사용자 결정). 그림 속 글자는 다시 치지 않은
// 변환 파일 캡처(samples/KakaoTalk_20260703_153237459_변환.hwp → PDF → 자르기). 앱 업데이트 팝업·시작 공지와 같은 재료.
export default function RealSolutionShowcase() {
  return (
    <div className="relative pb-2">
      {/* 원본 사진 — 학생 풀이 낙서가 그대로 남은 실제 시험지 */}
      <figure className="relative z-10 w-[62%] sm:w-[52%] -rotate-2 rounded-md bg-white p-1.5 shadow-xl shadow-zinc-900/20 ring-1 ring-zinc-200">
        <figcaption className="absolute -top-3 left-2 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-white">
          원본 사진
        </figcaption>
        <img
          src="/showcase/solution/original.jpg"
          alt="학생 풀이 낙서가 남은 실제 수학 시험지 사진 — 3번 문제"
          width={980}
          height={570}
          className="block w-full rounded-sm"
        />
      </figure>

      <div
        aria-hidden
        className="relative z-20 -mt-4 ml-[52%] sm:ml-[46%] flex h-10 w-10 items-center justify-center rounded-full bg-[#D9F99D] text-lg font-bold text-[#1B0B45] shadow-lg"
      >
        ↓
      </div>

      {/* 실제 변환 결과 — 한글 문서 */}
      <div className="relative -mt-3 rounded-xl border border-zinc-200 bg-white shadow-xl shadow-violet-900/10 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2.5 text-xs text-zinc-500">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden />
          한글 문서 (.hwp)
          <span className="ml-auto rounded-full bg-[#1B0B45] px-2.5 py-1 text-[11px] font-bold text-[#D9F99D]">
            실제 변환 결과
          </span>
        </div>
        <div className="px-4 sm:px-6 pt-4 pb-5">
          <img
            src="/showcase/solution/problem.png"
            alt="변환된 3번 문제 — 한글 수식으로 바뀐 문제와 선택지"
            width={867}
            height={410}
            className="block w-full"
          />
          <div className="my-3 flex items-center gap-3 text-xs font-semibold text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200" />
            정답 및 해설
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <img
            src="/showcase/solution/solution.png"
            alt="함께 만들어진 3번 해설 — y축 대칭과 수선의 발로 a+b−c=1을 구하는 풀이"
            width={867}
            height={354}
            className="block w-full"
          />
        </div>
      </div>
    </div>
  );
}
