import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const PROMO_BONUS_CREDITS = 100;
const VALIDATION_DELAY_MS = 200;
// 무차별 대입 방지: IP당 분당 시도 횟수 제한 (인증 없는 공개 엔드포인트)
const PROMO_RATE_LIMIT = 10;
const PROMO_RATE_LIMIT_WINDOW_MS = 60_000;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

type ValidateBody = {
  code?: string;
};

function normalizePromoCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function promoCodesFromEnv(): string[] {
  return (process.env.PROMO_CODES ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(
    `promo:${clientIp(request)}`,
    PROMO_RATE_LIMIT,
    PROMO_RATE_LIMIT_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: ValidateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 }
    );
  }

  const allowedKeys = new Set(["code"]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      return NextResponse.json(
        { error: `허용되지 않은 필드: ${key}` },
        { status: 400 }
      );
    }
  }

  await sleep(VALIDATION_DELAY_MS);

  const normalized = normalizePromoCode(body.code);
  if (!normalized) {
    return NextResponse.json({ valid: false });
  }

  try {
    const matched = promoCodesFromEnv().includes(normalized);
    if (matched) {
      return NextResponse.json({
        valid: true,
        bonus_credits: PROMO_BONUS_CREDITS,
      });
    }
    return NextResponse.json({ valid: false });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
