import { createAdminClient } from "@/lib/supabase/admin";

type CreditCheck =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * OCR 프록시 호출 전 크레딧 게이트.
 *
 * 크레딧 "차감"은 변환 시작 시 /api/credits 에서 원자적으로 이뤄진다.
 * 이 함수는 그와 별개로, 잔액이 0이거나 유효기간이 만료된 사용자가
 * OCR 프록시(/api/ocr/*)를 직접 호출해 Claude/Mathpix를 공짜로 쓰는 것을 막는다.
 * (차감은 그대로 두므로 이중 차감은 없다.)
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
    return { ok: false, status: 402, message: "크레딧이 부족합니다. 충전 후 다시 시도해주세요." };
  }

  return { ok: true };
}
