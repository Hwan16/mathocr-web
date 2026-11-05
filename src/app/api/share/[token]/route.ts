import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { FILE_BOX_BUCKET, clientIp, filePath, isExpired, isShareToken, withDownloadName } from "@/lib/file-box";

// 카카오톡 '받기 링크'(D-054) — /s/<token> 화면의 [한글 파일 받기]가 여기로 온다.
// 로그인 없이 받는다. 만료·삭제된 파일이면 받기 화면으로 돌려보낸다(거기서 안내).
// 서명 URL은 1분짜리라 링크가 퍼져도 저장소 주소 자체는 곧 쓸 수 없게 된다.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = new URL(`/s/${encodeURIComponent(token)}`, request.nextUrl.origin);
  if (!isShareToken(token)) {
    return NextResponse.redirect(back, 303);
  }

  const rl = await checkRateLimit(`share-dl:${clientIp(request.headers)}`, 60, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("stored_files")
    .select("id, user_id, file_name, expires_at, file_deleted_at, uploaded_at, deleted_at")
    .eq("share_token", token)
    .maybeSingle();
  if (!row || !row.uploaded_at || row.deleted_at || row.file_deleted_at || isExpired(row.expires_at)) {
    return NextResponse.redirect(back, 303);
  }

  const { data, error } = await admin.storage
    .from(FILE_BOX_BUCKET)
    .createSignedUrl(filePath(row.user_id, row.id), 60);
  if (error || !data) {
    console.error("[share] signed url failed", { file_id: row.id, error: error?.message });
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.redirect(withDownloadName(data.signedUrl, row.file_name), 302);
}
