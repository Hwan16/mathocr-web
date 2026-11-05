import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FILE_BOX_BUCKET,
  UPLOAD_URL_GRACE_MS,
  filePath,
  listRemovalCutoff,
  previewImagePath,
  removeInChunks,
} from "@/lib/file-box";

// 내 파일함 자동 정리(D-054) — vercel.json cron이 매시 20분에 호출한다
// (보관은 한국 시각 23:59에 끝나므로 0시 20분 실행이 그날 만료분을 지운다. 밀린 분은 다음 시간에).
//  1) 만료된 파일: 저장소의 파일·미리보기 그림을 지우고 file_deleted_at·미리보기·받기 링크를 비운다
//     (목록에는 회색 '만료됨' 줄로 남는다).
//  2) 만료 30일이 지난 줄: 남은 저장소를 지운 뒤 행을 지운다(목록에서 사라짐).
//  3) 하루가 지나도 업로드를 마치지 않은 행: 올라간 조각을 지우고 행도 지운다.
//  4) 회원이 지운 지 3시간(서명 업로드 URL 유효 시간 + 여유)이 지난 행: 그 사이 같은 URL로 다시
//     올라온 파일이 있을 수 있어 저장소를 한 번 더 지우고 행을 지운다.
//  5) 탈퇴 3시간 지난 회원(file_box_purges): 같은 이유로 그 회원 폴더를 한 번 더 비운다.
// 저장소 삭제가 실패한 묶음은 행을 그대로 두어 다음 실행에서 다시 시도한다(경로를 잃지 않게).
// 실행 결과는 응답 JSON과 Vercel 로그([file-box-cleanup])로 남는다.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 200;
const TIME_BUDGET_MS = 45_000; // 함수 상한(60초) 안에서 여러 묶음을 처리하고 남은 건 다음 실행에

type Row = { id: string; user_id: string };
const pathsOf = (rows: Row[]) =>
  rows.flatMap((r) => [filePath(r.user_id, r.id), previewImagePath(r.user_id, r.id)]);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const storage = admin.storage.from(FILE_BOX_BUCKET);
  const started = Date.now();
  const now = new Date();
  const nowIso = now.toISOString();
  const result = { expired: 0, rowsRemoved: 0, staleUploads: 0, deletedRows: 0, purgedAccounts: 0, failed: 0, more: false };
  const timeLeft = () => Date.now() - started < TIME_BUDGET_MS;

  /** 저장소를 먼저 지우고, 성공한 묶음만 행 처리(onRemoved)한다. 처리한 수, 실패면 -1. */
  async function sweep(label: string, rows: Row[], onRemoved: (ids: string[]) => Promise<{ error: { message: string } | null }>) {
    const rmError = await removeInChunks(storage, pathsOf(rows));
    if (rmError) {
      console.error(`[file-box-cleanup] ${label} 저장소 삭제 실패:`, rmError);
      result.failed += rows.length;
      return -1;
    }
    const { error } = await onRemoved(rows.map((r) => r.id));
    if (error) {
      console.error(`[file-box-cleanup] ${label} 행 처리 실패:`, error.message);
      result.failed += rows.length;
      return -1;
    }
    return rows.length;
  }

  // 각 단계는 묶음이 꽉 차는 동안 반복한다. 실패한 묶음이 나오면 그 단계는 다음 실행으로 넘긴다.
  async function loop(
    key: "expired" | "rowsRemoved" | "staleUploads" | "deletedRows",
    label: string,
    fetch: () => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    onRemoved: (ids: string[]) => Promise<{ error: { message: string } | null }>
  ) {
    while (timeLeft()) {
      const { data, error } = await fetch();
      if (error) {
        console.error(`[file-box-cleanup] ${label} 조회 실패:`, error.message);
        result.failed += 1;
        return;
      }
      const rows = data ?? [];
      if (rows.length === 0) return;
      const n = await sweep(label, rows, onRemoved);
      if (n < 0) return;
      result[key] += n;
      if (rows.length < BATCH) return;
    }
    result.more = true;
  }

  // 1) 만료된 파일
  await loop(
    "expired",
    "만료",
    () =>
      admin
        .from("stored_files")
        .select("id, user_id")
        .is("file_deleted_at", null)
        .not("uploaded_at", "is", null)
        .lt("expires_at", nowIso)
        .order("expires_at", { ascending: true })
        .limit(BATCH),
    async (ids) =>
      admin
        .from("stored_files")
        .update({ file_deleted_at: nowIso, preview: null, has_preview_image: false, share_token: null })
        .in("id", ids)
  );

  // 2) 만료 30일 지난 줄
  await loop(
    "rowsRemoved",
    "오래된 줄",
    () =>
      admin
        .from("stored_files")
        .select("id, user_id")
        .lt("expires_at", listRemovalCutoff(now).toISOString())
        .order("expires_at", { ascending: true })
        .limit(BATCH),
    async (ids) => admin.from("stored_files").delete().in("id", ids)
  );

  // 3) 업로드를 마치지 않은 지 하루 지난 행
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await loop(
    "staleUploads",
    "미완료",
    () =>
      admin
        .from("stored_files")
        .select("id, user_id")
        .is("uploaded_at", null)
        .lt("created_at", dayAgo)
        .order("created_at", { ascending: true })
        .limit(BATCH),
    async (ids) => admin.from("stored_files").delete().in("id", ids)
  );

  // 4) 회원이 지운 지 3시간 지난 행
  const graceAgo = new Date(now.getTime() - UPLOAD_URL_GRACE_MS).toISOString();
  await loop(
    "deletedRows",
    "지운 줄",
    () =>
      admin
        .from("stored_files")
        .select("id, user_id")
        .not("deleted_at", "is", null)
        .lt("deleted_at", graceAgo)
        .order("deleted_at", { ascending: true })
        .limit(BATCH),
    async (ids) => admin.from("stored_files").delete().in("id", ids)
  );

  // 5) 탈퇴 3시간 지난 회원 폴더 다시 비우기(탈퇴 직전 업로드 주소로 다시 생긴 파일)
  const { data: purges, error: e5 } = await admin
    .from("file_box_purges")
    .select("user_id")
    .lt("purge_after", nowIso)
    .limit(50);
  if (e5) {
    console.error("[file-box-cleanup] 탈퇴 정리 조회 실패:", e5.message);
  } else {
    for (const { user_id } of purges ?? []) {
      if (!timeLeft()) {
        result.more = true;
        break;
      }
      const { data: folders, error: listError } = await storage.list(user_id, { limit: 1000 });
      if (listError) {
        result.failed += 1;
        continue;
      }
      const paths = (folders ?? []).flatMap((f) => [filePath(user_id, f.name), previewImagePath(user_id, f.name)]);
      const rmError = await removeInChunks(storage, paths);
      if (rmError) {
        console.error("[file-box-cleanup] 탈퇴 폴더 삭제 실패:", rmError);
        result.failed += 1;
        continue;
      }
      // 1,000개가 꽉 찼으면 남은 게 있을 수 있어 행을 두고 다음 실행에서 이어 지운다
      if ((folders ?? []).length < 1000) {
        await admin.from("file_box_purges").delete().eq("user_id", user_id);
        result.purgedAccounts += 1;
      } else {
        result.more = true;
      }
    }
  }

  console.log("[file-box-cleanup]", JSON.stringify(result));
  return NextResponse.json(result);
}
