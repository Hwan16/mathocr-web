import { getAuthUser } from "@/lib/supabase/auth-helper";
import { ensureUsableCredits } from "@/lib/supabase/credit-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkAndCountUserCall,
  isDailyCostBlocked,
  recordCost,
  mathpixCostPerCallUsd,
  logOcrUsage,
} from "@/lib/ocr-guard";
import { NextRequest, NextResponse } from "next/server";

const MATHPIX_API_URL = "https://api.mathpix.com/v3/text";
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IMAGE_BASE64_LENGTH = 2_800_000;
// Older desktop builds send the delimiter/rm_spaces fields. Accept them for compatibility,
// but ignore client values and forward the server-owned fixed options below.
const ALLOWED_BODY_KEYS = new Set([
  "src",
  "formats",
  "math_inline_delimiters",
  "math_display_delimiters",
  "rm_spaces",
]);

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDataUrlPayload(src: string): string | null {
  const commaIndex = src.indexOf(",");
  if (!src.startsWith("data:") || commaIndex < 0) {
    return null;
  }
  return src.slice(commaIndex + 1);
}

function validateMathpixBody(body: unknown):
  | { ok: true; value: { src: string; formats: string[] } }
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

  if (typeof body.src !== "string") {
    return { ok: false, message: "src 필드는 data URL 문자열이어야 합니다.", status: 400 };
  }
  const payload = getDataUrlPayload(body.src);
  if (payload === null) {
    return { ok: false, message: "src는 data: URL만 사용할 수 있습니다.", status: 400 };
  }
  if (payload.length > MAX_IMAGE_BASE64_LENGTH) {
    return { ok: false, message: "이미지 크기가 너무 큽니다. 2MB 이하 이미지로 다시 시도해주세요.", status: 413 };
  }

  if (
    !Array.isArray(body.formats) ||
    body.formats.length === 0 ||
    !body.formats.every((format) => typeof format === "string")
  ) {
    return { ok: false, message: "formats 필드는 문자열 배열이어야 합니다.", status: 400 };
  }

  return {
    ok: true,
    value: {
      src: body.src,
      formats: body.formats as string[],
    },
  };
}

// Mathpix OCR 프록시
// 데스크톱 앱 → 우리 서버 → Mathpix API (API 키는 서버에만)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return errorResponse("인증되지 않았습니다.", 401);
  }

  // 키를 프록시별로 분리 — claude와 분당 한도를 공유하던 문제 해소 (감사 지적)
  const rateLimit = await checkRateLimit(`ocr:mathpix:${user.id}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
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

  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) {
    return errorResponse("Mathpix API 키가 설정되지 않았습니다.", 500);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("요청 JSON을 읽을 수 없습니다.", 400);
    }
    const validated = validateMathpixBody(body);
    if (!validated.ok) {
      return errorResponse(validated.message, validated.status);
    }

    // 사용자별 일일 호출 상한 (LA-04)
    const callCheck = await checkAndCountUserCall("mathpix", user.id);
    if (!callCheck.allowed) {
      logOcrUsage({
        provider: "mathpix", user_id: user.id, ok: false, status: 429,
        duration_ms: 0, blocked_reason: "user_daily_call_limit",
      });
      return errorResponse("오늘 처리 가능한 횟수를 초과했습니다. 내일 다시 시도해주세요.", 429);
    }

    // 공급자 일일 비용 상한 (LA-04) — 도달 시 자정(KST)까지 차단
    const costGate = await isDailyCostBlocked("mathpix");
    if (costGate.blocked) {
      logOcrUsage({
        provider: "mathpix", user_id: user.id, ok: false, status: 503,
        duration_ms: 0, blocked_reason: "daily_cost_limit",
      });
      return errorResponse(
        "일일 처리 한도에 도달했습니다. 내일 다시 시도해주세요. 문의: aimathocr.official@gmail.com",
        503
      );
    }

    const mathpixBody = {
      ...validated.value,
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
      rm_spaces: true,
      // Mathpix 기본값은 입력 이미지를 최대 90일 보존(품질 개선 활용) —
      // 개인정보처리방침(목적 달성 시 삭제)과 맞추기 위해 서버에서 opt-out 고정.
      metadata: { improve_mathpix: false },
    };

    const startedAt = Date.now();
    const response = await fetch(MATHPIX_API_URL, {
      method: "POST",
      headers: {
        "app_id": appId,
        "app_key": appKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mathpixBody),
    });

    const data = await response.json();
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      logOcrUsage({
        provider: "mathpix", user_id: user.id, ok: false,
        status: response.status, duration_ms: durationMs,
      });
      return NextResponse.json(
        { error: data.error ?? `Mathpix API 오류 (HTTP ${response.status})` },
        { status: response.status }
      );
    }

    // Mathpix는 응답에 비용 정보가 없어 건당 고정 추정치로 적립 (LA-04)
    const estCostUsd = mathpixCostPerCallUsd();
    await recordCost("mathpix", estCostUsd);
    logOcrUsage({
      provider: "mathpix", user_id: user.id, ok: true, status: 200,
      duration_ms: durationMs, est_cost_usd: estCostUsd,
    });

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(`프록시 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`, 500);
  }
}
