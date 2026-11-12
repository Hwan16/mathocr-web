import type { Metadata } from "next";
import { SIGNUP_FREE_CREDITS, SIGNUP_FREE_VALIDITY_DAYS } from "@/lib/plans";
import { articleSeoMetadata } from "@/lib/articles";
import TrackedLink from "@/components/TrackedLink";
import ArticleShell from "@/components/article/ArticleShell";
import { PromoInline } from "@/components/article/PromoCards";
import { EndBand, FaqList, LINK, Section, Step } from "@/components/article/Prose";

// ⚠️ 이 글의 사실관계 근거(2026-11-13 v2 학원 로고형으로 다시 씀):
//  - 양식: 마케팅/261028_자료실_강사전용/시험지/make_exam_template_v2.py(2단 시험지 24×33·A4)·make_answer_sheet.py(답안지·정답표).
//    머리 = [학원 로고 자리 그림 | 시험 구분 + 시험명(함초롬돋움) | 학원명 + 시험일 + 문항 수·총점] → 굵은 줄 0.5mm →
//    [범위 | 학년·반 | 이름 | 점수 /100] 한 줄. 본문 맨 위 [5지선다형] 표지 + 빈 줄, [서답형] 표지 + 빈 줄.
//    24×33판 본문은 앱 출력 src/hwp_writer.py 와 같은 용지(240×330, 좌우 20·상하 15)·단 간격 8mm(단 폭 96mm)·
//    함초롬바탕 10pt·줄 간격 160%·가운데 구분선. 머리만 1단(첫 단 정의를 HWPML에서 Count=1로). A4판은 여백 12mm·단 폭 89mm.
//  - 채운 예시: 학교 기말 시험지(학교명 제외)의 실제 OCR 구조화 결과 7문제를 앱 출력기의 문제 쓰기 함수로 [5지선다형] 아래에,
//    문제 사이 빈 줄 하나(줄바꿈 2번 — 검증 일꾼 PDF 실측; 변환 결과는 줄바꿈 8번 = 빈 줄 7개). 학원명·반은 가상. make_exam_example_v2.py
//  - 쪽수 실측(같은 간격): 7문제 → 24×33 한 쪽에 다 들어감(빈 [서답형] 표지만 2쪽)·A4 2쪽, 16문제 → 둘 다 3쪽(example_v2_*_16.pdf).
//  - 붙여 넣기 실측(make_paste_demo.py): 앱 generate()로 만든 변환 결과에서 1번~마지막 문제를 복사해 24×33 양식
//    [5지선다형] 아래에 붙이면 줄 바꿈 위치가 같다. 정답 미주는 양식 문서 끝으로 따라온다. 전체 선택(Ctrl+A)으로
//    복사하면 '[ 정답 ]' 제목 줄(본문 글자)이 붙인 자리에 들어온다. A4판에 붙이면 줄이 다시 흐르고 어색한 줄 바꿈이 생길 수 있다.
//  - 앱 동작: 결과는 24×33cm 2단 한글 문서, 번호는 박스 순서대로 1..N, 정답·해설은 문서 끝 미주.
//    ✨ 자동 인식 차감 없음(잔액 1 이상), 사진 10장(JPG·PNG), PDF 가능.
//  - 요금: lib/plans.ts — 문제 1개 1크레딧(약 140~199원), 그림 무료, 실패분 자동 반환, 가입 15크레딧·7일.
//    (비용 표는 강사 시선 11-13 '광고처럼 읽힘'으로 한 줄로 줄임)
//  - 붙여 넣기 그림: 보기 박스·분수 문제(원 시험지 7번)를 실제 복사·붙여 넣기(PIDS=07 make_paste_demo.py b4c problems)
//    — <보기> ㄹ 줄 '등비/수열이다' 같은 위치.
//  - 한/글 조작(한컴 도움말 Hwp.chm 11-13 재확인): 편집 용지 F7, 표 Ctrl+N,T, 그림 Ctrl+N,I, 쪽 번호 Ctrl+N,P,
//    머리말/꼬리말 Ctrl+N,H(쪽 윤곽에서 꼬리말 영역 두 번 누르면 고치기), 다단 설정 나누기 Ctrl+Alt+Enter,
//    단 나누기 Ctrl+Shift+Enter, 인쇄 방식 '공급 용지에 맞추어', 찾기 Ctrl+F.

const HREF = "/help/exam-paper-template";
const LOC = "exam_tpl";

export const metadata: Metadata = {
  title: "수학 시험지 양식(한글 HWP) 무료 — 학원 로고 넣는 2단 시험지·답안지",
  description:
    "학원 로고·시험명·학원명 머리, 이름·점수 칸, 5지선다형·서답형 표지, 2단 본문을 갖춘 한글 수학 시험지 양식(A4·24×33cm)과 답안지·정답표를 가입 없이 무료로 받으세요. AI MathOCR로 옮긴 문제를 24×33cm판에 붙이면 줄 바꿈이 그대로 들어가고, 한글에서 2단 시험지를 직접 만드는 순서도 정리했습니다.",
  alternates: { canonical: HREF },
  ...articleSeoMetadata(HREF),
};

const TOC = [
  { href: "#summary", label: "한눈에 보기" },
  { href: "#example", label: "채운 예시" },
  { href: "#anatomy", label: "양식 각 자리" },
  { href: "#paste", label: "변환 결과 붙여 넣기" },
  { href: "#answer", label: "답안지·정답표" },
  { href: "#diy", label: "한글에서 직접 만들려면" },
  { href: "#bank", label: "기출·문제은행 정리법" },
  { href: "#faq", label: "자주 묻는 질문" },
];

const DOWNLOAD_GROUPS = [
  {
    name: "2단 시험지 양식",
    note: "학원 로고·시험명 머리 + 이름·점수 칸 + 5지선다형·서답형 표지 + 본문 2단(가운데 구분선) + 쪽 번호",
    items: [
      { href: "/templates/exam-paper-2col-a4.hwp", file: "시험지_양식_2단_A4.hwp", title: "A4", sub: "직접 입력해 학원 프린터로 바로", label: "template_download_exam_a4" },
      { href: "/templates/exam-paper-2col.hwp", file: "시험지_양식_2단_24x33.hwp", title: "24×33cm", sub: "변환 결과 붙여 넣기용 — A4로 줄여 인쇄 가능", label: "template_download_exam" },
    ],
  },
  {
    name: "답안지·정답표",
    note: "1쪽 학생 답안지(객관식 26칸·서답형 3칸), 2쪽 정답·배점·단원·오답 수 표 — 문항 수에 맞게 칸을 줄이면 됩니다",
    items: [
      { href: "/templates/answer-sheet-a4.hwp", file: "답안지_정답표_A4.hwp", title: "A4", sub: "채점·오답 수 기록까지 한 파일에", label: "template_download_answer" },
    ],
  },
];

// 그림(exam-paper-anatomy.webp)의 번호와 같은 순서
const ANATOMY = [
  { t: "학원 로고 자리", d: "그림을 눌러 지우고, 그 자리에서 [입력] → [그림](Ctrl+N, I)으로 학원 로고 파일을 넣습니다. 높이 16mm 안팎이 알맞습니다. 로고가 없으면 지우기만 하세요 — 시험명은 쪽 가운데에 그대로 있습니다." },
  { t: "시험 구분", d: "'2026학년도 2학기 기말고사 대비', '11월 월말평가'처럼 어떤 시험인지 한 줄로." },
  { t: "시험명", d: "가장 크게 들어가는 제목. '고2 대수 기말 대비 모의고사' 정도 길이가 한 줄에 들어갑니다." },
  { t: "학원명 · 시험일·시간 · 문항 수·총점", d: "학생이 시험지를 받자마자 확인하는 정보라 오른쪽 위에 모았습니다." },
  { t: "범위 · 학년·반 · 이름 · 점수", d: "한 줄짜리 칸. 학년·반 칸은 '고2 오후 심화반'이 들어가는 폭이고, 점수 칸의 '/ 100'은 총점에 맞게 고치면 됩니다." },
  { t: "[5지선다형] · [서답형] 표지", d: "평가원·학교 시험지처럼 객관식과 서답형 구역을 나눕니다. 서답형이 없으면 [서답형] 표지를 지우고, 중등 4지선다형이면 표지 글자만 고치면 됩니다. 서답형 답은 답안지의 서답형 칸에 쓰게 하거나 문제 아래 빈 줄로 풀이 공간을 두세요." },
  { t: "붙여 넣는 자리", d: "각 표지 아래 빈 줄. 문제를 직접 치거나 변환 결과를 여기에 붙여 넣습니다." },
];

const DIY = [
  {
    t: "편집 용지(F7)에서 용지와 여백을 정합니다",
    d: "A4 또는 24×33cm. 여백은 좌우 20mm·위아래 15mm(A4는 12mm)쯤. 머리말·꼬리말 길이를 줄이면 본문이 넓어집니다.",
  },
  {
    t: "머리를 표 두 개로 만듭니다 (Ctrl+N, T)",
    d: "1줄 3칸 표에 로고 | 시험명 | 학원명을 넣고 테두리는 아래 굵은 선만 남깁니다. 바로 아래 1줄 8칸 표에 범위·학년반·이름·점수와 빈칸을 번갈아 두고, 이름표 칸에 옅은 회색을 채우면 시험지 머리처럼 보입니다.",
  },
  {
    t: "머리 아래부터 2단으로 바꿉니다",
    d: "머리 아래 빈 줄에 커서를 두고 [쪽] → [다단 설정 나누기](Ctrl+Alt+Enter)를 넣은 뒤, [쪽] → [단] → [다단 설정]에서 단 개수 2, 구분선을 켭니다. 이름이 비슷한 [단 나누기](Ctrl+Shift+Enter)는 글을 다음 단으로 넘기는 기능이라 여기서 쓰면 안 됩니다. 머리까지 2단으로 갈라지면 되돌리고(Ctrl+Z) 다단 설정 나누기를 먼저 넣었는지 확인하세요.",
  },
  {
    t: "문항 번호·배점 서식을 정합니다",
    d: "'1.'을 굵게 12pt로, 본문은 10pt·줄 간격 160%. 배점은 문장 끝 [4점]. 보기 박스는 표 1칸이나 문단 테두리로.",
  },
  {
    t: "쪽 번호를 넣고 양식으로 저장합니다 (Ctrl+N, P)",
    d: "가운데 아래. 완성한 빈 양식은 따로 두고, 시험마다 복사해서 씁니다.",
  },
];

const BANK_RULES = [
  { t: "시험이 끝난 주에 바로", d: "학생 시험지를 걷을 수 있는 건 시험 직후 며칠뿐입니다. 사진만 먼저 찍어 폴더에 넣어 두고, 변환은 그 주 안에 합니다." },
  { t: "정답표의 단원·유형은 반드시 채웁니다", d: "이 칸이 비어 있으면 문제은행이 아니라 파일 더미입니다. 변환 직후 채점하면서 적는 것이 가장 쉽습니다." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "본문이 비어 있는데 문항 번호는 어떻게 넣나요?",
    a: "직접 칠 때는 '1.'을 굵게 12pt로 치고 본문을 이어 씁니다. AI MathOCR 변환 결과를 붙여 넣으면 번호가 이미 붙어 있습니다(남겨 둔 문제 영역 순서대로 1, 2, 3…). 번호를 미리 넣어 두지 않은 이유입니다.",
  },
  {
    q: "학원 로고는 어떻게 넣나요?",
    a: "머리 왼쪽의 '학원 로고' 그림을 눌러 지우고, 그 자리에서 [입력] → [그림](Ctrl+N, I)으로 로고 파일을 넣습니다. 그림이 크게 들어오면 모서리를 끌어 높이 16mm 안팎으로 줄이세요. 로고가 없으면 지우기만 해도 시험명은 쪽 가운데에 그대로 있습니다.",
  },
  {
    q: "꼬리말의 'AI MathOCR 자료실' 표시는 지워도 되나요?",
    a: "네, 지우고 쓰셔도 됩니다. [쪽 윤곽] 보기에서 쪽 아래 꼬리말을 두 번 누르면 고칠 수 있고, [머리말/꼬리말] 탭의 [지우기]로 통째로 없앨 수도 있습니다. 쪽 번호는 따로 들어 있어 그대로 남습니다.",
  },
  {
    q: "A4판과 24×33cm판 중 어느 것을 받아야 하나요?",
    a: "문제를 직접 치거나 다른 곳에서 가져온다면 A4판, AI MathOCR 변환 결과를 붙여 넣는다면 24×33cm판입니다. 24×33cm는 변환 결과가 나오는 크기라 줄 바꿈이 그대로이고, 인쇄 창의 [인쇄 방식]에서 [공급 용지에 맞추어]를 고르면 A4 용지에 줄여 찍을 수 있습니다(87.5%로 줄어 본문 10pt가 약 9pt로 찍힙니다). A4판에 붙이면 단 폭이 좁아 줄이 다시 맞춰집니다.",
  },
  {
    q: "객관식이 20문항이면 답안지의 남는 칸은요?",
    a: "비워 두거나 표의 뒷 칸을 지우면 됩니다. 학교 시험은 객관식 21~25문항이 흔해 26칸으로 두었습니다. 서답형 칸도 같은 방식으로 줄이거나 복사해 늘릴 수 있습니다.",
  },
  {
    q: "배점은 어디에 적나요?",
    a: "문장 끝에 [3.7점]처럼 적는 것이 학교 시험지 관례입니다. 정답·배점표에도 같은 값을 적어 두면 채점과 오답 수 집계가 한 장에서 끝납니다.",
  },
  {
    q: "2단 가운데 구분선을 없애거나 1단으로 바꾸려면요?",
    a: "본문에 커서를 두고 [쪽] → [단] → [다단 설정]에서 구분선을 끄거나 단 개수를 1로 바꾸면 됩니다. 머리는 따로 1단으로 되어 있어 영향을 받지 않습니다.",
  },
  {
    q: "변환 결과 파일을 그대로 시험지로 써도 되나요?",
    a: "됩니다. 변환 결과도 24×33cm 2단 문서이고, 정답과 해설은 문서 끝에 미주로 붙습니다. 다만 학원 로고·이름·점수 칸이 있는 시험지로 내려면 이 양식에 붙여 넣으세요. 어느 쪽이든 문제 사이의 풀이 공간용 빈 줄은 시험지 분량에 맞게 줄이면 됩니다.",
  },
  {
    q: "무료 체험으로 어디까지 해 볼 수 있나요?",
    a: `가입하면 ${SIGNUP_FREE_CREDITS}크레딧을 드리고, 받은 날부터 ${SIGNUP_FREE_VALIDITY_DAYS}일 동안 쓸 수 있습니다. 문제 1개가 1크레딧이니 기출 ${SIGNUP_FREE_CREDITS}문제를 한글로 옮겨 볼 수 있습니다. 양식 자체는 가입 없이 무료입니다.`,
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

const howToStructuredData = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "한글에서 2단 수학 시험지 만들기",
  step: DIY.map((s) => ({ "@type": "HowToStep", name: s.t, text: s.d })),
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
        <div key={g.name}>
          <p className="text-[13.5px] text-zinc-600 mb-2.5 break-keep">
            <strong className="text-zinc-900 font-semibold">{g.name}</strong> · {g.note}
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
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold text-zinc-900 group-hover:text-white transition-colors">
                    {g.name} <span className="font-normal text-zinc-500 group-hover:text-blue-100">· {d.title} .hwp</span>
                  </span>
                  <span className="block text-[12.5px] text-zinc-500 group-hover:text-blue-100 transition-colors break-keep">{d.sub}</span>
                </span>
              </TrackedLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExamPaperTemplatePage() {
  return (
    <ArticleShell
      href={HREF}
      location={LOC}
      toc={TOC}
      hero={{
        lead: "학원 로고·시험명·이름·점수 칸에 2단 본문까지 갖춘 한글 수학 시험지 양식입니다. 답안지·정답표와 함께 가입 없이 받으세요. 문제를 직접 치셔도 되고, 24×33cm판에는 기출 사진에서 한글로 옮긴 문제를 붙여도 줄이 다시 흐르지 않습니다(실제로 붙인 결과는 아래).",
        img: { src: "/articles/exam-paper-example.webp", alt: "2단 시험지 양식에 수열·삼각함수 기출 7문제가 들어간 한 쪽 — 학원 로고 자리·시험명·학원명 머리, 이름·점수 칸, 5지선다형 표지, 가운데 구분선, 보기 박스", w: 1100, h: 1562 },
      }}
    >
      <style>{`
.ui{font-size:0.88em;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:1px 6px;color:#18181b;white-space:nowrap}
.tree{font-family:ui-monospace,Consolas,monospace;font-size:13.5px;line-height:1.75;color:#27272a;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:14px 18px;white-space:pre;overflow-x:auto}
`}</style>
      <script
        type="application/ld+json"
        // JSON-LD는 신뢰된 내부 정적 데이터라 안전
        dangerouslySetInnerHTML={{ __html: JSON.stringify([faqStructuredData, howToStructuredData]) }}
      />
      <article>
        {/* 한눈에 보기 — 글 안에서 유일한 바탕색 상자(바로 받기) */}
        <section id="summary" className="scroll-mt-6 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] p-6 md:p-8">
          <h2 className="text-[20px] font-bold text-zinc-900 tracking-tight mb-4">한눈에 보기</h2>
          <ul className="space-y-2.5 text-[15.5px] text-zinc-800 leading-relaxed mb-7 break-keep">
            {[
              <>
                <strong className="text-zinc-900">학원 로고·시험명 머리</strong>, 이름·점수 칸, 5지선다형·서답형 표지, 2단 본문, 쪽 번호까지 들어
                있어 문제만 넣으면 시험지가 됩니다
              </>,
              <>
                문제를 직접 칠 거면 <strong className="text-zinc-900">A4판</strong>, AI MathOCR로 옮긴 문제를 붙일 거면{" "}
                <strong className="text-zinc-900">24×33cm판</strong>(변환 결과와 같은 폭이라 줄 바꿈이 그대로, 인쇄할 때 A4로 줄여 찍힘).
                답안지·정답표는 A4 한 가지
              </>,
              <>24×33cm판 한 쪽에 보기 박스가 섞인 5지선다 7문제가 들어갑니다(A4판은 2쪽). 한글(.hwp), 가입 없이 바로</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-[var(--accent)] font-bold shrink-0">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <DownloadButtons location={`${LOC}_summary`} />
          <p className="text-[12.5px] text-zinc-500 mt-4">한/글 2014 이상에서 열립니다. 머리 글자·로고 자리와 꼬리말의 출처 표시는 고치거나 지우고 쓰셔도 됩니다.</p>
        </section>

        <Section id="example" title="채운 예시">
          <p className="prose-p mb-6">
            24×33cm판에 보기 박스·조건 박스가 있는 7문제를 넣은 모습입니다. 머리는 시험명·범위·반만 바꿨고(학원명·반은 가상, 로고 자리는 그대로),
            본문은 시험지 사진에서 옮긴 문제를 그대로 넣었습니다.
          </p>
          <figure>
            <img
              src="/articles/exam-paper-example.webp"
              alt="2단 시험지 양식에 수열·삼각함수 기출 7문제가 들어간 한 쪽 — 학원 로고 자리·시험명·학원명 머리, 이름·점수 칸, 5지선다형 표지, 가운데 구분선, 보기 박스, 조건 박스"
              width={1100}
              height={1562}
              className="block w-full h-auto rounded-lg border border-zinc-200"
            />
            <figcaption className="text-[13px] text-zinc-500 mt-3 leading-relaxed break-keep">
              본문의 문제는 학교 기말 시험지 사진(학교명 제외)에서 AI MathOCR이 읽어 낸 결과를 앱의 출력 방식 그대로 넣은 것입니다. 문제
              번호·배점·보기 박스·수식이 그대로 들어옵니다. 변환 결과에는 문제 사이에 풀이 공간용 빈 줄이 들어 있는데, 시험지로 낼 때
              줄이듯 여기서는 빈 줄 하나만 남겼습니다. 같은 간격으로 7문제가 24×33cm판 한 쪽에 다 들어가고(A4판은 2쪽), 16문제는 둘 다
              3쪽입니다.
            </figcaption>
          </figure>
        </Section>

        <Section id="anatomy" title="양식 각 자리 — 무엇을 어디에 쓰나">
          <p className="prose-p mb-6">
            빈 양식(24×33cm판)의 윗부분입니다. 글자는 눌러서 바로 고치면 되고, 번호마다 쓰는 법은 아래와 같습니다.
          </p>
          <figure className="mb-8">
            <img
              src="/articles/exam-paper-anatomy.webp"
              alt="빈 시험지 양식 윗부분에 번호를 붙인 그림 — 1 학원 로고 자리, 2 시험 구분, 3 시험명, 4 학원명·시험일·문항 수, 5 범위·학년반·이름·점수 칸, 6 5지선다형·서답형 표지, 7 붙여 넣는 자리"
              width={1100}
              height={356}
              loading="lazy"
              className="block w-full h-auto rounded-lg border border-zinc-200"
            />
          </figure>
          <ol className="space-y-5">
            {ANATOMY.map((c, i) => (
              <li key={c.t} className="flex gap-3.5">
                <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--accent)] text-white text-[13px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[16.5px] font-bold text-zinc-900 break-keep">{c.t}</p>
                  <p className="text-[15px] text-zinc-600 leading-relaxed mt-1 break-keep">{c.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="prose-p mt-8">
            <strong className="text-zinc-900">A4와 24×33cm</strong> — 본문 2단의 단 폭은 89mm(A4) · 96mm(24×33cm)이고, 둘 다 함초롬바탕
            10pt·줄 간격 160%입니다. 문제를 직접 친다면 A4판, AI MathOCR 변환 결과를 붙인다면 변환 결과와 크기가 같은 24×33cm판이 맞습니다.
          </p>
        </Section>

        <Section id="paste" title="AI MathOCR 변환 결과를 붙이면 — 줄 바꿈 그대로">
          <p className="prose-p mb-2">
            줄이 어디서 바뀌는지는 단 폭과 글자 크기·줄 간격으로 정해집니다. 양식의 24×33cm판 본문은 이 셋을 AI MathOCR 변환 결과와 똑같이
            맞췄습니다(단 폭 96mm · 함초롬바탕 10pt · 줄 간격 160%). 그래서 변환한 문제를 복사해 붙여도 줄이 다시 흐르지 않습니다. 아래는
            &lt;보기&gt; 박스와 분수가 든 문제를 실제로 복사해 붙여 넣은 결과입니다.
          </p>
          <p className="text-[14px] text-zinc-500 mb-6 break-keep">
            AI MathOCR은 시험지 사진·PDF의 문제를 편집 가능한 한글 수식 문서로 바꿔 주는 Windows 프로그램이고, PC에 정품 한/글(2014 이상
            권장)이 있어야 합니다. 양식만 쓸 때는 한/글만 있으면 됩니다.
          </p>
          <figure className="rounded-xl border border-zinc-200 overflow-hidden mb-10">
            <div className="grid sm:grid-cols-2">
              <div className="bg-zinc-50 p-3 md:p-4 flex flex-col">
                <span className="text-[12.5px] font-semibold text-zinc-500 mb-2">① AI MathOCR 변환 결과(한글 문서)</span>
                <img
                  src="/articles/exam-paste-before.webp"
                  alt="AI MathOCR이 만든 한글 문서의 보기 문제 — 보기 ㄹ 줄이 '등비'에서 끝나고 다음 줄이 '수열이다'"
                  width={630}
                  height={655}
                  loading="lazy"
                  className="block w-full h-auto rounded-md border border-zinc-200 bg-white"
                />
              </div>
              <div className="bg-white p-3 md:p-4 flex flex-col border-t sm:border-t-0 sm:border-l border-zinc-200">
                <span className="text-[12.5px] font-semibold text-[var(--accent)] mb-2">② 복사해서 양식의 [5지선다형] 아래에 붙인 모습</span>
                <img
                  src="/articles/exam-paste-after.webp"
                  alt="시험지 양식에 붙여 넣은 같은 보기 문제 — 5지선다형 표지 아래, 보기 ㄹ 줄이 같은 위치에서 바뀜"
                  width={630}
                  height={655}
                  loading="lazy"
                  className="block w-full h-auto rounded-md border border-zinc-200"
                />
              </div>
            </div>
            <figcaption className="text-[13px] text-zinc-500 px-3 md:px-4 py-3 border-t border-zinc-200 leading-relaxed break-keep">
              파란 칸 — &lt;보기&gt; ㄹ 줄이 두 장 모두 &lsquo;등비 / 수열이다&rsquo;에서 바뀝니다. 분수·첨자·보기 박스도 그대로 들어옵니다.
              옮긴 수식이 맞는지는 시험지로 내기 전에 한 번 훑어보세요.
            </figcaption>
          </figure>

          <h3 className="text-[19px] font-bold text-zinc-900 tracking-tight mb-6">기출 사진에서 양식까지 4단계</h3>
          <ol className="space-y-10">
            <Step n={1} title="기출 사진(또는 PDF)을 AI MathOCR로 변환합니다">
              휴대폰으로 찍은 사진(JPG·PNG, 한 번에 10장까지)이나 스캔 PDF를 열고 <span className="ui">✨ 자동 인식</span>을 누르면 문제마다
              박스가 그려집니다. 자동 인식에는 크레딧이 들지 않고, 잔액이 1 이상일 때 쓸 수 있습니다(문제가 잔액보다 많으면 잔액만큼만 박스가 그려집니다). <span className="ui">변환하기</span>를
              누르면 24×33cm 2단 한글 문서가 만들어집니다. 학생 필기가 남은 시험지도 인쇄된 문제만 옮기도록 되어 있지만, 사진이 흐리면 잘못 읽을 수 있으니 결과는
              한 번 훑어보세요.
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
            <Step n={2} title="변환 결과에서 문제만 복사합니다">
              1번 문제부터 마지막 문제의 선택지까지 끌어서 고른 뒤 <span className="ui">Ctrl+C</span>. 문서 맨 끝의 &lsquo;[ 정답 ]&rsquo;(해설을
              넣었으면 &lsquo;[ 정답 및 해설 ]&rsquo;) 제목 줄은 빼고 고르세요 — 전체 선택(<span className="ui">Ctrl+A</span>)으로 복사하면 이
              제목 줄이 붙인 문제들 바로 뒤에 본문 글자로 들어옵니다.
            </Step>
            <Step n={3} title="양식의 [5지선다형] 아래 빈 줄에 붙여 넣습니다">
              빈 줄을 누르고 <span className="ui">Ctrl+V</span>. 정답·해설은 미주라서 따로 옮기지 않아도 양식 문서 맨 끝으로 함께 따라옵니다.
              서답형 문제는 같은 방법으로 [서답형] 아래에 붙입니다.
            </Step>
            <Step n={4} title="간격을 맞추고 인쇄합니다">
              변환 결과에는 문제 사이에 풀이 공간용 빈 줄이 넉넉히 들어 있습니다. 시험지 분량에 맞게 줄이고, 문제가 두 단에 걸쳐 잘리면 그
              문제 번호 앞에 커서를 두고 [단 나누기](<span className="ui">Ctrl+Shift+Enter</span>)로 다음 단으로 넘깁니다. A4 용지에 찍을
              때는 인쇄 창의 [인쇄 방식]에서 [공급 용지에 맞추어]를 고르면 됩니다.
            </Step>
          </ol>
          <p className="text-[14px] text-zinc-500 mt-8 leading-relaxed break-keep">
            A4판 양식에 붙여도 수식·박스는 그대로 들어오지만, 단 폭이 7mm 좁아 줄이 다시 맞춰지면서 어색하게 끊기는 줄이 생길 수 있습니다.
            변환 결과를 붙여 쓸 때는 24×33cm판을 권합니다.
          </p>

          <p className="prose-p mt-6">
            <strong className="text-zinc-900">비용</strong> — 문제 1개 1크레딧(요금제에 따라 약 140~199원)이고, 문제 속 그림은 무료, 변환에
            실패한 문제는 크레딧을 자동으로 돌려드립니다. 가입하면 {SIGNUP_FREE_CREDITS}크레딧({SIGNUP_FREE_VALIDITY_DAYS}일)을 드려 기출{" "}
            {SIGNUP_FREE_CREDITS}문제를 무료로 옮겨 볼 수 있습니다. 양식은 무료입니다.
          </p>
        </Section>

        <Section id="answer" title="답안지·정답표">
          <p className="prose-p mb-6">
            1쪽은 학생이 쓰는 답안지(객관식 26칸, 서답형 3칸, 점수 합계), 2쪽은 선생님이 쓰는 정답·배점표입니다. 객관식이 20문항이면
            뒷 칸은 비워 두거나 지우면 됩니다. 정답표의 <strong className="text-zinc-900">단원·유형</strong> 칸을 채워 두면 나중에 문제은행에서
            찾을 때 색인이 되고, <strong className="text-zinc-900">오답 수</strong> 칸은 다음 수업과{" "}
            <TrackedLink href="/help/wrong-answer-note" label="article_link" location={`${LOC}_answer`} className={LINK}>
              오답 자료
            </TrackedLink>
            의 우선순위가 됩니다.
          </p>
          <figure>
            <img
              src="/articles/answer-sheet-preview.webp"
              alt="답안지(객관식 26칸·서답형 3칸)와 정답·배점표(번호·정답·배점·단원·유형·오답 수) 두 쪽"
              width={1100}
              height={746}
              loading="lazy"
              className="block w-full h-auto rounded-lg border border-zinc-200"
            />
            <figcaption className="text-[13px] text-zinc-500 mt-3 leading-relaxed break-keep">
              왼쪽 답안지는 학생용, 오른쪽 정답·배점표는 채점·기록용. 한 파일에 두 쪽입니다.
            </figcaption>
          </figure>
        </Section>

        <Section id="diy" title="한글에서 2단 시험지를 직접 만들려면?">
          <p className="prose-p mb-8">
            양식을 내려받아 열면 아래 다섯 단계가 이미 되어 있습니다. 한글에서 직접 만들거나 양식을 고칠 때만 읽으세요. 막히는 곳은
            보통 세 번째(머리는 1단, 본문만 2단)입니다.
          </p>
          <details className="group rounded-xl border border-zinc-200">
            <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 text-[15.5px] font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
              다섯 단계 펼쳐 보기
              <span className="text-zinc-400 text-[20px] leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <ol className="space-y-8 px-5 pb-6 pt-2">
              {DIY.map((s, i) => (
                <Step key={s.t} n={i + 1} title={s.t}>
                  {s.d}
                </Step>
              ))}
            </ol>
          </details>
        </Section>

        <Section id="bank" title="기출과 문제은행은 어떻게 정리하나요?">
          <p className="prose-p mb-6">
            규칙은 하나입니다 — <strong className="text-zinc-900">시험 하나 = 폴더 하나</strong>, 그 안에 ① 원본(사진·PDF) ② 한글 변환본
            ③ 정답·배점표 세 가지를 둡니다. 문항 단위로 쪼개 두지 않아도, 정답표의 &lsquo;단원·유형&rsquo; 칸을 채워 두면 어느 시험에 어떤
            유형이 나왔는지 표 한 장으로 보이고, 파일 안에서는 찾기(<span className="ui">Ctrl+F</span>)로 &lsquo;사인법칙&rsquo;처럼 검색할
            수 있습니다.
          </p>
          <pre className="tree mb-8">{`문제은행/
  고2 대수/
    2026-2학기 기말/
      원본.pdf              ← 학생 시험지 사진 묶음(학교명은 잘라 둡니다)
      변환본.hwp            ← AI MathOCR 변환 결과(번호·정답 미주 그대로)
      시험지.hwp            ← 이 양식에 붙여 낸 시험지
      정답배점표.hwp        ← 단원·유형 · 오답 수까지
    2026-2학기 중간/
  고1 공통수학1/
    …`}</pre>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
            {BANK_RULES.map((r) => (
              <div key={r.t} className="border-t-2 border-[var(--accent)] pt-3">
                <dt className="text-[16.5px] font-bold text-zinc-900 break-keep">{r.t}</dt>
                <dd className="text-[15px] text-zinc-600 leading-relaxed mt-1.5 break-keep">{r.d}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <PromoInline location={LOC} />

        <Section id="faq" title="자주 묻는 질문">
          <FaqList items={FAQ} />
        </Section>

        <div className="mt-12">
          <p className="text-[12.5px] font-semibold text-zinc-400 mb-2">함께 보면 좋은 글</p>
          <ul className="space-y-1.5 text-[15px]">
            {[
              { href: "/help/math-exam-to-hwp", t: "수학 시험지 PDF를 한글(HWP)로 옮기는 3가지 방법" },
              { href: "/help/wrong-answer-note", t: "수학 오답노트 양식(한글) — 틀린 문제마다 개념·풀이·틀린 이유를 한 장에" },
              { href: "/help/hwp-equation", t: "한글(HWP) 수식 입력 방법 — 명령어 69개·단축키 총정리" },
            ].map((l) => (
              <li key={l.href}>
                <TrackedLink href={l.href} label="article_link" location={`${LOC}_related`} className={LINK}>
                  {l.t}
                </TrackedLink>
              </li>
            ))}
          </ul>
        </div>

        <EndBand id="bottom" title="양식 내려받기" location={`${LOC}_bottom`} signupLabel={`기출 사진으로 ${SIGNUP_FREE_CREDITS}문제 무료 변환해 보기`}>
          <p className="mb-2">
            시험지 만들기에서 시간이 드는 건 틀이 아니라 문제를 넣는 일입니다. 틀은 이 양식으로 끝내고, 문제는{" "}
            <strong>기출 사진에서 옮겨 오세요.</strong>
          </p>
          <p className="mb-6 text-[13.5px] text-blue-200/80">AI MathOCR은 Windows 프로그램이고 PC에 정품 한/글이 있어야 합니다. 양식은 한/글만 있으면 됩니다.</p>
          <div className="rounded-xl bg-white text-zinc-900 p-5">
            <DownloadButtons location={`${LOC}_bottom`} />
          </div>
        </EndBand>
      </article>
    </ArticleShell>
  );
}
