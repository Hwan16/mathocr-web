import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user;
}

// 관리자: 특정 사용자에게 크레딧 수동 부여
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const { credits, reason } = await request.json();

  if (!credits || credits < 1) {
    return NextResponse.json(
      { error: "부여할 크레딧 수를 입력해주세요." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  const { data: current } = await adminClient
    .from("profiles")
    .select("credits, email")
    .eq("id", targetUserId)
    .single();

  if (!current) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const newCredits = current.credits + credits;

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", targetUserId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await adminClient.from("payments").insert({
    user_id: targetUserId,
    amount: 0,
    credits_added: credits,
    pg_transaction_id: `admin_grant_${Date.now()}`,
    status: "completed",
  });

  return NextResponse.json({
    success: true,
    user_email: current.email,
    previous_credits: current.credits,
    added_credits: credits,
    new_credits: newCredits,
    reason: reason ?? null,
  });
}
