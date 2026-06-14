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

const SIGNED_URL_TTL = 60 * 60; // 서명 URL 유효시간: 1시간

// 관리자: 변환 신고 목록 조회 (이미지 서명 URL 포함)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 20, 1, 100);
  const userId = searchParams.get("user_id");
  const status = searchParams.get("status");
  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();
  let query = adminClient
    .from("conversion_reports")
    .select("*, profiles!inner(email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq("user_id", userId);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/reports:GET] query failed", error);
    return NextResponse.json({ error: "신고 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  // 비공개 버킷 이미지를 만료형 서명 URL로 변환해 내려준다.
  const signFor = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data: signed } = await adminClient.storage
      .from("reports")
      .createSignedUrl(path, SIGNED_URL_TTL);
    return signed?.signedUrl ?? null;
  };

  const reports = await Promise.all(
    (data ?? []).map(async (r) => ({
      id: r.id,
      user_id: r.user_id,
      email: r.profiles?.email ?? null,
      comment: r.comment,
      status: r.status,
      rewarded: r.rewarded,
      rewarded_at: r.rewarded_at,
      created_at: r.created_at,
      original_url: await signFor(r.original_image_path),
      converted_url: await signFor(r.converted_image_path),
    }))
  );

  return NextResponse.json({ reports, total: count, page, limit });
}
