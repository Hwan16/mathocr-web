import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// 데스크톱 앱 전용: refresh_token으로 새 access_token 발급
export async function POST(request: NextRequest) {
  const { refresh_token } = await request.json();

  if (!refresh_token) {
    return NextResponse.json(
      { error: "refresh_token이 필요합니다." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.refreshSession({
    refresh_token,
  });

  if (error || !data.session) {
    return NextResponse.json(
      { error: "세션이 만료되었습니다. 다시 로그인해주세요." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
}
