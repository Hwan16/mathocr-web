import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

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
