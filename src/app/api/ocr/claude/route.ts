import { getAuthUser } from "@/lib/supabase/auth-helper";
import { ensureUsableCredits } from "@/lib/supabase/credit-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED_MODELS = ["claude-sonnet-4-6"] as const;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TOKENS = 4096;
const MAX_IMAGE_BASE64_LENGTH = 2_800_000;
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

function findOversizedClaudeImage(messages: unknown): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      return false;
    }

    return message.content.some((part) => {
      if (!isRecord(part) || !isRecord(part.source)) {
        return false;
      }
      const data = part.source.data;
      return typeof data === "string" && data.length > MAX_IMAGE_BASE64_LENGTH;
    });
  });
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
  if (findOversizedClaudeImage(body.messages)) {
    return { ok: false, message: "이미지 크기가 너무 큽니다. 2MB 이하 이미지로 다시 시도해주세요.", status: 413 };
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

  const rateLimit = checkRateLimit(user.id, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
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

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? `Claude API 오류 (HTTP ${response.status})` },
        { status: response.status, headers: responseHeaders }
      );
    }

    // Cache 적용 검증용 로그 (Vercel function logs에서 확인).
    // 1차 호출: cache_creation_input_tokens > 0, 2차 호출(5분 내): cache_read_input_tokens > 0.
    const usage = data.usage;
    if (usage) {
      const creation = usage.cache_creation_input_tokens ?? 0;
      const read = usage.cache_read_input_tokens ?? 0;
      const input = usage.input_tokens ?? 0;
      const output = usage.output_tokens ?? 0;
      console.log(
        `[claude proxy] usage user=${user.id} input=${input} output=${output} cache_creation=${creation} cache_read=${read}`
      );
    }

    return NextResponse.json(data, { headers: responseHeaders });
  } catch (error) {
    return errorResponse(`프록시 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`, 500);
  }
}
