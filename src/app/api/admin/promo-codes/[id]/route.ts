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

// 관리자: 프로모션 코드 활성/비활성 전환
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id } = await params;

  let body: { is_active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json(
      { error: "is_active(boolean) 값이 필요합니다." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("promo_codes")
    .update({ is_active: body.is_active })
    .eq("id", id)
    .select("id, code, is_active")
    .maybeSingle();

  if (error) {
    console.error("[admin/promo-codes:PATCH] failed", error);
    return NextResponse.json({ error: "코드 수정에 실패했습니다." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "코드를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ success: true, promo_code: data });
}

// 관리자: 프로모션 코드 삭제.
// 사용 이력이 있으면 FK 제약(promo_redemptions → promo_codes)으로 막힌다 —
// 이력 보존을 위해 의도된 동작이며, 이 경우 비활성화를 안내한다.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id } = await params;
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("promo_codes")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    // 23503 = foreign_key_violation (사용 이력 존재)
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "사용 이력이 있는 코드는 삭제할 수 없습니다. 대신 비활성화하세요." },
        { status: 409 }
      );
    }
    console.error("[admin/promo-codes:DELETE] failed", error);
    return NextResponse.json({ error: "코드 삭제에 실패했습니다." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "코드를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
