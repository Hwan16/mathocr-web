import { createAdminClient } from "@/lib/supabase/admin";
import { CONSENT_VERSION } from "@/lib/consent";

// ── 인증 후 마케팅 수신 동의 활성화 (LA-09 보강, 2026-07-13) ──
//
// 가입 시 마케팅 수신에 체크해도 이메일 인증 전에는
// user_metadata.pending_marketing_opt_in=true 로만 보관하고,
// 인증을 마친 뒤 첫 로그인 시점에 이 헬퍼가 실제 활성화
// (profiles.marketing_opt_in + user_consents 감사 기록)를 수행한다.
// 타인 이메일로 가입만 해 둔 계정이 '동의자'로 기록되는 것을 막기 위함.
// (LA-02 claimPendingPromo 와 같은 구조·같은 호출 3지점)
//
// 호출 지점:
//  - /api/promo/claim-pending (웹 로그인 직후 클라이언트가 호출)
//  - /api/auth/token (데스크톱 앱 로그인)
//  - /api/auth/login (웹 로그인)
//  - /api/auth/signup (Confirm email 이 꺼진 환경 — 가입 즉시 세션·인증이 생기는 경우)
//
// 멱등성: pending 플래그가 지워지면 이후 호출은 no-op. profiles 갱신은 그
// 자체로 멱등이고, user_consents 는 append-only 감사 로그라 드문 재시도
// 중복 행은 허용한다(플래그 정리 실패 → 재로그인 경로, promo와 동일한 소지).

type ConsentUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export async function claimPendingMarketingConsent(
  user: ConsentUser,
  clientIp: string | null,
  userAgent: string | null
): Promise<{ activated: boolean }> {
  if (user.user_metadata?.pending_marketing_opt_in !== true) {
    return { activated: false };
  }

  // 서버가 신뢰할 수 있는 인증 시각으로만 자격을 판단한다 (promo-claim과 동일).
  if (!user.email_confirmed_at) {
    return { activated: false };
  }

  const admin = createAdminClient();

  // 이미 켜져 있으면(예: 마이페이지 토글로 먼저 동의) 감사 행을 중복 생성하지
  // 않고 pending 플래그만 정리한다.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("marketing_opt_in")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    // 일시 오류 — pending 을 유지해 다음 로그인 때 다시 시도한다.
    console.warn("[marketing-consent] profile lookup failed", {
      user_id: user.id,
      error: profileError.message,
    });
    return { activated: false };
  }

  let activated = false;
  if (profile && profile.marketing_opt_in !== true) {
    // (1) 감사 기록 — 활성화 시점(인증 후 로그인)의 ip/user_agent 로 남긴다.
    const { error: consentError } = await admin.from("user_consents").insert([
      {
        user_id: user.id,
        email: user.email ?? null,
        doc_type: "marketing",
        version: CONSENT_VERSION,
        agreed: true,
        ip: clientIp,
        user_agent: userAgent,
      },
    ]);
    if (consentError) {
      console.warn("[marketing-consent] consent record failed", {
        user_id: user.id,
        error: consentError.message,
      });
      return { activated: false }; // pending 유지 — 다음 로그인 때 재시도
    }

    // (2) 프로필 반영 — 이 시점부터 광고형 메일 대상이 된다.
    const { error: patchError } = await admin
      .from("profiles")
      .update({ marketing_opt_in: true })
      .eq("id", user.id);
    if (patchError) {
      console.warn("[marketing-consent] profile update failed", {
        user_id: user.id,
        error: patchError.message,
      });
      return { activated: false }; // pending 유지 — 감사 행은 남지만 opt_in 은 꺼진 상태
    }
    activated = true;
  }

  // (3) pending 플래그 정리 — 실패해도 다음 로그인 때 멱등하게 재처리된다.
  const existingMetadata = user.user_metadata ?? {};
  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...existingMetadata, pending_marketing_opt_in: null },
  });
  if (metadataError) {
    console.warn("[marketing-consent] metadata cleanup failed", {
      user_id: user.id,
      error: metadataError.message,
    });
  }

  if (activated) {
    console.info("[marketing-consent] activated after verification", {
      user_id: user.id,
    });
  }
  return { activated };
}
