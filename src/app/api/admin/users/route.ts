import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { clampInt } from "@/lib/pagination";
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

// 전체 사용자 목록 (관리자 전용)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 100);
  const search = searchParams.get("search") ?? "";
  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();
  let query = adminClient
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("email", `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/users:GET] query failed", error);
    return NextResponse.json({ error: "사용자 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  // 이메일 인증·프로모션 대기 상태는 profiles 가 아니라 auth.users 에 있어서
  // 페이지 단위(≤limit건)로 별도 조회해 합친다. 개별 조회가 실패하면 해당
  // 유저만 null(알 수 없음)로 두고 목록 자체는 정상 반환한다 (fail-open) —
  // 미인증 유저가 얼리버드 미지급 사고로 오인되는 일을 막기 위한 표시용 정보.
  // promo_pending_error 는 위조 불가능한 app_metadata 에서만 읽는다 (promo-claim.ts 참조).
  let lookupFailures = 0;
  let firstLookupError: string | null = null;
  const users = await Promise.all(
    (data ?? []).map(async (profile) => {
      const unknown = {
        ...profile,
        email_confirmed: null as boolean | null,
        pending_promo_code: null as string | null,
        promo_pending_error: null as string | null,
      };
      try {
        const { data: authData, error: authError } =
          await adminClient.auth.admin.getUserById(profile.id);
        if (authError || !authData?.user) {
          lookupFailures += 1;
          firstLookupError ??= authError?.message ?? "user not found";
          return unknown;
        }
        const meta = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
        const appMeta = (authData.user.app_metadata ?? {}) as Record<string, unknown>;
        return {
          ...profile,
          email_confirmed: !!authData.user.email_confirmed_at,
          pending_promo_code:
            typeof meta.pending_promo_code === "string" && meta.pending_promo_code.trim()
              ? meta.pending_promo_code
              : null,
          promo_pending_error:
            typeof appMeta.promo_pending_error === "string"
              ? appMeta.promo_pending_error
              : null,
        };
      } catch (e) {
        lookupFailures += 1;
        firstLookupError ??= e instanceof Error ? e.message : String(e);
        return unknown;
      }
    })
  );

  // 인증 상태 조회가 조용히 전멸하면 배지 없는 화면이 "전원 인증 완료"로
  // 오독된다 — 열화 상태를 Vercel 로그에서 발견할 수 있게 남긴다.
  if (lookupFailures > 0) {
    console.warn("[admin/users:GET] auth enrichment degraded", {
      failed: lookupFailures,
      of: users.length,
      first_error: firstLookupError,
    });
  }

  return NextResponse.json({ users, total: count, page, limit });
}
