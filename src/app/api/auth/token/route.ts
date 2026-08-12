import { createAdminClient } from "@/lib/supabase/admin";
import { claimPendingPromo } from "@/lib/promo-claim";
import { claimPendingMarketingConsent } from "@/lib/marketing-consent";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  loginTooMany,
} from "@/lib/login-rate-limit";
import { NextRequest, NextResponse } from "next/server";

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

// 데스크톱 앱 전용: 이메일/비밀번호로 토큰 발급
// 브라우저 쿠키 대신 access_token/refresh_token을 직접 반환
//
// ⚠️ 이 라우트는 service_role 클라이언트로 로그인을 **대행**한다. 즉 GoTrue 가
// 보는 소스 IP 가 모든 사용자가 공유하는 Vercel egress IP 하나다. 제한이 없으면
// 외부에서 무의미한 요청을 쏟아부어 그 공유 IP 의 auth 한도를 소진시킬 수 있고,
// 그러면 정상 고객의 앱 로그인이 전부 실패한다 = 앱은 로그인 없이 변환이 불가하므로
// 유료 제품이 통째로 멈춘다. 그래서 무차별 대입 방어보다 **가용성** 이유가 더 크다.
export async function POST(request: NextRequest) {
  let email: unknown;
  let password: unknown;
  try {
    ({ email, password } = await request.json());
  } catch {
    return NextResponse.json({ error: "요청을 읽을 수 없습니다." }, { status: 400 });
  }

  // 문자열이 아닌 값이 오면 아래 정규화에서 예외가 나 500 이 된다 — 400 으로 끊는다.
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  const clientIp = getClientIp(request);
  const gate = await checkLoginRateLimit(clientIp, email);
  if (gate) return loginTooMany(gate);

  const admin = createAdminClient();

  // signInWithPassword는 admin client에서도 동작
  const { data, error } = await admin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // 이메일 인증 미완료는 별도 안내 — "비밀번호가 틀렸다"로 오인해
    // 재설정을 반복하는 혼란을 막는다 (웹 로그인 라우트와 동일 정책)
    // 이 경우는 자격증명 추측이 아니므로 시도 횟수에 세지 않는다 — 인증 메일을
    // 기다리며 반복 시도하는 정상 사용자가 잠기면 안 된다.
    if (
      error.code === "email_not_confirmed" ||
      error.message?.includes("not confirmed")
    ) {
      return NextResponse.json(
        {
          error:
            "이메일 인증이 필요합니다. 가입 시 받은 메일의 인증 링크를 눌러주세요.",
        },
        { status: 403 }
      );
    }
    // 자격증명 실패만 카운트 — 정상 사용자는 사실상 영향이 없다.
    await recordLoginFailure(clientIp, email);
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  // 인증 후 프로모션 지급 (LA-02) — 가입 때 보관한 pending 코드가 있으면
  // 여기서 지급한다. 데스크톱만 쓰는 사용자도 웹 로그인 없이 혜택을 받는다.
  // (RPC가 계정당 1회를 보장하므로 재로그인해도 중복 지급 없음)
  try {
    await claimPendingPromo(data.user, getClientIp(request));
  } catch (claimError) {
    // 지급 실패가 로그인을 막아서는 안 된다 — pending 이 남아 다음에 재시도
    console.warn("[auth/token] promo claim skipped", {
      user_id: data.user.id,
      error: claimError instanceof Error ? claimError.message : String(claimError),
    });
  }

  // 인증 후 마케팅 동의 활성화 (LA-09 보강) — pending 플래그가 있으면 여기서 기록
  try {
    await claimPendingMarketingConsent(
      data.user,
      getClientIp(request),
      request.headers.get("user-agent")
    );
  } catch (consentError) {
    console.warn("[auth/token] marketing consent claim skipped", {
      user_id: data.user.id,
      error: consentError instanceof Error ? consentError.message : String(consentError),
    });
  }

  // 프로필 조회 (프로모션 지급 이후 — 잔액에 보너스가 반영된 값을 반환)
  const { data: profile } = await admin
    .from("profiles")
    .select("role, credits, expires_at")
    .eq("id", data.user.id)
    .single();

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      role: profile?.role ?? "user",
      credits: profile?.credits ?? 0,
      expires_at: profile?.expires_at,
    },
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
}
