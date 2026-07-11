import { createAdminClient } from "@/lib/supabase/admin";

type CreditCheck =
  | { ok: true }
  | { ok: false; status: number; message: string };

// 선차감 직후 잔액이 0이 된 정상 변환을 허용하는 창.
// 대형 변환(문제 50+개)도 수십 분 안에 끝나므로 60분이면 충분하고,
// 크래시 등으로 finalize되지 못한 started 행이 영구 무료 통행증이 되는 것을 막는다.
const ACTIVE_CONVERSION_WINDOW_MS = 60 * 60 * 1000;

/**
 * OCR 프록시 호출 전 크레딧 게이트.
 *
 * 크레딧 "차감"은 변환 시작 시 /api/credits 에서 원자적으로 이뤄진다.
 * 이 함수는 그와 별개로, 잔액이 0이거나 유효기간이 만료된 사용자가
 * OCR 프록시(/api/ocr/*)를 직접 호출해 Claude/Mathpix를 공짜로 쓰는 것을 막는다.
 * (차감은 그대로 두므로 이중 차감은 없다.)
 *
 * 단, 변환 시작 시 전액을 선차감하므로 "잔액과 정확히 같은 수량"을 변환하면
 * OCR 호출 시점의 잔액이 정확히 0이다. 이 정상 경로를 막지 않기 위해,
 * 잔액이 0 이하라도 최근 60분 내 시작된(started) 변환이 있으면 통과시킨다 —
 * started 변환은 이미 크레딧을 지불한 상태라 무임 호출이 아니다.
 */
export async function ensureUsableCredits(userId: string): Promise<CreditCheck> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("credits, expires_at")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return { ok: false, status: 403, message: "프로필을 확인할 수 없습니다." };
  }

  if (profile.expires_at && new Date(profile.expires_at) < new Date()) {
    return { ok: false, status: 403, message: "이용 기간이 만료되었습니다. 충전 후 다시 시도해주세요." };
  }

  if ((profile.credits ?? 0) <= 0) {
    const since = new Date(Date.now() - ACTIVE_CONVERSION_WINDOW_MS).toISOString();
    const { data: active, error: activeError } = await admin
      .from("conversions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "started")
      .gte("created_at", since)
      .limit(1);

    if (activeError || !active || active.length === 0) {
      return { ok: false, status: 402, message: "크레딧이 부족합니다. 충전 후 다시 시도해주세요." };
    }
  }

  return { ok: true };
}
