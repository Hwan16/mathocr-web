// 한글(HWP) 수식 명령어 사전 — /help/hwp-equation 에서 사용.
//
// hwp: 한글 수식 편집기 스크립트 입력 창에 그대로 넣는 명령어(복사 버튼이 복사하는 값).
//      2026-10-14 한글 2022(Equation Version 60)에 전부 실제로 넣어 렌더링 결과를 눈으로 확인했다.
//      대부분 앱의 LaTeX→HWP 변환기(src/latex_to_hwp.py) 출력과 같다. 고칠 때는 한글에서 다시 확인할 것.
//      확인된 함정: perp·overset{frown}은 한글이 못 읽는다(→ bot·arch),
//      LEFTRIGHTARROW는 ⇒로 나온다(→ LRARROW), leftrightarrow는 →로 나온다(→ lrarrow).
// tex:  결과 미리보기를 그리기 위한 LaTeX — 서버에서 MathML로 바꿔 보여 준다(화면 표시 전용).
// kw:   검색창에서 찾을 수 있게 하는 별칭(한글 이름·기호).

export type EquationCommand = {
  name: string;
  hwp: string;
  tex: string;
  kw?: string;
};

export type EquationCategory = {
  id: string;
  label: string;
  items: EquationCommand[];
};

export const EQUATION_CATEGORIES: EquationCategory[] = [
  {
    id: "basic",
    label: "기본 연산·부등호",
    items: [
      { name: "곱하기", hwp: "a times b", tex: "a \\times b", kw: "× 곱셈" },
      { name: "나누기", hwp: "a div b", tex: "a \\div b", kw: "÷ 나눗셈" },
      { name: "가운데 점", hwp: "a cdot b", tex: "a \\cdot b", kw: "· 곱 점" },
      { name: "플러스마이너스", hwp: "+- , -+", tex: "\\pm ,\\ \\mp", kw: "± ∓ 복부호" },
      { name: "같지 않다", hwp: "a != b", tex: "a \\neq b", kw: "≠ 부등" },
      { name: "크거나 같다·작거나 같다", hwp: "a <= b , a >= b", tex: "a \\leq b ,\\ a \\geq b", kw: "≤ ≥ 부등호 이상 이하" },
      { name: "근삿값", hwp: "pi approx 3.14", tex: "\\pi \\approx 3.14", kw: "≈ 약" },
      { name: "공백 한 칸", hwp: "a ~ b", tex: "a \\ b", kw: "띄어쓰기 빈칸 물결" },
    ],
  },
  {
    id: "fraction",
    label: "분수·루트",
    items: [
      { name: "분수", hwp: "{a} over {b}", tex: "\\frac{a}{b}", kw: "분자 분모 over" },
      { name: "분자가 여러 글자인 분수", hwp: "{a+b} over {c}", tex: "\\frac{a+b}{c}", kw: "중괄호" },
      { name: "번분수", hwp: "{{1} over {2}} over {3}", tex: "\\frac{\\frac{1}{2}}{3}", kw: "분수 안 분수" },
      { name: "제곱근", hwp: "sqrt{2}", tex: "\\sqrt{2}", kw: "√ 루트 근호" },
      { name: "세제곱근", hwp: "root {3} of {x}", tex: "\\sqrt[3]{x}", kw: "∛ n제곱근 루트" },
    ],
  },
  {
    id: "script",
    label: "지수·첨자·괄호",
    items: [
      { name: "거듭제곱", hwp: "x^{2}", tex: "x^{2}", kw: "제곱 지수 위첨자" },
      { name: "지수가 식일 때", hwp: "e^{x+1}", tex: "e^{x+1}", kw: "지수함수" },
      { name: "아래첨자", hwp: "a_{n}", tex: "a_{n}", kw: "첨자 수열" },
      { name: "위·아래첨자 함께", hwp: "x_{1}^{2}", tex: "x_{1}^{2}" },
      { name: "분수 높이에 맞춘 괄호", hwp: "left( {1} over {2} right)^{2}", tex: "\\left( \\frac{1}{2} \\right)^{2}", kw: "큰 괄호 left right" },
      { name: "절댓값", hwp: "left| x-1 right|", tex: "\\left| x-1 \\right|", kw: "| | 절대값" },
      { name: "중괄호(집합)", hwp: "lbrace 1, 2, 3 rbrace", tex: "\\{ 1, 2, 3 \\}", kw: "{ } 원소나열" },
      { name: "가우스 기호", hwp: "left[ x right]", tex: "\\left[ x \\right]", kw: "[ ] 대괄호 최대정수" },
    ],
  },
  {
    id: "function",
    label: "함수·로그·삼각함수",
    items: [
      { name: "합성함수", hwp: "(f circ g)(x)", tex: "(f \\circ g)(x)", kw: "∘ 동그라미" },
      { name: "역함수", hwp: "f^{-1}(x)", tex: "f^{-1}(x)", kw: "인버스" },
      { name: "로그", hwp: "log _{2} 8", tex: "\\log_{2} 8", kw: "log 밑" },
      { name: "자연로그", hwp: "ln x", tex: "\\ln x", kw: "ln" },
      { name: "삼각함수", hwp: "sin ^{2} x + cos ^{2} x = 1", tex: "\\sin^{2} x + \\cos^{2} x = 1", kw: "sin cos tan 사인 코사인" },
      { name: "탄젠트·세타", hwp: "tan theta", tex: "\\tan \\theta", kw: "θ" },
    ],
  },
  {
    id: "calculus",
    label: "수열·극한·미적분",
    items: [
      { name: "점점점(가운데)", hwp: "a_{1}, a_{2}, cdots, a_{n}", tex: "a_{1}, a_{2}, \\cdots, a_{n}", kw: "⋯ 말줄임 수열" },
      { name: "점점점(아래)", hwp: "1, 2, 3, ldots", tex: "1, 2, 3, \\ldots", kw: "… 말줄임" },
      { name: "순환소수", hwp: "0. dot{1} dot{2}", tex: "0.\\dot{1}\\dot{2}", kw: "점 위 dot" },
      { name: "시그마(합)", hwp: "sum _{k=1}^{n} a_{k}", tex: "\\sum_{k=1}^{n} a_{k}", kw: "Σ 합 기호" },
      { name: "극한", hwp: "lim _{x rightarrow 0} {sin x} over {x}", tex: "\\lim_{x \\to 0} \\frac{\\sin x}{x}", kw: "lim 리미트" },
      { name: "무한대로 가는 극한", hwp: "lim _{n rightarrow inf} a_{n}", tex: "\\lim_{n \\to \\infty} a_{n}", kw: "∞ inf 무한" },
      { name: "미분", hwp: "f'(x)", tex: "f'(x)", kw: "프라임 도함수 '" },
      { name: "도함수(라이프니츠)", hwp: "{dy} over {dx}", tex: "\\frac{dy}{dx}", kw: "dy/dx" },
      { name: "적분", hwp: "int _{0}^{1} f(x) dx", tex: "\\int_{0}^{1} f(x)\\,dx", kw: "∫ 인테그랄 정적분" },
      { name: "정적분 계산 괄호", hwp: "left[ F(x) right]_{a}^{b}", tex: "\\left[ F(x) \\right]_{a}^{b}", kw: "대괄호 위끝 아래끝" },
    ],
  },
  {
    id: "geometry",
    label: "도형·벡터",
    items: [
      { name: "선분", hwp: "overline{AB}", tex: "\\overline{AB}", kw: "윗줄 바" },
      { name: "벡터", hwp: "vec{AB}", tex: "\\overrightarrow{AB}", kw: "→ 화살표" },
      { name: "호", hwp: "arch{AB}", tex: "\\overparen{AB}", kw: "⌒ 원" },
      { name: "도(°)", hwp: "60 DEG", tex: "60^{\\circ}", kw: "° 각도" },
      { name: "각", hwp: "angle ABC", tex: "\\angle ABC", kw: "∠" },
      { name: "삼각형", hwp: "TRIANGLE ABC", tex: "\\triangle ABC", kw: "△ 세모" },
      { name: "평행", hwp: "l parallel m", tex: "l \\parallel m", kw: "∥ //" },
      { name: "수직", hwp: "l bot m", tex: "l \\perp m", kw: "⊥ 직교" },
      { name: "합동", hwp: "TRIANGLE ABC equiv TRIANGLE DEF", tex: "\\triangle ABC \\equiv \\triangle DEF", kw: "≡" },
      { name: "닮음", hwp: "TRIANGLE ABC sim TRIANGLE DEF", tex: "\\triangle ABC \\sim \\triangle DEF", kw: "∽ ~" },
      { name: "그리스 문자", hwp: "alpha , beta , gamma , theta , pi", tex: "\\alpha, \\beta, \\gamma, \\theta, \\pi", kw: "α β γ θ π 알파 베타 세타 파이" },
    ],
  },
  {
    id: "set",
    label: "집합·명제",
    items: [
      { name: "원소이다·아니다", hwp: "x in A , x notin A", tex: "x \\in A ,\\ x \\notin A", kw: "∈ ∉" },
      { name: "부분집합", hwp: "A subset B , A not subset B", tex: "A \\subset B ,\\ A \\not\\subset B", kw: "⊂ ⊄" },
      { name: "합집합·교집합", hwp: "A cup B , A cap B", tex: "A \\cup B ,\\ A \\cap B", kw: "∪ ∩" },
      { name: "공집합", hwp: "emptyset", tex: "\\varnothing", kw: "∅ 공" },
      { name: "여집합", hwp: "A^{C}", tex: "A^{C}", kw: "C 컴플리먼트" },
      { name: "원소의 개수", hwp: "n(A)", tex: "n(A)" },
      { name: "이면(⇒)", hwp: "p RIGHTARROW q", tex: "p \\Rightarrow q", kw: "⇒ 충분조건 명제 화살표" },
      { name: "필요충분조건(⇔)", hwp: "p LRARROW q", tex: "p \\Leftrightarrow q", kw: "⇔ 동치 양쪽 화살표" },
      { name: "화살표(→)", hwp: "x rightarrow y", tex: "x \\rightarrow y", kw: "→ 대응" },
      { name: "따라서·왜냐하면", hwp: "therefore , because", tex: "\\therefore ,\\ \\because", kw: "∴ ∵" },
    ],
  },
  {
    id: "probability",
    label: "경우의 수·확률",
    items: [
      { name: "순열", hwp: "{}_{n} rm P it _{r}", tex: "{}_{n}\\mathrm{P}_{r}", kw: "nPr P" },
      { name: "조합", hwp: "{}_{n} rm C it _{r}", tex: "{}_{n}\\mathrm{C}_{r}", kw: "nCr C" },
      { name: "이항계수", hwp: "{n} choose {r}", tex: "\\binom{n}{r}", kw: "choose 괄호 조합" },
      { name: "계승(팩토리얼)", hwp: "n!", tex: "n!", kw: "! 팩토리얼" },
      { name: "조건부확률", hwp: "P(B | A)", tex: "P(B \\mid A)", kw: "| 세로선" },
      { name: "평균(표본평균)", hwp: "overline{X}", tex: "\\overline{X}", kw: "X바 바" },
    ],
  },
  {
    id: "layout",
    label: "행렬·경우·여러 줄",
    items: [
      { name: "경우 나누기", hwp: "cases{x+1 & (x >= 0) # -x & (x < 0)}", tex: "\\begin{cases} x+1 & (x \\geq 0) \\\\ -x & (x < 0) \\end{cases}", kw: "중괄호 구간 함수" },
      { name: "행렬", hwp: "left( matrix{1 & 2 # 3 & 4} right)", tex: "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}", kw: "matrix" },
      { name: "여러 줄 등호 맞추기", hwp: "f(x) & = (x+1)^{2} # & = x^{2} + 2x + 1", tex: "\\begin{aligned} f(x) &= (x+1)^{2} \\\\ &= x^{2} + 2x + 1 \\end{aligned}", kw: "줄바꿈 # 정렬 &" },
      { name: "수식 안 한글", hwp: "\"넓이\" = {1} over {2} ab", tex: "\\text{넓이} = \\frac{1}{2}ab", kw: "한글 따옴표 글자" },
      { name: "단위(정자체)", hwp: "3 rm {cm} it ^{2}", tex: "3\\,\\mathrm{cm}^{2}", kw: "rm it cm kg 로만체" },
    ],
  },
];

// 한글 2022 도움말 '수식 도구 상자'·'수식' 문서 기준(설치본 Hwp.chm, 2026-10-14 확인).
export const EQUATION_SHORTCUTS: { action: string; key: string }[] = [
  { action: "수식 편집기 열기", key: "Ctrl+N, M" },
  { action: "수식 넣고 닫기", key: "Shift+Esc" },
  { action: "분수 틀", key: "Ctrl+O" },
  { action: "근호(루트) 틀", key: "Ctrl+R" },
  { action: "위 첨자 / 아래 첨자", key: "Shift+6 / Shift+-" },
  { action: "합(시그마) 틀", key: "Ctrl+S" },
  { action: "적분 틀", key: "Ctrl+I" },
  { action: "극한 틀", key: "Ctrl+L" },
  { action: "괄호 틀", key: "Ctrl+9" },
  { action: "경우(cases) 틀", key: "Ctrl+0" },
  { action: "행렬 틀", key: "Ctrl+M" },
  { action: "장식 기호(선분·벡터 등)", key: "Ctrl+D" },
  { action: "다음 칸 / 이전 칸으로 이동", key: "Tab / Shift+Tab" },
  { action: "명령어 입력 상자로 이동", key: "\\ (역슬래시)" },
  { action: "본문의 수식 속성(크기·색) 열기", key: "수식 선택 후 P" },
];
