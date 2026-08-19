import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { isDisposableEmail, emailDomain } from "@/lib/disposable-email";
import { isDottedGmail } from "@/lib/email";

// ── 가입 무료 크레딧: 이메일 인증 후 지급 (A-1, 2026-08-19) ──
//
// 가입 시점에는 profiles 가 0크레딧으로 생성되고(0027 handle_new_user),
// 이메일 인증을 마친 계정의 첫 로그인 시점에 이 헬퍼가 실제 지급을 수행한다.
// 가입 라우트의 방어 5종을 우회해 GoTrue 로 직접 만든 계정은 인증·로그인
// 경로를 거치지 않는 한 잔액 0으로 남는다.
//
// 멱등성: grant_signup_credits RPC 가 profiles.signup_credits_granted_at 을
// 조건부 UPDATE 로 검사·기록하므로, 동시 로그인·재호출이 겹쳐도 계정당
// 평생 1회만 지급된다.
//
// 호출 지점 (claimPendingPromo 와 동일):
//  - /api/promo/claim-pending (웹 로그인 직후 클라이언트가 호출)
//  - /api/auth/token (데스크톱 앱 로그인)
//  - /api/auth/login (웹 로그인 폴백 라우트)
//  - /api/auth/signup (Confirm email 이 꺼진 환경에서 가입 즉시 세션이 생기는 경우)
//
// 어떤 실패도 밖으로 던지지 않는다 — 지급 실패가 로그인을 막으면 안 되고,
// 0027 마이그레이션이 아직 적용되지 않은 배포 창에서는 RPC 가 없어 실패하는
// 것이 정상이다(그동안은 기존 트리거가 가입 시점에 지급).

type GrantUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

export type SignupCreditsResult = {
  granted: boolean;
  credits_granted: number;
};

export async function claimSignupCredits(
  user: GrantUser
): Promise<SignupCreditsResult> {
  const none: SignupCreditsResult = { granted: false, credits_granted: 0 };

  // 서버가 신뢰할 수 있는 인증 시각으로만 판단한다. 미인증 계정에는 지급하지
  // 않는다 — 이 게이트가 이 기능의 존재 이유다.
  if (!user.email_confirmed_at) {
    return none;
  }

  // 이미 지급된 계정이면 여기서 끝낸다. 이 함수는 /api/credits 를 통해
  // 변환·자동 인식 때마다 불리는 뜨거운 경로다. 이 조기 종료가 없으면
  //  ① 이미 지급받은 기존 회원에게 아래 이메일 검사가 매번 소급 적용돼
  //     차단 기록(blocked_signups)이 호출마다 쌓이고(집계 오염),
  //  ② 지급할 것이 없는데도 RPC 왕복이 매번 발생한다.
  // 검사·기록은 "실제로 지급 직전인 계정"에만 적용하는 것이 맞다.
  try {
    const { data: profile, error } = await createAdminClient()
      .from("profiles")
      .select("signup_credits_granted_at")
      .eq("id", user.id)
      .maybeSingle();
    // 조회 실패(0027 미적용 등)는 통과시킨다 — RPC 가 최종 판정한다(멱등).
    if (!error && profile?.signup_credits_granted_at) {
      return none;
    }
  } catch {
    // 조회 자체가 실패해도 지급을 막지 않는다 (RPC 가 계정당 1회를 보장)
  }

  // 가입 라우트의 이메일 방어를 지급 시점에 한 번 더 적용한다 (교차 리뷰 반영).
  // 일회용 메일함도 인증 메일은 받을 수 있으므로, GoTrue 직접 가입으로 라우트를
  // 우회한 뒤 인증·로그인까지 자동화하면 인증 게이트만으로는 못 막는다.
  // 여기서 같은 검사(일회용 도메인·+별칭·지메일 점)를 하면 그 경로도 잔액 0.
  // 정상 가입자는 라우트에서 이미 걸러졌으므로 여기 걸릴 일이 없고, 검사
  // 오류(예외)는 지급을 막지 않는다(fail-open — 정상 고객 보호 우선).
  try {
    const email = user.email ?? "";
    const plusAliasBlocked =
      process.env.ALLOW_PLUS_ALIAS_SIGNUP !== "true" &&
      email.split("@")[0]?.includes("+");
    if (email && (isDisposableEmail(email) || plusAliasBlocked || isDottedGmail(email))) {
      console.warn("[signup-credits] grant refused by email screen", {
        user_id: user.id,
        domain: emailDomain(email),
      });
      try {
        await createAdminClient()
          .from("blocked_signups")
          .insert({ reason: "grant_refused", email_domain: emailDomain(email), ip: null });
      } catch {
        // 기록 실패는 무시 (0027 미적용 등)
      }
      return none;
    }
  } catch (screenError) {
    console.warn("[signup-credits] email screen skipped", {
      user_id: user.id,
      error: screenError instanceof Error ? screenError.message : String(screenError),
    });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("grant_signup_credits", {
      p_user_id: user.id,
    });

    if (error) {
      // 0027 미적용(함수 없음)·일시 오류 — 다음 로그인 때 다시 시도된다.
      console.warn("[signup-credits] grant rpc failed", {
        user_id: user.id,
        error: error.message,
      });
      return none;
    }

    if (data?.success === true) {
      const granted =
        typeof data.credits_granted === "number"
          ? data.credits_granted
          : SIGNUP_FREE_CREDITS;
      console.info("[signup-credits] granted after verification", {
        user_id: user.id,
        credits: granted,
      });
      return { granted: true, credits_granted: granted };
    }

    // already_granted(정상 — 재로그인) / user_not_found(프로필 지연) 등
    return none;
  } catch (error) {
    console.warn("[signup-credits] grant skipped", {
      user_id: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return none;
  }
}
