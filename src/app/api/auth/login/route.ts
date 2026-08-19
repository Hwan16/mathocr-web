import { createClient } from "@/lib/supabase/server";
import { claimPendingPromo } from "@/lib/promo-claim";
import { claimSignupCredits } from "@/lib/signup-credits";
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // 이메일 인증 미완료는 별도 안내 (데스크톱 앱이 이 메시지를 그대로 표시)
    // 자격증명 추측이 아니므로 시도 횟수에 세지 않는다.
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
    await recordLoginFailure(clientIp, email);
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  // 가입 무료 크레딧 지급 (A-1, 0027) — 인증 완료 계정의 첫 로그인 때 1회
  await claimSignupCredits(data.user);

  // 인증 후 프로모션 지급 (LA-02) — pending 코드가 있으면 여기서 지급
  try {
    await claimPendingPromo(data.user, getClientIp(request));
  } catch {
    // 지급 실패가 로그인을 막지 않는다 — pending 유지, 다음 로그인 때 재시도
  }

  // 인증 후 마케팅 동의 활성화 (LA-09 보강) — pending 플래그가 있으면 여기서 기록
  try {
    await claimPendingMarketingConsent(
      data.user,
      getClientIp(request),
      request.headers.get("user-agent")
    );
  } catch {
    // 실패가 로그인을 막지 않는다 — pending 유지, 다음 로그인 때 재시도
  }

  // 프로필 정보 함께 반환 (프로모션 지급 이후 잔액 기준)
  const { data: profile } = await supabase
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
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}
