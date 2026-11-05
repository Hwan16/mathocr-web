import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";

// 내 파일함(D-054) — 자동 보관 켜기/끄기(기본 켜짐). 끄면 앱이 변환해도 서버에 올리지 않는다
// (이미 보관된 파일은 그대로 두고 만료일에 지운다). 앱의 '첫 변환 때 묻기' 답도 여기로 온다.

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let enabled: unknown;
  try {
    ({ enabled } = await request.json());
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled 값이 필요합니다." }, { status: 400 });
  }
  // 앱의 '첫 변환 때 묻기'에 대한 답이거나 웹 파일함의 켜기·끄기 — 어느 쪽이든 '정함'으로 남긴다
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ file_box_enabled: enabled, file_box_choice_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    console.error("[files:settings] update failed", { user_id: user.id, error: error.message });
    return NextResponse.json({ error: "설정을 바꾸지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ enabled });
}
