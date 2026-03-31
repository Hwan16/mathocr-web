import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  // 프로필 조회
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
