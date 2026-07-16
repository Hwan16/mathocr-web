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
  let requestId: unknown;
  try {
    ({ credits, reason, requestId } = await request.json());
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

  // 이중 지급 차단 1: 같은 유저에게 같은 수량의 관리자 지급이 10초 내에 있으면 거부
  // (requestId를 보내지 않는 클라이언트까지 커버하는 방어선)
  const { data: recentDup } = await adminClient
    .from("payments")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("credits_added", credits)
    .like("pg_transaction_id", "admin_grant_%")
    .gte("created_at", new Date(Date.now() - 10_000).toISOString())
    .limit(1);

  if (recentDup && recentDup.length > 0) {
    return NextResponse.json(
      { error: "10초 이내에 같은 사용자에게 같은 수량이 이미 지급되었습니다. 중복 지급이 아니라면 잠시 후 다시 시도하세요." },
      { status: 409 }
    );
  }

  // 이중 지급 차단 2: 클라이언트 요청 ID를 거래 ID로 써서 uq_payments_pg_transaction_id가
  // 동일 요청 재전송(버튼 연타·네트워크 재시도)을 DB 수준에서 차단.
  // 지급 기록을 먼저 넣고 성공한 경우에만 크레딧을 증가시킨다.
  const txId =
    typeof requestId === "string" && /^[0-9a-f-]{16,64}$/i.test(requestId)
      ? `admin_grant_${requestId}`
      : `admin_grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { data: payment, error: insertError } = await adminClient
    .from("payments")
    .insert({
      user_id: targetUserId,
      amount: 0,
      credits_added: credits,
      pg_transaction_id: txId,
      status: "completed",
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "이미 처리된 요청입니다. (중복 지급 차단)" },
        { status: 409 }
      );
    }
    console.error("[admin/credits:POST] payments insert failed", insertError);
    return NextResponse.json({ error: "크레딧 부여에 실패했습니다." }, { status: 500 });
  }

  // 원자적 증가 (read-modify-write 경쟁으로 인한 lost update 방지)
  const { error: rpcError } = await adminClient.rpc("add_credits_raw", {
    p_user_id: targetUserId,
    p_credits: credits,
  });

  if (rpcError) {
    console.error("[admin/credits:POST] add_credits_raw failed", rpcError);
    // 크레딧이 실제로 증가하지 않았으므로 지급 기록을 되돌린다
    const { error: cleanupError } = await adminClient
      .from("payments")
      .delete()
      .eq("id", payment.id);
    if (cleanupError) {
      console.error(
        "[admin/credits:POST] orphan payment cleanup failed — 수동 삭제 필요",
        { paymentId: payment.id, cleanupError }
      );
    }
    return NextResponse.json({ error: "크레딧 부여에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    user_email: current.email,
    previous_credits: current.credits,
    added_credits: credits,
    new_credits: current.credits + credits,
    reason: typeof reason === "string" ? reason.slice(0, 500) : null,
  });
}
