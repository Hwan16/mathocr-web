import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILE_BOX_BUCKET, UPLOAD_URL_GRACE_MS, filePath, isExpired, previewImagePath } from "@/lib/file-box";

// 내 파일함(D-054)
//  GET    — 첫 문제 미리보기(+그림 서명 URL 5분). 만료된 파일은 미리보기도 없다.
//  DELETE — 파일·미리보기 그림을 지우고 목록 줄도 지운다(되돌릴 수 없음 — 화면에서 확인 창).

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownRow(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient()
    .from("stored_files")
    .select("id, preview, has_preview_image, expires_at, file_deleted_at, uploaded_at, deleted_at, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const row = await ownRow(id, user.id);
  if (!row || !row.uploaded_at || row.deleted_at) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  if (row.file_deleted_at || isExpired(row.expires_at)) {
    return NextResponse.json({ error: "보관 기간이 지난 파일입니다." }, { status: 410 });
  }

  let imageUrl: string | null = null;
  if (row.has_preview_image) {
    const { data } = await createAdminClient()
      .storage.from(FILE_BOX_BUCKET)
      .createSignedUrl(previewImagePath(user.id, id), 300);
    imageUrl = data?.signedUrl ?? null;
  }
  return NextResponse.json({ preview: row.preview, image_url: imageUrl });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const row = await ownRow(id, user.id);
  if (!row) {
    return NextResponse.json({ success: true }); // 이미 없음
  }

  const admin = createAdminClient();
  if (!row.file_deleted_at) {
    const { error: rmError } = await admin.storage
      .from(FILE_BOX_BUCKET)
      .remove([filePath(user.id, id), previewImagePath(user.id, id)]);
    if (rmError) {
      console.error("[files:DELETE] storage remove failed", { user_id: user.id, error: rmError.message });
      return NextResponse.json({ error: "파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
    }
  }
  // 서명 업로드 URL(2시간)이 아직 살아 있으면 그 URL로 파일이 다시 생길 수 있다 — 행을 지우지 않고
  // '지움'으로 표시해 목록에서만 빼 두고, cron 이 유효 시간이 지난 뒤 저장소를 한 번 더 지우고 행을 지운다.
  const recent = Date.now() - new Date(row.created_at).getTime() < UPLOAD_URL_GRACE_MS;
  const { error } = recent
    ? await admin
        .from("stored_files")
        .update({
          deleted_at: new Date().toISOString(),
          file_deleted_at: new Date().toISOString(),
          preview: null,
          has_preview_image: false,
          share_token: null,
        })
        .eq("id", id)
        .eq("user_id", user.id)
    : await admin.from("stored_files").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[files:DELETE] row delete failed", { user_id: user.id, error: error.message });
    return NextResponse.json({ error: "목록에서 지우지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
