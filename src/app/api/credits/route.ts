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

  let problem_count: unknown;
  let solution_count: unknown;
  let pdf_name: unknown;
  try {
    ({ problem_count, solution_count, pdf_name } = await request.json());
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  if (
    typeof problem_count !== "number" ||
    !Number.isInteger(problem_count) ||
    problem_count < 1 ||
    problem_count > 1000
  ) {
    return NextResponse.json(
      { error: "문제 수가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // solution_count 는 선택 값. 구버전 앱은 아예 보내지 않으므로(undefined/null) 0으로 둔다.
  // 하지만 값이 "왔는데" 정수 0..1000 범위를 벗어나면 조용히 0으로 깎지 말고 400으로 거절한다.
  // (신버전 클라이언트 버그나 API 직접 호출에서 해설분이 누락되는 과소 차감을 막기 위함)
  let solution = 0;
  if (solution_count !== undefined && solution_count !== null) {
    if (
      typeof solution_count !== "number" ||
      !Number.isInteger(solution_count) ||
      solution_count < 0 ||
      solution_count > 1000
    ) {
      return NextResponse.json(
        { error: "해설 수가 올바르지 않습니다." },
        { status: 400 }
      );
    }
    solution = solution_count;
  }

  // 총 차감분 = 문제 + 해설.
  //  - 신버전 앱: problem_count=문제 수, solution=해설 수
  //  - 구버전 앱: problem_count 에 이미 합계가 담겨 오고 solution=0 → total=합계(기존과 동일)
  const total = problem_count + solution;

  // DB 함수로 원자적 크레딧 차감 (총액 차감, 해설 수는 표시용으로 분리 저장)
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: total,
    p_pdf_name: typeof pdf_name === "string" ? pdf_name.slice(0, 255) : null,
    p_solution_count: solution,
  });

  if (error) {
    console.error("[credits:POST] deduct_credits failed", error);
    return NextResponse.json({ error: "크레딧 차감에 실패했습니다." }, { status: 500 });
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
