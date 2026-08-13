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

// 시스템 전용 코드 — 관리자 화면에서 **활성화할 수 없다**(비활성화는 허용).
//
// re_earlybird 는 만료 재지급 cron(0022)이 내부적으로만 쓰는 코드다.
// 15크레딧이고 max_uses 가 null(상한 없음)이라, 실수로 활성화되는 순간
// 마이페이지 코드 입력창과 가입 ?promo= 파라미터로 누구나 15크레딧을 받을 수 있고
// 총량 제한이 없다. 남는 방어는 계정당 1회 + 같은 IP 24시간 2회뿐인데,
// 2026-08-08 어뷰징 공격자는 이미 그 조합을 뚫은 전례가 있다.
//
// 화면 쪽 확인창만으로는 부족해서(토글에는 confirm 이 없었다) 서버에서 막는다.
const SYSTEM_ONLY_CODES = new Set(["re_earlybird"]);

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

  // 시스템 전용 코드의 활성화 요청은 거부한다 (비활성화·그 외 코드는 그대로 통과).
  //
  // ⚠️ fail-closed — 조회가 실패하면 활성화하지 않는다. 조회 오류를 무시하면
  // 하필 그 순간 '활성화'를 누른 관리자에게 서버가 200을 돌려주고, 실제로는
  // 상한 없는 15크레딧 코드가 공개돼 버린다(관리자는 막혔다고 착각).
  if (body.is_active === true) {
    const { data: target, error: lookupError } = await adminClient
      .from("promo_codes")
      .select("code")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("[admin/promo-codes:PATCH] 활성화 전 코드 조회 실패", lookupError);
      return NextResponse.json(
        { error: "코드를 확인하지 못해 활성화를 취소했습니다. 잠시 후 다시 시도해주세요." },
        { status: 503 }
      );
    }
    if (!target) {
      return NextResponse.json({ error: "코드를 찾을 수 없습니다." }, { status: 404 });
    }
    if (SYSTEM_ONLY_CODES.has(target.code)) {
      console.warn("[admin/promo-codes:PATCH] system-only code activation blocked", {
        code: target.code,
        admin_id: admin.id,
      });
      return NextResponse.json(
        {
          error:
            `'${target.code}' 는 시스템 전용 코드라 활성화할 수 없습니다. ` +
            "만료 재지급 cron 이 내부적으로만 사용하며, 공개되면 상한 없이 15크레딧이 지급됩니다.",
        },
        { status: 409 }
      );
    }
  }

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

  // 시스템 전용 코드는 삭제도 막는다 — 삭제 후 같은 이름으로 다시 만들면
  // is_active 기본값(활성)으로 생성돼 PATCH 가드를 통째로 우회하게 되고,
  // 재지급 cron(0022)이 참조하던 row 가 바뀌어 지급 이력 연결도 끊긴다.
  const { data: target, error: lookupError } = await adminClient
    .from("promo_codes")
    .select("code")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) {
    console.error("[admin/promo-codes:DELETE] 삭제 전 코드 조회 실패", lookupError);
    return NextResponse.json(
      { error: "코드를 확인하지 못해 삭제를 취소했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
  if (target?.code && SYSTEM_ONLY_CODES.has(target.code)) {
    return NextResponse.json(
      {
        error: `'${target.code}' 는 시스템 전용 코드라 삭제할 수 없습니다. 만료 재지급 cron 이 이 코드를 참조합니다.`,
      },
      { status: 409 }
    );
  }

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
