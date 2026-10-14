import type { Metadata } from "next";
import temml from "temml";
// 결과 미리보기 MathML 기본 스타일(Cambria Math 등 OS 수식 글꼴 지정 + 크롬 보정)
import "temml/dist/Temml-Local.css";
import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { latexToHwp } from "@/lib/latex-to-hwp";
import LatexToHwpTool from "@/components/LatexToHwpTool";
import TrackedLink from "@/components/TrackedLink";

export const metadata: Metadata = {
  title: "ChatGPT 수식 한글(HWP) 변환기 — LaTeX를 한글 수식으로",
  description:
    "ChatGPT가 준 수식(\\frac, \\sqrt 같은 LaTeX)을 한글(한컴오피스) 수식 편집기에 그대로 붙이면 깨집니다. 답변을 붙여 넣으면 수식마다 한글 수식 명령어로 바꿔 복사 버튼으로 바로 넣을 수 있습니다. 무료, 로그인 필요 없음.",
  alternates: { canonical: "/help/latex-to-hwp" },
};

// 대응표 — 한글 쪽은 실제 변환기로 빌드 때 만든다(표와 도구 결과가 어긋나지 않게).
const MAPPING_TEX = [
  ["분수", "\\frac{a}{b}"],
  ["제곱근", "\\sqrt{x}"],
  ["세제곱근", "\\sqrt[3]{x}"],
  ["거듭제곱", "x^2"],
  ["작거나 같다", "a \\le b"],
  ["같지 않다", "a \\ne b"],
  ["플러스마이너스", "\\pm"],
  ["곱하기", "a \\times b"],
  ["무한대", "\\infty"],
  ["극한", "\\lim_{x \\to 0}"],
  ["시그마", "\\sum_{k=1}^{n}"],
  ["적분", "\\int_0^1"],
  ["선분", "\\overline{AB}"],
  ["벡터", "\\vec{a}"],
  ["각도", "60^\\circ"],
  ["이면 / 필요충분", "p \\Rightarrow q,\\ p \\Leftrightarrow q"],
  ["글자(정자체)", "\\text{cm}"],
  ["경우 나누기", "\\begin{cases} 1 & (x>0) \\\\ 0 & (x \\le 0) \\end{cases}"],
] as const;

const MAPPING = MAPPING_TEX.map(([name, tex]) => ({
  name,
  tex,
  hwp: latexToHwp(tex),
  mathml: temml.renderToString("\\displaystyle " + tex, { throwOnError: false }),
}));

const FAQ: { q: string; a: string }[] = [
  {
    q: "ChatGPT 수식을 한글에 붙여 넣으면 왜 깨지나요?",
    a: "ChatGPT는 수식을 LaTeX(\\frac{a}{b} 같은 논문용 표기)로 씁니다. 한글 수식 편집기는 자체 명령어({a} over {b})를 쓰고 역슬래시(\\)를 정자체 전환으로 읽기 때문에, LaTeX를 그대로 붙이면 \\frac{a}{b}가 fracab처럼 글자로 깨집니다.",
  },
  {
    q: "ChatGPT 답변은 어떻게 복사해야 하나요?",
    a: "답변 아래의 [복사] 버튼을 누르세요. 그러면 수식이 \\( … \\)나 \\[ … \\]로 감싸진 LaTeX 그대로 복사됩니다. 화면을 마우스로 드래그해 복사하면 수식이 이미 그려진 글자로 풀려서 들어와 변환할 수 없습니다.",
  },
  {
    q: "답변에 수식이 여러 개면 어떻게 되나요?",
    a: "답변 전체를 한 번에 붙여 넣으면 글은 그대로 두고 수식만 골라 하나씩 바꿉니다. 수식마다 [복사] 버튼이 있어 한글 수식 편집기에 하나씩 넣으면 됩니다.",
  },
  {
    q: "무료인가요? 입력한 내용이 저장되나요?",
    a: "무료이고 로그인이 필요 없습니다. 붙여 넣은 내용은 변환에만 쓰고 저장하지 않습니다.",
  },
  {
    q: "바뀐 결과가 한글에서 이상하게 보이면?",
    a: "대부분은 ChatGPT 답변의 LaTeX가 중간에 잘렸거나 짝이 맞지 않는 경우입니다. 해당 수식만 다시 붙여 넣어 보거나, 한글 수식 명령어 사전에서 같은 기호를 찾아 직접 고칠 수 있습니다.",
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function LatexToHwpPage() {
  return (
    <div className="min-h-screen px-4 py-16 md:py-20 bg-zinc-50">
      <style>{`
.eq{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.85em;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:1px 5px;color:#18181b;white-space:nowrap}
.eq-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:5px;padding:5px 8px;color:#18181b;overflow-wrap:anywhere;word-break:normal}
.eq-render math{font-size:1.1em}
.eq-render math,.eq-render math *{font-family:"Cambria Math","STIX Two Math","Latin Modern Math",math}
`}</style>
      <script
        type="application/ld+json"
        // JSON-LD는 신뢰된 내부 정적 데이터라 안전
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <article className="w-full max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex flex-col items-center gap-3">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={48} height={48} />
            <span className="text-2xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <h1 className="text-2xl md:text-3xl font-bold mt-5">ChatGPT 수식 → 한글(HWP) 수식 변환기</h1>
          <p className="text-zinc-500 text-sm mt-3">
            LaTeX 수식을 한글 수식 편집기 명령어로 · 무료 · 로그인 없음
          </p>
        </div>

        {/* 도구 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <p className="text-sm text-zinc-600 leading-relaxed mb-5">
            ChatGPT가 준 수식을 한글에 그대로 붙이면{" "}
            <code className="eq">{"\\frac{a}{b}"}</code>가 <strong className="text-zinc-900">fracab</strong>
            처럼 깨집니다. 답변을 아래에 붙여 넣으면 글은 그대로 두고 수식만 골라{" "}
            <code className="eq">{"{a} over {b}"}</code> 같은 한글 수식 명령어로 바꿔 드립니다.
          </p>
          <LatexToHwpTool signupFreeCredits={SIGNUP_FREE_CREDITS} />
        </section>

        {/* 사용 방법 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">사용 방법</h2>
          <ol className="text-sm text-zinc-600 leading-relaxed space-y-2 list-decimal pl-5">
            <li>
              ChatGPT 답변 아래의 <strong className="text-zinc-900">[복사]</strong> 버튼을 누릅니다
              (드래그해서 복사하면 수식이 글자로 풀려 들어옵니다).
            </li>
            <li>
              위 칸에 붙여 넣고 <strong className="text-zinc-900">[한글 수식으로 변환]</strong>을
              누릅니다.
            </li>
            <li>
              한글에서 <strong className="text-zinc-900">Ctrl+N, M</strong>으로 수식 편집기를 열고, 바뀐
              수식의 [복사] → 아래쪽 입력 칸에 <strong className="text-zinc-900">Ctrl+V</strong> →{" "}
              <strong className="text-zinc-900">Shift+Esc</strong>로 넣습니다.
            </li>
          </ol>
        </section>

        {/* 대응표 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">LaTeX ↔ 한글 수식 대응표</h2>
          <p className="text-sm text-zinc-500 mb-4">
            자주 나오는 것만 모았습니다. 단원별 전체 목록은{" "}
            <TrackedLink
              href="/help/hwp-equation#commands"
              label="hwp_equation_dictionary"
              location="latex_tool_table"
              className="text-[var(--accent)] hover:underline"
            >
              한글 수식 명령어 사전
            </TrackedLink>
            에 있습니다.
          </p>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="py-2 px-2 font-medium whitespace-nowrap">종류</th>
                  <th className="py-2 px-2 font-medium">LaTeX (ChatGPT)</th>
                  <th className="py-2 px-2 font-medium">한글 수식</th>
                  <th className="py-2 px-2 font-medium">모양</th>
                </tr>
              </thead>
              <tbody>
                {MAPPING.map((m) => (
                  <tr key={m.name} className="border-b border-zinc-100 align-middle">
                    <td className="py-2 px-2 text-zinc-900 font-medium whitespace-nowrap">{m.name}</td>
                    <td className="py-2 px-2">
                      <code className="eq" style={{ whiteSpace: "normal" }}>{m.tex}</code>
                    </td>
                    <td className="py-2 px-2">
                      <code className="eq" style={{ whiteSpace: "normal" }}>{m.hwp}</code>
                    </td>
                    <td
                      className="py-2 px-2 eq-render text-zinc-900"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: m.mathml }}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 자주 묻는 질문 */}
        <section id="faq" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">자주 묻는 질문</h2>
          <div className="divide-y divide-zinc-100">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-sm font-medium text-zinc-900">
                  <h3 className="font-medium">{f.q}</h3>
                  <span className="text-zinc-400 transition-transform group-open:rotate-45 leading-none text-lg">
                    +
                  </span>
                </summary>
                <p className="text-sm text-zinc-600 leading-relaxed mt-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 문제가 많을 때 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm border-2 border-[var(--accent)]/20">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">문제지를 통째로 옮겨야 한다면</h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            ChatGPT 수식은 이 변환기로 충분합니다. 하지만 시험지·교재처럼{" "}
            <strong className="text-zinc-900">이미 인쇄된 문제</strong>를 한글로 옮길 때는 수식을 하나씩
            옮길 필요가 없습니다. <strong className="text-zinc-900">AI MathOCR</strong>은 수학 문제
            PDF나 사진을 읽어 문제·수식·그림을 편집 가능한 한글(HWP) 문서로 만들어 주는 Windows
            프로그램입니다.
          </p>
          <ul className="text-sm text-zinc-500 leading-relaxed list-disc pl-5 mt-3 space-y-1">
            <li>PC에 정품 한글(한컴오피스, 2014 이상 권장)이 설치되어 있어야 합니다.</li>
            <li>회원가입하면 {SIGNUP_FREE_CREDITS}문제를 무료로 변환해 볼 수 있습니다.</li>
          </ul>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <TrackedLink
              href="/auth/signup"
              label="sign_up_free_15"
              location="latex_tool_bottom"
              className="btn-primary text-sm px-5 py-2.5 rounded-lg text-center"
            >
              회원가입하고 {SIGNUP_FREE_CREDITS}문제 무료로 시작
            </TrackedLink>
            <TrackedLink
              href="/#guide"
              label="guide_video"
              location="latex_tool_bottom"
              className="text-sm px-5 py-2.5 rounded-lg text-center border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              사용법 영상 보기
            </TrackedLink>
          </div>
        </section>

        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            홈으로 돌아가기
          </a>
        </div>
      </article>
    </div>
  );
}
