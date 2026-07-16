import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { claimPendingPromo } from "@/lib/promo-claim";
import { claimPendingMarketingConsent } from "@/lib/marketing-consent";
import { CONSENT_VERSION } from "@/lib/consent";
import { DEFAULT_SIGNUP_PROMO } from "@/lib/promo";
import { NextRequest, NextResponse } from "next/server";

// IP당 가입 시도 제한 (B3 — 무료 크레딧 파밍 봇 방어의 1차 저지선).
// T3에서 Upstash Redis 기반으로 교체 — 서버리스 인스턴스가 바뀌어도 카운트가 유지된다.
// (Upstash 미설정 시 인스턴스 메모리 폴백)
const SIGNUP_IP_LIMIT = 5;
const SIGNUP_IP_WINDOW_MS = 60 * 60 * 1000; // 1시간

const DEFAULT_SIGNUP_CREDITS = 5;
const PROFILE_RETRY_DELAYS_MS = [100, 200, 400, 800, 1200];

type SignupBody = {
  email?: string;
  password?: string;
  promo_code?: string;
  agreed_terms?: boolean;
  agreed_privacy?: boolean;
  consent_version?: string;
  // 마케팅 수신 동의 (0013·LA-09) — 가입 화면의 순수 선택 체크박스(기본 해제).
  // 혜택 지급 조건이 아니며, true일 때만 동의 기록·프로필 갱신이 일어난다.
  marketing_opt_in?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function normalizePromoCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// 가입 출처(M4) UTM 값 정리 — 클라이언트 입력이므로 제어문자 제거·길이 제한.
// 빈 값은 null(= 직접 유입)로 기록한다.
function normalizeUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let cleaned = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) cleaned += ch; // 제어문자(비인쇄)는 버린다
  }
  cleaned = cleaned.trim().toLowerCase().slice(0, 100);
  return cleaned || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<boolean> {
  for (const delayMs of [0, ...PROFILE_RETRY_DELAYS_MS]) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (data?.id) {
      return true;
    }

    if (error) {
      console.warn("[signup] profile lookup failed before promo bonus", {
        user_id: userId,
        error: error.message,
      });
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(
    `signup:${clientIp ?? "unknown"}`,
    SIGNUP_IP_LIMIT,
    SIGNUP_IP_WINDOW_MS
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const {
    email,
    password,
    promo_code,
    agreed_terms,
    agreed_privacy,
    consent_version,
    marketing_opt_in,
    utm_source,
    utm_medium,
    utm_campaign,
  }: SignupBody = await request.json().catch(() => ({}));

  const marketingOptIn = marketing_opt_in === true;

  // 가입 출처(M4): source가 없으면 medium/campaign도 버린다(단독으로는 의미 없음)
  const utmSource = normalizeUtm(utm_source);
  const utmMedium = utmSource ? normalizeUtm(utm_medium) : null;
  const utmCampaign = utmSource ? normalizeUtm(utm_campaign) : null;

  if (!email || !password) {
    return NextResponse.json(
      { error: "이메일과 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "비밀번호는 6자 이상이어야 합니다." },
      { status: 400 }
    );
  }

  // 필수 동의(서비스 이용약관 · 개인정보 수집·이용)를 서버에서 강제한다.
  if (agreed_terms !== true || agreed_privacy !== true) {
    return NextResponse.json(
      { error: "서비스 이용약관 및 개인정보 수집·이용에 동의해야 합니다." },
      { status: 400 }
    );
  }

  // 동의 버전은 서버 상수로 기록한다. 클라이언트가 다른 값을 보내면 스테일
  // 클라이언트일 수 있으므로 경고만 남기고 무시한다.
  if (
    typeof consent_version === "string" &&
    consent_version.trim() &&
    consent_version.trim() !== CONSENT_VERSION
  ) {
    console.warn("[signup] consent version mismatch", {
      client: consent_version,
      server: CONSENT_VERSION,
    });
  }

  // 코드를 입력하지 않은 가입에도 기본 프로모션(얼리버드)을 무조건 적용한다
  // (2026-07-16 사용자 결정 — 가입 경로에 따라 혜택이 누락되던 사고 재발 방지).
  // 소진·비활성 코드는 인증 후 지급 단계(claimPendingPromo)에서 조용히
  // 걸러지므로 가입 자체는 영향받지 않는다. 종료 방법은 lib/promo.ts 참조.
  const normalizedPromoCode =
    normalizePromoCode(promo_code) || DEFAULT_SIGNUP_PROMO;

  // 계정 생성과 원자적으로 동의 도장을 user_metadata 에 남긴다.
  // (별도 user_consents 기록이 실패하더라도 '동의 없는 계정'은 생기지 않는다.)
  // 프로모션 코드는 여기서 지급하지 않고 pending 으로만 보관한다(LA-02) —
  // 실제 지급은 이메일 인증 후 첫 로그인 시점(claimPendingPromo)에 수행해,
  // 미인증 가입이 선착순 자리를 소진하지 못하게 한다.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // 이메일 인증(Confirm email)이 켜진 경우, 인증 링크 클릭 후 로그인
      // 페이지로 돌려보낸다. (Supabase Auth의 Redirect URLs 허용 목록에
      // 이 경로가 등록되어 있어야 한다.)
      emailRedirectTo: `${request.nextUrl.origin}/auth/login?confirmed=1`,
      data: {
        consent_version: CONSENT_VERSION,
        consent_terms: true,
        consent_privacy: true,
        consented_at: new Date().toISOString(),
        // 마케팅 수신 체크는 이메일 인증 전에는 pending 으로만 보관한다 (LA-09
        // 보강) — 실제 활성화(user_consents·profiles)는 인증 후 첫 로그인
        // 시점에 claimPendingMarketingConsent 가 수행한다. 타인 이메일 가입이
        // '동의자'로 기록되는 것을 막는다.
        ...(marketingOptIn ? { pending_marketing_opt_in: true } : {}),
        ...(normalizedPromoCode
          ? { pending_promo_code: normalizedPromoCode }
          : {}),
        // 가입 출처 원본 스탬프 — profiles 기록(아래)이 실패해도 백필할 수 있는 사본
        ...(utmSource
          ? {
              utm_source: utmSource,
              utm_medium: utmMedium,
              utm_campaign: utmCampaign,
            }
          : {}),
      },
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;
  let promoApplied = false;
  let promoBonusCredits = 0;

  // 프로필 생성(트리거) 이후에 (1) 동의 이력 기록, (2) 프로모션 보너스를 수행.
  if (userId) {
    try {
      const admin = createAdminClient();
      const profileReady = await waitForProfile(admin, userId);

      if (profileReady) {
        // (1) 동의 이력 기록 (append-only 감사 로그, 서버 버전으로 기록).
        // 원자적 도장은 위 signUp user_metadata 에 이미 남았으므로 이 기록 실패가
        // 가입을 막지는 않는다(추후 백필 가능). email 은 탈퇴(user_id=null) 후에도
        // '누가 동의했는지' 식별하기 위한 스냅샷이다.
        const userAgent = request.headers.get("user-agent");
        const { error: consentError } = await admin.from("user_consents").insert([
          { user_id: userId, email, doc_type: "terms", version: CONSENT_VERSION, agreed: true, ip: clientIp, user_agent: userAgent },
          { user_id: userId, email, doc_type: "privacy", version: CONSENT_VERSION, agreed: true, ip: clientIp, user_agent: userAgent },
        ]);
        if (consentError) {
          console.warn("[signup] consent record failed", {
            user_id: userId,
            error: consentError.message,
          });
        }

        // (1.2) 마케팅 수신 동의: 여기서는 기록하지 않는다 (LA-09 보강).
        // user_consents 감사 행·profiles.marketing_opt_in 은 이메일 인증 후
        // 첫 로그인 때 claimPendingMarketingConsent 가 기록한다 — 위 signUp
        // user_metadata 의 pending_marketing_opt_in 이 그때까지의 보관소다.

        // (1.5) 가입 출처(M4)를 프로필에 기록.
        // user_metadata에 사본이 있으므로 실패해도 가입은 막지 않는다.
        const profilePatch: Record<string, unknown> = {};
        if (utmSource) {
          profilePatch.utm_source = utmSource;
          profilePatch.utm_medium = utmMedium;
          profilePatch.utm_campaign = utmCampaign;
        }
        if (Object.keys(profilePatch).length > 0) {
          const { error: patchError } = await admin
            .from("profiles")
            .update(profilePatch)
            .eq("id", userId);
          if (patchError) {
            console.warn("[signup] profile attribution/opt-in record failed", {
              user_id: userId,
              error: patchError.message,
            });
          }
        }

        // (2) 프로모션·마케팅 동의: 이메일 인증(Confirm email)이 꺼진 환경에서는
        // 가입 즉시 세션과 함께 인증이 완료되므로 여기서 바로 처리한다. 인증이
        // 켜진 환경(현재 프로덕션)에서는 pending 으로 남고, 인증 후 첫 로그인 때
        // claim-pending / token / login 라우트가 처리한다.
        if (normalizedPromoCode && data.session && data.user) {
          const claim = await claimPendingPromo(data.user, clientIp);
          if (claim.applied) {
            promoApplied = true;
            promoBonusCredits = claim.credits_granted;
          }
        }
        if (marketingOptIn && data.session && data.user) {
          await claimPendingMarketingConsent(data.user, clientIp, userAgent);
        }
      } else {
        console.warn("[signup] profile was not ready after signup", {
          user_id: userId,
        });
      }
    } catch (postError) {
      console.warn("[signup] post-signup steps skipped", {
        user_id: userId,
        error:
          postError instanceof Error ? postError.message : String(postError),
      });
    }
  }

  // 이메일 인증(Confirm email)이 켜져 있으면 세션 없이 반환된다 →
  // 클라이언트는 "인증 메일을 확인하세요" 화면으로 분기한다.
  const needsConfirmation = !data.session;

  return NextResponse.json({
    user: { id: userId, email: data.user?.email },
    needs_confirmation: needsConfirmation,
    message: needsConfirmation
      ? "확인 메일을 보냈습니다. 메일의 인증 링크를 눌러 가입을 완료해주세요."
      : "회원가입이 완료되었습니다.",
    credits: DEFAULT_SIGNUP_CREDITS + promoBonusCredits,
    promo_applied: promoApplied,
    // 인증 후 지급 대기 중인 코드 존재 여부 — 가입 화면이 안내 문구에 사용.
    // Confirm email이 꺼진 환경에서 프로필 지연으로 즉시 지급을 건너뛴 경우에도
    // pending은 metadata에 남아 다음 로그인 때 지급되므로 true가 정확하다.
    promo_pending: !promoApplied && !!normalizedPromoCode,
  });
}
