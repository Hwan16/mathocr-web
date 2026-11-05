import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { isExpired, newShareToken } from "@/lib/file-box";

// 내 파일함(D-054) — 카카오톡으로 보낼 '받기 링크'를 만든다(처음 한 번만 토큰 생성, 이후 같은 링크).
// 링크를 받은 사람은 로그인 없이 받을 수 있다. 파일이 만료되거나 지워지면 링크도 끊긴다.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "잘못된 파일입니다." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("stored_files")
    .select("file_name, problem_count, solution_count, expires_at, file_deleted_at, uploaded_at, deleted_at, share_token")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row || !row.uploaded_at || row.deleted_at) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  if (row.file_deleted_at || isExpired(row.expires_at)) {
    return NextResponse.json({ error: "보관 기간이 지난 파일은 보낼 수 없습니다." }, { status: 410 });
  }

  let token = row.share_token as string | null;
  if (!token) {
    token = newShareToken();
    const { error } = await admin
      .from("stored_files")
      .update({ share_token: token })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("share_token", null);
    if (error) {
      console.error("[files:share] token save failed", { user_id: user.id, error: error.message });
      return NextResponse.json({ error: "받기 링크를 만들지 못했습니다." }, { status: 500 });
    }
    // 동시에 두 번 눌러 다른 토큰이 먼저 저장됐을 수 있다 — 저장된 값을 다시 읽는다
    const { data: saved } = await admin.from("stored_files").select("share_token").eq("id", id).maybeSingle();
    token = (saved?.share_token as string | null) ?? token;
  }

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    url: `${origin}/s/${token}`,
    file_name: row.file_name,
    problem_count: row.problem_count,
    solution_count: row.solution_count,
    expires_at: row.expires_at,
  });
}
