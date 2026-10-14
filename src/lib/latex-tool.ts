// ChatGPT 답변(글 + LaTeX 수식)을 조각으로 나눠 수식만 한글(HWP) 수식 명령어로 바꾼다.
// /api/tools/latex-to-hwp 가 쓴다. ⚠️ 서버 전용(latex-to-hwp.ts 를 끌어오므로 클라이언트에서 import 금지).
//
// 수식으로 보는 것:
//   1. 구분자로 감싼 부분 — \[ … \] · $$ … $$ (별도 줄 수식), \( … \) · $ … $ (문장 속 수식)
//      ChatGPT 의 [복사] 버튼은 \( \)·\[ \] 를, 다른 도구는 $ 를 주로 쓴다.
//   2. 구분자가 하나도 없으면: 한글이 없는 입력은 통째로 수식 하나(여러 줄이면 \begin 이 없는 한 줄마다),
//      한글 문장에 섞인 경우는 앱과 같은 방식(splitTextAndLatex)으로 LaTeX 명령이 든 부분만 떼어낸다.

import { LatexToHwpConverter, splitTextAndLatex } from "./latex-to-hwp.ts";

export type ToolItem =
  | { kind: "text"; text: string }
  | { kind: "math"; latex: string; hwp: string; display: boolean };

// 홑 $ 는 '$5' 같은 돈 표시와 헷갈리지 않게: 여는 $ 뒤·닫는 $ 앞에 공백 금지, 닫는 $ 뒤 숫자 금지, 한 줄 안
const DELIMITED_RE =
  /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?![\s$])([^$\n]+?)(?<!\s)\$(?!\d)/g;

const HANGUL_RE = /[가-힣]/;

function pushText(items: ToolItem[], text: string) {
  if (!text) return;
  const last = items[items.length - 1];
  if (last && last.kind === "text") last.text += text;
  else items.push({ kind: "text", text });
}

function pushMath(items: ToolItem[], latex: string, display: boolean) {
  const src = latex.trim();
  if (!src) return;
  const hwp = new LatexToHwpConverter().convert(src);
  if (!hwp) return;
  items.push({ kind: "math", latex: src, hwp, display });
}

/** 구분자 없는 글 — 줄마다 한글 문장 속 LaTeX 를 떼어낸다(앱의 안전망과 같은 규칙). */
function pushLooseText(items: ToolItem[], text: string) {
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    for (const [kind, value] of splitTextAndLatex(line)) {
      if (kind === "math") pushMath(items, value, false);
      else pushText(items, value);
    }
    if (idx < lines.length - 1) pushText(items, "\n");
  });
}

export function convertDocument(input: string): ToolItem[] {
  const text = input.replace(/\r\n?/g, "\n");
  const items: ToolItem[] = [];

  let last = 0;
  let found = false;
  for (const m of text.matchAll(DELIMITED_RE)) {
    found = true;
    const start = m.index ?? 0;
    pushLooseText(items, text.slice(last, start));
    const [, bracket, paren, dollar2, dollar1] = m;
    if (bracket !== undefined) pushMath(items, bracket, true);
    else if (dollar2 !== undefined) pushMath(items, dollar2, true);
    else pushMath(items, paren ?? dollar1 ?? "", false);
    last = start + m[0].length;
  }

  if (found) {
    pushLooseText(items, text.slice(last));
  } else if (!HANGUL_RE.test(text)) {
    // 순수 수식 붙여넣기
    const trimmed = text.trim();
    if (trimmed.includes("\\begin") || !trimmed.includes("\n")) {
      pushMath(items, trimmed, trimmed.includes("\n"));
    } else {
      trimmed.split("\n").forEach((line, idx) => {
        if (idx > 0) pushText(items, "\n");
        pushMath(items, line, false);
      });
    }
  } else {
    pushLooseText(items, text);
  }

  return items.filter((i) => i.kind === "math" || i.text.trim() !== "" || i.text.includes("\n"));
}
