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
  let request_id: unknown;
  try {
    ({ problem_count, solution_count, pdf_name, request_id } = await request.json());
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  // 멱등키(0016, LA-06): 앱이 변환 시도마다 UUID를 보낸다. 같은 키 재요청은
  // 서버가 새로 차감하지 않고 기존 결과를 돌려준다 — 응답 유실 후 재시도가
  // 이중 차감으로 이어지지 않는다. 선택 값(구버전 앱은 보내지 않음).
  let requestId: string | null = null;
  if (request_id !== undefined && request_id !== null) {
    if (
      typeof request_id !== "string" ||
      request_id.length === 0 ||
      request_id.length > 64 ||
      !/^[A-Za-z0-9-]+$/.test(request_id)
    ) {
      return NextResponse.json(
        { error: "request_id 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    requestId = request_id;
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

  // DB 함수로 원자적 크레딧 차감 (총액 차감, 해설 수는 표시용으로 분리 저장).
  // p_request_id 는 값이 있을 때만 전달 — 0016 마이그레이션 적용 전 함수(4-인수)
  // 와도 기존 앱 호출이 계속 동작하게 하기 위함.
  const admin = createAdminClient();
  const rpcParams: Record<string, unknown> = {
    p_user_id: user.id,
    p_amount: total,
    p_pdf_name: typeof pdf_name === "string" ? pdf_name.slice(0, 255) : null,
    p_solution_count: solution,
  };
  if (requestId) {
    rpcParams.p_request_id = requestId;
  }
  const { data, error } = await admin.rpc("deduct_credits", rpcParams);

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
      // 0017: 같은 request_id 를 다른 내용으로 재사용 — 정상 앱에선 발생하지
      // 않으며, 발생 시 새로 시도하라는 안내가 맞다 (기존 결과 반환 금지)
      request_mismatch: {
        status: 409,
        message: "요청 정보가 이전 시도와 일치하지 않습니다. 변환을 다시 시작해주세요.",
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
