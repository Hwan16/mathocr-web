import { getAuthUser } from "@/lib/supabase/auth-helper";
import { checkRateLimit } from "@/lib/rate-limit";
import { claimPendingPromo } from "@/lib/promo-claim";
import { claimPendingMarketingConsent } from "@/lib/marketing-consent";
import { NextRequest, NextResponse } from "next/server";

// ── 인증 후 프로모션 지급 청구 (LA-02) ──
// 웹 로그인 페이지가 로그인 성공 직후 호출한다. 가입 때 보관해 둔
// pending_promo_code 가 있고 이메일 인증이 끝났으면 실제 지급을 수행한다.
// 멱등: 지급 로직은 redeem_promo_code RPC 가 계정당 1회를 보장한다.

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const rl = await checkRateLimit(
    `promo-claim:${user.id}`,
    RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const result = await claimPendingPromo(user, getClientIp(request));

  // 인증 후 마케팅 동의 활성화 (LA-09 보강) — pending 플래그가 있으면 여기서 기록
  try {
    await claimPendingMarketingConsent(
      user,
      getClientIp(request),
      request.headers.get("user-agent")
    );
  } catch {
    // 실패해도 프로모션 응답은 정상 반환 — pending 유지, 다음 로그인 때 재시도
  }

  return NextResponse.json({
    applied: result.applied,
    credits_granted: result.credits_granted,
    error: result.error,
  });
}
