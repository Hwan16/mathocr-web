import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// 크레딧 잔액 조회
export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("credits, expires_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "프로필을 찾을 수 없습니다." }, { status: 404 });
  }

  const isExpired =
    profile.expires_at && new Date(profile.expires_at) < new Date();

  return NextResponse.json({
    credits: profile.credits,
    expires_at: profile.expires_at,
    is_expired: !!isExpired,
  });
}

// 크레딧 차감 (변환 시작 시)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const { problem_count, pdf_name } = await request.json();

  if (!problem_count || problem_count < 1) {
    return NextResponse.json(
      { error: "문제 수를 입력해주세요." },
      { status: 400 }
    );
  }

  // DB 함수로 원자적 크레딧 차감
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: problem_count,
    p_pdf_name: pdf_name ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data.success) {
    const statusMap: Record<string, { status: number; message: string }> = {
      insufficient_credits: {
        status: 402,
        message: `크레딧이 부족합니다. (현재: ${data.credits}, 필요: ${data.required})`,
      },
      expired: {
        status: 403,
        message: `유효기간이 만료되었습니다. (${data.expires_at})`,
      },
      user_not_found: {
        status: 404,
        message: "사용자를 찾을 수 없습니다.",
      },
    };

    const info = statusMap[data.error] ?? { status: 400, message: data.error };
    return NextResponse.json({ error: info.message }, { status: info.status });
  }

  return NextResponse.json({
    conversion_id: data.conversion_id,
    remaining_credits: data.remaining_credits,
  });
}
