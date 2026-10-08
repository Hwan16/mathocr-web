import { createHash } from "node:crypto";

import {
  PROBLEM_PROMPT_SONNET_5_5,
  SOLUTION_PROMPT_SONNET_5_5,
} from "./ocr-prompts.ts";

// Claude 변환 호출의 "모델 ↔ 지시문" 정책 (순수 로직 — 라우트와 단위 테스트가 함께 쓴다).
//
// 지시문은 모델에 맞춰 튜닝되므로 모델을 고르는 서버가 한 벌로 소유한다.
// 데스크톱 앱이 보내는 system 프롬프트는 (1) 허용 여부 검사와 (2) 종류·세대 식별에만
// 쓰고, 현행 세대 앱의 요청은 서버 완성본 지시문(ocr-prompts.ts)으로 바꿔 5.5에 보낸다.
// 구세대 앱(박스·표 형식을 모르는 v2.0.6 이하)은 출력 형식이 달라 앱이 보낸 프롬프트
// 그대로 4.6에 보낸다 — 4.6 종료 전에 업데이트를 유도해야 한다(D-011).

export const MODEL_SONNET_4_6 = "claude-sonnet-4-6";
export const MODEL_SONNET_5_5 = "claude-sonnet-5-5";
export const ALLOWED_MODELS = [MODEL_SONNET_4_6, MODEL_SONNET_5_5] as const;
export type ClaudeModel = (typeof ALLOWED_MODELS)[number];
export const DEFAULT_MODEL: ClaudeModel = MODEL_SONNET_5_5;
// 구세대 프롬프트와 5.5 실패 시 폴백에 쓰는 모델
export const LEGACY_MODEL: ClaudeModel = MODEL_SONNET_4_6;

export type PromptKind = "problem" | "solution";
export type PromptInfo = { kind: PromptKind | null; current: boolean };

// 데스크톱 structure_analyzer.py 의 SYSTEM_PROMPT / SOLUTION_SYSTEM_PROMPT SHA-256.
// current=true 인 해시가 서버 완성본 지시문의 파생 원본이다(ocr-prompts.ts 의 *_BASE_SHA256).
// 앱 프롬프트를 바꾸는 릴리스에서는 새 해시를 여기에 먼저 추가·배포할 것.
const PROMPT_HASHES: Record<string, PromptInfo> = {
  // SYSTEM_PROMPT (v2.0.7~현행) — 테두리 박스 정의 확장(일반 박스 포함)
  f3fabf2e91e747aec4fef74df9bf366c7b0613c5d25cb5ba4b06969e4c094549: { kind: "problem", current: true },
  // SOLUTION_SYSTEM_PROMPT (v1.4.0~현행, 변경 이력 없음)
  a53e24e2b599c75cb107d476ce1887cefc4ab34895c719b472e5927ea6572980: { kind: "solution", current: true },
  // SYSTEM_PROMPT (v1.7.0~v2.0.6)
  "1d5489828e6424494da64a44a2e2c5df339fde16374df0b72f33d976d0f82ceb": { kind: "problem", current: false },
  // SYSTEM_PROMPT (v1.6.0)
  "0d54844bfffcb95a75f76e494a81c0c8c4264d86c780d4a43bf5d714655454df": { kind: "problem", current: false },
  // SYSTEM_PROMPT (v1.4.0~v1.5.x)
  "3ff95bd73896dbdd1d39719a4d0626cd189d451adb7009d2b1306ec8d1ab449c": { kind: "problem", current: false },
};

// 앱이 요청에 싣는 버전 헤더(X-App-Version) — 로그에 남겨 버전 분포를 본다.
// 지금 배포된 앱(v2.3.3 이하)은 헤더를 보내지 않는다. v2.2.0 이하는 `\mathrm` 을 이탤릭으로
// 그리는데 서버가 구분할 방법이 없으므로, 버전을 보내는 앱이 퍼지면 지시문을 나눌 근거가 된다.
// 숫자.숫자.숫자 꼴만 받는다(임의 문자열이 로그에 들어가지 않게).
export function parseAppVersion(header: string | null | undefined): string | undefined {
  const value = header?.trim() ?? "";
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) ? value : undefined;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// 허용된 프롬프트면 종류·세대를, 아니면 null 을 돌려준다.
// extraHashes = 긴급 탈출구 env(OCR_EXTRA_PROMPT_HASHES) — 종류를 모르므로 구세대 취급.
export function classifySystemPrompt(
  system: string,
  extraHashes: string[] = []
): PromptInfo | null {
  const hash = sha256Hex(system);
  const known = promptInfoByHash(hash);
  if (known) return known;
  if (extraHashes.includes(hash)) return { kind: null, current: false };
  return null;
}

export function promptInfoByHash(hash: string): PromptInfo | null {
  return Object.prototype.hasOwnProperty.call(PROMPT_HASHES, hash) ? PROMPT_HASHES[hash] : null;
}

const SERVER_PROMPTS: Record<PromptKind, string> = {
  problem: PROBLEM_PROMPT_SONNET_5_5,
  solution: SOLUTION_PROMPT_SONNET_5_5,
};

// 5.5는 답하기 전에 "생각"을 하고, 그 토큰도 max_tokens 에 포함된다(새 토크나이저는
// 같은 글도 토큰 수가 더 많다). 앱이 요청한 값(문제 4096·해설 8192)보다 넉넉히 준다.
const SONNET_5_5_MAX_TOKENS: Record<PromptKind, number> = {
  problem: 8192,
  solution: 16384,
};

export type ClaudeCallPlan = {
  model: ClaudeModel;
  body: Record<string, unknown>;
  // 서버 완성본 지시문으로 바꿔 보냈는지 (false = 앱 프롬프트 그대로)
  serverPrompt: boolean;
};

function cachedSystem(text: string) {
  // 호출마다 동일한 지시문 → 5분 ephemeral 캐시로 입력 토큰 약 90% 절감
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

// 4.6 호출 — 앱이 보낸 프롬프트 그대로 (전환 전 동작과 동일)
export function planLegacyCall(input: {
  system: string;
  messages: unknown[];
  maxTokens: number;
}): ClaudeCallPlan {
  return {
    model: LEGACY_MODEL,
    serverPrompt: false,
    body: {
      model: LEGACY_MODEL,
      max_tokens: input.maxTokens,
      system: cachedSystem(input.system),
      messages: input.messages,
    },
  };
}

export function planClaudeCall(input: {
  configuredModel: ClaudeModel;
  prompt: PromptInfo;
  system: string;
  messages: unknown[];
  maxTokens: number;
}): ClaudeCallPlan {
  const { prompt } = input;
  if (input.configuredModel !== MODEL_SONNET_5_5 || !prompt.current || !prompt.kind) {
    return planLegacyCall(input);
  }
  return {
    model: MODEL_SONNET_5_5,
    serverPrompt: true,
    body: {
      model: MODEL_SONNET_5_5,
      max_tokens: Math.max(input.maxTokens, SONNET_5_5_MAX_TOKENS[prompt.kind]),
      system: cachedSystem(SERVER_PROMPTS[prompt.kind]),
      messages: input.messages,
      // thinking 은 생략 = adaptive(생각 켬). effort 를 낮추면 필기 동그라미를 괄호로
      // 읽는 오류가 재현된다(2026-10-02 실측, D-011) — high 를 명시해 고정.
      output_config: { effort: "high" },
    },
  };
}

type ContentBlock = { type?: unknown; text?: unknown };

// 배포된 모든 앱은 content[0]["text"] 만 읽는다. 5.5는 맨 앞에 thinking 블록을 붙일 수
// 있으므로 text 블록만 남겨 돌려준다. 쓸 수 있는 text 가 없으면(거절·빈 응답) null.
export function usableResponse<T extends Record<string, unknown>>(data: T): T | null {
  if (data.stop_reason === "refusal") return null;
  const content = Array.isArray(data.content) ? (data.content as ContentBlock[]) : [];
  const textBlocks = content.filter(
    (block) =>
      block !== null &&
      typeof block === "object" &&
      block.type === "text" &&
      typeof block.text === "string" &&
      block.text.trim().length > 0
  );
  if (textBlocks.length === 0) return null;
  return { ...data, content: textBlocks };
}

// 로만체 이름 보호 — `\mathrm{GE}` 를 `\mathrm{G E}` 로 (글자 사이 한 칸).
//
// 앱은 `\mathrm{AB}` 를 한글 수식 `rm {AB} it` 로 바꾸는데, 한글 수식은 영문자 묶음을
// 한 낱말로 읽어 수식 명령어와 같으면 기호로 바꿔 버린다: 선분 GE → ≥, LE → ≤, NE → ≠,
// PI → Π, IN → ∈, DEG → °, CAP → ∩, SUM → Σ, TO·IT·RM → 사라짐 (2026-10-02 실제 렌더 확인).
// 글자 사이를 띄우면 낱말이 한 글자씩으로 쪼개져 겹치지 않고, 한글 수식은 공백을
// 무시하므로 화면에는 똑같이 붙어 보인다. 모델 준수에 기대지 않도록 서버에서 처리한다.
//
// 입력은 모델이 쓴 JSON 텍스트라서 다음을 지킨다(2026-10-02 코드 검토 반영):
// - 내용에 따옴표·중괄호가 있으면 건드리지 않는다 — 닫히지 않은 `\mathrm{` 가 JSON 의
//   다음 키까지 삼키지 않게 한다.
// - `\Omega` 같은 명령어 이름과 JSON 유니코드 이스케이프(`\uXXXX`)는 그대로 둔다.
// - 백슬래시 개수를 1~4개로 제한해 퇴화 입력(백슬래시 수만 개)에서도 선형 시간에 끝난다.
const ROMAN_GROUP = /(\\{1,4}mathrm[ \t]*\{)([^{}"]*)(\})/g;
const ROMAN_TOKEN = /(\\{1,4}u[0-9a-fA-F]{4})|(\\{1,4}[A-Za-z]+)|([A-Za-z]{2,})/g;

export function protectRomanNames(text: string): string {
  return text.replace(
    ROMAN_GROUP,
    (_match, open: string, inner: string, close: string) =>
      open +
      inner.replace(ROMAN_TOKEN, (token: string, unicode?: string, command?: string) =>
        unicode || command ? token : token.split("").join(" ")
      ) +
      close
  );
}

// 부등호 뒤 음수 보호 — `a<-2` 를 `a< -2` 로 (2026-10-08).
//
// 한글 수식은 붙어 있는 `<-` 를 왼쪽 화살표(←)로 읽어 a<−2 가 "a←2"로 찍힌다(실제 렌더 확인).
// 모델은 `x<-1` 처럼 공백 없이 자주 쓴다. LaTeX 에는 `<-` 화살표 표기가 없으므로(화살표는
// `\leftarrow`) 언제나 '작다 + 음수'이고, 한 칸 띄우면 부등호와 음수로 렌더된다. 한글 수식은
// 공백을 무시하므로 화면은 똑같다. `<=`·`>-` 는 한글에서 원래 정상이라 건드리지 않는다.
// 앱 v2.3.5 변환기도 같은 처리를 하지만, 이미 설치된 앱(v2.3.4 이하)을 위해 서버에서도 한다.
const LT_MINUS = /<(?=-)/g;

export function separateLtMinus(text: string): string {
  return text.replace(LT_MINUS, "< ");
}

// 응답의 text 블록에 부등호 뒤 음수 보호와 로만체 이름 보호를 적용한다(블록 구성은 그대로).
export function protectResponseText<T extends Record<string, unknown>>(data: T): T {
  if (!Array.isArray(data.content)) return data;
  const content = (data.content as ContentBlock[]).map((block) =>
    block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string"
      ? { ...block, text: protectRomanNames(separateLtMinus(block.text)) }
      : block
  );
  return { ...data, content };
}

// 5.5 응답 마무리: text 블록만 남기고(usableResponse) 부등호 뒤 음수·로만체 이름을 보호한다.
export function finalizeServerPromptResponse<T extends Record<string, unknown>>(data: T): T | null {
  const usable = usableResponse(data);
  return usable ? protectResponseText(usable) : null;
}

// ── 호출 + 폴백 (라우트와 스모크 테스트가 같은 로직을 쓰도록 순수 함수로 둔다) ──

export type ClaudeAttempt = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  durationMs: number;
};

// 5.5 시도를 버리고 4.6으로 다시 해야 하는 이유. 쓸 수 있는 응답이면 null.
// - 오류 응답(과부하·한도·잘못된 요청 등): 원인을 로그에서 알 수 있게 상태와 오류 종류를 담는다
// - refusal: 안전 분류기 거절 / no_text: 답 없이 끝남
// - max_tokens: 생각 토큰까지 합쳐 한도에 걸려 JSON 이 중간에 잘림(앱이 파싱할 수 없다)
export function fallbackReason(attempt: ClaudeAttempt): string | null {
  if (!attempt.ok) {
    const error = attempt.data.error as { type?: unknown } | undefined;
    const type = typeof error?.type === "string" ? `:${error.type}` : "";
    return `http_${attempt.status}${type}`;
  }
  if (attempt.data.stop_reason === "refusal") return "refusal";
  if (attempt.data.stop_reason === "max_tokens") return "max_tokens";
  if (!usableResponse(attempt.data)) return "no_text";
  return null;
}

export type ClaudeRunResult = {
  // 최종 응답을 낸 호출
  plan: ClaudeCallPlan;
  attempt: ClaudeAttempt;
  // 5.5 시도가 실패해 4.6이 대신 답했을 때의 실패한 시도
  failed?: { plan: ClaudeCallPlan; attempt: ClaudeAttempt; reason: string };
};

// 현행 세대 앱: 서버 지시문 + 5.5 → 실패하거나 쓸 답이 없으면 앱 프롬프트 + 4.6 으로 한 번 더.
// 구세대 앱·CLAUDE_MODEL=4.6: 4.6 한 번만(전환 전 동작).
export async function runClaudeCall(
  input: Parameters<typeof planClaudeCall>[0],
  call: (plan: ClaudeCallPlan) => Promise<ClaudeAttempt>
): Promise<ClaudeRunResult> {
  const plan = planClaudeCall(input);
  const attempt = await call(plan);
  if (!plan.serverPrompt) return { plan, attempt };
  const reason = fallbackReason(attempt);
  if (reason === null) return { plan, attempt };
  const legacy = planLegacyCall(input);
  return { plan: legacy, attempt: await call(legacy), failed: { plan, attempt, reason } };
}

// 앱에 돌려줄 본문.
// - 5.5 응답: thinking 을 걸러 text 만 남기고 로만체 이름을 보호한다.
// - 5.5 실패로 4.6 이 대신 답한 응답: 블록은 그대로 두고 로만체 이름만 보호한다.
// - 구세대 앱·CLAUDE_MODEL=4.6: 전환 전처럼 손대지 않는다.
export function responsePayload(run: ClaudeRunResult): Record<string, unknown> {
  if (!run.attempt.ok) return run.attempt.data;
  if (run.plan.serverPrompt) return finalizeServerPromptResponse(run.attempt.data) ?? run.attempt.data;
  if (run.failed) return protectResponseText(run.attempt.data);
  return run.attempt.data;
}

// 단가 (USD/1M tokens, anthropic.com 가격표 2026-10-02 확인) — 캐시 쓰기는 5분 TTL 기준
const CLAUDE_USD_PER_MTOK: Record<
  ClaudeModel,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  [MODEL_SONNET_4_6]: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  [MODEL_SONNET_5_5]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

export function estimateClaudeCostUsd(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  model: ClaudeModel = LEGACY_MODEL
): number {
  const price = CLAUDE_USD_PER_MTOK[model];
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  return (
    (n(usage.input_tokens) * price.input +
      n(usage.output_tokens) * price.output +
      n(usage.cache_creation_input_tokens) * price.cacheWrite +
      n(usage.cache_read_input_tokens) * price.cacheRead) /
    1_000_000
  );
}
