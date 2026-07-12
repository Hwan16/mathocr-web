import { getAuthUser } from "@/lib/supabase/auth-helper";
import { ensureUsableCredits } from "@/lib/supabase/credit-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isAllowedSystemPrompt,
  checkAndCountUserCall,
  isDailyCostBlocked,
  recordCost,
  estimateClaudeCostUsd,
  logOcrUsage,
} from "@/lib/ocr-guard";
import { NextRequest, NextResponse } from "next/server";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED_MODELS = ["claude-sonnet-4-6"] as const;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
// 데스크톱의 해설 분석 단계(structure_analyzer.analyze_solution)가 8192를 요청한다.
// 4096으로 캡하면 긴 해설이 중간에서 잘려 품질·재시도 비용이 나빠진다(감사 LA-13).
// 서버가 여전히 상한을 소유한다 — 클라이언트가 이 이상 요청해도 8192로 캡.
const MAX_TOKENS = 8192;
const MAX_IMAGE_BASE64_LENGTH = 2_800_000;
// OCR 텍스트(USER_PROMPT_TEMPLATE + Mathpix 결과) 최대치 대비 여유 상한 —
// 허용 프롬프트 하에서 임의 장문 주입으로 토큰 비용을 불리는 것을 차단 (코덱스 2차)
const MAX_TEXT_LENGTH = 40_000;
// 데스크톱 structure_analyzer._read_image_base64 의 mime_map 과 일치
const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/bmp",
  "image/webp",
]);
const ALLOWED_BODY_KEYS = new Set(["system", "messages", "max_tokens", "model"]);

function resolveClaudeModel(): string {
  const configuredModel = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.includes(configuredModel as (typeof ALLOWED_MODELS)[number])) {
    throw new Error(`Invalid CLAUDE_MODEL: ${configuredModel}`);
  }
  return configuredModel;
}

// 클라이언트는 system을 string으로 보내고, 서버에서 prompt cache가 가능한 content block 배열로 변환한다.
// SYSTEM_PROMPT가 ~2000 토큰으로 호출마다 동일해서 5분 ephemeral cache hit 시 input 토큰 약 90% 절감.
function applySystemPromptCache(systemValue: string): Array<{
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
}> {
  return [
    {
      type: "text",
      text: systemValue,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 데스크톱 앱이 보내는 유일한 형태(LA-04에서 강제): user 메시지 1개,
// content = [이미지 정확히 1개 + 텍스트 정확히 1개] (structure_analyzer._call_api
// 가 이 고정 형태로만 호출). 이 형태가 아니면 수학문제 변환이 아니라 프록시를
// 범용 LLM처럼 쓰려는 시도다. (코덱스 2차: 텍스트 0~3개 허용·길이 무제한이던
// 것을 정확히 1개·40,000자 상한·media_type 화이트리스트로 조임)
function validateClaudeMessages(
  messages: unknown[]
): { ok: true } | { ok: false; message: string; status: number } {
  if (messages.length !== 1) {
    return { ok: false, message: "messages는 1개여야 합니다.", status: 400 };
  }
  const message = messages[0];
  if (!isRecord(message) || message.role !== "user" || !Array.isArray(message.content)) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
  }
  if (message.content.length !== 2) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
  }

  let imageCount = 0;
  let textCount = 0;
  for (const part of message.content) {
    if (!isRecord(part)) {
      return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
    }
    if (part.type === "image") {
      if (
        !isRecord(part.source) ||
        part.source.type !== "base64" ||
        typeof part.source.media_type !== "string" ||
        !ALLOWED_IMAGE_MEDIA_TYPES.has(part.source.media_type) ||
        typeof part.source.data !== "string" ||
        part.source.data.length === 0
      ) {
        return { ok: false, message: "이미지 형식이 올바르지 않습니다.", status: 400 };
      }
      if (part.source.data.length > MAX_IMAGE_BASE64_LENGTH) {
        return {
          ok: false,
          message: "이미지 크기가 너무 큽니다. 2MB 이하 이미지로 다시 시도해주세요.",
          status: 413,
        };
      }
      imageCount += 1;
    } else if (part.type === "text") {
      if (typeof part.text !== "string") {
        return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
      }
      if (part.text.length > MAX_TEXT_LENGTH) {
        return { ok: false, message: "요청 텍스트가 너무 깁니다.", status: 413 };
      }
      textCount += 1;
    } else {
      return { ok: false, message: "허용되지 않은 콘텐츠 형식입니다.", status: 400 };
    }
  }

  // 이미지 1 + 텍스트 1 고정 — 텍스트 전용/이미지 전용 요청은 문제 변환이 아니다
  if (imageCount !== 1 || textCount !== 1) {
    return { ok: false, message: "문제 이미지가 포함되어야 합니다.", status: 400 };
  }
  return { ok: true };
}

function validateClaudeBody(body: unknown):
  | { ok: true; value: { system: string; messages: unknown[]; max_tokens: number }; capped: boolean }
  | { ok: false; message: string; status: number } {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
  }

  const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_BODY_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      message: `허용되지 않은 요청 필드입니다: ${unknownKeys.join(", ")}`,
      status: 400,
    };
  }

  if (typeof body.system !== "string") {
    return { ok: false, message: "system 필드는 문자열이어야 합니다.", status: 400 };
  }
  if (!Array.isArray(body.messages)) {
    return { ok: false, message: "messages 필드는 배열이어야 합니다.", status: 400 };
  }
  if (typeof body.max_tokens !== "number" || !Number.isFinite(body.max_tokens) || body.max_tokens <= 0) {
    return { ok: false, message: "max_tokens 필드는 양수여야 합니다.", status: 400 };
  }
  const messagesCheck = validateClaudeMessages(body.messages);
  if (!messagesCheck.ok) {
    return messagesCheck;
  }

  const requestedTokens = Math.floor(body.max_tokens);
  const cappedTokens = Math.min(requestedTokens, MAX_TOKENS);
  return {
    ok: true,
    value: {
      system: body.system,
      messages: body.messages,
      max_tokens: cappedTokens,
    },
    capped: requestedTokens > MAX_TOKENS,
  };
}

// Claude Vision 프록시
// 데스크톱 앱 → 우리 서버 → Claude API (API 키는 서버에만)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return errorResponse("인증되지 않았습니다.", 401);
  }

  // 키를 프록시별로 분리 — mathpix와 분당 한도를 공유해 50문제 변환(양쪽 합산
  // 100호출)이 60회/분에 걸리던 문제 해소 (감사 지적)
  const rateLimit = await checkRateLimit(`ocr:claude:${user.id}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return errorResponse(
      "잠시 후 다시 시도해주세요. (분당 시도 횟수 초과)",
      429,
      { "Retry-After": String(rateLimit.retryAfter) }
    );
  }

  // 크레딧 게이트: 잔액 0 / 만료 사용자의 공짜 OCR 차단
  const creditCheck = await ensureUsableCredits(user.id);
  if (!creditCheck.ok) {
    return errorResponse(creditCheck.message, creditCheck.status);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse("Anthropic API 키가 설정되지 않았습니다.", 500);
  }

  let model: string;
  try {
    model = resolveClaudeModel();
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid CLAUDE_MODEL", 500);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("요청 JSON을 읽을 수 없습니다.", 400);
    }
    const validated = validateClaudeBody(body);
    if (!validated.ok) {
      return errorResponse(validated.message, validated.status);
    }

    // 서버가 아는 프롬프트만 통과 — 임의 지시문으로 프록시를 범용 LLM처럼
    // 쓰는 것을 차단한다 (LA-04)
    if (!isAllowedSystemPrompt(validated.value.system)) {
      logOcrUsage({
        provider: "claude", user_id: user.id, ok: false, status: 403,
        duration_ms: 0, blocked_reason: "system_prompt_not_allowed",
      });
      return errorResponse("허용되지 않은 요청입니다. 앱을 최신 버전으로 업데이트해주세요.", 403);
    }

    // 사용자별 일일 호출 상한 (LA-04)
    const callCheck = await checkAndCountUserCall("claude", user.id);
    if (!callCheck.allowed) {
      logOcrUsage({
        provider: "claude", user_id: user.id, ok: false, status: 429,
        duration_ms: 0, blocked_reason: "user_daily_call_limit",
      });
      return errorResponse("오늘 처리 가능한 횟수를 초과했습니다. 내일 다시 시도해주세요.", 429);
    }

    // 공급자 일일 비용 상한 (LA-04) — 도달 시 자정(KST)까지 차단
    const costGate = await isDailyCostBlocked("claude");
    if (costGate.blocked) {
      logOcrUsage({
        provider: "claude", user_id: user.id, ok: false, status: 503,
        duration_ms: 0, blocked_reason: "daily_cost_limit",
      });
      return errorResponse(
        "일일 처리 한도에 도달했습니다. 내일 다시 시도해주세요. 문의: aimathocr.official@gmail.com",
        503
      );
    }

    // body.model is intentionally ignored; the server owns model selection.
    // validated.value.system(문자열)을 5분 ephemeral cache 가능한 array 블록으로 변환.
    const anthropicBody = {
      ...validated.value,
      model,
      system: applySystemPromptCache(validated.value.system),
    };
    const responseHeaders: HeadersInit = validated.capped
      ? { "X-Max-Tokens-Capped": "true" }
      : {};

    const startedAt = Date.now();
    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      logOcrUsage({
        provider: "claude", user_id: user.id, ok: false,
        status: response.status, duration_ms: durationMs,
      });
      return NextResponse.json(
        { error: data.error?.message ?? `Claude API 오류 (HTTP ${response.status})` },
        { status: response.status, headers: responseHeaders }
      );
    }

    // 사용량 구조화 기록 + 일일 비용 적립 (50/80/100% 경보 포함, LA-04)
    const usage = data.usage ?? {};
    const estCostUsd = estimateClaudeCostUsd(usage);
    await recordCost("claude", estCostUsd);
    logOcrUsage({
      provider: "claude", user_id: user.id, ok: true, status: 200,
      duration_ms: durationMs, est_cost_usd: Number(estCostUsd.toFixed(6)),
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    });

    return NextResponse.json(data, { headers: responseHeaders });
  } catch (error) {
    return errorResponse(`프록시 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`, 500);
  }
}
