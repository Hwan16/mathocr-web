import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const PROMO_BONUS_CREDITS = 100;
const DEFAULT_SIGNUP_CREDITS = 5;
const PROFILE_RETRY_DELAYS_MS = [100, 200, 400, 800, 1200];
// 서버가 인정하는 현재 약관/개인정보 문서 버전(시행일). 동의 이력은 클라이언트
// 값이 아니라 반드시 이 서버 상수로 기록한다(감사 신뢰성).
const CONSENT_VERSION = "2026-07-03";

type SignupBody = {
  email?: string;
  password?: string;
  promo_code?: string;
  agreed_terms?: boolean;
  agreed_privacy?: boolean;
  consent_version?: string;
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

function promoCodesFromEnv(): string[] {
  return (process.env.PROMO_CODES ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
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
  const {
    email,
    password,
    promo_code,
    agreed_terms,
    agreed_privacy,
    consent_version,
  }: SignupBody = await request.json().catch(() => ({}));

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

  // 계정 생성과 원자적으로 동의 도장을 user_metadata 에 남긴다.
  // (별도 user_consents 기록이 실패하더라도 '동의 없는 계정'은 생기지 않는다.)
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        consent_version: CONSENT_VERSION,
        consent_terms: true,
        consent_privacy: true,
        consented_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;
  const normalizedPromoCode = normalizePromoCode(promo_code);
  const promoMatched =
    normalizedPromoCode.length > 0 &&
    promoCodesFromEnv().includes(normalizedPromoCode);
  let promoApplied = false;

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
        const clientIp = getClientIp(request);
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

        // (2) 프로모션 보너스
        if (promoMatched) {
          const { error: bonusError } = await admin.rpc("add_credits_raw", {
            p_user_id: userId,
            p_credits: PROMO_BONUS_CREDITS,
          });

          if (bonusError) {
            console.warn("[signup] promo bonus failed", {
              user_id: userId,
              error: bonusError.message,
            });
          } else {
            promoApplied = true;
            const existingMetadata = data.user?.user_metadata ?? {};
            const { error: metadataError } = await admin.auth.admin.updateUserById(
              userId,
              {
                user_metadata: {
                  ...existingMetadata,
                  promo_code: normalizedPromoCode,
                },
              }
            );

            if (metadataError) {
              console.warn("[signup] promo metadata update failed", {
                user_id: userId,
                error: metadataError.message,
              });
            }

            console.info("[signup] promo bonus applied", { user_id: userId });
          }
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

  return NextResponse.json({
    user: { id: userId, email: data.user?.email },
    message: "회원가입이 완료되었습니다.",
    credits: DEFAULT_SIGNUP_CREDITS + (promoApplied ? PROMO_BONUS_CREDITS : 0),
    promo_applied: promoApplied,
  });
}
