import type { Metadata } from "next";
import temml from "temml";
// 결과 미리보기 MathML 기본 스타일(Cambria Math 등 OS 수식 글꼴 지정 + 크롬 보정)
import "temml/dist/Temml-Local.css";
import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { articleSeoMetadata } from "@/lib/articles";
import { EQUATION_CATEGORIES, EQUATION_SHORTCUTS } from "@/lib/hwp-equation-commands";
import EquationDictionary, { type DictionaryCategory } from "@/components/EquationDictionary";
import TrackedLink from "@/components/TrackedLink";
import ArticleShell from "@/components/article/ArticleShell";
import { EndBand, FaqList, LINK, Section, SummaryBox } from "@/components/article/Prose";
import { PromoInline } from "@/components/article/PromoCards";

export const metadata: Metadata = {
  title: "한글(HWP) 수식 입력 방법 — 수식 편집기 명령어·단축키 총정리",
  description:
    "한글(한컴오피스) 수식 편집기 여는 법과 단축키, 분수·루트·극한·시그마·적분·집합·벡터·경우의 수까지 중고등 수학 명령어 69개를 복사 버튼과 함께 정리했습니다. 줄바꿈·정렬·한글 넣기 등 자주 막히는 부분도 담았습니다.",
  alternates: { canonical: "/help/hwp-equation" },
  ...articleSeoMetadata("/help/hwp-equation"),
};

// 결과 미리보기는 빌드 시 서버에서 MathML로 만든다 — 방문자 브라우저가 기본 수식 표시로 그린다.
const DICTIONARY: DictionaryCategory[] = EQUATION_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  items: c.items.map((it) => ({
    name: it.name,
    hwp: it.hwp,
    kw: it.kw,
    // \displaystyle — 분수·시그마를 한글 수식처럼 본문 크기로 보여 준다
    mathml: temml.renderToString("\\displaystyle " + it.tex, { throwOnError: false }),
  })),
}));

const COMMAND_COUNT = EQUATION_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

const TIPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "여러 글자는 반드시 중괄호 { }로 묶기",
    body: (
      <>
        <code className="eq">a+b over c</code>라고 쓰면 <strong className="text-zinc-900">c 위에
        b만</strong> 올라갑니다. 분자·분모·지수·첨자가 두 글자 이상이면{" "}
        <code className="eq">{"{a+b} over {c}"}</code>, <code className="eq">{"x^{n+1}"}</code>처럼
        항상 중괄호로 묶으세요. 수식이 이상하게 나올 때 대부분 이 문제입니다. 한글 도움말에
        따르면 스크립트 입력 창은 최대 9글자까지만 한 덩어리로 읽기 때문에, 긴 묶음도 중괄호로
        감싸야 합니다.
      </>
    ),
  },
  {
    title: "대문자·소문자가 다른 명령어가 있다",
    body: (
      <>
        대부분의 명령어는 대소문자를 가리지 않지만, 일부는 다른 기호가 됩니다. 예를 들어{" "}
        <code className="eq">rightarrow</code>는 →, <code className="eq">RIGHTARROW</code>는 ⇒입니다.
        필요충분조건 ⇔은 <code className="eq">LRARROW</code>로 써야 하고,{" "}
        <code className="eq">LEFTRIGHTARROW</code>라고 쓰면 ⇒로 잘못 나옵니다.
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

// 화면의 질문·답과 FAQ 구조화 데이터가 같은 출처를 쓴다(구글: 보이는 FAQ만 마크업).
const FAQ: { q: string; a: string }[] = [
  {
    q: "수식 안에서 줄을 바꾸려면 어떻게 하나요?",
    a: "스크립트 입력 창(아래쪽 입력 칸)에서는 줄을 바꿀 자리에 # 을 넣습니다. 위쪽 수식 편집 창에서 직접 입력할 때는 Enter를 누르면 됩니다.",
  },
  {
    q: "여러 줄 수식의 등호(=) 위치를 맞추려면?",
    a: "맞추고 싶은 기호 앞에 & 를 넣고 줄 사이에 # 을 넣습니다. 예: f(x) & = (x+1)^{2} # & = x^{2} + 2x + 1 이라고 쓰면 두 줄의 등호가 세로로 맞춰집니다.",
  },
  {
    q: "수식 글자 크기나 색은 어디서 바꾸나요?",
    a: "본문에 넣은 수식을 한 번 클릭해 선택한 뒤 P 키를 누르면(또는 [서식-개체 속성]) 수식 속성 창이 열리고, 수식 탭에서 글자 크기와 색을 바꿀 수 있습니다. 적용 범위를 바꾸면 문서의 여러 수식에 한꺼번에 적용할 수도 있습니다.",
  },
  {
    q: "수식 안에 한글을 넣을 수 있나요?",
    a: "네. 스크립트 입력 창에서 한/영 전환 후 그대로 입력하면 됩니다. \"넓이\"처럼 큰따옴표로 감싸면 한 덩어리의 글자로 들어갑니다.",
  },
  {
    q: "ChatGPT가 준 수식(\\frac{a}{b} 같은 LaTeX)을 그대로 붙여 넣어도 되나요?",
    a: "안 됩니다. 한글 수식 편집기는 LaTeX를 읽지 못해서 \\frac{a}{b}를 붙여 넣으면 fracab처럼 글자로 깨집니다. 이 사이트의 ChatGPT 수식 변환기(mathocr.ai.kr/help/latex-to-hwp)에 답변을 통째로 붙여 넣으면 수식마다 한글 명령어로 바꿔 줍니다.",
  },
  {
    q: "자주 쓰는 수식을 매번 다시 입력해야 하나요?",
    a: "한글 2022부터는 수식 편집기에서 만든 수식을 '수식 매크로'로 저장해 두고 [입력-수식-수식 매크로]에서 바로 넣을 수 있습니다. 이전 버전이라면 자주 쓰는 수식을 문서 한쪽에 모아 두고 복사해 쓰는 방법이 편합니다.",
  },
  {
    q: "명령어 대신 버튼으로 입력할 수는 없나요?",
    a: "수식 편집기 위쪽 도구 상자의 분수·근호·적분 같은 틀 버튼을 누르면 빈칸이 있는 수식 틀이 들어가고, Tab 키로 다음 칸으로 옮겨 가며 채울 수 있습니다. 분수 Ctrl+O, 근호 Ctrl+R처럼 단축키도 있습니다.",
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

const TOC = [
  { href: "#open", label: "수식 편집기 여는 법·단축키" },
  { href: "#commands", label: `수식 명령어 사전 (${COMMAND_COUNT}개)` },
  { href: "#tips", label: "자주 막히는 부분" },
  { href: "#faq", label: "자주 묻는 질문" },
  { href: "#bulk", label: "옮길 문제가 많다면" },
];

export default function HwpEquationGuidePage() {
  return (
    <ArticleShell
      href="/help/hwp-equation"
      location="help_eq"
      toc={TOC.map((t, i) => ({ href: t.href, label: `${i + 1}. ${t.label}` }))}
      hero={{
        title: "한글(HWP) 수식 입력 방법",
        lead: `수식 편집기 여는 법 · 단축키 · 명령어 ${COMMAND_COUNT}개 복사 · 자주 막히는 부분`,
        img: { src: "/articles/eq-dict-hero.webp", alt: "AI MathOCR 마스코트가 수학 기호 키보드와 수식 문서를 소개하는 그림", w: 1440, h: 810 },
      }}
    >
      <style>{`
.eq{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.85em;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:1px 5px;color:#18181b;white-space:nowrap}
.eq-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:5px;padding:5px 8px;color:#18181b;overflow-wrap:anywhere;word-break:normal}
.eq-render math{font-size:1.15em}
.eq-render math,.eq-render math *{font-family:"Cambria Math","STIX Two Math","Latin Modern Math",math}
`}</style>
      <script
        type="application/ld+json"
        // JSON-LD는 신뢰된 내부 정적 데이터라 안전
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <article>
        {/* 바로 답 */}
        <SummaryBox title="한 줄 요약">
          <p className="prose-p">
            한글에서 수식을 넣으려면{" "}
            <strong className="text-zinc-900">[입력] 메뉴 → [수식]</strong>(단축키{" "}
            <strong className="text-zinc-900">Ctrl+N, M</strong>)으로 수식 편집기를 열고, 아래쪽
            입력 칸에 <code className="eq">{"{a} over {b}"}</code>,{" "}
            <code className="eq">{"sqrt{2}"}</code> 같은 명령어를 입력한 뒤{" "}
            <strong className="text-zinc-900">[넣기]</strong>(Shift+Esc)를 누르면 됩니다. 이렇게
            넣은 수식은 그림이 아니라 편집 가능한 수식 개체라서, 나중에 더블클릭해 언제든 고칠 수
            있습니다.
          </p>
          <p className="text-[14px] text-zinc-600 mt-5 pt-4 border-t border-[var(--accent-border)]">
            시험지 한 장을 통째로 옮겨야 한다면?{" "}
            <TrackedLink href="#bulk" label="help_bulk" location="help_eq_summary" className={LINK}>
              PDF·사진 속 수식을 한글 수식으로 자동 변환하기 →
            </TrackedLink>
          </p>
        </SummaryBox>

        {/* 목차 — PC(xl 이상)는 왼쪽 목차가 대신한다 */}
        <nav aria-label="목차" className="mt-8 px-1 xl:hidden">
          <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-zinc-500">
            {TOC.map((t, i) => (
              <li key={t.href}>
                <a href={t.href} className="hover:text-zinc-900 transition-colors">
                  {i + 1}. {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 여는 법·단축키 */}
        <Section id="open" title="1. 수식 편집기 여는 법·단축키">
          <ol className="prose-p space-y-2 list-decimal pl-5 marker:text-[var(--accent)] marker:font-bold">
            <li>수식을 넣을 위치에 커서를 둡니다.</li>
            <li>
              상단 <strong className="text-zinc-900">[입력] → [수식]</strong>을 누르거나{" "}
              <strong className="text-zinc-900">Ctrl+N</strong>을 눌렀다 뗀 뒤 바로{" "}
              <strong className="text-zinc-900">M</strong>을 누릅니다.
            </li>
            <li>
              열린 창의 아래쪽 입력 칸(스크립트 입력 창)에 명령어를 입력하면 위쪽에 결과가 미리
              보입니다. 아래 사전의 [복사] 버튼으로 복사해 이 칸에{" "}
              <strong className="text-zinc-900">Ctrl+V</strong>로 붙여 넣어도 됩니다.
            </li>
            <li>
              <strong className="text-zinc-900">[넣기]</strong>를 누르거나{" "}
              <strong className="text-zinc-900">Shift+Esc</strong>를 누르면 본문에 수식이 들어갑니다.
            </li>
          </ol>

          <h3 className="text-[19px] font-bold text-zinc-900 tracking-tight mt-10 mb-3">수식 편집기 단축키</h3>
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <dl className="grid sm:grid-cols-2 text-[15px]">
              {EQUATION_SHORTCUTS.map((s) => (
                <div
                  key={s.action}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-200 sm:odd:border-r"
                >
                  <dt className="text-zinc-700">{s.action}</dt>
                  <dd className="whitespace-nowrap">
                    <kbd className="eq">{s.key}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-[13px] text-zinc-500 mt-3">
            한글 2022 도움말 기준입니다. 틀 단축키는 수식 편집기 위쪽 편집 창에서 동작합니다.
          </p>
        </Section>

        {/* 명령어 사전 */}
        <Section id="commands" title={`2. 수학 수식 명령어 사전 (${COMMAND_COUNT}개)`}>
          <p className="prose-p mb-6">
            중·고등 수학 시험지에 나오는 기호를 단원별로 모았습니다. [복사]를 누른 뒤 수식 편집기
            아래쪽 입력 칸에 붙여 넣으면 오른쪽 모양대로 들어갑니다. 모든 명령어는 한글 2022에서
            직접 넣어 확인했습니다.
          </p>
          <EquationDictionary categories={DICTIONARY} signupFreeCredits={SIGNUP_FREE_CREDITS} />
          <p className="text-[14.5px] text-zinc-600 mt-6 leading-relaxed">
            ChatGPT가 준 수식(<code className="eq">{"\\frac{a}{b}"}</code> 같은 LaTeX)이라면 하나씩 찾지
            말고{" "}
            <TrackedLink href="/help/latex-to-hwp" label="latex_tool" location="help_eq_commands" className={LINK}>
              ChatGPT 수식 변환기
            </TrackedLink>
            에 통째로 붙여 넣으세요.
          </p>
          <p className="text-[13px] text-zinc-500 mt-3">
            경우 나누기·행렬·여러 줄 수식에서 <code className="eq">&amp;</code>는 칸(맞춤) 구분,{" "}
            <code className="eq">#</code>은 줄바꿈입니다.
          </p>
        </Section>

        <PromoInline location="help_eq" />

        {/* 팁 */}
        <Section id="tips" title="3. 자주 막히는 부분">
          <div className="space-y-8">
            {TIPS.map((t) => (
              <div key={t.title}>
                <h3 className="text-[17.5px] font-bold text-zinc-900 mb-1.5 break-keep">{t.title}</h3>
                <p className="prose-p">{t.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 자주 묻는 질문 */}
        <Section id="faq" title="4. 자주 묻는 질문">
          <FaqList items={FAQ} />
        </Section>

        {/* 문제가 많을 때 */}
        <EndBand
          id="bulk"
          title="5. 옮길 문제가 많다면"
          location="help_eq_bottom"
          signupLabel={`회원가입하고 ${SIGNUP_FREE_CREDITS}문제 무료로 시작`}
        >
          <p>
            한두 문제는 위 명령어로 직접 입력하는 게 가장 빠릅니다. 하지만 시험지 한 장을
            옮기려면 수식을 하나하나 입력하느라 시간이 오래 걸립니다.{" "}
            <strong>AI MathOCR</strong>은 수학 문제 PDF나 사진을 읽어, 위와 같은{" "}
            <strong>편집 가능한 한글 수식</strong>으로 HWP 파일을 만들어 주는 Windows 프로그램입니다. 결과
            수식도 더블클릭하면 그대로 고칠 수 있습니다.
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-1 text-[14.5px] text-blue-100/75">
            <li>PC에 정품 한글(한컴오피스, 2014 이상 권장)이 설치되어 있어야 합니다.</li>
            <li>회원가입하면 {SIGNUP_FREE_CREDITS}문제를 무료로 변환해 볼 수 있습니다.</li>
          </ul>
        </EndBand>
      </article>
    </ArticleShell>
  );
}
