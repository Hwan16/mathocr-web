// AI 해설 생성(D-036·D-037) — 단가·입력 지시문·응답 해석의 단일 출처.
//
// 단가는 서버가 소유한다: 앱은 GET /api/credits 가 돌려주는 값을 표시·계산에만 쓴다.
//
// D-038(2026-10-09): 정가 = 문제당 2크레딧으로 확정. 출시 때 "정가 3 · 기념가 2"로 내놨지만
// 원가 실측(쉬운 문제 23원 ~ 어려운 문제 100원)으로 2가 적정하다고 보았고, 받은 적 없는 3을
// 취소선 '정가'로 계속 두면 허위 종전가격(표시광고법)이 되므로 기념가 표시 자체를 걷었다.
// 이벤트가 필요하면 NEXT_PUBLIC_AI_SOLUTION_PROMO=on 으로 켠다(기본 꺼짐, 앱 릴리스 없음,
// 홈페이지는 같은 변수를 빌드에 쓰므로 재배포 필요). 켜기 전에 PROMO 가격을 정가보다 낮게 둘 것.

export const AI_SOLUTION_REGULAR_PRICE = 2; // 정가 (D-038, 2026-10-09)
export const AI_SOLUTION_PROMO_PRICE = 2; // 이벤트가(현재 이벤트 없음 — 정가와 같음)

export function isAiSolutionPromoActive(): boolean {
  return (process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO ?? "").trim().toLowerCase() === "on";
}

export function aiSolutionUnitPrice(): number {
  return isAiSolutionPromoActive() ? AI_SOLUTION_PROMO_PRICE : AI_SOLUTION_REGULAR_PRICE;
}

// 앱이 보내는 학년 코드 → 지시문의 '시험' 항목. 코드 밖의 값은 "auto" 로 취급한다.
export const EXPLAIN_LEVELS: Record<string, string> = {
  auto: "학년 정보 없음 — 문제의 내용과 표기로 학년을 추정하고, 그 학년까지 배운 방법만 쓴다",
  중1: "중학교 1학년 — 중1까지 배운 내용만 쓴다(문자와 식·일차방정식·함수의 기초·기본 도형)",
  중2: "중학교 2학년 — 중2까지 배운 내용만 쓴다(연립방정식·일차함수·삼각형과 사각형의 성질·확률)",
  중3: "중학교 3학년 — 중3까지 배운 내용만 쓴다(제곱근·인수분해·이차방정식·이차함수·삼각비·원의 성질·통계). 고등학교 내용(사인법칙·코사인법칙 등)은 쓰지 않는다",
  고1: "고등학교 1학년 — 공통수학1·2 범위까지(다항식·방정식과 부등식·경우의 수·행렬·도형의 방정식·집합과 명제·함수). 수학Ⅰ·Ⅱ 이후 내용은 쓰지 않는다",
  고2: "고등학교 2학년 — 수학Ⅰ·수학Ⅱ 범위까지(지수·로그·삼각함수·수열·함수의 극한·미분·적분). 선택과목(확률과 통계·미적분·기하) 내용은 쓰지 않는다",
  고3: "고등학교 3학년·수능 — 수학Ⅰ·수학Ⅱ + 선택과목(확률과 통계/미적분/기하) 범위",
};

export type ExplainKind = "choice" | "number";

export type ExplainInput = {
  // 앱이 OCR 로 읽어 구조화한 문제(content·choices·problem_type) — 서버는 내용을 해석하지 않고 그대로 싣는다
  problem: Record<string, unknown>;
  score?: string | null; // 예: "3점"
  kind: ExplainKind;
  level?: string | null; // EXPLAIN_LEVELS 의 키
};

export function levelDescription(level: string | null | undefined): string {
  const key = (level ?? "auto").trim();
  return EXPLAIN_LEVELS[key] ?? EXPLAIN_LEVELS.auto;
}

// 실험(tools/explain_gen/run_explain.py USER_TMPL)과 같은 입력 모양 — 실측한 지시문 그대로.
export function buildExplainUserPrompt(input: ExplainInput): string {
  const kindKo = input.kind === "choice" ? "객관식(5지선다)" : "단답형";
  const rule = input.kind === "choice" ? "answer는 ①~⑤ 중 하나" : "answer는 수(문자열)";
  const score = input.score && input.score.trim() ? input.score.trim() : "표시 없음";
  const problemJson = JSON.stringify(input.problem);
  return [
    "아래는 수학 문제 하나입니다. 첫 번째 입력은 문제 이미지(원본)이고, 그 아래는 앱이 이미지에서 읽어 구조화한 문제 텍스트(JSON)입니다. 텍스트와 이미지가 다르면 이미지를 따르세요.",
    "",
    `- 시험: ${levelDescription(input.level)}`,
    `- 배점: ${score}`,
    `- 유형: ${kindKo} (${rule})`,
    "",
    "## 구조화된 문제 텍스트",
    problemJson,
    "",
    "이 문제의 해설을 스타일 규칙·표기 규칙에 맞게 JSON 하나로만 작성하세요.",
  ].join("\n");
}

// ── 응답 해석 ───────────────────────────────────────────────

export type ExplainContentItem =
  | { type: "text"; value: string }
  | { type: "math_inline"; value: string }
  | { type: "math_block"; value: string }
  | { type: "line_break" };

export type ExplainResult = {
  answer: string;
  answer_kind: ExplainKind;
  content: ExplainContentItem[];
  confidence: number | null;
  note: string | null;
};

const CONTENT_TYPES = new Set(["text", "math_inline", "math_block", "line_break"]);

// 모델이 JSON 앞뒤에 설명을 붙이거나 코드 펜스로 감싸도 answer/content 가 있는 첫 객체를 찾는다
// (실험에서 Sonnet 이 불확실할 때 설명을 먼저 쓴 사례). JSON 안의 LaTeX 는 모델이 이중
// 백슬래시로 쓰므로 그대로 파싱하되, 홑 백슬래시 이스케이프(\\frac 등)가 섞이면 한 번 고쳐 재시도한다.
export function extractExplainJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const starts: number[] = [];
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === "{") starts.push(i);
    if (starts.length > 200) break;
  }
  for (const start of starts) {
    for (const candidate of [t.slice(start), sanitizeInvalidEscapes(t.slice(start))]) {
      const obj = parseLeadingObject(candidate);
      if (obj && (typeof obj.content !== "undefined" || typeof obj.answer !== "undefined")) {
        return obj;
      }
    }
  }
  return null;
}

// 문자열 안의 잘못된 이스케이프(\f 같은 유효 이스케이프가 아닌 \l, \m …)를 이중 백슬래시로.
function sanitizeInvalidEscapes(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

// 앞에서부터 중괄호 짝을 세어 첫 객체의 끝을 찾고 JSON.parse 한다(뒤에 설명이 붙어 있어도 됨).
function parseLeadingObject(text: string): Record<string, unknown> | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(0, i + 1));
          return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];

// answer 정리 — 객관식은 ①~⑤ 로 통일(숫자 1~5 도 허용), 단답형은 공백·쉼표 제거.
export function normalizeAnswer(raw: unknown, kind: ExplainKind): string {
  const s = String(raw ?? "").trim();
  if (kind === "choice") {
    if (s && CIRCLED.includes(s[0])) return s[0];
    if (/^[1-5]$/.test(s)) return CIRCLED[Number(s) - 1];
    return s;
  }
  return s.replace(/[,\s]/g, "");
}

// 모델 응답 → 앱이 쓰는 모양. 허용되지 않은 항목은 버리고, 본문이 비면 실패로 본다.
export function toExplainResult(obj: Record<string, unknown>, kind: ExplainKind): ExplainResult | null {
  const rawContent = Array.isArray(obj.content) ? obj.content : [];
  const content: ExplainContentItem[] = [];
  for (const item of rawContent) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const type = rec.type;
    if (typeof type !== "string" || !CONTENT_TYPES.has(type)) continue;
    if (type === "line_break") {
      content.push({ type: "line_break" });
      continue;
    }
    if (typeof rec.value !== "string") continue;
    content.push({ type: type as "text" | "math_inline" | "math_block", value: rec.value });
  }
  const answer = normalizeAnswer(obj.answer, kind);
  if (content.length === 0 || !answer) return null;
  const confidence = typeof obj.confidence === "number" && Number.isFinite(obj.confidence) ? obj.confidence : null;
  const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim().slice(0, 500) : null;
  return { answer, answer_kind: kind, content, confidence, note };
}

// 출력이 중간에 끊긴 흔적 — 마지막 수식의 중괄호가 안 닫혔거나, 마지막 항목이 빈 글이다.
// (실험에서 Sonnet 이 JSON 을 중간에 닫고 끝낸 1건: confidence 0.0 + 빈 text 로 끝남)
export function looksTruncated(result: ExplainResult): boolean {
  const last = result.content[result.content.length - 1];
  if (!last) return true;
  const lastMath = [...result.content].reverse().find((c) => c.type === "math_inline" || c.type === "math_block");
  if (lastMath && "value" in lastMath) {
    const open = (lastMath.value.match(/\{/g) ?? []).length;
    const close = (lastMath.value.match(/\}/g) ?? []).length;
    if (open !== close) return true;
  }
  if (last.type === "text" && last.value.trim() === "" && result.content.length > 1) {
    const prev = result.content[result.content.length - 2];
    if ((prev.type === "math_inline" || prev.type === "math_block") && !/[0-9a-zA-Z}\)\]]\s*$/.test(prev.value)) {
      return true;
    }
  }
  return result.confidence !== null && result.confidence <= 0;
}

// 크레딧 계산 — 차감(POST /api/credits)과 앱 표시가 같은 식을 쓴다.
export function aiSolutionCredits(count: number, unitPrice: number): number {
  return Math.max(0, Math.floor(count)) * unitPrice;
}
