import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailAlias } from "@/lib/email";

// ── 인증 후 프로모션 지급 (LA-02, 2026-07-12) ──
//
// 가입 시에는 코드를 user_metadata.pending_promo_code 에만 보관하고,
// 이메일 인증을 마친 뒤 첫 로그인 시점에 이 헬퍼가 실제 지급(redeem_promo_code RPC)을
// 수행한다. 인증하지 않은 가입이 선착순(max_uses) 자리를 소진하는 것을 막기 위함.
//
// 멱등성: redeem_promo_code 가 promo_codes 행 잠금(for update) + 계정당 1회 검사
// (already_redeemed)를 하므로, 동시 로그인·재호출이 겹쳐도 두 번 지급되지 않는다.
//
// 호출 지점:
//  - /api/promo/claim-pending (웹 로그인 직후 클라이언트가 호출)
//  - /api/auth/token (데스크톱 앱 로그인)
//  - /api/auth/signup (Confirm email 이 꺼진 환경에서 가입 즉시 세션이 생기는 경우)

export type PromoClaimResult = {
  applied: boolean;
  credits_granted: number;
  // RPC 오류 코드 (exhausted/already_redeemed 등). 적용 성공·대기 코드 없음이면 null.
  error: string | null;
};

// 이 오류들은 재시도해도 결과가 바뀌지 않으므로 pending 을 지운다.
// ip_limit(24시간 후 해제)과 일시 RPC 오류는 pending 을 남겨 다음 로그인 때 재시도한다.
const PERMANENT_ERRORS = new Set([
  "invalid_code",
  "inactive_code",
  "already_redeemed",
  "exhausted",
  "invalid_source",
]);

type ClaimUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export async function claimPendingPromo(
  user: ClaimUser,
  clientIp: string | null
): Promise<PromoClaimResult> {
  const none: PromoClaimResult = { applied: false, credits_granted: 0, error: null };

  const pending = user.user_metadata?.pending_promo_code;
  if (typeof pending !== "string" || !pending.trim()) {
    return none;
  }
  const code = pending.trim().toLowerCase();

  // 서버가 신뢰할 수 있는 인증 시각으로만 자격을 판단한다.
  // (Confirm email 이 켜져 있으면 미인증 계정은 로그인 자체가 안 되지만, 설정
  // 변경·경계 케이스에 대비해 이중으로 확인한다.)
  if (!user.email_confirmed_at) {
    return none;
  }

  const admin = createAdminClient();
  const { data, error: rpcError } = await admin.rpc("redeem_promo_code", {
    p_user_id: user.id,
    p_code: code,
    p_source: "signup",
    p_normalized_email: user.email ? normalizeEmailAlias(user.email) : null,
    p_ip: clientIp,
  });

  if (rpcError) {
    // 일시 오류 — pending 을 유지해 다음 로그인 때 다시 시도한다.
    console.warn("[promo-claim] redeem rpc failed", {
      user_id: user.id,
      error: rpcError.message,
    });
    return { applied: false, credits_granted: 0, error: "rpc_failed" };
  }

  const success = data?.success === true;
  let errorCode = typeof data?.error === "string" ? data.error : null;

  // already_redeemed는 두 경우가 섞여 있다: (a) 이 계정이 이미 받음 — 예:
  // 지난 지급 성공 후 metadata 정리만 실패하고 재로그인한 경우, (b) 별칭
  // 이메일 등 다른 계정이 받아서 차단. (a)를 실패로 기록하면 감사 기록이
  // 부정확하므로 본인 상환 이력을 확인해 구분한다 (Codex 리뷰 반영).
  let ownRedemption = false;
  if (!success && errorCode === "already_redeemed") {
    const { data: redemption } = await admin
      .from("promo_redemptions")
      .select("id, promo_codes!inner(code)")
      .eq("user_id", user.id)
      .eq("promo_codes.code", code)
      .maybeSingle();
    ownRedemption = !!redemption;
  }

  if (success || (errorCode && PERMANENT_ERRORS.has(errorCode))) {
    // 성공했거나 재시도 의미가 없는 실패 → pending 정리 (감사용 결과도 남긴다)
    const existingMetadata = user.user_metadata ?? {};
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...existingMetadata,
        pending_promo_code: null,
        ...(success || ownRedemption
          ? { promo_code: code }
          : { promo_pending_error: errorCode }),
      },
    });
    if (metadataError) {
      // 정리 실패 시 다음 로그인 때 한 번 더 시도된다 — already_redeemed 로
      // 멱등하게 걸러지므로 이중 지급은 없다.
      console.warn("[promo-claim] metadata cleanup failed", {
        user_id: user.id,
        error: metadataError.message,
      });
    }
  }

  if (success) {
    const granted =
      typeof data.credits_granted === "number" ? data.credits_granted : 0;
    console.info("[promo-claim] promo applied after verification", {
      user_id: user.id,
      code,
      credits: granted,
    });
    return { applied: true, credits_granted: granted, error: null };
  }

  return { applied: false, credits_granted: 0, error: errorCode ?? "unknown" };
}
