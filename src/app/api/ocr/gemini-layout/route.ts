import { getAuthUser } from "@/lib/supabase/auth-helper";
import { ensureUsableCredits } from "@/lib/supabase/credit-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkAndCountUserCall,
  isDailyCostBlocked,
  recordCost,
  estimateGeminiCostUsd,
  logOcrUsage,
} from "@/lib/ocr-guard";
import { NextRequest, NextResponse } from "next/server";

// 자동 영역 인식 프록시 (v2.2.0)
// 데스크톱 앱 → 우리 서버 → Gemini API (API 키는 서버에만).
//
// claude 라우트와 다른 점: 프롬프트를 서버가 소유한다. 클라이언트는 페이지
// 이미지 1장만 보내므로 임의 지시문 주입 여지가 아예 없고(해시 허용 목록 불필요),
// 프롬프트 개선도 앱 릴리스 없이 서버 배포만으로 가능하다.
//
// 모델 선정 근거: docs/AUTO_DETECT_BETA.md §9 (2026-07-25 실측) — 문제 감지
// Claude와 동률, 사진 시험지에서 인쇄/필기 구분 우세, 쪽당 비용 40%.
const GEMINI_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ALLOWED_MODELS = ["gemini-3.6-flash"] as const;
const DEFAULT_MODEL = "gemini-3.6-flash";
// 자동 인식 1회 = 최대 20페이지(앱 상한) → 분당 30이면 정상 사용을 막지 않는다
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IMAGE_BASE64_LENGTH = 2_800_000;
const MAX_OUTPUT_TOKENS = 16_000;
// 데스크톱 layout_analyzer가 보내는 형식과 일치 (structure_analyzer와 동일 목록)
const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/bmp",
  "image/webp",
]);
const ALLOWED_BODY_KEYS = new Set(["image"]);

// 레이아웃 분석 프롬프트 — 2026-07-25 모델 비교 실험(tools/layout_experiment)에서
// 검증된 문안. 좌표는 Gemini 공식 권장 방식(box_2d, 0~1000 정규화)을 쓴다.
// 소문항은 "묶기" 모드만 제공한다(베타에서 나누기 모드는 실측 검증이 없었음).
const LAYOUT_PROMPT = `당신은 한국 수학 시험지/문제지 한 페이지의 레이아웃을 분석하는 도구입니다.
각 문제 영역과, 문제 안에 있는 그림 영역의 바운딩 박스를 JSON으로 반환하세요.
모든 박스는 box_2d 형식, 즉 [ymin, xmin, ymax, xmax]를 0~1000으로 정규화한 정수 4개입니다.

[문제 박스 규칙]
- 문제 하나 = 문제 번호부터 그 문제에 속한 모든 내용(발문, 수식, 조건 박스, <보기>, 선택지 ①~⑤, 배점 표시, 답란)을 담는 사각형.
- 경계선에 글자가 닿거나 잘리면 안 됩니다. 여유를 두세요.
- 객관식 선택지 ①~⑤는 반드시 전부 포함하세요. 선택지가 두 줄(윗줄 ①②③ / 아랫줄 ④⑤)인 경우 아랫줄까지 포함했는지 반드시 확인하세요.
- 페이지 머리말/꼬리말, 시험지 제목, 학교·과목·날짜 표시, 단 구분선, 페이지 번호, 로고는 어떤 박스에도 넣지 마세요.
- 2단 레이아웃이면 왼쪽 단 위→아래, 그다음 오른쪽 단 위→아래 순서로 problems 배열에 담으세요.
- 문제 박스끼리는 서로 겹치지 않게 하세요.
- 페이지 끝에서 잘려 다음 페이지로 이어지는 문제도 보이는 부분까지 박스를 만드세요.
- label에는 시험지에 인쇄된 문제 번호를 그대로 적으세요 (예: "1", "13", "서술형 2").
- 한 문제 안에 1), 2) 같은 소문항이 있어도 나누지 말고 큰 문제 번호 단위로 하나의 박스를 만드세요.

[그림 박스 규칙]
- 그림 = 도형, 그래프, 좌표평면, 수직선, 벤다이어그램, 입체도형, 사진 같은 시각 자료.
- 수식, 조건/보기 박스, 선택지, 글자로 된 표는 그림이 아닙니다.
- 그림 박스는 반드시 자기 문제 박스 안에 완전히 포함되어야 합니다.
- 그림의 모든 요소(축, 축 라벨, 눈금 숫자, 꼭짓점 문자, 이름표)가 잘리지 않게 여유를 두세요.
- 그림이 없는 문제는 figures를 빈 배열로 두세요.
- 그림 박스는 시험지에 인쇄된 그림에만 만드세요. 학생이 연필이나 펜으로 손으로 그린 도형, 풀이 스케치, 낙서에는 절대 그림 박스를 만들지 마세요.
- 인쇄된 그림인지 확실하지 않으면 그림 박스를 만들지 마세요.

다음 JSON 형식으로만 답하세요:
{"problems": [{"label": "1", "box_2d": [ymin, xmin, ymax, xmax], "figures": [[ymin, xmin, ymax, xmax]]}]}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          box_2d: { type: "array", items: { type: "integer" } },
          figures: {
            type: "array",
            items: { type: "array", items: { type: "integer" } },
          },
        },
        required: ["label", "box_2d", "figures"],
      },
    },
  },
  required: ["problems"],
};

function resolveModel(): string {
  const configured = process.env.GEMINI_LAYOUT_MODEL?.trim() || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.includes(configured as (typeof ALLOWED_MODELS)[number])) {
    throw new Error(`Invalid GEMINI_LAYOUT_MODEL: ${configured}`);
  }
  return configured;
}

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBody(body: unknown):
  | { ok: true; mediaType: string; data: string }
  | { ok: false; message: string; status: number } {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 형식이 올바르지 않습니다.", status: 400 };
  }
  const unknownKeys = Object.keys(body).filter((k) => !ALLOWED_BODY_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      message: `허용되지 않은 요청 필드입니다: ${unknownKeys.join(", ")}`,
      status: 400,
    };
  }
  const image = body.image;
  if (
    !isRecord(image) ||
    typeof image.media_type !== "string" ||
    !ALLOWED_IMAGE_MEDIA_TYPES.has(image.media_type) ||
    typeof image.data !== "string" ||
    image.data.length === 0
  ) {
    return { ok: false, message: "이미지 형식이 올바르지 않습니다.", status: 400 };
  }
  if (image.data.length > MAX_IMAGE_BASE64_LENGTH) {
    return {
      ok: false,
      message: "이미지 크기가 너무 큽니다. 2MB 이하 이미지로 다시 시도해주세요.",
      status: 413,
    };
  }
  return { ok: true, mediaType: image.media_type, data: image.data };
}

// Gemini 응답 JSON을 신뢰하지 않고 형태·범위를 검증해 정규화한다.
// 좌표는 0~1000 정수로 클램프, 박스 아닌 항목은 버린다.
function sanitizeProblems(parsed: unknown): Array<{
  label: string;
  box_2d: [number, number, number, number];
  figures: Array<[number, number, number, number]>;
}> {
  const clampBox = (b: unknown): [number, number, number, number] | null => {
    if (!Array.isArray(b) || b.length !== 4) return null;
    const vals = b.map((v) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(1000, Math.max(0, Math.round(v)))
        : null
    );
    if (vals.some((v) => v === null)) return null;
    const [ymin, xmin, ymax, xmax] = vals as number[];
    if (ymax <= ymin || xmax <= xmin) return null;
    return [ymin, xmin, ymax, xmax];
  };
  if (!isRecord(parsed) || !Array.isArray(parsed.problems)) return [];
  const out: Array<{
    label: string;
    box_2d: [number, number, number, number];
    figures: Array<[number, number, number, number]>;
  }> = [];
  for (const item of parsed.problems.slice(0, 60)) {
    if (!isRecord(item)) continue;
    const box = clampBox(item.box_2d);
    if (!box) continue;
    const figures: Array<[number, number, number, number]> = [];
    if (Array.isArray(item.figures)) {
      for (const f of item.figures.slice(0, 10)) {
        const fb = clampBox(f);
        if (fb) figures.push(fb);
      }
    }
    out.push({
      label: typeof item.label === "string" ? item.label.slice(0, 20) : "",
      box_2d: box,
      figures,
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return errorResponse("인증되지 않았습니다.", 401);
  }

  const rateLimit = await checkRateLimit(
    `ocr:gemini:${user.id}`,
    RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    return errorResponse("잠시 후 다시 시도해주세요. (분당 시도 횟수 초과)", 429, {
      "Retry-After": String(rateLimit.retryAfter),
    });
  }

  // 자동 인식은 크레딧을 차감하지 않는 무료 기능이지만, 잔액 0·만료 계정의
  // 공짜 API 사용은 막는다 (claude/mathpix 프록시와 동일 게이트)
  const creditCheck = await ensureUsableCredits(user.id);
  if (!creditCheck.ok) {
    return errorResponse(creditCheck.message, creditCheck.status);
  }

  // trim(): CLI로 env를 넣을 때 셸 인코딩이 BOM(U+FEFF)·개행을 붙일 수 있고,
  // 그러면 fetch가 헤더 값을 거부한다 (2026-07-26 실사고 — JS trim은 BOM도 제거)
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse("Gemini API 키가 설정되지 않았습니다.", 500);
  }

  let model: string;
  try {
    model = resolveModel();
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Invalid GEMINI_LAYOUT_MODEL",
      500
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("요청 JSON을 읽을 수 없습니다.", 400);
    }
    const validated = validateBody(body);
    if (!validated.ok) {
      return errorResponse(validated.message, validated.status);
    }

    const callCheck = await checkAndCountUserCall("gemini", user.id);
    if (!callCheck.allowed) {
      logOcrUsage({
        provider: "gemini", user_id: user.id, ok: false, status: 429,
        duration_ms: 0, blocked_reason: "user_daily_call_limit",
      });
      return errorResponse(
        "오늘 처리 가능한 횟수를 초과했습니다. 내일 다시 시도해주세요.",
        429
      );
    }

    const costGate = await isDailyCostBlocked("gemini");
    if (costGate.blocked) {
      logOcrUsage({
        provider: "gemini", user_id: user.id, ok: false, status: 503,
        duration_ms: 0, blocked_reason: "daily_cost_limit",
      });
      return errorResponse(
        "일일 처리 한도에 도달했습니다. 내일 다시 시도해주세요. 문의: aimathocr.official@gmail.com",
        503
      );
    }

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: validated.mediaType,
                data: validated.data,
              },
            },
            { text: LAYOUT_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    };

    const startedAt = Date.now();
    const response = await fetch(`${GEMINI_URL_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiBody),
    });
    const data = await response.json();
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      logOcrUsage({
        provider: "gemini", user_id: user.id, ok: false,
        status: response.status, duration_ms: durationMs,
      });
      return NextResponse.json(
        { error: data.error?.message ?? `Gemini API 오류 (HTTP ${response.status})` },
        { status: response.status === 429 ? 429 : 502 }
      );
    }

    let problems: ReturnType<typeof sanitizeProblems>;
    try {
      const text: unknown = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") throw new Error("no text");
      problems = sanitizeProblems(JSON.parse(text));
    } catch {
      logOcrUsage({
        provider: "gemini", user_id: user.id, ok: false, status: 502,
        duration_ms: durationMs, blocked_reason: "unparseable_response",
      });
      return errorResponse("분석 결과를 해석하지 못했습니다. 다시 시도해주세요.", 502);
    }

    const usage = data.usageMetadata ?? {};
    const estCostUsd = estimateGeminiCostUsd(usage);
    await recordCost("gemini", estCostUsd);
    logOcrUsage({
      provider: "gemini", user_id: user.id, ok: true, status: 200,
      duration_ms: durationMs, est_cost_usd: Number(estCostUsd.toFixed(6)),
      input_tokens: usage.promptTokenCount ?? 0,
      output_tokens:
        (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    });

    return NextResponse.json({
      problems,
      usage: {
        input_tokens: usage.promptTokenCount ?? 0,
        output_tokens:
          (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      },
    });
  } catch (error) {
    return errorResponse(
      `프록시 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      500
    );
  }
}
