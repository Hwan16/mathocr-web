import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// 오류 로그 전송 (데스크톱 앱에서 호출)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  const { conversion_id, error_type, error_message, stack_trace, metadata } = payload;

  if (typeof error_type !== "string" || typeof error_message !== "string" || !error_type || !error_message) {
    return NextResponse.json(
      { error: "error_type과 error_message는 필수입니다." },
      { status: 400 }
    );
  }

  // 클라이언트가 보내는 자유 입력 필드의 크기를 제한해 저장소 폭주/DoS를 방지한다.
  const cap = (value: unknown, max: number): string | null =>
    typeof value === "string" ? value.slice(0, max) : null;

  // metadata(jsonb)는 직렬화 길이로 상한을 두고, 초과 시 버린다.
  let safeMetadata: unknown = null;
  if (metadata != null) {
    try {
      if (JSON.stringify(metadata).length <= 4000) {
        safeMetadata = metadata;
      }
    } catch {
      safeMetadata = null;
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("error_logs")
    .insert({
      user_id: user.id,
      conversion_id: typeof conversion_id === "string" ? conversion_id : null,
      error_type: error_type.slice(0, 100),
      error_message: error_message.slice(0, 2000),
      stack_trace: cap(stack_trace, 10000),
      metadata: safeMetadata,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[logs:POST] insert failed", error);
    return NextResponse.json({ error: "로그 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ log_id: data.id });
}
