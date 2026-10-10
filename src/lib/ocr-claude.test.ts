import test from "node:test";
import assert from "node:assert/strict";

import {
  type ClaudeAttempt,
  type ClaudeCallPlan,
  MODEL_SONNET_4_6,
  MODEL_SONNET_5_5,
  classifySystemPrompt,
  estimateClaudeCostUsd,
  fallbackReason,
  finalizeServerPromptResponse,
  parseAppVersion,
  planClaudeCall,
  promptInfoByHash,
  protectRomanNames,
  responsePayload,
  runClaudeCall,
  separateLtMinus,
  sha256Hex,
  usableResponse,
} from "./ocr-claude.ts";
import {
  PROBLEM_PROMPT_BASE_SHA256,
  PROBLEM_PROMPT_SONNET_5_5,
  SOLUTION_PROMPT_BASE_SHA256,
  SOLUTION_PROMPT_SONNET_5_5,
} from "./ocr-prompts.ts";

const MESSAGES = [{ role: "user", content: [] }];
const CURRENT_PROBLEM = { kind: "problem", current: true } as const;
const CURRENT_SOLUTION = { kind: "solution", current: true } as const;

test("서버 완성본 지시문은 현행 앱 프롬프트에서 파생된 것이다", () => {
  // 앱 프롬프트가 바뀌어 새 해시가 현행이 되면 ocr-prompts.ts 를 다시 내보내야 한다
  assert.deepEqual(promptInfoByHash(PROBLEM_PROMPT_BASE_SHA256), CURRENT_PROBLEM);
  assert.deepEqual(promptInfoByHash(SOLUTION_PROMPT_BASE_SHA256), CURRENT_SOLUTION);
});

test("허용 목록에 없는 프롬프트는 거부, env 추가 해시는 구세대로 취급", () => {
  const prompt = "임의 지시문";
  assert.equal(classifySystemPrompt(prompt), null);
  assert.deepEqual(classifySystemPrompt(prompt, [sha256Hex(prompt)]), {
    kind: null,
    current: false,
  });
});

test("현행 앱 요청은 서버 지시문 + 5.5(생각 켬, effort high)로 보낸다", () => {
  const plan = planClaudeCall({
    configuredModel: MODEL_SONNET_5_5,
    prompt: CURRENT_PROBLEM,
    system: "앱이 보낸 프롬프트",
    messages: MESSAGES,
    maxTokens: 4096,
  });
  assert.equal(plan.model, MODEL_SONNET_5_5);
  assert.equal(plan.serverPrompt, true);
  assert.equal(plan.body.model, MODEL_SONNET_5_5);
  assert.equal(plan.body.max_tokens, 8192);
  assert.deepEqual(plan.body.output_config, { effort: "high" });
  // thinking 을 보내지 않아야 adaptive(생각 켬) — disabled 는 5.5에서 400
  assert.equal("thinking" in plan.body, false);
  assert.deepEqual(plan.body.system, [
    { type: "text", text: PROBLEM_PROMPT_SONNET_5_5, cache_control: { type: "ephemeral" } },
  ]);
  assert.equal(plan.body.messages, MESSAGES);
});

test("해설은 해설용 서버 지시문과 더 큰 max_tokens 를 쓴다", () => {
  const plan = planClaudeCall({
    configuredModel: MODEL_SONNET_5_5,
    prompt: CURRENT_SOLUTION,
    system: "앱이 보낸 프롬프트",
    messages: MESSAGES,
    maxTokens: 8192,
  });
  assert.equal(plan.body.max_tokens, 16384);
  assert.deepEqual(plan.body.system, [
    { type: "text", text: SOLUTION_PROMPT_SONNET_5_5, cache_control: { type: "ephemeral" } },
  ]);
});

test("구세대 앱·env 해시·CLAUDE_MODEL=4.6 은 앱 프롬프트 그대로 4.6으로 보낸다", () => {
  const cases = [
    { configuredModel: MODEL_SONNET_5_5, prompt: { kind: "problem", current: false } },
    { configuredModel: MODEL_SONNET_5_5, prompt: { kind: null, current: false } },
    { configuredModel: MODEL_SONNET_4_6, prompt: CURRENT_PROBLEM },
  ] as const;
  for (const c of cases) {
    const plan = planClaudeCall({ ...c, system: "앱 프롬프트", messages: MESSAGES, maxTokens: 4096 });
    assert.equal(plan.model, MODEL_SONNET_4_6);
    assert.equal(plan.serverPrompt, false);
    assert.deepEqual(plan.body, {
      model: MODEL_SONNET_4_6,
      max_tokens: 4096,
      system: [{ type: "text", text: "앱 프롬프트", cache_control: { type: "ephemeral" } }],
      messages: MESSAGES,
    });
  }
});

test("thinking 블록은 걸러 내고 text 가 맨 앞에 오게 한다", () => {
  const data = {
    stop_reason: "end_turn",
    usage: { output_tokens: 10 },
    content: [
      { type: "thinking", thinking: "", signature: "x" },
      { type: "text", text: '{"content": []}' },
    ],
  };
  const out = usableResponse(data);
  assert.deepEqual(out?.content, [{ type: "text", text: '{"content": []}' }]);
  assert.deepEqual(out?.usage, { output_tokens: 10 });
});

test("거절·text 없는 응답은 쓸 수 없는 응답(null)으로 판정한다", () => {
  assert.equal(usableResponse({ stop_reason: "refusal", content: [] }), null);
  assert.equal(
    usableResponse({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }] }),
    null
  );
  assert.equal(usableResponse({ stop_reason: "end_turn", content: [{ type: "text", text: " " }] }), null);
  assert.equal(usableResponse({ error: { message: "x" } }), null);
});

test("비용은 응답한 모델의 단가로 계산한다", () => {
  const usage = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  };
  assert.equal(estimateClaudeCostUsd(usage, MODEL_SONNET_4_6), 3 + 15 + 3.75 + 0.3);
  assert.equal(estimateClaudeCostUsd(usage, MODEL_SONNET_5_5), 2 + 10 + 2.5 + 0.2);
});

test("서버 지시문에 기존 핵심 규칙과 5.5 보정 규칙이 모두 들어 있다", () => {
  const latex = (name: string) => String.fromCharCode(92) + name; // 92 = 백슬래시
  for (const rule of [latex("mid"), latex("neq"), latex("begin{cases}"), latex("square"), "line_break", "이중 백슬래시"]) {
    assert.ok(PROBLEM_PROMPT_SONNET_5_5.includes(rule), `문제 지시문에 ${rule} 규칙 없음`);
  }
  for (const rule of ["손글씨·필기 처리", "원본 충실성", "공백 없이 붙입니다"]) {
    assert.ok(PROBLEM_PROMPT_SONNET_5_5.includes(rule), `문제 지시문에 ${rule} 없음`);
  }
  assert.ok(SOLUTION_PROMPT_SONNET_5_5.includes("공백 없이 붙입니다"));
  assert.ok(SOLUTION_PROMPT_SONNET_5_5.includes(latex("begin{array}")));
});

test("로만체 이름은 글자 사이를 띄워 한글 수식 명령어와 겹치지 않게 한다", () => {
  const bs = String.fromCharCode(92);
  const m = (inner: string, slashes = 2) => bs.repeat(slashes) + "mathrm{" + inner + "}";
  // 모델 출력은 JSON 문자열이라 백슬래시가 두 개다. 한 개로 온 경우(앱 sanitizer 가 복구)도 처리한다.
  assert.equal(protectRomanNames(m("GE")), m("G E"));
  assert.equal(protectRomanNames(m("ABCD", 1)), m("A B C D", 1));
  assert.equal(protectRomanNames(bs + bs + "overline{" + m("PI") + "}=4"), bs + bs + "overline{" + m("P I") + "}=4");
  assert.equal(protectRomanNames("13" + m("km")), "13" + m("k m"));
  assert.equal(protectRomanNames(m("km/h")), m("k m/h"));
  // 한 글자·이미 띄운 것·명령어 이름은 그대로
  assert.equal(protectRomanNames(m("P") + "(A " + bs + bs + "cap B)"), m("P") + "(A " + bs + bs + "cap B)");
  assert.equal(protectRomanNames(m("A B C")), m("A B C"));
  assert.equal(protectRomanNames(m(bs + bs + "Omega")), m(bs + bs + "Omega"));
  // mathrm 밖의 글자는 건드리지 않는다
  const outside = '{"type": "text", "value": "STEP 삼각형"}, {"type": "math_inline", "value": "AB+xyz"}';
  assert.equal(protectRomanNames(outside), outside);
});

test("로만체 뒤 숫자 아래첨자는 안으로 접어 한글 수식 윗줄이 식 끝까지 늘어나지 않게 한다", () => {
  const bs = String.fromCharCode(92);
  const m = (inner: string) => bs + bs + "mathrm{" + inner + "}";
  const ol = (inner: string) => bs + bs + "overline{" + inner + "}";
  // AI 해설 실제 사례: \overline{\mathrm{P}_1\mathrm{P}_2}^2
  assert.equal(
    protectRomanNames(ol(m("P") + "_1" + m("P") + "_{2}") + "^2"),
    ol(m("P_1") + m("P_{2}")) + "^2"
  );
  // 숫자 윗첨자는 함께, 공백은 정리, 이름 보호와 함께 동작
  assert.equal(protectRomanNames(m("P") + " _ {1} ^2"), m("P_{1}^2"));
  assert.equal(protectRomanNames(m("GE") + "_1"), m("G E_1"));
  // 글자 첨자(순열 nPr)·명령어 첨자·글자 윗첨자는 그대로 (기울임이어야 함)
  for (const keep of [
    "{}_{n}" + m("P") + "_{r}",
    m("P") + "_n",
    m("P") + "_{" + bs + bs + "alpha}",
    m("c m") + "^2",
    m("P") + "_{n+1}",
  ]) {
    assert.equal(protectRomanNames(keep), keep);
  }
  // 숫자 다음 글자 윗첨자는 아래첨자만 접는다
  assert.equal(protectRomanNames(m("P") + "_1^n"), m("P_1") + "^n");
  // JSON 은 그대로 읽힌다
  assert.deepEqual(JSON.parse(protectRomanNames(`{"value": "${m("P")}_1"}`)), { value: bs + "mathrm{P_1}" });
});

test("5.5 응답 마무리는 thinking 을 걸러 내고 text 안의 로만체 이름을 보호한다", () => {
  const bs = String.fromCharCode(92);
  const out = finalizeServerPromptResponse({
    stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: `{"value": "${bs}${bs}mathrm{LE}"}` },
    ],
  });
  assert.deepEqual(out?.content, [{ type: "text", text: `{"value": "${bs}${bs}mathrm{L E}"}` }]);
  assert.equal(finalizeServerPromptResponse({ stop_reason: "refusal", content: [] }), null);
});

test("로만체 보호는 JSON 을 깨뜨리지 않는다 (유니코드 이스케이프·닫히지 않은 중괄호·퇴화 입력)", () => {
  const bs = String.fromCharCode(92);
  // \uXXXX 이스케이프의 16진수 글자를 띄우면 잘못된 JSON 이 된다
  const unicode = `{"value": "5${bs}${bs}mathrm{${bs}u03bcm}"}`;
  assert.equal(protectRomanNames(unicode), unicode);
  assert.doesNotThrow(() => JSON.parse(protectRomanNames(`{"value": "${bs}${bs}mathrm{${bs}uc5ec}"}`)));
  // 닫히지 않은 \mathrm{ 가 다음 키(type)까지 삼키면 안 된다
  const unclosed = `{"value": "${bs}${bs}mathrm{AB", "type": "math_inline"}`;
  assert.equal(protectRomanNames(unclosed), unclosed);
  // 백슬래시가 수만 개 이어져도 금방 끝난다
  const startedAt = performance.now();
  protectRomanNames(bs.repeat(60_000) + "mathrm{" + bs.repeat(60_000));
  assert.ok(performance.now() - startedAt < 1000);
});

test("붙어 있는 '<-' 는 한 칸 띄워 한글 수식이 화살표(←)로 읽지 않게 한다", () => {
  const bs = String.fromCharCode(92);
  assert.equal(separateLtMinus(`{"value": "a<-2"}`), `{"value": "a< -2"}`);
  assert.equal(separateLtMinus(`{"value": "-1<x<-0.5"}`), `{"value": "-1<x< -0.5"}`);
  assert.equal(separateLtMinus(`x<-${bs}${bs}frac{1}{2}`), `x< -${bs}${bs}frac{1}{2}`);
  assert.equal(separateLtMinus("r<-1 이고 s<-2"), "r< -1 이고 s< -2");
  // 이미 띄운 것·다른 부등호·화살표 명령은 그대로 (`>-`·`<=-` 는 한글에서 원래 정상)
  for (const keep of ["a < -2", "a>-2", "a<=-2", "a<b", `x ${bs}${bs}to -1`, `a ${bs}${bs}leq -2`]) {
    assert.equal(separateLtMinus(keep), keep);
  }
  // JSON 은 그대로 읽힌다
  assert.deepEqual(JSON.parse(separateLtMinus(`{"value": "f(x)<-x^{2}"}`)), { value: "f(x)< -x^{2}" });
});

test("5.5 응답 마무리는 '<-' 띄우기와 로만체 보호를 함께 적용한다", () => {
  const bs = String.fromCharCode(92);
  const out = finalizeServerPromptResponse({
    stop_reason: "end_turn",
    content: [{ type: "text", text: `{"value": "${bs}${bs}mathrm{AB}<-3"}` }],
  });
  assert.deepEqual(out?.content, [{ type: "text", text: `{"value": "${bs}${bs}mathrm{A B}< -3"}` }]);
});

// ── 호출 + 폴백 ──
const RUN_INPUT = {
  configuredModel: MODEL_SONNET_5_5,
  prompt: CURRENT_PROBLEM,
  system: "앱 프롬프트",
  messages: MESSAGES,
  maxTokens: 4096,
} as const;
const okText = (text: string): ClaudeAttempt => ({
  ok: true,
  status: 200,
  durationMs: 1,
  data: { stop_reason: "end_turn", content: [{ type: "text", text }], usage: { output_tokens: 5 } },
});

test("5.5 가 쓸 수 있는 답을 주면 한 번만 호출한다", async () => {
  const calls: string[] = [];
  const run = await runClaudeCall(RUN_INPUT, async (plan) => {
    calls.push(plan.model);
    return okText("{}");
  });
  assert.deepEqual(calls, [MODEL_SONNET_5_5]);
  assert.equal(run.plan.serverPrompt, true);
  assert.equal(run.failed, undefined);
});

test("5.5 가 실패·거절·빈 응답·잘린 응답이면 앱 프롬프트 + 4.6 으로 한 번 더 호출한다", async () => {
  const failures: [ClaudeAttempt, string][] = [
    [{ ok: false, status: 529, durationMs: 1, data: { error: { type: "overloaded_error", message: "x" } } }, "http_529:overloaded_error"],
    [{ ok: false, status: 500, durationMs: 1, data: {} }, "http_500"],
    [{ ok: true, status: 200, durationMs: 1, data: { stop_reason: "refusal", content: [] } }, "refusal"],
    [{ ok: true, status: 200, durationMs: 1, data: { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }] } }, "no_text"],
    [{ ok: true, status: 200, durationMs: 1, data: { stop_reason: "max_tokens", content: [{ type: "text", text: '{"content": [' }] } }, "max_tokens"],
  ];
  for (const [failure, reason] of failures) {
    assert.equal(fallbackReason(failure), reason);
    const calls: ClaudeCallPlan[] = [];
    const run = await runClaudeCall(RUN_INPUT, async (plan) => {
      calls.push(plan);
      return calls.length === 1 ? failure : okText("{}");
    });
    assert.deepEqual(calls.map((p) => p.model), [MODEL_SONNET_5_5, MODEL_SONNET_4_6]);
    // 두 번째 호출은 전환 전과 같은 본문(앱 프롬프트, 앱이 요청한 max_tokens, effort 없음)
    assert.deepEqual(calls[1].body, {
      model: MODEL_SONNET_4_6,
      max_tokens: 4096,
      system: [{ type: "text", text: "앱 프롬프트", cache_control: { type: "ephemeral" } }],
      messages: MESSAGES,
    });
    assert.equal(run.plan.model, MODEL_SONNET_4_6);
    assert.equal(run.failed?.reason, reason);
    assert.equal(run.failed?.plan.model, MODEL_SONNET_5_5);
  }
  assert.equal(fallbackReason(okText("{}")), null);
});

test("구세대 앱·CLAUDE_MODEL=4.6 은 실패해도 다시 호출하지 않는다 (전환 전 동작)", async () => {
  const inputs: Parameters<typeof runClaudeCall>[0][] = [
    { ...RUN_INPUT, prompt: { kind: "problem", current: false } },
    { ...RUN_INPUT, configuredModel: MODEL_SONNET_4_6 },
  ];
  for (const input of inputs) {
    let count = 0;
    const run = await runClaudeCall(input, async () => {
      count += 1;
      return { ok: false, status: 529, durationMs: 1, data: { error: { message: "x" } } };
    });
    assert.equal(count, 1);
    assert.equal(run.plan.model, MODEL_SONNET_4_6);
    assert.equal(run.failed, undefined);
  }
});

test("앱에 돌려주는 본문: 5.5 는 걸러서 보호, 폴백 4.6 은 보호만, 구세대는 그대로", async () => {
  const bs = String.fromCharCode(92);
  const raw = `{"value": "x<-1, ${bs}${bs}mathrm{GE}"}`;
  const spaced = `{"value": "x< -1, ${bs}${bs}mathrm{G E}"}`;
  // 5.5: thinking 제거 + 보호
  const served = await runClaudeCall(RUN_INPUT, async () => ({
    ok: true, status: 200, durationMs: 1,
    data: { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: raw }] },
  }));
  assert.deepEqual(responsePayload(served).content, [{ type: "text", text: spaced }]);
  // 폴백 4.6: 보호만
  let n = 0;
  const fellBack = await runClaudeCall(RUN_INPUT, async () =>
    ++n === 1 ? { ok: false, status: 500, durationMs: 1, data: {} } : okText(raw)
  );
  assert.deepEqual(responsePayload(fellBack).content, [{ type: "text", text: spaced }]);
  // 구세대: 손대지 않음
  const legacy = await runClaudeCall(
    { ...RUN_INPUT, prompt: { kind: "problem", current: false } },
    async () => okText(raw)
  );
  assert.equal(responsePayload(legacy), legacy.attempt.data);
  // 오류 응답은 그대로
  const failed = await runClaudeCall(RUN_INPUT, async () => ({ ok: false, status: 500, durationMs: 1, data: { error: { message: "x" } } }));
  assert.deepEqual(responsePayload(failed), { error: { message: "x" } });
});

test("허용 목록의 구세대 해시 3종은 구세대로 분류된다", () => {
  for (const hash of [
    "1d5489828e6424494da64a44a2e2c5df339fde16374df0b72f33d976d0f82ceb",
    "0d54844bfffcb95a75f76e494a81c0c8c4264d86c780d4a43bf5d714655454df",
    "3ff95bd73896dbdd1d39719a4d0626cd189d451adb7009d2b1306ec8d1ab449c",
  ]) {
    assert.deepEqual(promptInfoByHash(hash), { kind: "problem", current: false });
  }
});

test("앱 버전 헤더는 숫자.숫자.숫자 꼴만 받는다", () => {
  assert.equal(parseAppVersion("2.3.4"), "2.3.4");
  assert.equal(parseAppVersion(" 2.10.0 "), "2.10.0");
  for (const bad of [null, undefined, "", "2.3", "v2.3.4", "2.3.4-beta", "2.3.4; DROP", "1234.5.6"]) {
    assert.equal(parseAppVersion(bad), undefined);
  }
});
