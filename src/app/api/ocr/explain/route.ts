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
import { MODEL_SONNET_5_5, estimateClaudeCostUsd, protectRomanNames, separateLtMinus } from "@/lib/ocr-claude";
import {
  type ExplainKind,
  type ExplainResult,
  buildExplainUserPrompt,
  extractExplainJson,
  looksTruncated,
  toExplainResult,
} from "@/lib/ai-solution";
import { EXPLAIN_PROMPT_SONNET_5_5, EXPLAIN_SPEC_VERSION } from "@/lib/explain-prompt";
import { NextRequest, NextResponse } from "next/server";

// AI 해설 생성 프록시 (D-036·D-037)
// 데스크톱 앱 → 우리 서버 → Claude(Sonnet 5.5). 지시문·모델·단가는 서버가 소유한다.
//
// 실측(2026-10-08, 40문제×3회): 평균 14초, 4점 평균 23초, 최장 96초 → 함수 상한을 넉넉히 둔다.
// 킬러 문항은 생각 토큰이 많아 한 호출에 2만 토큰을 넘길 수 있어 max_tokens 도 크게 둔다.
export const maxDuration = 120;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TOKENS = 32_000;
const EXPLAIN_TIMEOUT_MS = 110_000;
const MAX_ATTEMPTS = 2; // 오류·거절·끊김이면 한 번 더 (실험: 끊김 1/126)
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

async function callAnthropic(apiKey: string, body: Record<string, unknown>): Promise<Attempt> {
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
      signal: AbortSignal.timeout(EXPLAIN_TIMEOUT_MS),
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
  const claudeBody = {
    model: MODEL_SONNET_5_5,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: EXPLAIN_PROMPT_SONNET_5_5, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: input.image.media_type, data: input.image.data } },
          { type: "text", text: buildExplainUserPrompt(input) },
        ],
      },
    ],
    // thinking 생략 = adaptive. 실험은 effort high 로 했고(D-036) 그대로 고정.
    output_config: { effort: "high" },
  };

  let lastReason = "unknown";
  let lastStatus = 502;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const res = await callAnthropic(apiKey, claudeBody);
    const usage = usageOf(res.data);
    const estCostUsd = res.ok ? estimateClaudeCostUsd(usage, MODEL_SONNET_5_5) : 0;
    if (estCostUsd > 0) await recordCost("claude", estCostUsd);
    const outcome = interpretAttempt(res, input.kind);
    const ok = "result" in outcome;
    const usageEntry = {
      provider: "claude" as const, kind: "explain" as const, user_id: user.id, ok, status: ok ? 200 : res.status,
      duration_ms: res.durationMs, est_cost_usd: Number(estCostUsd.toFixed(6)),
      input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0, model: MODEL_SONNET_5_5,
      blocked_reason: ok ? undefined : `explain_${outcome.reason}:attempt${attempt}`,
      app_version: appVersion,
    };
    logOcrUsage(usageEntry);
    // 1건당 원가 기록(대시보드) — 응답 전에 끝낸다. 실패해도 변환에는 영향 없음.
    await recordAiUsage(usageEntry);
    if (ok) {
      return NextResponse.json(
        { ...outcome.result, model: MODEL_SONNET_5_5, spec_version: EXPLAIN_SPEC_VERSION, attempts: attempt },
        { headers: { "X-Claude-Model": MODEL_SONNET_5_5 } }
      );
    }
    lastReason = outcome.reason;
    // 429(한도)·401(키)·400(요청) 은 재시도해도 같다 — 바로 돌려준다
    if (!res.ok && [400, 401, 403, 413].includes(res.status)) {
      lastStatus = res.status;
      break;
    }
    lastStatus = res.ok ? 502 : res.status;
  }

  return errorResponse(`AI 해설을 만들지 못했습니다. (${lastReason})`, lastStatus === 200 ? 502 : lastStatus);
}
