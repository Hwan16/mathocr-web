import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "한글(한컴오피스) 연결 오류 해결 가이드",
  description:
    "MathOCR 변환 시 '한글(한컴오피스) 설치가 손상되어 있어 앱과 연결할 수 없습니다' 또는 '라이브러리가 등록되지 않았습니다' 오류가 뜰 때, 한컴오피스 복구 설치로 해결하는 방법을 그림과 함께 안내합니다.",
  alternates: { canonical: "/help/hwp-repair" },
};

// 복구 절차 각 단계. 스크린샷은 실제 복구 과정(한컴오피스 2022, Windows 11)에서 캡처.
const STEPS: {
  title: string;
  body: React.ReactNode;
  image?: string;
  imageAlt?: string;
  warning?: React.ReactNode;
}[] = [
  {
    title: "Windows 설정에서 한컴오피스 찾기",
    body: (
      <>
        <strong className="text-zinc-900">Windows 설정 → 앱 → 설치된 앱</strong>으로
        이동한 뒤, 검색창에 <strong className="text-zinc-900">&ldquo;한컴&rdquo;</strong>을
        입력하세요. 한컴오피스 항목 오른쪽의 <strong className="text-zinc-900">⋯ 버튼 →
        수정</strong>을 클릭합니다.
      </>
    ),
    image: "/guide/hwp-repair/step-1.png",
    imageAlt: "Windows 설정 > 앱 > 설치된 앱에서 '한컴'을 검색한 화면",
  },
  {
    title: "실행 중인 프로그램 닫기",
    body: (
      <>
        아래와 같은 창이 뜨면 <strong className="text-zinc-900">&ldquo;자동으로 응용
        프로그램을 닫고 삭제를 시작합니다&rdquo;</strong>가 선택된 상태 그대로{" "}
        <strong className="text-zinc-900">[다음]</strong>을 클릭하세요. 목록에 보이는
        프로그램은 자동으로 닫혔다가 복구가 끝나면 다시 사용할 수 있습니다.
      </>
    ),
    image: "/guide/hwp-repair/step-2.png",
    imageAlt: "작업을 계속하려면 다음 응용 프로그램을 닫아야 합니다 창",
  },
  {
    title: "구성 요소는 그대로 두고 [변경] 클릭",
    body: (
      <>
        구성 요소 선택 창이 나타나면{" "}
        <strong className="text-zinc-900">체크박스를 건드리지 말고 그대로</strong> 오른쪽
        아래 <strong className="text-zinc-900">[변경]</strong>을 클릭하세요. 이미 설치된
        프로그램을 같은 자리에 다시 설치하면서 손상된 연결 정보를 되살리는 과정입니다.
      </>
    ),
    warning: (
      <>
        체크를 <strong>해제</strong>하면 그 프로그램(한워드·한셀 등)이 컴퓨터에서{" "}
        <strong>제거될 수 있습니다.</strong> 반드시 체크 상태를 그대로 두세요.
      </>
    ),
    image: "/guide/hwp-repair/step-3.png",
    imageAlt: "변경하려는 구성 요소를 선택하십시오 창 — 체크박스를 그대로 두고 변경 클릭",
  },
  {
    title: "변경 완료 → [마침]",
    body: (
      <>
        잠시 기다리면 <strong className="text-zinc-900">&ldquo;성공적으로
        변경했습니다&rdquo;</strong> 화면이 나옵니다.{" "}
        <strong className="text-zinc-900">[마침]</strong>을 클릭하세요.
      </>
    ),
    image: "/guide/hwp-repair/step-4.png",
    imageAlt: "한컴오피스 2022를 성공적으로 변경했습니다 화면",
  },
  {
    title: "자동으로 뜨는 '한컴 기본 설정' 창에서 [기본값으로 설정]",
    body: (
      <>
        마침을 누르면 <strong className="text-zinc-900">&ldquo;한컴 기본
        설정&rdquo;</strong> 창이 자동으로 나타납니다. 왼쪽의{" "}
        <strong className="text-zinc-900">[기본값으로 설정]</strong>을 클릭하세요. (한글
        화면·도구 설정을 직접 바꿔서 쓰고 계셨다면 &lsquo;사용자 설정&rsquo;을 선택해도
        됩니다.)
      </>
    ),
    image: "/guide/hwp-repair/step-5.png",
    imageAlt: "한컴 기본 설정 창 — 기본값으로 설정과 사용자 설정 중 선택",
  },
  {
    title: "구성 완료 → [마침]",
    body: (
      <>
        <strong className="text-zinc-900">&ldquo;구성을 완료했습니다&rdquo;</strong>{" "}
        화면이 나오면 <strong className="text-zinc-900">[마침]</strong>을 클릭하세요.
        여기까지 오면 복구는 끝났습니다.
      </>
    ),
    image: "/guide/hwp-repair/step-6.png",
    imageAlt: "한컴오피스 2022 구성을 완료했습니다 화면",
  },
  {
    title: "컴퓨터 재시작 후 변환 다시 시도",
    body: (
      <>
        <strong className="text-zinc-900">컴퓨터를 재시작</strong>한 뒤 MathOCR을 실행해
        변환을 다시 시도해 보세요. 대부분 여기서 정상적으로 변환됩니다.
      </>
    ),
  },
];

export default function HwpRepairGuidePage() {
  return (
    <div className="min-h-screen px-4 py-16 md:py-20 bg-zinc-50">
      <div className="w-full max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex flex-col items-center gap-3">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={48} height={48} />
            <span className="text-2xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <h1 className="text-2xl md:text-3xl font-bold mt-5">
            한글(한컴오피스) 연결 오류 해결 가이드
          </h1>
          <p className="text-zinc-500 text-sm mt-3">
            5~10분이면 해결됩니다 · 문서와 파일은 지워지지 않습니다
          </p>
        </div>

        {/* 어떤 오류일 때 이 가이드를 따라하나 */}
        <div className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">
            이런 오류가 떴다면 이 가이드를 따라 하세요
          </h2>
          <div className="rounded-lg bg-zinc-100 border border-zinc-200 px-4 py-3 text-sm text-zinc-700 space-y-1 mb-4">
            <p>&ldquo;한글(한컴오피스) 설치가 손상되어 있어 앱과 연결할 수 없습니다&rdquo;</p>
            <p>&ldquo;라이브러리가 등록되지 않았습니다&rdquo;</p>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">
            MathOCR은 PC에 설치된 한/글을 이용해 HWP 문서를 만듭니다. 그런데 Windows에
            저장된 한글 연결 정보가 손상되면, <strong className="text-zinc-900">한글
            프로그램 자체는 멀쩡히 실행되더라도</strong> 변환은 실패합니다. 아래의
            &lsquo;복구 설치&rsquo;로 연결 정보를 되살리면 해결됩니다.
          </p>
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 leading-relaxed">
            <strong>먼저 확인:</strong> 변환에는 정식 한/글(한컴오피스)이 필요합니다. 무료
            &lsquo;한글 뷰어&rsquo;만 설치된 경우에는 이 가이드로 해결되지 않으며, 정식
            한글(2014 이상 권장)을 설치해야 합니다.
          </div>
        </div>

        {/* 단계별 절차 */}
        <div className="space-y-6">
          {STEPS.map((step, i) => (
            <div key={i} className="card rounded-xl p-6 md:p-8 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base md:text-lg font-semibold text-zinc-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">{step.body}</p>
                  {step.warning && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 leading-relaxed">
                      ⚠️ {step.warning}
                    </div>
                  )}
                </div>
              </div>
              {step.image && (
                <img
                  src={step.image}
                  alt={step.imageAlt}
                  className="mt-5 w-full rounded-lg border border-zinc-200"
                />
              )}
            </div>
          ))}
        </div>

        {/* 그래도 안 될 때 */}
        <div className="card rounded-xl p-6 md:p-8 shadow-sm mt-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">그래도 안 되나요?</h2>
          <ul className="text-sm text-zinc-600 leading-relaxed space-y-2 list-disc pl-5">
            <li>
              한컴오피스를 <strong className="text-zinc-900">제거한 뒤 다시
              설치</strong>해 보세요. 프로그램만 다시 설치되는 것이라 작성해 둔 문서는
              지워지지 않습니다.
            </li>
            <li>
              그래도 같은 오류가 반복되면{" "}
              <a
                href="mailto:aimathocr.official@gmail.com"
                className="text-[var(--accent)] font-medium hover:underline"
              >
                aimathocr.official@gmail.com
              </a>
              으로 오류 화면을 캡처해서 보내 주세요. 확인 후 도와드리겠습니다.
            </li>
          </ul>
        </div>

        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}
