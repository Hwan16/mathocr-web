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

  let credits: unknown;
  let reason: unknown;
  try {
    ({ credits, reason } = await request.json());
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  if (typeof credits !== "number" || !Number.isInteger(credits) || credits < 1 || credits > 100000) {
    return NextResponse.json(
      { error: "부여할 크레딧 수가 올바르지 않습니다." },
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

  // 원자적 증가 (read-modify-write 경쟁으로 인한 lost update 방지)
  const { error: rpcError } = await adminClient.rpc("add_credits_raw", {
    p_user_id: targetUserId,
    p_credits: credits,
  });

  if (rpcError) {
    console.error("[admin/credits:POST] add_credits_raw failed", rpcError);
    return NextResponse.json({ error: "크레딧 부여에 실패했습니다." }, { status: 500 });
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
    new_credits: current.credits + credits,
    reason: typeof reason === "string" ? reason.slice(0, 500) : null,
  });
}
