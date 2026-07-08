import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // 이메일 인증 미완료는 별도 안내 (데스크톱 앱이 이 메시지를 그대로 표시)
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
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  // 프로필 정보 함께 반환
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
