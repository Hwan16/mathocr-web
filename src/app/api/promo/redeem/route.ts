import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeEmailAlias } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

// 무차별 대입 방지: 계정당 분당 시도 횟수 제한
const REDEEM_RATE_LIMIT = 5;
const REDEEM_RATE_LIMIT_WINDOW_MS = 60_000;

function normalizePromoCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// RPC 오류 코드 → 사용자 메시지. 비활성 코드는 존재 여부를 노출하지 않도록
// '유효하지 않음'과 같은 메시지를 쓴다.
const REDEEM_ERROR_MESSAGES: Record<string, { message: string; status: number }> = {
  invalid_code: { message: "유효하지 않은 코드입니다.", status: 400 },
  inactive_code: { message: "유효하지 않은 코드입니다.", status: 400 },
  already_redeemed: { message: "이미 사용한 코드입니다.", status: 409 },
  exhausted: { message: "사용 가능 횟수가 모두 소진된 코드입니다.", status: 409 },
  user_not_found: { message: "사용자 정보를 찾을 수 없습니다.", status: 404 },
  // 0013 어뷰징 가드: 같은 네트워크(IP)에서 같은 코드 24시간 내 2회 초과
  ip_limit: {
    message: "같은 네트워크에서 이 코드의 참여 한도를 초과했습니다. 24시간 후 다시 시도해주세요.",
    status: 429,
  },
};

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

// 마이페이지: 프로모션 코드 입력 → 크레딧 지급 (계정당 코드 1회)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rate = await checkRateLimit(
    `promo-redeem:${user.id}`,
    REDEEM_RATE_LIMIT,
    REDEEM_RATE_LIMIT_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "시도가 너무 잦습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const code = normalizePromoCode(body?.code);
  if (!code || code.length > 50) {
    return NextResponse.json({ error: "코드를 입력해주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_promo_code", {
    p_user_id: user.id,
    p_code: code,
    p_source: "mypage",
    // 어뷰징 가드(0013): 가입 경로와 동일하게 알리아스·IP를 기록해 우회를 막는다
    p_normalized_email: user.email ? normalizeEmailAlias(user.email) : null,
    p_ip: getClientIp(request),
  });

  if (error) {
    console.error("[promo/redeem] rpc failed", { user_id: user.id, error: error.message });
    return NextResponse.json(
      { error: "코드 적용에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  if (!data?.success) {
    const mapped = REDEEM_ERROR_MESSAGES[data?.error as string] ?? {
      message: "코드 적용에 실패했습니다.",
      status: 400,
    };
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json({
    success: true,
    credits_granted: data.credits_granted,
    new_credits: data.new_credits,
    // 상환 후 계정 만료일 (0011 적용 전 RPC는 이 필드가 없음 → null)
    expires_at: data.expires_at ?? null,
  });
}
