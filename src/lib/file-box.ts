// 내 파일함(D-054) — 서버 공용 규칙. 마이그레이션 0030_file_box.sql 과 짝.
//
// 보관: 결과 한글 파일만, 변환일(한국 날짜) + 30일째 23:59:59(KST)까지. 만료되면 cron이
// 파일·미리보기 그림을 지우고, 만료 30일 뒤에는 목록 줄(행)도 지운다.
// 미리보기: 변환 때 이미 인식한 첫 문제만(앱이 만든 블록 목록 + 그림이 있으면 작은 PNG).
import { randomBytes } from "node:crypto";
import type { Preview, PreviewBlock } from "./file-box-types";

export type { Preview, PreviewBlock };

export const FILE_BOX_BUCKET = "file-box";
export const KEEP_DAYS = 30;
export const LIST_GRACE_DAYS = 30; // 만료 뒤 목록에 남겨 두는 기간
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 버킷 file_size_limit 과 같게
export const MAX_PREVIEW_IMAGE_BYTES = 400 * 1024;
export const MAX_PREVIEW_JSON_CHARS = 64 * 1024;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 변환일(한국 날짜) + 30일째 23:59:59.999 KST 를 UTC 시각으로. 예: 10/06 변환 → 11/05 밤. */
export function computeExpiresAt(created: Date): Date {
  const kst = new Date(created.getTime() + KST_OFFSET_MS);
  const endKstAsUtc = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + KEEP_DAYS,
    23,
    59,
    59,
    999
  );
  return new Date(endKstAsUtc - KST_OFFSET_MS);
}

/** 만료 뒤 목록에서도 지우는 기준 시각(이보다 먼저 만료된 행을 지운다). */
export function listRemovalCutoff(now: Date): Date {
  return new Date(now.getTime() - LIST_GRACE_DAYS * DAY_MS);
}

export function isExpired(expiresAt: string | Date, now = new Date()): boolean {
  return new Date(expiresAt).getTime() < now.getTime();
}

/** 서명 업로드 URL 유효 시간(Supabase 고정 2시간) + 여유. 이 안에 지운 파일은 행을 남겨 cron 이 다시 지운다. */
export const UPLOAD_URL_GRACE_MS = 3 * 60 * 60 * 1000;

/** Storage remove 는 요청당 1,000개까지 — 나눠서 지우고 하나라도 실패하면 오류를 돌려준다. */
export async function removeInChunks(
  storage: { remove(paths: string[]): Promise<{ error: { message: string } | null }> },
  paths: string[]
): Promise<string | null> {
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await storage.remove(paths.slice(i, i + 1000));
    if (error) return error.message;
  }
  return null;
}

/** 서명 URL 에 받을 이름을 안전하게 붙인다(SDK 의 download 옵션은 이름을 인코딩하지 않아 &·# 에서 잘린다). */
export function withDownloadName(signedUrl: string, fileName: string): string {
  const u = new URL(signedUrl);
  u.searchParams.set("download", fileName);
  return u.toString();
}

/** 표가 아직 없음(0030 미적용) — 탈퇴 등에서 이 경우만 건너뛴다. */
export function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /stored_files/.test(err.message ?? "") && /exist|find/i.test(err.message ?? "");
}

export function filePath(userId: string, fileId: string): string {
  return `${userId}/${fileId}/file.hwp`;
}

export function previewImagePath(userId: string, fileId: string): string {
  return `${userId}/${fileId}/preview.png`;
}

/** 카톡 '받기 링크' 토큰 — 192비트 무작위, 주소에 바로 쓸 수 있는 문자만. */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isShareToken(raw: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(raw);
}

/** 받을 때 쓰는 파일 이름 — 경로·제어 문자를 빼고 길이를 줄이고 확장자를 보장한다. */
export function sanitizeFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let name = raw.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (!/\.hwpx?$/i.test(name)) name += ".hwp";
  if (name.length > 120) {
    const ext = name.match(/\.hwpx?$/i)?.[0] ?? ".hwp";
    name = name.slice(0, 120 - ext.length).trim() + ext;
  }
  return name;
}

export function toCount(raw: unknown, max = 10_000): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.min(Math.floor(raw), max)
    : 0;
}

// ── 첫 문제 미리보기 블록 ──
// 앱(src/file_box.py build_preview)이 만든다. 웹은 text 는 글자로, math 는 temml(MathML)로 그린다.
// 모양 정의는 브라우저와 함께 쓰는 file-box-types.ts 에 있다.
const MAX_NODES = 3000;
const MAX_TEXT = 4000;

/** 앱이 보낸 미리보기를 허용된 모양만 남겨 다시 만든다. 모양이 틀리면 null(미리보기 없음). */
export function sanitizePreview(raw: unknown): Preview | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    if (JSON.stringify(raw).length > MAX_PREVIEW_JSON_CHARS) return null;
  } catch {
    return null;
  }
  let nodes = 0;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : null);

  const blocks = (list: unknown, depth: number): PreviewBlock[] => {
    if (!Array.isArray(list) || depth > 3) return [];
    const out: PreviewBlock[] = [];
    for (const item of list) {
      if (++nodes > MAX_NODES) break;
      if (!item || typeof item !== "object") continue;
      const b = item as Record<string, unknown>;
      switch (b.t) {
        case "text": {
          const v = str(b.v);
          if (v !== null) out.push(b.b === true ? { t: "text", v, b: true } : { t: "text", v });
          break;
        }
        case "math":
        case "mathd":
        case "hwp": {
          const v = str(b.v);
          if (v) out.push({ t: b.t, v });
          break;
        }
        case "br":
        case "img":
          out.push({ t: b.t });
          break;
        case "box":
          out.push({
            t: "box",
            kind: b.kind === "bogi" ? "bogi" : "condition",
            items: blocks(b.items, depth + 1),
          });
          break;
        case "table": {
          const rows = Array.isArray(b.rows)
            ? b.rows.slice(0, 30).map((row) =>
                Array.isArray(row) ? row.slice(0, 12).map((cell) => blocks(cell, depth + 1)) : []
              )
            : [];
          out.push({ t: "table", rows });
          break;
        }
      }
    }
    return out;
  };

  const r = raw as Record<string, unknown>;
  const body = blocks(r.body, 0);
  if (body.length === 0) return null;
  const choices = Array.isArray(r.choices)
    ? r.choices.slice(0, 10).flatMap((c) => {
        if (!c || typeof c !== "object") return [];
        const cc = c as Record<string, unknown>;
        return [{ label: str(cc.label)?.slice(0, 8) ?? "", items: blocks(cc.items, 1) }];
      })
    : undefined;
  const answer = str(r.answer)?.slice(0, 200) ?? null;
  return {
    v: 1,
    number: toCount(r.number, 999),
    body,
    ...(choices && choices.length ? { choices } : {}),
    answer,
  };
}

/** base64 PNG 를 바이트로 — PNG 서명과 크기 상한을 확인한다. 아니면 null. */
export function decodePreviewPng(raw: unknown): Uint8Array | null {
  if (typeof raw !== "string" || raw.length > MAX_PREVIEW_IMAGE_BYTES * 1.4) return null;
  const buf = Buffer.from(raw, "base64");
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 8 || buf.length > MAX_PREVIEW_IMAGE_BYTES) return null;
  if (!sig.every((v, i) => buf[i] === v)) return null;
  return new Uint8Array(buf);
}

/** 요청자 IP (Vercel 이 x-forwarded-for 첫 값에 실제 접속 IP를 넣는다). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
