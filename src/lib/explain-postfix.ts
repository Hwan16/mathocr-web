// AI 해설 content 후처리 — 문장 붙음 교정 (D-039, 2026-10-10)
//
// 모델이 문장 사이 줄바꿈(line_break)을 빼먹으면 한글에 "…이다.따라서", "…… ㉠상수항을"처럼 붙어 찍힌다.
// 실측: Haiku 해설 30%, 운영 Sonnet 해설 17%. 지시문으로 다 안 잡혀서 결정적 규칙으로 고친다.
// AI 호출 없음. 글자·수식은 그대로 두고 배치(줄바꿈 위치·식 번호 자리)만 바꾼다.
// 원본 = 부모 repo tools/explain_gen/postfix.py (해설 893개에 적용해 붙음 0·내용 변화 0·수식 변환 실패 0 확인).
// 두 구현이 같은지는 explain-postfix.test.ts 의 사례 + 로컬 대조 스크립트로 확인한다 — 한쪽을 고치면 다른 쪽도 고칠 것.
//
// 규칙:
//   1. 블록 수식 바로 뒤 text 가 '…… ㉠' 식 번호로 시작하면 번호를 그 블록 수식 끝으로 옮긴다
//      (문장 속 수식에 번호가 붙어 있으면 그 수식을 블록 수식으로 바꾼 뒤 같은 처리). '㉠의 양변에'처럼
//      번호를 가리키는 문장은 말줄임표가 없으므로 건드리지 않는다.
//   2. text 안에서 문장 끝(한글/닫는 괄호 뒤 '.') 다음에 공백 없이 다음 문장이 붙으면 줄을 나눈다.
//      ')따라서'처럼 닫는 괄호 뒤 접속어 앞도 나눈다. 소수(3.5)·말줄임(……)은 건드리지 않는다.
//   3. '.'으로 끝난 항목 뒤, 수식 바로 뒤 접속어('$k=32$따라서'), '(단, …)' 단서가 닫힌 뒤에
//      다음 문장이 줄바꿈 없이 이어지면 line_break 를 넣는다. 블록 수식 앞뒤에는 넣지 않는다.

import type { ExplainContentItem } from "./ai-solution";

const CIRCLED = "㉠㉡㉢㉣㉤㉥";
const LABEL_RE = new RegExp(`^\\s*(?:…+|\\.{3,}|\\\\cdots)+\\s*([${CIRCLED}])\\s*`);
const SENT_RE = /(?<=[가-힣)])\.(?=[^\s.\d,)])/;
const CONNECT = ["따라서", "그러므로", "즉,", "이때", "한편"];
const CONNECT_IN_TEXT = /(?<=\))\s*(?=(?:따라서|그러므로|즉,|이때|한편))/;

type Item = ExplainContentItem;
const LB: Item = { type: "line_break" };

function splitSentences(value: string): Item[] {
  const parts = value.split(SENT_RE);
  const out: Item[] = [];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const seg = last ? p : `${p}.`;
    if (seg) out.push({ type: "text", value: seg });
    if (!last) out.push(LB);
  });
  return out;
}

function splitText(value: string): Item[] {
  const chunks = value.split(CONNECT_IN_TEXT);
  if (chunks.length > 1) {
    const out: Item[] = [];
    chunks.forEach((chunk, i) => {
      if (i) out.push(LB);
      out.push(...splitSentences(chunk));
    });
    return out;
  }
  return splitSentences(value);
}

function endsSentence(item: Item | undefined): boolean {
  return !!item && (item.type === "text" || item.type === "math_inline") && item.value.trimEnd().endsWith(".");
}

export function fixExplainContent(content: readonly Item[]): Item[] {
  const items: Item[] = (content ?? []).map((c) => ({ ...c }));

  // 1. 식 번호를 블록 수식 끝으로
  const out: Item[] = [];
  for (const c of items) {
    const prev = out[out.length - 1];
    if (c.type === "text" && prev?.type === "math_inline" && LABEL_RE.test(c.value)) {
      out[out.length - 1] = { type: "math_block", value: prev.value };
    }
    const prev2 = out[out.length - 1];
    if (c.type === "text" && prev2?.type === "math_block") {
      const m = LABEL_RE.exec(c.value);
      if (m) {
        out[out.length - 1] = { type: "math_block", value: `${prev2.value.trimEnd()} \\quad \\cdots\\cdots \\; ${m[1]}` };
        const rest = c.value.slice(m[0].length);
        if (rest.trim()) out.push({ type: "text", value: rest.trimStart() });
        continue;
      }
    }
    out.push(c);
  }

  // 2. text 안의 문장 붙음 나누기
  const split: Item[] = [];
  for (const c of out) {
    if (c.type === "text") split.push(...splitText(c.value));
    else split.push(c);
  }

  // 3. 문장 끝 뒤에 줄바꿈 없이 이어지면 줄바꿈
  const final: Item[] = [];
  let sinceBreak = ""; // 마지막 줄바꿈 이후 글 — '(단, …)' 단서 판단용
  for (let c of split) {
    const t = c.type;
    if (t === "line_break" || t === "math_block") sinceBreak = "";
    const prev = final[final.length - 1];
    if (
      prev &&
      (t === "text" || t === "math_inline") &&
      prev.type === "text" &&
      prev.value.trimEnd().endsWith(")") &&
      sinceBreak.includes("(단,")
    ) {
      final.push(LB);
      sinceBreak = "";
      if (c.type === "text") c = { type: "text", value: c.value.trimStart() };
      final.push(c);
      if (c.type === "text") sinceBreak += c.value;
      continue;
    }
    if (c.type === "text") sinceBreak += c.value;
    const opens = c.type === "text" && CONNECT.some((w) => c.type === "text" && c.value.trimStart().startsWith(w));
    if (prev && opens && prev.type === "math_inline") {
      final.push(LB);
      if (c.type === "text") c = { type: "text", value: c.value.trimStart() };
    } else if (prev && (c.type === "text" || c.type === "math_inline") && endsSentence(prev)) {
      final.push(LB);
      if (c.type === "text") c = { type: "text", value: c.value.trimStart() };
    }
    final.push(c);
  }

  // 정리: 연속 줄바꿈·블록 수식 옆 줄바꿈·맨 뒤 줄바꿈·빈 글 제거
  const clean: Item[] = [];
  for (const c of final) {
    const last = clean[clean.length - 1];
    if (c.type === "line_break") {
      if (!last || last.type === "line_break" || last.type === "math_block") continue;
    }
    if (c.type === "math_block" && last?.type === "line_break") clean.pop();
    if (c.type === "text" && !c.value) continue;
    clean.push(c);
  }
  while (clean.length && clean[clean.length - 1].type === "line_break") clean.pop();
  return clean;
}
