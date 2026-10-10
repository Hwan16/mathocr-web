import { getAuthUser } from "@/lib/supabase/auth-helper";
import { ensureUsableCredits } from "@/lib/supabase/credit-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkAndCountUserCall,
  isDailyCostBlocked,
  recordCost,
  logOcrUsage,
  recordAiUsage,
} from "@/lib/ocr-guard";
import {
  MODEL_HAIKU_5_5,
  MODEL_SONNET_5_5,
  type PricedClaudeModel,
  estimateClaudeCostUsd,
  protectRomanNames,
  separateLtMinus,
} from "@/lib/ocr-claude";
import {
  type ExplainKind,
  type ExplainResult,
  buildDifficultyUserPrompt,
  buildExplainUserPrompt,
  extractExplainJson,
  looksTruncated,
  parseDifficulty,
  toExplainResult,
} from "@/lib/ai-solution";
import {
  EXPLAIN_DIFFICULTY_PROMPT,
  EXPLAIN_HAIKU_SPEC_VERSION,
  EXPLAIN_PROMPT_HAIKU_5_5,
  EXPLAIN_PROMPT_SONNET_5_5,
  EXPLAIN_SPEC_VERSION,
} from "@/lib/explain-prompt";
import { fixExplainContent } from "@/lib/explain-postfix";
import { NextRequest, NextResponse } from "next/server";

// AI 해설 생성 프록시 (D-036·D-037·D-039)
// 데스크톱 앱 → 우리 서버 → Claude. 지시문·모델·단가는 서버가 소유한다.
//
// D-039(2026-10-10): 난이도 분류(Haiku low, 풀지 않고 easy/hard 만) → easy 는 Haiku 5.5, 나머지는 Sonnet 5.5.
//   Haiku 가 실패하면(오류·끊김·형식 불량) 같은 요청에서 Sonnet 으로 다시 푼다. 분류가 실패·애매하면 Sonnet.
//   근거: 쉬운 문제 116개 블라인드 비교에서 Haiku v3h4 ≒ Sonnet(순격차 2~3%p, Sonnet끼리 0), 정답 100%.
//   분류기가 hard 로 보내는 중간 구간은 Haiku 글 품질이 확실히 낮아(순격차 30%p) 넓히지 않는다.
//   끄기: Vercel env EXPLAIN_HAIKU_ROUTING=off → 전부 Sonnet(분류 호출도 안 함).
// 모든 해설은 응답 직전에 fixExplainContent(문장 붙음 교정)를 거친다.
//
// 시간: Sonnet 실측 평균 14초·최장 96초, Haiku(easy) 평균 11초·최장 59초, 분류 평균 1.7초.
// 앱은 150초 기다린다 → 전체 마감 138초 안에서만 다음 시도를 한다.
export const maxDuration = 145;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TOKENS = 32_000;
const HAIKU_MAX_TOKENS = 16_000; // easy 실측 상위 1% 약 12,000 — 넘으면 빨리 실패하고 Sonnet 으로
// 10-11 실사용: 킬러 문항 하나가 Sonnet 110초 상한에 걸려 실패, 재시도는 남은 24초로 또 실패.
// → 첫 Sonnet 시도에 남은 시간을 거의 다 주고(최대 135초), 재시도는 빨리 실패한 경우(60초 이상 남음)만 한다.
const EXPLAIN_TIMEOUT_MS = 135_000;
const HAIKU_TIMEOUT_MS = 60_000;
const CLASSIFY_TIMEOUT_MS = 20_000;
const CLASSIFY_MAX_TOKENS = 4_000;
const DEADLINE_MS = 138_000;
const MIN_SONNET_BUDGET_MS = 20_000; // 첫 Sonnet 시도 — 남은 시간이 이보다 적으면 시작하지 않는다
const MIN_SONNET_RETRY_BUDGET_MS = 60_000; // Sonnet 재시도 — 이만큼 남았을 때만(어차피 못 끝낼 짧은 재시도 방지)
const MAX_SONNET_ATTEMPTS = 2; // 오류·거절·끊김이면 한 번 더 (실험: 끊김 1/126)
const MAX_IMAGE_BASE64_LENGTH = 2_800_000;
const MAX_PROBLEM_JSON_LENGTH = 40_000;
const ALLOWED_IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_KEYS = new Set(["image", "problem", "score", "kind", "level"]);

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ValidBody = {
  image: { media_type: string; data: string };
  problem: Record<string, unknown>;
  score: string | null;
  kind: ExplainKind;
  level: string | null;
};

function validateBody(body: unknown): { ok: true; value: ValidBody } | { ok: false; message: string; status: number } {
  if (!isRecord(body)) return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
  const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return { ok: false, message: `허용되지 않은 요청 필드입니다: ${unknownKeys.join(", ")}`, status: 400 };
  }
  const image = body.image;
  if (
    !isRecord(image) ||
    typeof image.media_type !== "string" ||
    !ALLOWED_IMAGE_MEDIA_TYPES.has(image.media_type) ||
    typeof image.data !== "string" ||
    image.data.length === 0
  ) {
    return { ok: false, message: "문제 이미지가 포함되어야 합니다.", status: 400 };
  }
  if (image.data.length > MAX_IMAGE_BASE64_LENGTH) {
    return { ok: false, message: "이미지 크기가 너무 큽니다. 2MB 이하 이미지로 다시 시도해주세요.", status: 413 };
  }
  if (!isRecord(body.problem)) {
    return { ok: false, message: "구조화된 문제 텍스트가 필요합니다.", status: 400 };
  }
  if (JSON.stringify(body.problem).length > MAX_PROBLEM_JSON_LENGTH) {
    return { ok: false, message: "문제 텍스트가 너무 깁니다.", status: 413 };
  }
  if (body.kind !== "choice" && body.kind !== "number") {
    return { ok: false, message: "문항 유형(kind)이 올바르지 않습니다.", status: 400 };
  }
  const score = typeof body.score === "string" ? body.score.slice(0, 10) : null;
  const level = typeof body.level === "string" ? body.level.slice(0, 10) : null;
  return {
    ok: true,
    value: {
      image: { media_type: image.media_type, data: image.data },
      problem: body.problem,
      score,
      kind: body.kind,
      level,
    },
  };
}

type Attempt = { ok: boolean; status: number; data: Record<string, unknown>; durationMs: number };

async function callAnthropic(apiKey: string, body: Record<string, unknown>, timeoutMs: number): Promise<Attempt> {
  const startedAt = Date.now();
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, data, durationMs: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return {
      ok: false,
      status: 500,
      data: { error: { type: "proxy_error", message: `프록시 오류: ${message}` } },
      durationMs: Date.now() - startedAt,
    };
  }
}

type ClaudeUsage = Parameters<typeof estimateClaudeCostUsd>[0];

function usageOf(data: Record<string, unknown>): ClaudeUsage {
  return (typeof data.usage === "object" && data.usage !== null ? data.usage : {}) as ClaudeUsage;
}

function responseText(data: Record<string, unknown>): string {
  const content = Array.isArray(data.content) ? (data.content as Array<{ type?: unknown; text?: unknown }>) : [];
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

// 한 시도의 결과 해석 — 쓸 수 있으면 result, 아니면 실패 사유.
export function interpretAttempt(
  attempt: Attempt,
  kind: ExplainKind
): { result: ExplainResult } | { reason: string } {
  if (!attempt.ok) {
    const error = attempt.data.error as { type?: unknown } | undefined;
    const type = typeof error?.type === "string" ? `:${error.type}` : "";
    return { reason: `http_${attempt.status}${type}` };
  }
  if (attempt.data.stop_reason === "refusal") return { reason: "refusal" };
  if (attempt.data.stop_reason === "max_tokens") return { reason: "max_tokens" };
  const text = responseText(attempt.data);
  if (!text.trim()) return { reason: "no_text" };
  // 부등호 뒤 음수·로만체 이름 보호는 OCR 응답과 같은 처리 (둘 다 JSON 텍스트에 안전)
  const parsed = extractExplainJson(protectRomanNames(separateLtMinus(text)));
  if (!parsed) return { reason: "no_json" };
  const result = toExplainResult(parsed, kind);
  if (!result) return { reason: "empty_content" };
  if (looksTruncated(result)) return { reason: "truncated" };
  return { result };
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return errorResponse("인증되지 않았습니다.", 401);

  const rateLimit = await checkRateLimit(`ocr:explain:${user.id}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return errorResponse("잠시 후 다시 시도해주세요. (분당 시도 횟수 초과)", 429, {
      "Retry-After": String(rateLimit.retryAfter),
    });
  }

  const creditCheck = await ensureUsableCredits(user.id);
  if (!creditCheck.ok) return errorResponse(creditCheck.message, creditCheck.status);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return errorResponse("Anthropic API 키가 설정되지 않았습니다.", 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("요청 JSON을 읽을 수 없습니다.", 400);
  }
  const validated = validateBody(body);
  if (!validated.ok) return errorResponse(validated.message, validated.status);
  const input = validated.value;

  // 사용자별 일일 호출 상한·공급자 일일 비용 상한은 변환 OCR 과 같은 'claude' 몫을 쓴다
  const callCheck = await checkAndCountUserCall("claude", user.id);
  if (!callCheck.allowed) {
    logOcrUsage({ provider: "claude", kind: "explain", user_id: user.id, ok: false, status: 429, duration_ms: 0, blocked_reason: "user_daily_call_limit" });
    return errorResponse("오늘 처리 가능한 횟수를 초과했습니다. 내일 다시 시도해주세요.", 429);
  }
  const costGate = await isDailyCostBlocked("claude");
  if (costGate.blocked) {
    logOcrUsage({ provider: "claude", kind: "explain", user_id: user.id, ok: false, status: 503, duration_ms: 0, blocked_reason: "daily_cost_limit" });
    return errorResponse("일일 처리 한도에 도달했습니다. 내일 다시 시도해주세요. 문의: aimathocr.official@gmail.com", 503);
  }

  const appVersion = request.headers.get("x-app-version") ?? undefined;
  const startedAt = Date.now();
  const remainingMs = () => DEADLINE_MS - (Date.now() - startedAt);

  // 사용량 기록 공통 — 콘솔(ocr_usage)과 대시보드(ai_usage_log). 응답 전에 끝낸다(서버리스).
  const record = async (
    kind: "explain" | "explain_route",
    model: PricedClaudeModel,
    res: Attempt,
    ok: boolean,
    blockedReason?: string
  ) => {
    const usage = usageOf(res.data);
    const estCostUsd = res.ok ? estimateClaudeCostUsd(usage, model) : 0;
    if (estCostUsd > 0) await recordCost("claude", estCostUsd);
    const entry = {
      provider: "claude" as const, kind, user_id: user.id, ok, status: ok ? 200 : res.status,
      duration_ms: res.durationMs, est_cost_usd: Number(estCostUsd.toFixed(6)),
      input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0, model,
      blocked_reason: ok ? undefined : blockedReason,
      app_version: appVersion,
    };
    logOcrUsage(entry);
    await recordAiUsage(entry);
  };

  // 1. 난이도 분류 — 실패·애매하면 hard(Sonnet)로 본다
  const routingOn = (process.env.EXPLAIN_HAIKU_ROUTING ?? "").trim().toLowerCase() !== "off";
  let difficulty: "easy" | "hard" | null = null;
  if (routingOn) {
    const res = await callAnthropic(apiKey, {
      model: MODEL_HAIKU_5_5,
      max_tokens: CLASSIFY_MAX_TOKENS,
      system: [{ type: "text", text: EXPLAIN_DIFFICULTY_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: buildDifficultyUserPrompt(input) }] }],
      output_config: { effort: "low" },
    }, CLASSIFY_TIMEOUT_MS);
    difficulty = res.ok ? parseDifficulty(responseText(res.data)) : null;
    await record("explain_route", MODEL_HAIKU_5_5, res, difficulty !== null,
      res.ok ? "route_unparsed" : `route_http_${res.status}`);
  }

  // 2. 시도 계획 — easy: Haiku 1회 → (실패 시) Sonnet 최대 2회 / 그 밖: Sonnet 최대 2회
  type Plan = { model: PricedClaudeModel; prompt: string; specVersion: string; maxTokens: number; timeoutMs: number };
  const sonnet: Plan = {
    model: MODEL_SONNET_5_5, prompt: EXPLAIN_PROMPT_SONNET_5_5, specVersion: EXPLAIN_SPEC_VERSION,
    maxTokens: MAX_TOKENS, timeoutMs: EXPLAIN_TIMEOUT_MS,
  };
  const haiku: Plan = {
    model: MODEL_HAIKU_5_5, prompt: EXPLAIN_PROMPT_HAIKU_5_5, specVersion: EXPLAIN_HAIKU_SPEC_VERSION,
    maxTokens: HAIKU_MAX_TOKENS, timeoutMs: HAIKU_TIMEOUT_MS,
  };
  const plans: Plan[] = difficulty === "easy" ? [haiku, sonnet, sonnet] : [sonnet, sonnet];
  const userContent = [
    { type: "image", source: { type: "base64", media_type: input.image.media_type, data: input.image.data } },
    { type: "text", text: buildExplainUserPrompt(input) },
  ];

  let lastReason = "unknown";
  let lastStatus = 502;
  let sonnetTries = 0;
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const isSonnet = plan.model === MODEL_SONNET_5_5;
    if (isSonnet && sonnetTries >= MAX_SONNET_ATTEMPTS) break;
    // 앱이 기다리는 시간 안에 끝낼 수 있을 때만 새 시도를 시작한다
    const budget = Math.min(plan.timeoutMs, remainingMs() - 2_000);
    const minBudget = !isSonnet ? 10_000 : sonnetTries === 0 ? MIN_SONNET_BUDGET_MS : MIN_SONNET_RETRY_BUDGET_MS;
    if (budget < minBudget) {
      lastReason = lastReason === "unknown" ? "deadline" : `${lastReason}+deadline`;
      break;
    }
    if (isSonnet) sonnetTries += 1;
    const res = await callAnthropic(apiKey, {
      model: plan.model,
      max_tokens: plan.maxTokens,
      system: [{ type: "text", text: plan.prompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      // thinking 생략 = adaptive. 실험은 두 모델 모두 effort high(D-036·D-039)로 했고 그대로 고정.
      output_config: { effort: "high" },
    }, budget);
    const outcome = interpretAttempt(res, input.kind);
    const ok = "result" in outcome;
    const tag = plan.model === MODEL_HAIKU_5_5 ? "haiku" : "sonnet";
    await record("explain", plan.model, res, ok, ok ? undefined : `explain_${"reason" in outcome ? outcome.reason : "?"}:${tag}:attempt${i + 1}`);
    if (ok) {
      const fixed = fixExplainContent(outcome.result.content);
      const result = { ...outcome.result, content: fixed.length > 0 ? fixed : outcome.result.content };
      return NextResponse.json(
        {
          ...result, model: plan.model, spec_version: plan.specVersion, attempts: i + 1,
          route: difficulty === "easy" ? "easy" : routingOn ? "hard" : "off",
        },
        { headers: { "X-Claude-Model": plan.model } }
      );
    }
    lastReason = outcome.reason;
    lastStatus = res.ok ? 502 : res.status;
    // Sonnet 의 401(키)·400(요청)·413 은 재시도해도 같다 — 바로 돌려준다. Haiku 실패는 무엇이든 Sonnet 으로 넘긴다.
    if (isSonnet && !res.ok && [400, 401, 403, 413].includes(res.status)) break;
  }

  return errorResponse(`AI 해설을 만들지 못했습니다. (${lastReason})`, lastStatus === 200 ? 502 : lastStatus);
}
