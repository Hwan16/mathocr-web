import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 오류 로그 전송 (데스크톱 앱에서 호출)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  // 사용량 제한 (LA-10): 필드 크기 캡만으로는 건수 폭주(저장소 오염·관리자
  // 로그 화면 도배)를 못 막는다. 실제 오류 폭주 세션도 넉넉히 커버하는 수준.
  // 앱은 로그 전송 실패를 치명적으로 다루지 않으므로 429는 기록만 포기된다.
  const { allowed, retryAfter } = await checkRateLimit(
    `logs:${user.id}`,
    30,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "로그 전송이 너무 많습니다.", retry_after: retryAfter },
      { status: 429 }
    );
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

  // 소유권 검증 (LA-10): 남의 conversion_id를 붙여 관리자 화면에서 다른
  // 사용자의 변환에 가짜 오류가 달려 보이는 것을 막는다 — 본인 소유가
  // 아니면 로그 자체는 받되 연결만 끊는다(null).
  let ownedConversionId: string | null = null;
  if (typeof conversion_id === "string" && UUID_RE.test(conversion_id)) {
    const { data: conv } = await admin
      .from("conversions")
      .select("id")
      .eq("id", conversion_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (conv) ownedConversionId = conversion_id;
  }

  const { data, error } = await admin
    .from("error_logs")
    .insert({
      user_id: user.id,
      conversion_id: ownedConversionId,
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
