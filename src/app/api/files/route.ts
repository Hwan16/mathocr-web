import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  FILE_BOX_BUCKET,
  MAX_FILE_BYTES,
  computeExpiresAt,
  filePath,
  isExpired,
  sanitizeFileName,
  toCount,
} from "@/lib/file-box";

// 내 파일함(D-054)
//  GET  — 내 보관 파일 목록(웹). 업로드가 끝난 것만, 최신순.
//  POST — 앱이 변환을 마친 뒤 보관을 시작한다: 행을 만들고 서명 업로드 URL을 준다.
//         앱은 그 URL로 파일을 직접 올린 뒤(Vercel 본문 4.5MB 제한을 피함)
//         POST /api/files/[id]/complete 로 끝을 알린다. 자동 보관이 꺼져 있으면 enabled:false.

export const dynamic = "force-dynamic";

const DAILY_UPLOAD_LIMIT = 300; // 하루 보관 시작 상한(오작동·남용 방지 — 정상 사용은 수십 건)
const LIST_LIMIT = 1000; // 화면 목록 상한(60일 치 — 넘으면 truncated 로 알린다)

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const admin = createAdminClient();
  // 전체 개수를 함께 받아 잘림을 판정한다 — Supabase 기본 반환 상한이 1,000개라
  // '1,001개 요청 후 길이 비교'로는 넘친 걸 알 수 없다(Codex 재검토 ⑥)
  const [{ data: rows, error, count }, { data: profile }] = await Promise.all([
    admin
      .from("stored_files")
      .select(
        "id, file_name, size_bytes, problem_count, solution_count, figure_count, created_at, expires_at, file_deleted_at",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .not("uploaded_at", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    admin.from("profiles").select("file_box_enabled").eq("id", user.id).maybeSingle(),
  ]);
  if (error) {
    console.error("[files:GET] list failed", { user_id: user.id, error: error.message });
    return NextResponse.json({ error: "파일 목록을 불러오지 못했습니다." }, { status: 500 });
  }
  const now = new Date();
  const list = rows ?? [];
  return NextResponse.json({
    enabled: profile?.file_box_enabled ?? true,
    truncated: (count ?? list.length) > list.length,
    files: list.map((r) => ({
      ...r,
      expired: Boolean(r.file_deleted_at) || isExpired(r.expires_at, now),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }

  const fileName = sanitizeFileName(body.file_name);
  const size = toCount(body.size_bytes, MAX_FILE_BYTES + 1);
  if (!fileName) {
    return NextResponse.json({ error: "파일 이름이 없습니다." }, { status: 400 });
  }
  if (size <= 0 || size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "보관할 수 있는 파일 크기(50MB)를 넘었습니다." },
      { status: 413 }
    );
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("file_box_enabled, file_box_choice_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    // 회원이 자동 보관을 꺼 두었을 수 있으니, 설정을 확인하지 못하면 올리지 않는다(앱은 실패로 안내)
    return NextResponse.json({ error: "보관 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
  if (profile.file_box_enabled === false) {
    return NextResponse.json({ enabled: false });
  }
  if (!profile.file_box_choice_at) {
    // 기존 회원 — 아직 보관 여부를 정하지 않았다. 앱이 완료 창에서 한 번 묻고
    // PATCH /api/files/settings 로 답을 남긴 뒤 다시 부른다(그 전에는 올리지 않는다).
    return NextResponse.json({ enabled: true, needs_choice: true });
  }

  const rl = await checkRateLimit(`file-box:${user.id}`, DAILY_UPLOAD_LIMIT, 24 * 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "오늘 보관할 수 있는 파일 수를 넘었습니다. 내일 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // 변환 이력과 잇기 — 내 변환일 때만(남의 ID를 붙이지 못하게)
  let conversionId: string | null = null;
  if (typeof body.conversion_id === "string" && /^[0-9a-f-]{36}$/i.test(body.conversion_id)) {
    const { data: conv } = await admin
      .from("conversions")
      .select("id")
      .eq("id", body.conversion_id)
      .eq("user_id", user.id)
      .maybeSingle();
    conversionId = conv?.id ?? null;
  }

  const id = randomUUID();
  const created = new Date();
  const path = filePath(user.id, id);
  const { data: signed, error: signError } = await admin.storage
    .from(FILE_BOX_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    console.error("[files:POST] signed upload url failed", {
      user_id: user.id,
      error: signError?.message,
    });
    return NextResponse.json({ error: "파일함에 올릴 준비를 하지 못했습니다." }, { status: 500 });
  }

  const expiresAt = computeExpiresAt(created);
  const { error: insertError } = await admin.from("stored_files").insert({
    id,
    user_id: user.id,
    conversion_id: conversionId,
    file_name: fileName,
    size_bytes: size,
    problem_count: toCount(body.problem_count),
    solution_count: toCount(body.solution_count),
    figure_count: toCount(body.figure_count),
    created_at: created.toISOString(),
    expires_at: expiresAt.toISOString(),
    app_version: typeof body.app_version === "string" ? body.app_version.slice(0, 32) : null,
  });
  if (insertError) {
    console.error("[files:POST] insert failed", { user_id: user.id, error: insertError.message });
    return NextResponse.json({ error: "파일함에 올릴 준비를 하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    enabled: true,
    id,
    upload_url: signed.signedUrl,
    expires_at: expiresAt.toISOString(),
  });
}
