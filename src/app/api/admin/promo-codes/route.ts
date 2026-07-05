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

// 코드 형식: 영문/숫자/하이픈/언더스코어 2~50자 (소문자 정규화 후 저장)
const CODE_PATTERN = /^[a-z0-9_-]{2,50}$/;

// 관리자: 프로모션 코드 목록 (+ 사용 이력 포함)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("promo_codes")
    .select(
      "id, code, credits, max_uses, is_active, memo, created_at, promo_redemptions(id, email, credits_granted, source, created_at)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/promo-codes:GET] failed", error);
    return NextResponse.json({ error: "코드 목록 조회 실패" }, { status: 500 });
  }

  const codes = (data ?? []).map((row) => ({
    ...row,
    promo_redemptions: [...(row.promo_redemptions ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    use_count: row.promo_redemptions?.length ?? 0,
  }));

  return NextResponse.json({ codes });
}

// 관리자: 프로모션 코드 생성 (코드·크레딧·최대 사용 횟수·메모 직접 지정)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: { code?: unknown; credits?: unknown; max_uses?: unknown; memo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  const code =
    typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: "코드는 영문/숫자/하이픈/언더스코어 2~50자여야 합니다." },
      { status: 400 }
    );
  }

  const credits = body.credits;
  if (
    typeof credits !== "number" ||
    !Number.isInteger(credits) ||
    credits < 1 ||
    credits > 100000
  ) {
    return NextResponse.json(
      { error: "지급 크레딧은 1~100,000 사이의 정수여야 합니다." },
      { status: 400 }
    );
  }

  // max_uses: null/undefined = 무제한, 숫자 = 선착순 n명
  let maxUses: number | null = null;
  if (body.max_uses !== undefined && body.max_uses !== null && body.max_uses !== "") {
    if (
      typeof body.max_uses !== "number" ||
      !Number.isInteger(body.max_uses) ||
      body.max_uses < 1 ||
      body.max_uses > 100000
    ) {
      return NextResponse.json(
        { error: "최대 사용 횟수는 1~100,000 사이의 정수여야 합니다." },
        { status: 400 }
      );
    }
    maxUses = body.max_uses;
  }

  const memo =
    typeof body.memo === "string" && body.memo.trim()
      ? body.memo.trim().slice(0, 500)
      : null;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("promo_codes")
    .insert({
      code,
      credits,
      max_uses: maxUses,
      memo,
      created_by: admin.id,
    })
    .select("id, code, credits, max_uses, is_active, memo, created_at")
    .single();

  if (error) {
    // 23505 = unique_violation (동일 코드 중복)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 존재하는 코드입니다." },
        { status: 409 }
      );
    }
    console.error("[admin/promo-codes:POST] failed", error);
    return NextResponse.json({ error: "코드 생성에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true, promo_code: data });
}
