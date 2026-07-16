import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { clampInt } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user;
}

const SIGNED_URL_TTL = 60 * 60; // 서명 URL 유효시간: 1시간
// 같은 경로에는 같은 서명 URL을 재사용하는 창(45분). 매 요청마다 새 URL을 만들면
// 토큰이 달라져 브라우저 이미지 캐시가 무력화되어 탭을 열 때마다 전부 재다운로드된다.
// 45분 재사용 시 반환된 URL의 남은 유효시간은 최소 15분 보장.
const SIGNED_URL_REUSE_MS = 45 * 60 * 1000;

type SignedCacheEntry = { url: string; freshUntil: number };
const globalSignedCache = globalThis as typeof globalThis & {
  __mathocrReportSignedUrls?: Map<string, SignedCacheEntry>;
};
const signedUrlCache =
  globalSignedCache.__mathocrReportSignedUrls ?? new Map<string, SignedCacheEntry>();
globalSignedCache.__mathocrReportSignedUrls = signedUrlCache;

// 여러 경로의 서명 URL을 한 번의 스토리지 API 호출로 발급(createSignedUrls)하고
// 재사용 창 동안 캐시한다. (기존: 이미지마다 개별 호출 → 페이지당 최대 20회 왕복)
async function signedUrlsFor(
  adminClient: ReturnType<typeof createAdminClient>,
  paths: string[]
): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const misses: string[] = [];

  for (const path of paths) {
    const hit = signedUrlCache.get(path);
    if (hit && hit.freshUntil > now) {
      result.set(path, hit.url);
    } else if (!misses.includes(path)) {
      misses.push(path);
    }
  }

  if (misses.length > 0) {
    const { data, error } = await adminClient.storage
      .from("reports")
      .createSignedUrls(misses, SIGNED_URL_TTL);

    if (error) {
      console.error("[admin/reports:GET] createSignedUrls failed", error);
    }

    if (signedUrlCache.size > 1000) signedUrlCache.clear();
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) {
        signedUrlCache.set(item.path, {
          url: item.signedUrl,
          freshUntil: now + SIGNED_URL_REUSE_MS,
        });
        result.set(item.path, item.signedUrl);
      }
    }
  }

  return result;
}

// 관리자: 변환 신고 목록 조회 (이미지 서명 URL 포함)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get("limit"), 20, 1, 100);
  const userId = searchParams.get("user_id");
  const status = searchParams.get("status");
  const offset = (page - 1) * limit;

  const adminClient = createAdminClient();
  let query = adminClient
    .from("conversion_reports")
    .select("*, profiles!inner(email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq("user_id", userId);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/reports:GET] query failed", error);
    return NextResponse.json({ error: "신고 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  // 비공개 버킷 이미지를 만료형 서명 URL로 변환해 내려준다 (일괄 발급 + 캐시).
  const paths = (data ?? [])
    .flatMap((r) => [r.original_image_path, r.converted_image_path])
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const urls = await signedUrlsFor(adminClient, paths);

  const reports = (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    email: r.profiles?.email ?? null,
    comment: r.comment,
    status: r.status,
    rewarded: r.rewarded,
    rewarded_at: r.rewarded_at,
    created_at: r.created_at,
    // 0019 미적용 환경에서는 컬럼이 없어 undefined → null
    images_deleted_at: r.images_deleted_at ?? null,
    original_url: r.original_image_path ? (urls.get(r.original_image_path) ?? null) : null,
    converted_url: r.converted_image_path ? (urls.get(r.converted_image_path) ?? null) : null,
  }));

  return NextResponse.json({ reports, total: count, page, limit });
}
