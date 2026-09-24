import type { Metadata } from "next";
import { SIGNUP_FREE_CREDITS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "한글(HWP) 수식 입력 방법 — 수식 편집기 명령어 정리",
  description:
    "한글(한컴오피스)에서 수식 편집기를 여는 법과 분수·루트·지수·극한·시그마·적분·벡터·각도 등 수학 수식 명령어를 예시와 함께 정리했습니다. 자주 막히는 중괄호·띄어쓰기·정자체 팁까지.",
  alternates: { canonical: "/help/hwp-equation" },
};

// 명령어 예시는 앱의 LaTeX→HWP 변환기(src/latex_to_hwp.py)가 실제 변환에서
// 한글에 넣는 문법과 동일하다. 표를 고칠 때는 변환기 출력으로 다시 확인할 것.
const COMMANDS: { name: string; code: string; result: string }[] = [
  { name: "분수", code: "{a} over {b}", result: "a/b (분수)" },
  { name: "제곱근", code: "sqrt{2}", result: "√2" },
  { name: "세제곱근", code: "root {3} of {x}", result: "∛x" },
  { name: "거듭제곱", code: "x^{2}", result: "x²" },
  { name: "아래첨자", code: "a_{n}", result: "aₙ" },
  { name: "첨자 함께", code: "x_{1}^{2}", result: "x₁²" },
  { name: "플러스마이너스", code: "+-", result: "±" },
  { name: "부등호", code: "a <= b , a >= b", result: "a ≤ b, a ≥ b" },
  { name: "무한대", code: "inf", result: "∞" },
  { name: "극한", code: "lim _{x rightarrow 0} {sin x} over {x}", result: "lim(x→0) sin x / x" },
  { name: "시그마", code: "sum _{k=1}^{n} a_{k}", result: "Σ(k=1~n) aₖ" },
  { name: "적분", code: "int _{0}^{1} f(x) dx", result: "∫₀¹ f(x) dx" },
  { name: "로그", code: "log _{2} 8", result: "log₂ 8" },
  { name: "큰 괄호", code: "left( {1} over {2} right)^{2}", result: "(½)² — 괄호가 분수 높이에 맞춰짐" },
  { name: "선분", code: "overline{AB}", result: "AB 위 가로줄" },
  { name: "벡터", code: "vec{AB}", result: "AB 위 화살표" },
  { name: "각도(도)", code: "60 DEG", result: "60°" },
  { name: "각", code: "angle ABC", result: "∠ABC" },
  { name: "삼각형", code: "TRIANGLE ABC", result: "△ABC" },
  { name: "그리스 문자", code: "alpha + beta , theta , pi", result: "α + β, θ, π" },
  { name: "따라서", code: "therefore", result: "∴" },
  { name: "경우 나누기", code: "cases{x+1 & x >= 0 # -x & x < 0}", result: "중괄호로 묶인 두 줄 식" },
  { name: "행렬", code: "left( matrix{1 & 2 # 3 & 4} right)", result: "2×2 행렬" },
];

const TIPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "여러 글자는 반드시 중괄호 { }로 묶기",
    body: (
      <>
        <code className="eq">a+b over c</code>라고 쓰면 <strong className="text-zinc-900">c 위에
        b만</strong> 올라갑니다. 분자·분모·지수·첨자가 두 글자 이상이면{" "}
        <code className="eq">{"{a+b} over {c}"}</code>, <code className="eq">{"x^{n+1}"}</code>처럼
        항상 중괄호로 묶으세요. 수식이 이상하게 나올 때 대부분 이 문제입니다.
      </>
    ),
  },
  {
    title: "띄어쓰기는 수식에 반영되지 않는다 — 공백은 ~",
    body: (
      <>
        수식 편집기에서 스페이스바로 띄운 칸은 명령어를 구분하는 용도일 뿐 결과에는 나타나지
        않습니다. 수식 안에서 실제로 한 칸 띄우려면 물결표{" "}
        <code className="eq">~</code>를 넣으세요.
      </>
    ),
  },
  {
    title: "단위·점 이름은 정자체로: rm … it",
    body: (
      <>
        수식 글자는 기본이 기울임꼴이라 <em>cm</em>, <em>kg</em> 같은 단위도 기울어집니다.{" "}
        <code className="eq">{"3 rm {cm} it"}</code>처럼 <code className="eq">rm</code>으로
        바로 세우고 <code className="eq">it</code>으로 다시 기울임꼴로 돌려놓으세요.{" "}
        <code className="eq">it</code>을 빼먹으면 뒤의 글자까지 전부 정자체가 됩니다.
      </>
    ),
  },
  {
    title: "괄호 안에 분수가 있으면 left( … right)",
    body: (
      <>
        그냥 <code className="eq">(</code>를 쓰면 괄호가 글자 높이 그대로라 분수를 다 감싸지
        못합니다. <code className="eq">{"left( {1} over {2} right)"}</code>처럼 쓰면 괄호가
        안쪽 높이에 맞춰 커집니다. 대괄호·절댓값도 <code className="eq">left[ … right]</code>,{" "}
        <code className="eq">{"left| … right|"}</code>로 같은 방식입니다.
      </>
    ),
  },
  {
    title: "이미 넣은 수식 고치기",
    body: (
      <>
        본문의 수식을 <strong className="text-zinc-900">더블클릭</strong>하면 수식 편집기가 다시
        열리고, 입력했던 명령어를 그대로 고칠 수 있습니다.
      </>
    ),
  },
];

export default function HwpEquationGuidePage() {
  return (
    <div className="min-h-screen px-4 py-16 md:py-20 bg-zinc-50">
      <style>{`.eq{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.85em;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:1px 5px;color:#18181b;white-space:nowrap}`}</style>
      <article className="w-full max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex flex-col items-center gap-3">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={48} height={48} />
            <span className="text-2xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <h1 className="text-2xl md:text-3xl font-bold mt-5">
            한글(HWP) 수식 입력 방법
          </h1>
          <p className="text-zinc-500 text-sm mt-3">
            수식 편집기 여는 법 · 자주 쓰는 명령어 · 자주 막히는 부분
          </p>
        </div>

        {/* 바로 답 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">한 줄 요약</h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            한글에서 수식을 넣으려면{" "}
            <strong className="text-zinc-900">[입력] 메뉴 → [수식]</strong>(단축키{" "}
            <strong className="text-zinc-900">Ctrl+N, M</strong>)으로 수식 편집기를 열고, 아래쪽
            입력 칸에 <code className="eq">{"{a} over {b}"}</code>,{" "}
            <code className="eq">{"sqrt{2}"}</code> 같은 명령어를 입력한 뒤{" "}
            <strong className="text-zinc-900">[넣기]</strong>를 누르면 됩니다. 이렇게 넣은 수식은
            그림이 아니라 편집 가능한 수식 개체라서, 나중에 더블클릭해 언제든 고칠 수 있습니다.
          </p>
        </section>

        {/* 여는 법 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">1. 수식 편집기 여는 법</h2>
          <ol className="text-sm text-zinc-600 leading-relaxed space-y-2 list-decimal pl-5">
            <li>수식을 넣을 위치에 커서를 둡니다.</li>
            <li>
              상단 <strong className="text-zinc-900">[입력] → [수식]</strong>을 누르거나{" "}
              <strong className="text-zinc-900">Ctrl+N</strong>을 눌렀다 뗀 뒤 바로{" "}
              <strong className="text-zinc-900">M</strong>을 누릅니다.
            </li>
            <li>
              열린 창의 아래쪽 입력 칸에 명령어를 입력하면 위쪽에 결과가 미리 보입니다. 위쪽
              도구 상자의 기호 버튼을 눌러도 명령어가 입력됩니다.
            </li>
            <li>
              <strong className="text-zinc-900">[넣기]</strong>를 누르면 본문에 수식이 들어갑니다.
            </li>
          </ol>
        </section>

        {/* 명령어 표 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">
            2. 수학 수식 명령어 정리
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            중·고등 수학 시험지에서 자주 쓰는 것 위주입니다. 입력 칸에 왼쪽 명령어를 그대로
            쓰면 오른쪽처럼 나옵니다.
          </p>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="py-2 px-2 font-medium whitespace-nowrap">종류</th>
                  <th className="py-2 px-2 font-medium">입력할 명령어</th>
                  <th className="py-2 px-2 font-medium">결과</th>
                </tr>
              </thead>
              <tbody>
                {COMMANDS.map((c) => (
                  <tr key={c.name} className="border-b border-zinc-100 align-top">
                    <td className="py-2 px-2 text-zinc-900 font-medium whitespace-nowrap">
                      {c.name}
                    </td>
                    <td className="py-2 px-2">
                      <code className="eq" style={{ whiteSpace: "normal" }}>{c.code}</code>
                    </td>
                    <td className="py-2 px-2 text-zinc-600">{c.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-400 mt-3">
            경우 나누기·행렬에서 <code className="eq">&amp;</code>는 칸 구분,{" "}
            <code className="eq">#</code>은 줄바꿈입니다.
          </p>
        </section>

        {/* 팁 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">3. 자주 막히는 부분</h2>
          <div className="space-y-5">
            {TIPS.map((t) => (
              <div key={t.title}>
                <h3 className="text-sm md:text-base font-semibold text-zinc-900 mb-1.5">
                  {t.title}
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 문제가 많을 때 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm border-2 border-[var(--accent)]/20">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">
            4. 옮길 문제가 많다면
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            한두 문제는 위 명령어로 직접 입력하는 게 가장 빠릅니다. 하지만 시험지 한 장을
            옮기려면 수식을 하나하나 입력하느라 시간이 오래 걸립니다.{" "}
            <strong className="text-zinc-900">AI MathOCR</strong>은 수학 문제 PDF나 사진을 읽어,
            위와 같은 <strong className="text-zinc-900">편집 가능한 한글 수식</strong>으로 HWP
            파일을 만들어 주는 Windows 프로그램입니다. 결과 수식도 더블클릭하면 그대로 고칠 수
            있습니다.
          </p>
          <ul className="text-sm text-zinc-500 leading-relaxed list-disc pl-5 mt-3 space-y-1">
            <li>PC에 정품 한글(한컴오피스, 2014 이상 권장)이 설치되어 있어야 합니다.</li>
            <li>회원가입하면 {SIGNUP_FREE_CREDITS}문제를 무료로 변환해 볼 수 있습니다.</li>
          </ul>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <a
              href="/auth/signup"
              className="btn-primary text-sm px-5 py-2.5 rounded-lg text-center"
            >
              회원가입하고 {SIGNUP_FREE_CREDITS}문제 무료로 시작
            </a>
            <a
              href="/#guide"
              className="text-sm px-5 py-2.5 rounded-lg text-center border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              사용법 영상 보기
            </a>
          </div>
        </section>

        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            홈으로 돌아가기
          </a>
        </div>
      </article>
    </div>
  );
}
