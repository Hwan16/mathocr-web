import { createAdminClient } from "@/lib/supabase/admin";
import { claimPendingPromo } from "@/lib/promo-claim";
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
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // signInWithPassword는 admin client에서도 동작
  const { data, error } = await admin.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // 이메일 인증 미완료는 별도 안내 — "비밀번호가 틀렸다"로 오인해
    // 재설정을 반복하는 혼란을 막는다 (웹 로그인 라우트와 동일 정책)
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
