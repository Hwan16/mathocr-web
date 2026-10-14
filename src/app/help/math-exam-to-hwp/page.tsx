import type { Metadata } from "next";
import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { articleSeoMetadata } from "@/lib/articles";
import TrackedLink from "@/components/TrackedLink";
import ArticleShell from "@/components/article/ArticleShell";
import { PromoInline } from "@/components/article/PromoCards";
import ExamCostCalculator from "@/components/article/ExamCostCalculator";

// ⚠️ 이 글의 사실관계 근거(2026-10-14):
//  - 외주 단가 400~1,300원/문제: 사용자 시세 확인(문제 길이에 따라). 바뀌면 여기와 계산기 힌트를 함께 고칠 것.
//  - 직접 타이핑 시간: 실측이 없어 '예시'로만 쓰고 계산기에서 방문자가 바꾸게 했다.
//  - 우리 요금·기능: lib/plans.ts(140~199원, 그림 무료, 해설 1크레딧), lib/faqs.ts(50문제, 실패 시 차감 없음, 박스).
//  - 경쟁사 이름·우열 비교는 쓰지 않는다(표시광고법 — 검증 가능한 비교 시험 자료 없음).

export const metadata: Metadata = {
  title: "수학 시험지 PDF를 한글(HWP)로 옮기는 3가지 방법 — 직접 타이핑·외주·변환 프로그램 비교",
  description:
    "수학 시험지·교재 PDF를 편집 가능한 한글 파일로 옮기는 방법 3가지를 비용·시간·품질로 비교했습니다. 타이핑 외주 시세(문제당 400~1,300원), 맡길 때와 프로그램 고를 때 확인할 것, 문제 수별 시간·비용 계산기까지.",
  alternates: { canonical: "/help/math-exam-to-hwp" },
  ...articleSeoMetadata("/help/math-exam-to-hwp"),
};

const TOC = [
  { href: "#summary", label: "한눈에 보기" },
  { href: "#typing", label: "1. 직접 타이핑" },
  { href: "#outsource", label: "2. 타이핑 외주" },
  { href: "#program", label: "3. 변환 프로그램" },
  { href: "#calculator", label: "시간·비용 계산기" },
  { href: "#pick", label: "상황별 추천" },
  { href: "#faq", label: "자주 묻는 질문" },
];

const COMPARE: { label: string; typing: string; outsource: string; program: string }[] = [
  { label: "비용", typing: "0원", outsource: "문제당 400~1,300원", program: "문제당 수십~200원 안팎" },
  { label: "걸리는 시간", typing: "문제당 몇 분씩 내 시간", outsource: "보통 며칠 (맡기고 받기까지)", program: "몇 분 + 검토" },
  { label: "결과 품질", typing: "내가 친 만큼 정확", outsource: "작업자에 따라 다름", program: "인쇄 상태에 따라 다름 — 검토 필요" },
  { label: "급할 때", typing: "가능하지만 오래 걸림", outsource: "어려움", program: "바로 가능" },
  { label: "시험지 외부 전달", typing: "없음", outsource: "있음", program: "프로그램의 처리 방식 확인" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "타이핑 외주 단가는 왜 문제마다 다른가요?",
    a: "문제 길이와 수식 양이 가장 큰 기준입니다. 짧은 계산 문제와 조건 박스·<보기>·그림이 붙은 서술형 문제는 손이 가는 정도가 몇 배 차이 나기 때문에, 2026년 10월 기준 시세로 문제당 400원에서 1,300원까지 받습니다. 그림을 다시 그려 넣거나 해설까지 맡기면 따로 받는 곳도 있으니 견적 때 범위를 꼭 확인하세요.",
  },
  {
    q: "변환 프로그램 결과를 검토 없이 바로 써도 되나요?",
    a: "권하지 않습니다. 인쇄가 흐리거나 필기가 수식 위에 겹친 부분은 잘못 읽을 수 있습니다. 결과가 편집 가능한 한글 수식이라면 틀린 부분만 더블클릭해 고치면 되므로, 처음부터 치는 것보다 훨씬 빠르게 검토할 수 있습니다.",
  },
  {
    q: "학교 시험지를 외주로 맡겨도 괜찮나요?",
    a: "학교·학원마다 규정이 다릅니다. 시험지는 문제 자체가 저작물이고, 시험 전 문제라면 유출 위험도 있으니 외부에 보내기 전에 소속 기관의 규정을 확인하는 것이 안전합니다.",
  },
  {
    q: "손으로 쓴 원고도 변환 프로그램으로 옮길 수 있나요?",
    a: "인쇄된 문제를 기준으로 만든 프로그램이 대부분이라, 손으로 쓴 원고는 인식이 불안정할 수 있습니다. 인쇄된 시험지 위에 학생이 쓴 풀이·채점 표시는 무시하고 인쇄된 문제만 옮기는 경우가 많으니, 원고가 손글씨라면 직접 타이핑이나 외주가 더 확실합니다.",
  },
  {
    q: "변환 프로그램은 무료로 먼저 써 볼 수 있나요?",
    a: `AI MathOCR은 회원가입하면 ${SIGNUP_FREE_CREDITS}문제를 무료로 변환해 볼 수 있습니다. 실제로 옮길 시험지 한 장으로 결과와 검토 시간을 직접 확인해 보는 것이 가장 정확한 비교입니다.`,
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

function ProsCons({ pros, cons }: { pros: string[]; cons: string[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-5">
      <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-4">
        <p className="text-[12px] font-semibold text-emerald-700 mb-2">좋은 점</p>
        <ul className="space-y-1.5 text-[13.5px] text-zinc-700 leading-relaxed">
          {pros.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-emerald-600 shrink-0">+</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg bg-rose-50/60 border border-rose-100 p-4">
        <p className="text-[12px] font-semibold text-rose-700 mb-2">아쉬운 점</p>
        <ul className="space-y-1.5 text-[13.5px] text-zinc-700 leading-relaxed">
          {cons.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-rose-500 shrink-0">−</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: { q: string; why: string }[] }) {
  return (
    <div className="mt-6">
      <p className="text-sm font-semibold text-zinc-900 mb-3">{title}</p>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={it.q} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-zinc-900 text-white text-[12px] font-semibold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="text-[13.5px] leading-relaxed">
              <strong className="text-zinc-900">{it.q}</strong>
              <span className="block text-zinc-500">{it.why}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function MathExamToHwpPage() {
  return (
    <ArticleShell href="/help/math-exam-to-hwp" location="exam_compare" toc={TOC}>
      <style>{`
.eq{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.85em;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:1px 5px;color:#18181b;white-space:nowrap}
.prose-p{font-size:14.5px;line-height:1.85;color:#3f3f46}
`}</style>
      <script
        type="application/ld+json"
        // JSON-LD는 신뢰된 내부 정적 데이터라 안전
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <article>
        {/* Header */}
        <div className="mb-8">
          <p className="text-[12px] font-semibold text-[var(--accent)] mb-2">시험지 제작 · 2026-10-14</p>
          <h1 className="text-2xl md:text-[32px] md:leading-tight font-bold">
            수학 시험지 PDF를 한글(HWP)로 옮기는 3가지 방법
          </h1>
          <p className="text-zinc-500 text-[15px] mt-3 leading-relaxed">
            직접 타이핑, 타이핑 외주, 변환 프로그램 — 비용·시간·품질을 솔직하게 비교하고, 내 상황에 맞는 방법을 고르는
            기준을 정리했습니다.
          </p>
        </div>

        <figure className="mb-6 rounded-xl overflow-hidden border border-zinc-200 bg-white">
          <img
            src="/articles/exam-3ways-hero.webp"
            alt="시험지를 한글 문서로 옮기는 세 가지 길 — 스캔해 변환하기, 외주에 맡기기, 직접 타이핑하기"
            width={1440}
            height={810}
            className="block w-full h-auto"
          />
        </figure>

        {/* 도입 */}
        <section className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <p className="prose-p">
            기출 시험지로 내신 대비 자료를 만들거나, 교재 문제를 골라 학습지를 꾸리려면 결국 문제를{" "}
            <strong className="text-zinc-900">편집할 수 있는 한글 파일</strong>로 옮겨야 합니다. PDF를 그림으로
            붙여 넣으면 숫자 하나 바꾸기도 어렵고, 글씨 크기도 문서와 맞지 않으니까요.
          </p>
          <p className="prose-p mt-4">
            방법은 크게 세 가지입니다. 어느 하나가 늘 정답은 아니고,{" "}
            <strong className="text-zinc-900">옮길 문제 수와 급한 정도</strong>에 따라 맞는 방법이 달라집니다.
          </p>
        </section>

        {/* 한눈에 보기 */}
        <section id="summary" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">한눈에 보기</h2>
          {/* 휴대폰: 방법별 카드(표는 세 번째 칸이 잘려 옆으로 밀어야 보임) */}
          <div className="sm:hidden space-y-2.5">
            {(
              [
                ["직접 타이핑", "typing"],
                ["타이핑 외주", "outsource"],
                ["변환 프로그램", "program"],
              ] as const
            ).map(([name, key]) => (
              <div
                key={key}
                className={`rounded-lg border p-3.5 ${
                  key === "program" ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-zinc-200"
                }`}
              >
                <p className={`text-sm font-semibold mb-2 ${key === "program" ? "text-[var(--accent)]" : "text-zinc-900"}`}>
                  {name}
                </p>
                <dl className="space-y-1 text-[13px]">
                  {COMPARE.map((r) => (
                    <div key={r.label} className="flex gap-3">
                      <dt className="w-24 shrink-0 text-zinc-400">{r.label}</dt>
                      <dd className="text-zinc-700">{r[key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto -mx-2">
            <table className="w-full text-[13.5px] border-collapse">
              <thead>
                <tr className="text-left border-b border-zinc-200">
                  <th className="py-2.5 px-2 font-medium text-zinc-400 w-24"></th>
                  <th className="py-2.5 px-2 font-semibold text-zinc-900">직접 타이핑</th>
                  <th className="py-2.5 px-2 font-semibold text-zinc-900">타이핑 외주</th>
                  <th className="py-2.5 px-2 font-semibold text-[var(--accent)]">변환 프로그램</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.label} className="border-b border-zinc-100 align-top">
                    <td className="py-2.5 px-2 text-zinc-500 font-medium whitespace-nowrap">{r.label}</td>
                    <td className="py-2.5 px-2 text-zinc-700">{r.typing}</td>
                    <td className="py-2.5 px-2 text-zinc-700">{r.outsource}</td>
                    <td className="py-2.5 px-2 text-zinc-700 bg-[var(--accent-soft)]/60">{r.program}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-zinc-400 mt-3">
            외주 단가는 2026년 10월 기준 시세, 변환 프로그램 비용은 요금제·프로그램에 따라 다릅니다.
          </p>
        </section>

        {/* 1. 직접 타이핑 */}
        <section id="typing" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <p className="text-[12px] font-semibold text-zinc-400 mb-1">방법 1</p>
          <h2 className="text-xl font-semibold text-zinc-900 mb-4">직접 타이핑 — 한글 수식 편집기로 한 문제씩</h2>
          <p className="prose-p">
            한글에서 <strong className="text-zinc-900">Ctrl+N, M</strong>으로 수식 편집기를 열고{" "}
            <code className="eq">{"{a} over {b}"}</code>, <code className="eq">{"sqrt{2}"}</code> 같은 명령어로
            수식을 넣는 방법입니다. 돈이 들지 않고, 글자 하나까지 내가 원하는 대로 만들 수 있습니다.
          </p>
          <p className="prose-p mt-4">
            문제는 시간입니다. 수식이 한두 개인 계산 문제는 금방 끝나지만, 분수 안에 루트가 들어가고 조건 박스와{" "}
            {"<보기>"}, 그래프까지 붙은 문제는 한 문제에 몇 분씩 걸립니다. 시험지 한 장(20~30문제)을 옮기면 저녁 시간이
            통째로 사라지는 이유입니다.
          </p>
          <ProsCons
            pros={["비용 0원", "서식·글꼴을 완전히 내 마음대로", "시험지를 밖으로 보낼 필요가 없음"]}
            cons={["문제 수에 비례해 시간이 늘어남", "그림은 따로 캡처·삽입해야 함", "오타를 다시 찾아야 함"]}
          />
          <div className="mt-5 rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-[13.5px] text-zinc-600 leading-relaxed">
            직접 친다면 이 두 가지가 시간을 많이 줄여 줍니다:{" "}
            <TrackedLink href="/help/hwp-equation" label="article_link" location="exam_compare_typing" className="font-medium text-[var(--accent)] hover:underline">
              한글 수식 명령어 사전(복사 버튼)
            </TrackedLink>
            {" · "}
            <TrackedLink href="/help/latex-to-hwp" label="article_link" location="exam_compare_typing" className="font-medium text-[var(--accent)] hover:underline">
              ChatGPT 수식 변환기
            </TrackedLink>
          </div>
        </section>

        {/* 2. 외주 */}
        <section id="outsource" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <p className="text-[12px] font-semibold text-zinc-400 mb-1">방법 2</p>
          <h2 className="text-xl font-semibold text-zinc-900 mb-4">타이핑 외주 — 문제당 400~1,300원</h2>
          <p className="prose-p">
            수식 타이핑을 전문으로 하는 업체나 아르바이트에 맡기는 방법입니다. 2026년 10월 기준 시세는{" "}
            <strong className="text-zinc-900">문제 길이에 따라 문제당 400원에서 1,300원</strong> 정도입니다. 30문제
            시험지 한 장이면 대략 1만 2천 원에서 3만 9천 원 사이가 됩니다.
          </p>
          <p className="prose-p mt-4">
            내 시간을 쓰지 않는다는 게 가장 큰 장점입니다. 대신 맡기고 받기까지 보통 며칠이 걸리고, 받은 뒤 오타를
            찾아 수정을 요청하는 왕복이 생길 수 있습니다. 시험 직전처럼 급할 때는 쓰기 어렵습니다.
          </p>
          <ProsCons
            pros={["내 시간이 거의 들지 않음", "그림 재작업·해설까지 맡길 수 있는 곳도 있음"]}
            cons={["문제 수만큼 비용이 쌓임", "받기까지 며칠, 수정 왕복", "시험지를 외부에 보내야 함"]}
          />
          <Checklist
            title="맡기기 전에 확인할 것"
            items={[
              { q: "수식이 '편집 가능한 한글 수식'으로 들어오나요?", why: "수식을 그림으로 붙여 주면 나중에 숫자 하나 바꾸기도 어렵습니다." },
              { q: "그림·그래프는 어떻게 처리하고, 추가 요금이 있나요?", why: "원본 캡처인지 다시 그려 주는지, 그림 1개당 따로 받는지 확인하세요." },
              { q: "조건 박스·<보기> 같은 시험지 서식도 맞춰 주나요?", why: "서식은 빠지고 글만 들어오면 결국 다시 손봐야 합니다." },
              { q: "오타가 있으면 수정은 몇 번까지 무료인가요?", why: "수정 왕복이 길어지면 외주의 장점이 줄어듭니다." },
              { q: "시험지를 외부에 보내도 되는 자료인가요?", why: "학교·학원 규정과 시험 일정(유출 위험)을 먼저 확인하세요." },
            ]}
          />
        </section>

        {/* 3. 변환 프로그램 */}
        <section id="program" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <p className="text-[12px] font-semibold text-zinc-400 mb-1">방법 3</p>
          <h2 className="text-xl font-semibold text-zinc-900 mb-4">변환 프로그램(OCR) — 몇 분 + 검토</h2>
          <p className="prose-p">
            PDF나 사진 속 문제를 프로그램이 읽어서 한글 파일로 만들어 주는 방법입니다. 글자를 읽는 기술(OCR)로 문제와
            수식을 인식한 뒤, 한글 수식 편집기 형식으로 바꿔 문서에 넣습니다. 시험지 한 장이 몇 분이면 나오고, 비용은
            프로그램에 따라 문제당 수십 원에서 200원 안팎입니다.
          </p>
          <p className="prose-p mt-4">
            다만 <strong className="text-zinc-900">완벽하지는 않습니다.</strong> 인쇄가 흐리거나 필기가 수식 위에
            겹친 부분은 잘못 읽을 수 있어서 결과를 한 번 훑어보는 검토가 필요합니다. 그래서 결과가{" "}
            <strong className="text-zinc-900">편집 가능한 수식</strong>으로 들어오는지가 중요합니다 — 틀린 곳만 더블클릭해
            고치면 되니까요.
          </p>

          {/* 실제 예시 */}
          <figure className="mt-6 rounded-xl border border-zinc-200 overflow-hidden">
            <div className="grid sm:grid-cols-2">
              <div className="bg-zinc-100 p-3 flex flex-col">
                <span className="text-[11px] font-semibold text-zinc-500 mb-2">원본 — 학생 필기가 남은 시험지 사진</span>
                <img src="/showcase/pencil-before.webp" alt="학생 풀이와 채점 표시가 남아 있는 수학 시험지 사진" width={613} height={216} loading="lazy" className="w-full h-auto rounded-md border border-zinc-200 bg-white" />
              </div>
              <div className="bg-white p-3 flex flex-col border-t sm:border-t-0 sm:border-l border-zinc-200">
                <span className="text-[11px] font-semibold text-[var(--accent)] mb-2">변환 결과 — 한글 문서</span>
                <img src="/showcase/pencil-after.webp" alt="필기는 빠지고 문제와 수식만 편집 가능한 한글 수식으로 들어간 결과" width={617} height={363} loading="lazy" className="w-full h-auto rounded-md border border-zinc-200" />
              </div>
            </div>
            <figcaption className="text-[12px] text-zinc-500 px-4 py-2.5 border-t border-zinc-200 bg-zinc-50">
              AI MathOCR 실제 변환 예시. 학생의 풀이·채점 표시는 빠지고 인쇄된 문제와 수식만 편집 가능한 한글 수식으로
              들어갔습니다.
            </figcaption>
          </figure>

          <ProsCons
            pros={["시험지 한 장이 몇 분", "문제당 수십~200원 안팎", "급할 때 바로 쓸 수 있음"]}
            cons={["결과 검토는 필요", "프로그램마다 결과 형식이 다름", "손으로 쓴 원고는 인식이 불안정할 수 있음"]}
          />
          <Checklist
            title="변환 프로그램 고를 때 확인할 것"
            items={[
              { q: "수식이 그림이 아니라 '한글 수식 편집기 개체'로 들어가나요?", why: "더블클릭해 바로 고칠 수 있어야 검토가 빨라집니다." },
              { q: "그림·그래프는 어떻게 들어가고, 따로 돈을 받나요?", why: "그림이 많은 기하·함수 단원에서 비용 차이가 커집니다." },
              { q: "조건 박스·<보기> 같은 시험지 서식을 살려 주나요?", why: "서식이 빠지면 결국 손으로 다시 맞춰야 합니다." },
              { q: "학생 필기가 있는 시험지도 깨끗하게 나오나요?", why: "채점된 시험지로 오답 자료를 만들 때 특히 중요합니다." },
              { q: "인식에 실패한 문제는 비용을 돌려주나요?", why: "실패분까지 돈을 받으면 실제 단가가 올라갑니다." },
              { q: "충전한 금액의 유효기간은 얼마인가요?", why: "가끔 쓰는 경우 유효기간이 짧으면 남은 금액이 사라질 수 있습니다." },
              { q: "무료로 먼저 써 볼 수 있나요?", why: "내 시험지로 직접 돌려 보는 것이 가장 정확한 비교입니다." },
            ]}
          />
        </section>

        <PromoInline location="exam_compare" />

        {/* 계산기 */}
        <section id="calculator" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">내 경우엔 얼마나 차이 날까? — 시간·비용 계산기</h2>
          <p className="text-[13.5px] text-zinc-500 mb-5 leading-relaxed">
            아래 숫자는 예시입니다. 내가 실제로 걸리는 시간과 받아 본 견적으로 바꿔 보세요.
          </p>
          <ExamCostCalculator />
        </section>

        {/* 상황별 추천 */}
        <section id="pick" className="card rounded-xl p-6 md:p-8 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">상황별로 이렇게 고르세요</h2>
          <div className="space-y-3">
            {[
              { when: "한두 문제만 급하게 고칠 때", pick: "직접 타이핑", why: "프로그램을 켜는 시간보다 직접 치는 게 빠릅니다. 수식 사전의 복사 버튼을 쓰세요." },
              { when: "시험지·교재를 매주 수십 문제씩 옮길 때", pick: "변환 프로그램", why: "문제 수가 많을수록 시간·비용 차이가 커집니다. 검토만 하면 됩니다." },
              { when: "시험 직전, 오늘 안에 자료가 필요할 때", pick: "변환 프로그램", why: "외주는 받기까지 며칠이 걸립니다." },
              { when: "손으로 쓴 원고를 옮길 때", pick: "직접 타이핑 또는 외주", why: "인쇄물 기준 프로그램은 손글씨 인식이 불안정할 수 있습니다." },
              { when: "내 시간을 전혀 쓰고 싶지 않고 납기가 여유로울 때", pick: "타이핑 외주", why: "비용은 들지만 검토 외에는 손이 가지 않습니다." },
            ].map((r) => (
              <div key={r.when} className="rounded-lg border border-zinc-200 p-4 sm:flex sm:items-start sm:gap-4">
                <p className="text-[13.5px] font-semibold text-zinc-900 sm:w-56 shrink-0">{r.when}</p>
                <div className="mt-1 sm:mt-0">
                  <p className="text-[13.5px] font-semibold text-[var(--accent)]">→ {r.pick}</p>
                  <p className="text-[13px] text-zinc-500 leading-relaxed mt-0.5">{r.why}</p>
                </div>
              </div>
            ))}
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
                  <span className="text-zinc-400 transition-transform group-open:rotate-45 leading-none text-lg">+</span>
                </summary>
                <p className="text-sm text-zinc-600 leading-relaxed mt-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 우리 소개 */}
        <section id="bulk" className="card rounded-xl p-6 md:p-8 shadow-sm border-2 border-[var(--accent)]/20">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">AI MathOCR을 만든 입장에서 덧붙이면</h2>
          <p className="prose-p">
            저희는 3번, 변환 프로그램을 만드는 팀입니다. 그래서 더 솔직하게 말씀드리면, 한두 문제는 직접 치는 게 빠르고
            손글씨 원고는 아직 사람 손이 더 확실합니다. 대신 인쇄된 시험지를 정기적으로 옮기신다면 아래 기준으로 만들었습니다.
          </p>
          <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] text-zinc-700">
            {[
              "수식은 편집 가능한 한글 수식 편집기 개체로",
              "문제 속 그림·그래프는 무료",
              "조건 박스·<보기>도 시험지 서식 그대로",
              "학생 필기가 있는 시험지도 인쇄된 문제만",
              "변환에 실패한 문제는 차감하지 않음",
              "해설지 연결, 해설이 없으면 해설 생성까지",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-[var(--accent)] shrink-0">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-zinc-500 mt-4">
            문제당 140~199원(요금제별) · 한 번에 최대 50문제 · Windows + 정품 한글(2014 이상 권장) 필요
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <TrackedLink
              href="/auth/signup"
              label="sign_up_free_15"
              location="exam_compare_bottom"
              className="btn-primary text-sm px-5 py-2.5 rounded-lg text-center"
            >
              내 시험지로 {SIGNUP_FREE_CREDITS}문제 무료 변환해 보기
            </TrackedLink>
            <TrackedLink
              href="/#guide"
              label="guide_video"
              location="exam_compare_bottom"
              className="text-sm px-5 py-2.5 rounded-lg text-center border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              사용법 영상 보기
            </TrackedLink>
          </div>
        </section>
      </article>
    </ArticleShell>
  );
}
