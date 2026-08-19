import { NextRequest, NextResponse } from "next/server";
import { checkSignupSurge } from "@/lib/signup-alert";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// 가입 급증 감시 cron — vercel.json이 10분마다 호출한다 (A-2, 2026-08-19).
//
// 배경: checkSignupSurge()는 원래 가입 라우트 안에서만 호출됐다. 가입 라우트를
// 우회해 GoTrue로 직접 계정을 만드는 공격(감사 A-1 경로)은 라우트를 지나지
// 않으므로, 정상 가입이 없는 새벽 시간대에는 경보가 영영 울리지 않았다.
// 감시를 라우트와 독립된 cron으로도 돌려 "막는 것"과 "아는 것"을 분리한다.
//
// checkSignupSurge 내부가 profiles 테이블 전체를 기준으로 세고(경로 무관),
// 경보는 1시간 1회로 자체 억제(claimAlertSlot)하므로 10분 주기로 불러도
// 메일이 중복 발송되지 않는다. 라우트 안의 기존 호출은 즉시성을 위해 유지.

export const dynamic = "force-dynamic";

// 차단 기록(blocked_signups) 보관 기간 — 오탐률 측정에는 몇 주면 충분하고,
// 회원이 아닌 사람의 IP를 무기한 들고 있을 이유가 없다. 하루 1회만 정리한다.
const BLOCKED_SIGNUP_RETENTION_DAYS = 90;

async function purgeOldBlockedSignups(): Promise<number | null> {
  // 하루 1슬롯만 통과 — checkRateLimit(limit=1)을 경보 억제와 같은 방식으로 재사용
  const { allowed } = await checkRateLimit(
    "blockedsignups:purge",
    1,
    24 * 60 * 60 * 1000
  );
  if (!allowed) return null;

  const cutoff = new Date(
    Date.now() - BLOCKED_SIGNUP_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await createAdminClient()
    .from("blocked_signups")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    // 0027 미적용 등 — 감시 자체는 계속되어야 한다
    console.warn("[signup-surge] 차단 기록 정리 실패", { error: error.message });
    return null;
  }
  return data?.length ?? 0;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await checkSignupSurge();

  let purged: number | null = null;
  try {
    purged = await purgeOldBlockedSignups();
  } catch (error) {
    console.warn("[signup-surge] 차단 기록 정리 예외", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ ok: true, purged });
}
