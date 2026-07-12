import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { CONSENT_VERSION } from "@/lib/consent";
import { NextRequest, NextResponse } from "next/server";

// 마이페이지 마케팅 수신 설정 (LA-09).
// profiles.marketing_opt_in 갱신 + user_consents에 동의/철회 감사행 기록.
// user_consents는 서비스 롤 전용이라 클라이언트가 직접 못 쓰고, 이 라우트가
// 로그인 세션 확인 후 admin 클라이언트로 처리한다. (수신거부 메일 링크와 동일한
// 데이터 경로 — /api/unsubscribe kind=user 참조)

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rate = await checkRateLimit(
    `marketing-consent:${user.id}`,
    RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "변경 시도가 너무 잦습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: { opt_in?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  if (typeof body?.opt_in !== "boolean") {
    return NextResponse.json({ error: "opt_in 값이 필요합니다." }, { status: 400 });
  }
  const optIn = body.opt_in;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("marketing_opt_in")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json(
      { error: "설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  // 이미 같은 값이면 그대로 성공 처리 — 중복 클릭이 감사 기록을 오염시키지 않는다.
  if ((profile.marketing_opt_in === true) === optIn) {
    return NextResponse.json({ opt_in: optIn });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ marketing_opt_in: optIn })
    .eq("id", user.id);
  if (updateError) {
    console.error("[marketing-consent] profile update failed", {
      user_id: user.id,
      error: updateError.message,
    });
    return NextResponse.json(
      { error: "설정 변경에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  // 동의/철회 감사 기록 (append-only). 실패해도 설정 자체는 반영됐으므로
  // 성공으로 응답하고 경고만 남긴다 — signup·unsubscribe와 같은 정책.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { error: consentError } = await admin.from("user_consents").insert([
    {
      user_id: user.id,
      email: user.email,
      doc_type: "marketing",
      version: CONSENT_VERSION,
      agreed: optIn,
      ip,
      user_agent: request.headers.get("user-agent"),
    },
  ]);
  if (consentError) {
    console.warn("[marketing-consent] consent record failed", {
      user_id: user.id,
      error: consentError.message,
    });
  }

  return NextResponse.json({ opt_in: optIn });
}
