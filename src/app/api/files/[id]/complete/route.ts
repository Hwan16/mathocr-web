import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FILE_BOX_BUCKET,
  MAX_FILE_BYTES,
  decodePreviewPng,
  filePath,
  previewImagePath,
  sanitizePreview,
} from "@/lib/file-box";

// 내 파일함(D-054) — 앱이 서명 URL로 파일을 다 올린 뒤 부른다.
// 저장소에 파일이 실제로 있는지 확인하고, 첫 문제 미리보기(+그림)를 붙여 목록에 보이게 한다.
// 미리보기가 이상하면 미리보기 없이 보관만 한다(보관 자체는 막지 않음).

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "잘못된 파일입니다." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // 미리보기 없이 완료만 알릴 수도 있다
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("stored_files")
    .select("id, uploaded_at, expires_at, deleted_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row || row.deleted_at) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  if (row.uploaded_at) {
    return NextResponse.json({ success: true, expires_at: row.expires_at });
  }

  const storage = admin.storage.from(FILE_BOX_BUCKET);
  const { data: info } = await storage.info(filePath(user.id, id));
  let size = Number(info?.size ?? 0);
  if (!(size > 0)) {
    // info 가 크기를 주지 않는 저장소 버전 대비 — 폴더 목록의 메타데이터로 다시 확인
    const { data: listed } = await storage.list(`${user.id}/${id}`, { search: "file.hwp" });
    const meta = listed?.find((o) => o.name === "file.hwp")?.metadata as { size?: number } | undefined;
    size = Number(meta?.size ?? 0);
  }
  if (!(size > 0) || size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "올린 파일을 확인하지 못했습니다. 다시 올려 주세요." },
      { status: 409 }
    );
  }

  const preview = sanitizePreview(body.preview);
  let hasImage = false;
  const png = decodePreviewPng(body.preview_image);
  if (preview && png) {
    const { error: imgError } = await storage.upload(previewImagePath(user.id, id), png, {
      contentType: "image/png",
      upsert: true,
    });
    hasImage = !imgError;
    if (imgError) {
      console.error("[files:complete] preview image upload failed", {
        user_id: user.id,
        error: imgError.message,
      });
    }
  }

  const { error: updateError } = await admin
    .from("stored_files")
    .update({
      uploaded_at: new Date().toISOString(),
      size_bytes: size,
      preview,
      has_preview_image: hasImage,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("uploaded_at", null);
  if (updateError) {
    console.error("[files:complete] update failed", { user_id: user.id, error: updateError.message });
    return NextResponse.json({ error: "보관을 마치지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true, expires_at: row.expires_at });
}
