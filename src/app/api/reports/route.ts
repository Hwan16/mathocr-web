import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// 변환 실패/오변환 신고 접수 (웹 로그인 사용자).
// 이미지는 비공개 Storage 'reports' 버킷에 service_role로 업로드하고,
// 신고 행에는 경로만 기록한다.

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 장당 2MB
// 전체 요청 상한. Vercel 서버리스 함수 본문 한도(약 4.5MB)에 맞춘다.
// (이미지 2MB×2 + 코멘트 + multipart 오버헤드가 이 안에 들어와야 한다.)
const MAX_REQUEST_BYTES = Math.floor(4.5 * 1024 * 1024);
const MAX_COMMENT = 2000;

type ImageExt = "png" | "jpg" | "webp";

const CONTENT_TYPE: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

// 실제 파일 시그니처(매직바이트)로 형식을 판별한다. 클라이언트가 보낸 MIME은
// 위조 가능하므로 신뢰하지 않고, 여기서 판별된 형식만 허용한다.
function sniffImageExt(buf: Buffer): ImageExt | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 거대한 본문을 formData()로 파싱하기 전에 전체 요청 크기를 선제한한다.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "이미지 용량이 너무 큽니다. 각 이미지를 2MB 이하로 줄여 다시 시도해주세요." },
      { status: 413 }
    );
  }

  // 사용자별 신고 빈도 제한 (스팸/저장소 폭주 방지): 10건 / 1시간
  const rl = checkRateLimit(`report:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `신고가 너무 잦습니다. 잠시 후 다시 시도해주세요. (${rl.retryAfter}초)` },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "요청을 읽을 수 없습니다." }, { status: 400 });
  }

  const comment = form.get("comment");
  const original = form.get("original");
  const converted = form.get("converted");

  if (typeof comment !== "string" || comment.trim().length === 0) {
    return NextResponse.json(
      { error: "어떤 부분이 잘못 변환됐는지 설명을 입력해주세요." },
      { status: 400 }
    );
  }
  if (comment.length > MAX_COMMENT) {
    return NextResponse.json(
      { error: `설명은 ${MAX_COMMENT}자 이하로 입력해주세요.` },
      { status: 400 }
    );
  }
  if (!(original instanceof File) || !(converted instanceof File)) {
    return NextResponse.json(
      { error: "원본 시험지와 변환 결과 이미지를 모두 첨부해주세요." },
      { status: 400 }
    );
  }

  const inputs: { label: string; field: "original" | "converted"; file: File }[] = [
    { label: "원본 시험지", field: "original", file: original },
    { label: "변환 결과", field: "converted", file: converted },
  ];

  // 크기 + 매직바이트 검증 후 업로드용 버퍼를 준비한다.
  const prepared: { field: string; buffer: Buffer; ext: ImageExt }[] = [];
  for (const { label, field, file } of inputs) {
    if (file.size === 0) {
      return NextResponse.json({ error: `${label} 이미지가 비어 있습니다.` }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: `${label} 이미지는 2MB 이하만 첨부할 수 있습니다.` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = sniffImageExt(buffer);
    if (!ext) {
      return NextResponse.json(
        { error: `${label}이(가) 올바른 이미지 파일이 아닙니다. (PNG / JPG / WEBP)` },
        { status: 400 }
      );
    }
    prepared.push({ field, buffer, ext });
  }

  const admin = createAdminClient();
  const reportId = randomUUID();
  const basePath = `${user.id}/${reportId}`;

  const uploaded: string[] = [];
  for (const { field, buffer, ext } of prepared) {
    const path = `${basePath}/${field}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("reports")
      .upload(path, buffer, {
        contentType: CONTENT_TYPE[ext],
        upsert: false,
        // 미지정 시 no-cache 로 저장되어 관리자 화면에서 볼 때마다 재다운로드된다.
        // 신고 이미지는 경로가 고유하고 내용이 바뀌지 않으므로 1시간 캐시 허용.
        cacheControl: "3600",
      });

    if (upErr) {
      console.error("[reports:POST] upload failed", upErr);
      if (uploaded.length > 0) await admin.storage.from("reports").remove(uploaded);
      return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
    }
    uploaded.push(path);
  }

  const { error: insErr } = await admin.from("conversion_reports").insert({
    id: reportId,
    user_id: user.id,
    comment: comment.trim(),
    original_image_path: uploaded[0],
    converted_image_path: uploaded[1],
  });

  if (insErr) {
    console.error("[reports:POST] insert failed", insErr);
    await admin.storage.from("reports").remove(uploaded);
    return NextResponse.json({ error: "신고 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true, report_id: reportId });
}
