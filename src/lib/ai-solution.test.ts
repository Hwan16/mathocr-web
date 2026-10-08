import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_SOLUTION_PROMO_PRICE,
  AI_SOLUTION_REGULAR_PRICE,
  aiSolutionCredits,
  aiSolutionUnitPrice,
  buildExplainUserPrompt,
  extractExplainJson,
  isAiSolutionPromoActive,
  levelDescription,
  looksTruncated,
  normalizeAnswer,
  toExplainResult,
} from "./ai-solution.ts";
import { EXPLAIN_PROMPT_SONNET_5_5, EXPLAIN_SPEC_VERSION } from "./explain-prompt.ts";

test("단가: 기념가가 기본, NEXT_PUBLIC_AI_SOLUTION_PROMO=off 면 정가", () => {
  const saved = process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO;
  delete process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO;
  assert.equal(isAiSolutionPromoActive(), true);
  assert.equal(aiSolutionUnitPrice(), AI_SOLUTION_PROMO_PRICE);
  process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO = "off";
  assert.equal(isAiSolutionPromoActive(), false);
  assert.equal(aiSolutionUnitPrice(), AI_SOLUTION_REGULAR_PRICE);
  process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO = "ON";
  assert.equal(aiSolutionUnitPrice(), AI_SOLUTION_PROMO_PRICE);
  if (saved === undefined) delete process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO;
  else process.env.NEXT_PUBLIC_AI_SOLUTION_PROMO = saved;
  assert.equal(AI_SOLUTION_REGULAR_PRICE, 3);
  assert.equal(AI_SOLUTION_PROMO_PRICE, 2);
  assert.equal(aiSolutionCredits(7, 2), 14);
  assert.equal(aiSolutionCredits(-1, 2), 0);
  assert.equal(aiSolutionCredits(2.9, 3), 6);
});

test("서버 지시문은 v3 명세에서 내보낸 완성본이다", () => {
  assert.equal(EXPLAIN_SPEC_VERSION, "v3");
  assert.ok(EXPLAIN_PROMPT_SONNET_5_5.includes("출제 학년·시험 범위 안의 방법"));
  assert.ok(EXPLAIN_PROMPT_SONNET_5_5.includes("글(text) 항목에는 수학 기호·알파벳·수식을 절대 넣지 않는다"));
  assert.ok(EXPLAIN_PROMPT_SONNET_5_5.includes("JSON 응답 escape 규칙"));
});

test("입력 지시문: 학년 코드·배점·유형이 실험과 같은 모양으로 들어간다", () => {
  const text = buildExplainUserPrompt({
    problem: { content: [{ type: "text", value: "x의 값은?" }] },
    score: "3점",
    kind: "choice",
    level: "중3",
  });
  assert.ok(text.includes("- 시험: 중학교 3학년"));
  assert.ok(text.includes("- 배점: 3점"));
  assert.ok(text.includes("객관식(5지선다) (answer는 ①~⑤ 중 하나)"));
  assert.ok(text.includes('{"content":[{"type":"text","value":"x의 값은?"}]}'));
  const auto = buildExplainUserPrompt({ problem: {}, kind: "number", level: "없는코드" });
  assert.ok(auto.includes("학년 정보 없음"));
  assert.ok(auto.includes("- 배점: 표시 없음"));
  assert.ok(auto.includes("단답형 (answer는 수(문자열))"));
  assert.equal(levelDescription(null), levelDescription("auto"));
});

test("응답 해석: 앞뒤 설명·코드 펜스가 있어도 JSON 을 찾고, 허용 항목만 남긴다", () => {
  const text =
    "지수는 2/3이 맞다. 3^{2/3}이므로...\n```json\n" +
    '{"answer":"③","answer_kind":"choice","content":[{"type":"math_block","value":"\\\\sqrt[3]{9}=3^{\\\\frac{2}{3}}"},{"type":"box","value":"x"},{"type":"text","value":"따라서 1이다."}],"confidence":0.9}\n```';
  const parsed = extractExplainJson(text);
  assert.ok(parsed);
  const result = toExplainResult(parsed!, "choice");
  assert.ok(result);
  assert.equal(result!.answer, "③");
  assert.deepEqual(
    result!.content.map((c) => c.type),
    ["math_block", "text"]
  );
  assert.equal(result!.confidence, 0.9);
  assert.equal(result!.note, null);
  assert.equal(looksTruncated(result!), false);
});

test("응답 해석: 홑 백슬래시 이스케이프도 복구하고, 본문이 비면 실패", () => {
  // \m 은 JSON 에서 잘못된 이스케이프라 복구 대상. (\f·\n 처럼 유효한 이스케이프와 겹치는
  // \frac·\neq 는 구분할 수 없어 복구하지 않는다 — 지시문이 이중 백슬래시를 요구하고 실측 파싱 실패 0건)
  const bad = '{"answer":"12","content":[{"type":"math_inline","value":"\\mathrm{AB}=2"}]}';
  const parsed = extractExplainJson(bad);
  assert.ok(parsed);
  const result = toExplainResult(parsed!, "number");
  assert.equal(result!.content[0].type === "math_inline" && result!.content[0].value, "\\mathrm{AB}=2");
  assert.equal(toExplainResult({ answer: "3", content: [] }, "number"), null);
  assert.equal(extractExplainJson("답은 3입니다."), null);
});

test("answer 정리: 객관식은 ①~⑤, 단답형은 공백·쉼표 제거", () => {
  assert.equal(normalizeAnswer("4", "choice"), "④");
  assert.equal(normalizeAnswer("④ ", "choice"), "④");
  assert.equal(normalizeAnswer("1,024", "number"), "1024");
  assert.equal(normalizeAnswer(97, "number"), "97");
});

test("끊김 감지: 중괄호가 안 닫힌 마지막 수식·confidence 0", () => {
  const broken = toExplainResult(
    {
      answer: "②",
      content: [
        { type: "text", value: "점 " },
        { type: "math_inline", value: "\\mathrm{E" },
        { type: "text", value: "" },
      ],
      confidence: 0.0,
    },
    "choice"
  )!;
  assert.equal(looksTruncated(broken), true);
  const fine = toExplainResult(
    { answer: "②", content: [{ type: "math_block", value: "x=1" }], confidence: 0.95 },
    "choice"
  )!;
  assert.equal(looksTruncated(fine), false);
});
