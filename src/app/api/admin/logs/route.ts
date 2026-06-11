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

// 관리자: 오류 로그 조회
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 100);
  const userId = searchParams.get("user_id");
  const errorType = searchParams.get("error_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();
  let query = adminClient
    .from("error_logs")
    .select("*, profiles!inner(email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq("user_id", userId);
  if (errorType) query = query.eq("error_type", errorType);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/logs:GET] query failed", error);
    return NextResponse.json({ error: "오류 로그를 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ logs: data, total: count, page, limit });
}
