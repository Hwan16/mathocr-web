import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimSignupCredits } from "@/lib/signup-credits";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  // 가입 무료 크레딧 지급 안전망 (0027) — 앱이 잔액을 새로고침하는 경로다.
  // 로그인 때 지급이 일시 오류로 실패했더라도 여기서 회복된다(계정당 1회 멱등,
  // 이미 지급된 계정은 즉시 반환하므로 비용이 거의 없다).
  await claimSignupCredits(user);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, credits, expires_at")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    role: profile?.role ?? "user",
    credits: profile?.credits ?? 0,
    expires_at: profile?.expires_at,
  });
}
