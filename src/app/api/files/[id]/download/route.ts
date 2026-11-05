import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILE_BOX_BUCKET, filePath, isExpired, withDownloadName } from "@/lib/file-box";

// 내 파일함(D-054) — 받기. 본인 파일이고 만료 전이면 1분짜리 서명 URL(받을 이름 포함)을 준다.
// 화면은 이 URL로 바로 받거나(1개), 여러 개를 받아 브라우저에서 zip으로 묶는다.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    .select("file_name, expires_at, file_deleted_at, uploaded_at, deleted_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row || !row.uploaded_at || row.deleted_at) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  if (row.file_deleted_at || isExpired(row.expires_at)) {
    return NextResponse.json({ error: "보관 기간이 지난 파일입니다." }, { status: 410 });
  }
  const { data, error } = await admin.storage
    .from(FILE_BOX_BUCKET)
    .createSignedUrl(filePath(user.id, id), 60);
  if (error || !data) {
    console.error("[files:download] signed url failed", { user_id: user.id, error: error?.message });
    return NextResponse.json({ error: "파일을 받을 수 없습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ url: withDownloadName(data.signedUrl, row.file_name), file_name: row.file_name });
}
