import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const rate = await checkRateLimit(
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
    // DB 관리 코드만 유효 — 레거시 환경변수(PROMO_CODES) 코드는 2026-07-12에
    // 폐기했다. env 경로는 계정당 1회·알리아스·IP 가드와 지급 이력을 모두
    // 우회하고 100크레딧을 고정 지급하는 구멍이었다(감사 LA-02). 기존 env
    // 코드를 계속 쓰려면 관리자 페이지에서 DB 코드로 등록하면 된다.
    const dbBonus = await dbPromoBonusCredits(normalized);
    if (dbBonus !== null) {
      return NextResponse.json({
        valid: true,
        bonus_credits: dbBonus.credits,
        // null = 계정 만료일 따름, n = 사용 시 만료일이 최소 now()+n일로 연장
        validity_days: dbBonus.validityDays,
      });
    }
    return NextResponse.json({ valid: false });
  } catch {
    return NextResponse.json({ valid: false });
  }
}

// DB 프로모션 코드 검증: 활성 + 사용 횟수 미소진이면 지급 크레딧·유효기간, 아니면 null.
async function dbPromoBonusCredits(
  code: string
): Promise<{ credits: number; validityDays: number | null } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promo_codes")
    .select("id, credits, max_uses, validity_days, is_active")
    .eq("code", code)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;

  if (data.max_uses !== null) {
    const { count } = await admin
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", data.id);
    if ((count ?? 0) >= data.max_uses) return null;
  }

  return { credits: data.credits, validityDays: data.validity_days ?? null };
}
