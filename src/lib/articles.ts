// 자료실(/guides) 카드 목록 — 글을 추가하면 여기 한 줄 + sitemap 날짜만 갱신한다.
// 주소는 기존 /help/... 를 그대로 쓴다(이미 검색에 잡힌 주소를 바꾸면 순위가 처음부터 다시 쌓인다).

export type ArticleCategory = "exam" | "hwp" | "tool" | "app";

export const ARTICLE_CATEGORIES: { id: ArticleCategory; label: string }[] = [
  { id: "exam", label: "시험지 제작" },
  { id: "hwp", label: "한글 수식" },
  { id: "tool", label: "무료 도구" },
  { id: "app", label: "앱 도움말" },
];

export type Article = {
  href: string;
  category: ArticleCategory;
  title: string;
  summary: string;
  date: string; // 최근 수정일 YYYY-MM-DD
  // 썸네일: 대표 이미지(public 경로) · 대표 수식(LaTeX, 서버에서 MathML로 그림) · 짧은 글자 중 하나
  thumb: { img: string; alt: string } | { tex: string } | { text: string };
  thumbTone: "violet" | "sky" | "amber" | "rose" | "emerald";
};

export const ARTICLES: Article[] = [
  {
    href: "/help/math-exam-to-hwp",
    category: "exam",
    title: "수학 시험지 PDF를 한글(HWP)로 옮기는 3가지 방법",
    summary: "직접 타이핑·타이핑 외주(문제당 400~1,300원)·변환 프로그램을 비용·시간·품질로 비교하고, 문제 수별 계산기로 내 경우를 따져 봅니다.",
    date: "2026-10-14",
    thumb: { img: "/articles/exam-3ways-thumb.webp", alt: "시험지를 한글 문서로 옮기는 세 가지 길 — 스캔·외주·직접 타이핑" },
    thumbTone: "emerald",
  },
  {
    href: "/help/hwp-equation",
    category: "hwp",
    title: "한글(HWP) 수식 입력 방법 — 명령어 69개·단축키 총정리",
    summary: "수식 편집기 여는 법부터 분수·극한·적분·집합·경우의 수까지, 복사 버튼으로 바로 붙여 넣는 명령어 사전.",
    date: "2026-10-14",
    thumb: { tex: "\\frac{a}{b}\\quad \\sqrt{2}\\quad \\sum_{k=1}^{n}" },
    thumbTone: "violet",
  },
  {
    href: "/help/latex-to-hwp",
    category: "tool",
    title: "ChatGPT 수식을 한글 수식으로 — 무료 변환기",
    summary: "ChatGPT 답변을 붙여 넣으면 \\frac 같은 LaTeX 수식만 골라 한글 수식 명령어로 바꿔 줍니다. 로그인 없이 무료.",
    date: "2026-10-14",
    thumb: { text: "\\frac{a}{b}  →  {a} over {b}" },
    thumbTone: "sky",
  },
  {
    href: "/help/hwp-launch",
    category: "app",
    title: "한글 실행·응답 오류 해결 가이드",
    summary: "변환 중 '한글이 응답하지 않아' 문서를 만들지 못했을 때, 인식 결과를 살려 문서를 다시 만드는 방법.",
    date: "2026-10-01",
    thumb: { text: "한글 응답 없음" },
    thumbTone: "amber",
  },
  {
    href: "/help/hwp-repair",
    category: "app",
    title: "한글(한컴오피스) 연결 오류 해결 가이드",
    summary: "'한글 설치가 손상되어 연결할 수 없습니다' 오류가 뜰 때 한컴오피스 복구 설치로 해결하는 방법.",
    date: "2026-07-13",
    thumb: { text: "한컴오피스 복구" },
    thumbTone: "rose",
  },
];
