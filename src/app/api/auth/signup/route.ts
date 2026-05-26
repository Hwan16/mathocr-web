import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const PROMO_BONUS_CREDITS = 100;
const DEFAULT_SIGNUP_CREDITS = 5;
const PROFILE_RETRY_DELAYS_MS = [100, 200, 400, 800, 1200];

type SignupBody = {
  email?: string;
  password?: string;
  promo_code?: string;
};

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
  const { email, password, promo_code }: SignupBody = await request
    .json()
    .catch(() => ({}));

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;
  const normalizedPromoCode = normalizePromoCode(promo_code);
  const promoMatched =
    normalizedPromoCode.length > 0 &&
    promoCodesFromEnv().includes(normalizedPromoCode);
  let promoApplied = false;

  if (userId && promoMatched) {
    try {
      const admin = createAdminClient();
      const profileReady = await waitForProfile(admin, userId);

      if (profileReady) {
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
      } else {
        console.warn("[signup] profile was not ready for promo bonus", {
          user_id: userId,
        });
      }
    } catch (bonusError) {
      console.warn("[signup] promo bonus skipped after signup", {
        user_id: userId,
        error:
          bonusError instanceof Error ? bonusError.message : String(bonusError),
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
