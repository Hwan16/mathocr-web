import type { Metadata } from "next";
import { AI_SOLUTION_RULE, SIGNUP_FREE_CREDITS, SIGNUP_FREE_VALIDITY_DAYS } from "@/lib/plans";
import { articleSeoMetadata } from "@/lib/articles";
import TrackedLink from "@/components/TrackedLink";
import ArticleShell from "@/components/article/ArticleShell";
import { PromoInline } from "@/components/article/PromoCards";
import { LINK, Section, Step } from "@/components/article/Prose";

// ⚠️ 이 글의 사실관계 근거(2026-10-25, 검증 일꾼 대조 반영):
//  - 양식: 마케팅/261025_자료실/양식/make_template_v5.py 로 만든 .hwp 4종(24×33cm·A4 × 개인용·반 공용).
//    24×33판은 앱 출력 src/hwp_writer.py 와 같은 용지·함초롬바탕 10pt·줄 간격 160%. 왼쪽 문제 칸 안쪽 폭(약 92mm 이상)이
//    앱 그림·<보기> 최대 폭(약 92mm)보다 넓어 붙여 넣은 문제가 칸에 맞는다. A4판도 같은 예시로 붙여넣기 확인.
//  - 예시 그림: 실제 학생 시험지(학교명 제외) 4번·9번 OCR 구조화 결과를 앱 출력기로 쓰고, 해설은 tools/explain_gen
//    해설 생성 실측(nesin2_s) 결과(정답표 일치). 연달은 별도 줄 수식 사이 빈 줄(출력기 동작)만 검토하며 지운 상태.
//  - 앱 동작: ✨ 자동 인식 — 크레딧 차감 없음, 단 잔액 1 이상·유효기간 안이어야 시작, 박스는 보유 크레딧 수만큼(최대 50).
//    문제 번호는 남은 박스 순서대로 1..N(region_panel._renumber). ⚠️ 문제 박스를 지워도 그 문제의 그림 박스는 남아
//    다른 문제에 붙을 수 있다(10-25 검증 발견) → 글은 '통째로 변환 후 골라 붙이기'를 기본으로, 지울 때는 그림 박스도.
//    해설 생성: 목록의 💡 칸(또는 '💡 해설 생성 일괄 적용'), 학년은 선택(기본 '학년 자동'). 해설지 박스는 N번째 → N번 문제.
//    사진: JPG·JPEG·PNG·BMP, 한 번에 10장(HEIC 불가). 결과는 문서 끝 [정답 및 해설](미주).
//  - 요금: lib/plans.ts — 문제·해설지 박스 1개 1크레딧, 해설 생성 AI_SOLUTION_RULE.current(기념가면 '출시 기념가'),
//    그림 무료, 실패분 자동 반환, 가입 15크레딧·7일. 'AI 해설' 표현 금지(해설 생성).
//  - 인쇄: 한/글 인쇄 방식 '공급 용지에 맞추어'(한컴 도움말 print_general).

const HREF = "/help/wrong-answer-note";
const LOC = "wrong_note";

const SOLUTION_PRICE = AI_SOLUTION_RULE.current;
const FREE_WITH_SOLUTION = Math.floor(SIGNUP_FREE_CREDITS / (1 + SOLUTION_PRICE));

export const metadata: Metadata = {
  title: "수학 오답노트 양식(한글 HWP) 무료 — 틀린 문제마다 개념·풀이·틀린 이유를 한 장에",
  description:
    "틀린 문제마다 [문제 | 핵심 개념 · 문제 풀이 · 왜 틀렸나]로 정리하는 한글 오답노트 양식(24×33cm·A4)을 가입 없이 무료로 받으세요. 시험지를 한 번 변환해 두고 학생마다 틀린 문제와 풀이를 골라 붙이는 방법까지 정리했습니다.",
  alternates: { canonical: HREF },
  ...articleSeoMetadata(HREF),
};

const TOC = [
  { href: "#summary", label: "한눈에 보기" },
  { href: "#why", label: "오답 정리가 오래 걸리는 이유" },
  { href: "#template", label: "양식 구성 — 네 칸" },
  { href: "#manual", label: "방법 1. 직접 채우기" },
  { href: "#fast", label: "방법 2. 시험지 사진으로" },
  { href: "#tips", label: "쓰는 요령" },
  { href: "#faq", label: "자주 묻는 질문" },
];

const DOWNLOAD_GROUPS = [
  {
    size: "24×33cm",
    note: "AI MathOCR 변환 결과와 같은 크기 — 붙여 넣기 가장 편해요",
    items: [
      { href: "/templates/wrong-answer-note.hwp", file: "오답노트_양식_개인용_24x33.hwp", title: "개인용", label: "template_download_personal" },
      { href: "/templates/wrong-answer-note-class.hwp", file: "오답노트_양식_반공용_24x33.hwp", title: "반 공용", label: "template_download_class" },
    ],
  },
  {
    size: "A4",
    note: "학원 프린터에 바로 — 여백을 좁혀 같은 폭의 문제 칸을 넣었어요",
    items: [
      { href: "/templates/wrong-answer-note-a4.hwp", file: "오답노트_양식_개인용_A4.hwp", title: "개인용", label: "template_download_personal_a4" },
      { href: "/templates/wrong-answer-note-class-a4.hwp", file: "오답노트_양식_반공용_A4.hwp", title: "반 공용", label: "template_download_class_a4" },
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "개인용과 반 공용은 무엇이 다른가요?",
    a: "칸 구성은 같고 맨 위 표만 다릅니다. 개인용은 학생 한 명에게 나눠 주는 오답 노트라 이름·점수·틀린 문항을 적고, 반 공용은 반 전체 수업 자료로 쓰도록 반·담당·다룬 문항을 적습니다.",
  },
  {
    q: "반 학생 전체 것을 만들려면 어떻게 하나요?",
    a: "시험 문제는 반 전체가 같으니 시험지를 한 번만 변환해 두고, 학생마다 틀린 번호의 문제와 풀이만 골라 각자의 양식에 붙여 넣으면 됩니다. 학생 수만큼 다시 변환할 필요가 없습니다.",
  },
  {
    q: "한글(한/글) 프로그램이 없어도 쓸 수 있나요?",
    a: "양식은 한글 문서(.hwp)라 PC용 한/글(2014 이상 권장)에서 고쳐 쓰는 것을 기준으로 만들었습니다. 한컴독스(웹)나 한글 뷰어로 열어 볼 수는 있지만, 칸에 수식과 표를 붙여 넣고 고치려면 PC용 한/글이 편합니다.",
  },
  {
    q: "24×33cm판을 A4·B4 용지에 인쇄할 수 있나요?",
    a: "인쇄 창의 '인쇄 방식'에서 '공급 용지에 맞추어'를 고르면 프린터에 넣은 용지에 맞춰 찍을 수 있습니다. 처음부터 A4로 쓰려면 A4판 양식을 받으세요. A4판은 여백을 좁혀 문제 칸 폭을 24×33판과 비슷하게 맞췄습니다.",
  },
  {
    q: "칸 크기나 항목을 바꿔도 되나요?",
    a: "네, 자유롭게 고쳐 쓰셔도 됩니다. 내용이 길면 칸이 저절로 늘어나고, '왜 틀렸나' 항목도 학원에서 쓰는 분류로 바꿔 쓰시면 됩니다. 다만 왼쪽 문제 칸을 많이 줄이면 붙여 넣은 그림이나 <보기> 박스가 칸 밖으로 넘칠 수 있습니다.",
  },
  {
    q: "문제 칸을 더 늘리려면 어떻게 하나요?",
    a: "양식에는 빈 문제 칸이 4개 들어 있습니다. 더 필요하면 문제 칸 표 전체를 선택해 복사(Ctrl+C)한 뒤, 표 아래 빈 줄에서 붙여 넣기(Ctrl+V)하면 됩니다.",
  },
  {
    q: "무료 체험으로 어디까지 해 볼 수 있나요?",
    a: `가입하면 ${SIGNUP_FREE_CREDITS}크레딧을 드리고, 받은 날부터 ${SIGNUP_FREE_VALIDITY_DAYS}일 동안 쓸 수 있습니다. 문제만 옮기면 ${SIGNUP_FREE_CREDITS}문제, 해설 생성까지 하면 ${FREE_WITH_SOLUTION}문제 분량입니다. 양식 자체는 가입 없이 무료입니다.`,
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

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14.5V16h12v-1.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadButtons({ location }: { location: string }) {
  return (
    <div className="space-y-5">
      {DOWNLOAD_GROUPS.map((g) => (
        <div key={g.size}>
          <p className="text-[13.5px] text-zinc-600 mb-2.5">
            <strong className="text-zinc-900 font-semibold">{g.size}</strong> · {g.note}
          </p>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {g.items.map((d) => (
              <TrackedLink
                key={d.href}
                href={d.href}
                download={d.file}
                label={d.label}
                location={location}
                className="group rounded-lg border border-[var(--accent-border)] bg-white hover:bg-[var(--accent)] hover:border-[var(--accent)] px-4 py-3 flex items-center gap-3 transition-colors"
              >
                <span className="shrink-0 w-9 h-9 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-white/15 group-hover:text-white flex items-center justify-center transition-colors">
                  <DownloadIcon />
                </span>
                <span className="text-[14.5px] font-semibold text-zinc-900 group-hover:text-white transition-colors">
                  {d.title} 양식 <span className="font-normal text-zinc-500 group-hover:text-blue-100">· {g.size} .hwp</span>
                </span>
              </TrackedLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const COST_ROWS: { t: string; v: string; note?: string; free?: boolean }[] = [
  { t: "문제 변환", v: "문제 1개 1크레딧" },
  {
    t: "해설 생성",
    v: `문제당 +${SOLUTION_PRICE}크레딧`,
    note: AI_SOLUTION_RULE.promoActive ? AI_SOLUTION_RULE.promoNote : undefined,
  },
  { t: "해설지에서 옮기는 해설", v: "1개 1크레딧" },
  { t: "문제 속 그림", v: "무료", free: true },
  { t: "변환에 실패한 문제·만들지 못한 해설", v: "자동 반환", free: true },
];

export default function WrongAnswerNotePage() {
  return (
    <ArticleShell
      href={HREF}
      location={LOC}
      toc={TOC}
      hero={{
        lead: "틀린 문제를 푼 과정과 틀린 이유까지 한 장에 붙여 두면, 다음에 같은 유형을 만났을 때 꺼내 볼 수 있습니다. 그렇게 정리하는 한글 양식을 무료로 공유하고, 학생 시험지로 빠르게 채우는 방법까지 정리했습니다.",
        img: { src: "/articles/wrong-note-example-2.webp", alt: "조건 (가)(나) 박스가 있는 수열 문제와 풀이를 오답 노트 양식에 채운 예시", w: 1100, h: 956 },
      }}
    >
      <style>{`
.ui{font-size:0.88em;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:1px 6px;color:#18181b;white-space:nowrap}
`}</style>
      <script
        type="application/ld+json"
        // JSON-LD는 신뢰된 내부 정적 데이터라 안전
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <article>
        {/* 한눈에 보기 — 글 안에서 유일한 바탕색 상자(바로 받기) */}
        <section id="summary" className="scroll-mt-6 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] p-6 md:p-8">
          <h2 className="text-[20px] font-bold text-zinc-900 tracking-tight mb-4">한눈에 보기</h2>
          <ul className="space-y-2.5 text-[15.5px] text-zinc-800 leading-relaxed mb-7 break-keep">
            {[
              <>
                틀린 문제 하나 = 문제 칸 하나. <strong className="text-zinc-900">왼쪽에 문제</strong>, 오른쪽에{" "}
                <strong className="text-zinc-900">핵심 개념 · 문제 풀이 · 왜 틀렸나</strong>
              </>,
              <>단원·유형, 내 답, 다시 풀기(O·△·X) 칸까지 — 한글(.hwp), 가입 없이 바로 내려받기</>,
              <>문제와 풀이는 시험지 사진에서 옮기고, 핵심 개념과 틀린 이유는 선생님이나 학생이 채웁니다</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-[var(--accent)] font-bold shrink-0">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <DownloadButtons location={`${LOC}_summary`} />
          <p className="text-[12.5px] text-zinc-500 mt-4">한/글 2014 이상에서 열립니다. 개인용은 학생 한 명용, 반 공용은 수업 자료용입니다.</p>
        </section>

        <Section id="why" title="오답 정리가 오래 걸리는 이유">
          <ol className="space-y-6">
            {[
              {
                t: "문제를 다시 쳐야 합니다",
                d: "학생 시험지는 풀이와 채점 표시로 가득해 그대로 복사해 쓰기 어렵고, 수식은 한글 수식 편집기로 하나씩 넣어야 합니다.",
              },
              {
                t: "학교 시험지는 해설지가 없습니다",
                d: "틀린 문제마다 풀이를 직접 써야 합니다. 오답 자료 준비에서 가장 시간이 많이 드는 부분입니다.",
              },
              {
                t: "학생마다 틀린 문제가 다릅니다",
                d: "반 전체에 한 장으로 끝나지 않고, 학생 수만큼 조합이 생깁니다.",
              },
            ].map((r, i) => (
              <li key={r.t} className="flex gap-4">
                <span className="shrink-0 text-[26px] leading-none font-bold text-[var(--accent)] tabular-nums w-7">{i + 1}</span>
                <span className="min-w-0">
                  <strong className="block text-[17px] text-zinc-900">{r.t}</strong>
                  <span className="block prose-p mt-1">{r.d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="prose-p mt-8">
            양식은 &lsquo;무엇을 어떻게 정리할지&rsquo;를 정해 주고, 아래{" "}
            <a href="#fast" className={LINK}>
              방법 2
            </a>
            는 시험지를 한 번만 옮겨 두고 학생마다 골라 붙이는 방식이라 세 가지 모두에 드는 손을 덜어 줍니다.
          </p>
        </Section>

        <Section id="template" title="양식 구성 — 문제 칸 하나에 네 칸">
          <p className="prose-p mb-6">한 쪽에 문제 칸 두 개, 맨 위에는 시험명·이름·점수·틀린 문항을 적는 표가 있습니다.</p>

          <figure className="mb-8">
            <img
              src="/articles/wrong-note-example.webp"
              alt="오답 노트 양식에 고2 대수 기말 4번(사인법칙)을 채운 예시 — 왼쪽 문제, 오른쪽 핵심 개념·문제 풀이·왜 틀렸나"
              width={1100}
              height={1030}
              className="block w-full h-auto rounded-lg border border-zinc-200"
            />
            <figcaption className="text-[13px] text-zinc-500 mt-3 leading-relaxed break-keep">
              실제로 채운 예시. 문제와 &lsquo;문제 풀이&rsquo;는 AI MathOCR 변환 결과(해설 생성)를 붙여 넣었고, 나머지 칸은 선생님이나
              학생이 쓰는 칸이라 예시 문장을 넣었습니다.
            </figcaption>
          </figure>

          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-[var(--accent-soft)] text-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold w-[7.5em]">칸</th>
                  <th scope="col" className="px-4 py-3 font-semibold">무엇을 적나</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {[
                  { t: "문제", d: "틀린 문제를 그대로. 위에 단원·유형, 아래에 다시 풀기(날짜와 O·△·X) 칸이 있습니다." },
                  { t: "핵심 개념", d: "이 문제를 푸는 데 쓴 개념·공식 한두 줄. 같은 유형을 다시 만났을 때 꺼낼 도구입니다." },
                  { t: "문제 풀이", d: "정답과 풀이 과정. 정답만 있으면 어디서 막혔는지 다시 볼 수 없습니다." },
                  { t: "왜 틀렸나", d: "내 답을 적고 계산 실수 · 개념 부족 · 조건 놓침 · 문제 오독 · 시간 부족 · 풀이 방향 못 잡음 중 체크, 한 줄 메모." },
                ].map((c) => (
                  <tr key={c.t} className="align-top">
                    <th scope="row" className="px-4 py-3.5 font-semibold text-zinc-900 whitespace-nowrap">{c.t}</th>
                    <td className="px-4 py-3.5 text-zinc-700 leading-relaxed break-keep">{c.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="prose-p mt-6">
            선생님이 네 칸을 다 채워 나눠 줘도 되고, 문제와 풀이까지만 채운 뒤 &lsquo;핵심 개념&rsquo;과 &lsquo;왜 틀렸나&rsquo;는
            학생이 직접 쓰게 해도 됩니다.
          </p>
        </Section>

        <Section id="manual" title="방법 1. 직접 채우기">
          <ul className="space-y-4 prose-p">
            <li className="flex gap-3">
              <span className="text-[var(--accent)] shrink-0 font-bold">·</span>
              <span>
                <strong className="text-zinc-900">문제 칸</strong> — 한/글에서 <span className="ui">Ctrl+N, M</span>으로 수식 편집기를
                열어 문제를 칩니다. 시험지를 캡처해 그림으로 붙이면 빠르지만, 숫자 하나 고칠 수 없고 학생 필기도 함께
                들어갑니다.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--accent)] shrink-0 font-bold">·</span>
              <span>
                <strong className="text-zinc-900">문제 풀이 칸</strong> — 풀이를 직접 씁니다. 수식 명령어가 기억나지 않으면{" "}
                <TrackedLink href="/help/hwp-equation" label="article_link" location={`${LOC}_manual`} className={LINK}>
                  한글 수식 명령어 사전
                </TrackedLink>
                에서 복사해 쓰세요.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--accent)] shrink-0 font-bold">·</span>
              <span>
                <strong className="text-zinc-900">문제 칸이 모자라면</strong> — 문제 칸 표를 통째로 복사해 아래 빈 줄에 붙여 넣습니다.
              </span>
            </li>
          </ul>
        </Section>

        <Section id="fast" title="방법 2. 시험지 사진으로 빠르게 채우기">
          <p className="prose-p mb-2">
            AI MathOCR로 시험지를 한글 파일로 옮기고, 해설지가 없으면 풀이 초안까지 만든 뒤 학생마다 틀린 번호만 골라 붙이는
            방법입니다. 시험 문제는 반 전체가 같으니 <strong className="text-zinc-900">변환은 한 번이면 됩니다.</strong>
          </p>
          <p className="text-[14px] text-zinc-500 mb-10 break-keep">
            AI MathOCR은 Windows에 설치하는 프로그램이고, PC에 정품 한/글(2014 이상 권장)이 있어야 합니다.
          </p>

          <ol className="space-y-10">
            <Step n={1} title="시험지 사진(또는 PDF)을 엽니다">
              휴대폰으로 찍은 사진(JPG·PNG, 한 번에 10장까지)이나 스캔 PDF를 엽니다. 학생이 쓴 풀이와 채점 표시가 있어도
              프로그램이 인쇄된 문제만 옮기도록 되어 있습니다. 사진이 흐리면 잘못 읽을 수 있으니 결과는 한 번 훑어보세요.
              <figure className="mt-4 rounded-xl border border-zinc-200 overflow-hidden">
                <div className="grid sm:grid-cols-2">
                  <div className="bg-zinc-100 p-3 flex flex-col">
                    <span className="text-[12px] font-semibold text-zinc-500 mb-2">원본 — 학생 필기가 남은 시험지 사진</span>
                    <img src="/showcase/pencil-before.webp" alt="학생 풀이와 채점 표시가 남아 있는 수학 시험지 사진" width={613} height={216} loading="lazy" className="w-full h-auto rounded-md border border-zinc-200 bg-white" />
                  </div>
                  <div className="bg-white p-3 flex flex-col border-t sm:border-t-0 sm:border-l border-zinc-200">
                    <span className="text-[12px] font-semibold text-[var(--accent)] mb-2">변환 결과 — 한글 문서</span>
                    <img src="/showcase/pencil-after.webp" alt="필기는 빠지고 문제와 수식만 편집 가능한 한글 수식으로 들어간 결과" width={617} height={363} loading="lazy" className="w-full h-auto rounded-md border border-zinc-200" />
                  </div>
                </div>
              </figure>
            </Step>
            <Step n={2} title="문제 영역을 잡습니다">
              <span className="ui">✨ 자동 인식</span>을 누르면 문제마다 박스가 그려집니다. 자동 인식은 크레딧이 차감되지 않지만,
              크레딧이 남아 있어야 시작되고 보유 크레딧 수만큼만 박스를 그립니다. 반 전체 자료라면 박스를 그대로 두고 시험지
              전체를 변환하세요.
              <span className="block mt-3 text-[14.5px] text-zinc-500 leading-relaxed">
                학생 한 명의 몇 문제만 필요하면 맞힌 문제 박스를 지워도 됩니다. 이때 그 문제 안의 그림 박스도 함께 지우세요. 남은
                박스 순서대로 번호가 1, 2, 3…으로 다시 매겨지니 원래 번호는 양식 맨 위 &lsquo;틀린 문항&rsquo;에 적어 둡니다.
              </span>
            </Step>
            <Step n={3} title="풀이를 어떻게 붙일지 고르고 변환합니다">
              <span className="block">
                <strong className="text-zinc-900">해설지가 없으면</strong> — 문제 목록의 <span className="ui">💡</span> 칸을 체크합니다(모든
                문제에 한 번에 하려면 <span className="ui">💡 해설 생성 일괄 적용</span>). 학년을 고르면 그 학년까지 배운 방법으로만
                풀이를 씁니다. 예를 들어 중3을 고르면 사인법칙 같은 고등학교 내용은 쓰지 않습니다. 비워 두면 문제를 보고 학년을
                추정합니다.
              </span>
              <span className="block mt-3">
                <strong className="text-zinc-900">해설지가 있으면</strong> — 해설 부분도 박스로 잡습니다. 문제 순서대로 그리면 N번째
                해설이 N번 문제에 붙습니다(목록의 &lsquo;해N&rsquo; 표시로 확인).
              </span>
              <span className="block mt-3">
                그다음 <span className="ui">변환하기</span>를 누르면 문제와, 문서 끝에 [정답 및 해설]이 든 한글 파일이 만들어집니다.
              </span>
            </Step>
            <Step n={4} title="학생마다 틀린 번호를 골라 붙이고, 검토합니다">
              변환된 파일에서 그 학생이 틀린 번호의 문제를 복사해 양식 왼쪽 칸에, 파일 끝 [정답 및 해설]에서 같은 번호의 해설을
              복사해 &lsquo;문제 풀이&rsquo; 칸에 붙여 넣습니다.
              <span className="block mt-3">
                풀이는 한 번 읽어 보세요. 해설은 한글 수식으로 들어가서 고칠 곳은 더블클릭해 바로 고칠 수 있습니다. 그다음 핵심
                개념과 틀린 이유를 채웁니다.
              </span>
            </Step>
          </ol>

          <figure className="mt-10">
            <img
              src="/articles/wrong-note-example-2.webp"
              alt="조건 (가)(나) 박스가 있는 수열 문제와 긴 풀이가 오답 노트 양식 칸에 들어간 예시"
              width={1100}
              height={956}
              loading="lazy"
              className="block w-full h-auto rounded-lg border border-zinc-200"
            />
            <figcaption className="text-[13px] text-zinc-500 mt-3 leading-relaxed break-keep">
              조건 박스가 있는 문제와 긴 풀이도 칸이 늘어나며 들어갑니다. 풀이는 해설 생성 결과를 그대로 붙여 넣고, 수식 사이
              빈 줄 하나만 지운 상태입니다.
            </figcaption>
          </figure>

          {/* 비용 — 줄글 대신 표(2026-10-30). 숫자는 lib/plans.ts 에서 온다 */}
          <h3 className="text-[19px] font-bold text-zinc-900 tracking-tight mt-12 mb-4">비용</h3>
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-[var(--accent-soft)] text-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">하는 일</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">크레딧</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {COST_ROWS.map((r) => (
                  <tr key={r.t}>
                    <th scope="row" className="px-4 py-3 font-medium text-zinc-800 break-keep">{r.t}</th>
                    <td className={`px-4 py-3 text-right font-semibold break-keep ${r.free ? "text-emerald-700" : "text-zinc-900"}`}>
                      {r.v}
                      {r.note && <span className="block text-[12px] font-medium text-[var(--accent)]">{r.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-[var(--ink)] text-white px-4 py-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] font-bold">
                가입하면 {SIGNUP_FREE_CREDITS}크레딧 무료
                <span className="font-normal text-blue-200/80"> ({SIGNUP_FREE_VALIDITY_DAYS}일)</span>
              </span>
              <span className="text-[13.5px] text-blue-100/85">
                문제만이면 {SIGNUP_FREE_CREDITS}문제 · 해설 생성까지 하면 {FREE_WITH_SOLUTION}문제 분량
              </span>
            </div>
          </div>
          <p className="text-[13px] text-zinc-500 mt-3">1크레딧은 요금제에 따라 약 140~199원입니다.</p>
        </Section>

        <PromoInline location={LOC} />

        <Section id="tips" title="쓰는 요령">
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
            {[
              {
                t: "'왜 틀렸나'는 학생에게",
                d: "문제와 풀이는 채워서 주고 틀린 이유는 학생이 체크하게 하면, 자기 실수가 어느 쪽에 몰리는지 스스로 보게 됩니다.",
              },
              {
                t: "'다시 풀기'는 날짜를 적고 O·△·X로",
                d: "다시 풀어 맞히면 O, 맞혔지만 오래 걸렸으면 △, 또 틀리면 X. 다음 시험 전에는 △와 X만 다시 보면 됩니다.",
              },
              {
                t: "반 공용 양식은 수업 자료로",
                d: "반에서 많이 틀린 문제만 모아 '다룬 문항'에 적고, 수업 시간에 같이 풀이하는 자료로 쓰기 좋습니다.",
              },
              {
                t: "핵심 개념은 한두 줄로",
                d: "교과서 정의를 길게 옮기기보다 이 문제에 쓴 공식 하나를 적어 두는 쪽이 다시 보기 쉽습니다.",
              },
            ].map((r) => (
              <div key={r.t} className="border-t-2 border-[var(--accent)] pt-3">
                <dt className="text-[16.5px] font-bold text-zinc-900 break-keep">{r.t}</dt>
                <dd className="text-[15px] text-zinc-600 leading-relaxed mt-1.5 break-keep">{r.d}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="faq" title="자주 묻는 질문">
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <h3 className="text-[16px] font-semibold text-zinc-900 break-keep">{f.q}</h3>
                  <span className="text-zinc-400 transition-transform group-open:rotate-45 leading-none text-xl">+</span>
                </summary>
                <p className="text-[15px] text-zinc-600 leading-relaxed mt-2.5 break-keep">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* 마무리 — 남색 띠 하나로 끝낸다 */}
        <section id="bulk" className="scroll-mt-6 mt-16 rounded-2xl bg-[var(--ink)] text-white p-6 md:p-9">
          <h2 className="text-[22px] md:text-[26px] font-bold tracking-tight mb-3">양식 내려받기</h2>
          <p className="text-[15.5px] text-blue-100/85 leading-relaxed mb-6 break-keep">
            오답 정리에서 시간이 가장 많이 드는 건 문제를 다시 치고 풀이를 쓰는 일입니다. 그 둘의 초안은 AI MathOCR이 만들고,
            선생님은 읽고 고친 뒤 개념과 틀린 이유를 채우시면 되도록 이 양식을 만들었습니다.
          </p>
          <div className="rounded-xl bg-white text-zinc-900 p-5">
            <DownloadButtons location={`${LOC}_bottom`} />
          </div>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <TrackedLink
              href="/auth/signup"
              label="sign_up_free_15"
              location={`${LOC}_bottom`}
              className="text-[15px] font-bold px-5 py-3 rounded-lg text-center bg-white text-[var(--ink)] hover:bg-blue-50 transition-colors"
            >
              시험지로 {SIGNUP_FREE_CREDITS}문제 무료 변환해 보기
            </TrackedLink>
            <TrackedLink
              href="/#guide"
              label="guide_video"
              location={`${LOC}_bottom`}
              className="text-[15px] px-5 py-3 rounded-lg text-center border border-white/30 text-white hover:bg-white/10 transition-colors"
            >
              사용법 영상 보기
            </TrackedLink>
          </div>
        </section>
      </article>
    </ArticleShell>
  );
}
