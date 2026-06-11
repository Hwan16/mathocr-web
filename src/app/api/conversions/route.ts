import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { clampInt } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";

// 변환 이력 조회
export async function GET(request: NextRequest) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 20, 1, 100);
  const offset = (page - 1) * limit;

  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("conversions")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[conversions:GET] query failed", error);
    return NextResponse.json({ error: "변환 이력을 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    conversions: data,
    total: count,
    page,
    limit,
  });
}
