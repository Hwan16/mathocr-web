import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, SIGNUP_FREE_CREDITS } from "@/lib/plans";

// 크레딧 지급 내역 — 기존 기록들을 하나의 타임라인으로 조립한다(별도 원장 테이블 없음).
//
// 출처:
//  - payments: 플랜 구매(amount>0) / 프로모션(promo_*) / 운영자 지급(admin_grant_*, grant_*)
//    ※ 프로모 상환은 redeem_promo_code가 payments에도 기록하므로(0013) payments가 지급 원장.
//  - profiles.created_at: 가입 무료 크레딧(상수 SIGNUP_FREE_CREDITS)
//  - profiles.expires_at: 유효기간 만료(현재 잔액 기준 합성 이벤트 — 과거 만료 이력은
//    별도 기록이 없어 다음 충전으로 잔액이 재설정되면 표시되지 않는다)
//
// 변환 사용/실패 반환(-)은 대시보드 "변환 이력" 표가 담당하므로 여기 포함하지 않는다.

type CreditEvent = {
  type: "purchase" | "promo" | "admin" | "signup" | "expiry";
  label: string;
  detail: string | null;
  delta: number; // 크레딧 증감(만료는 음수)
  refunded: boolean; // 결제 환불됨 표시
  at: string; // ISO 시각
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 관리자는 ?user_id= 로 특정 사용자의 내역 조회 가능 (CS 대응용)
  let targetId = user.id;
  const qUserId = request.nextUrl.searchParams.get("user_id");
  if (qUserId && qUserId !== user.id) {
    const { data: me } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (me?.role !== "admin") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    targetId = qUserId;
  }

  const [profileRes, paymentsRes, redemptionsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("credits, expires_at, created_at")
      .eq("id", targetId)
      .single(),
    admin
      .from("payments")
      .select("amount, credits_added, pg_transaction_id, status, created_at")
      .eq("user_id", targetId)
      .in("status", ["completed", "refunded"])
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("promo_redemptions")
      .select("promo_code_id, promo_codes(code)")
      .eq("user_id", targetId),
  ]);

  const profile = profileRes.data;
  if (!profile) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  // promo_code_id → 코드명 (payments의 promo_ 거래를 코드명으로 표시하기 위함)
  const codeById = new Map<string, string>();
  for (const r of redemptionsRes.data ?? []) {
    // 임베드된 promo_codes는 타입상 배열로 잡히지만 FK 1:1이라 런타임엔 단일 객체다.
    const pc = r.promo_codes as unknown as { code: string } | null;
    if (pc?.code) codeById.set(r.promo_code_id, pc.code);
  }

  const events: CreditEvent[] = [];

  for (const p of paymentsRes.data ?? []) {
    const tid = p.pg_transaction_id ?? "";
    const refunded = p.status === "refunded";
    if (tid.startsWith("promo_")) {
      // 형식: promo_{codeUuid}_{userUuid} — uuid에는 '_'가 없다
      const codeId = tid.slice("promo_".length).split("_")[0];
      const code = codeById.get(codeId);
      events.push({
        type: "promo",
        label: "프로모션 코드",
        detail: code ? code.toUpperCase() : null,
        delta: p.credits_added,
        refunded,
        at: p.created_at,
      });
    } else if (tid.startsWith("admin_grant_") || tid.startsWith("grant_")) {
      events.push({
        type: "admin",
        label: "운영자 지급",
        detail: null,
        delta: p.credits_added,
        refunded,
        at: p.created_at,
      });
    } else if (p.amount > 0) {
      const plan = PLANS.find(
        (pl) => pl.price === p.amount && pl.credits === p.credits_added
      );
      events.push({
        type: "purchase",
        label: plan ? `${plan.name} 플랜 구매` : "크레딧 구매",
        detail: `${p.amount.toLocaleString()}원`,
        delta: p.credits_added,
        refunded,
        at: p.created_at,
      });
    } else {
      events.push({
        type: "admin",
        label: "크레딧 지급",
        detail: null,
        delta: p.credits_added,
        refunded,
        at: p.created_at,
      });
    }
  }

  // 가입 무료 크레딧
  if (profile.created_at) {
    events.push({
      type: "signup",
      label: "가입 무료 크레딧",
      detail: null,
      delta: SIGNUP_FREE_CREDITS,
      refunded: false,
      at: profile.created_at,
    });
  }

  // 유효기간 만료 (현재 잔액 기준 합성)
  if (
    profile.expires_at &&
    new Date(profile.expires_at) < new Date() &&
    profile.credits > 0
  ) {
    events.push({
      type: "expiry",
      label: "유효기간 만료",
      detail: "잔여 크레딧 소멸",
      delta: -profile.credits,
      refunded: false,
      at: profile.expires_at,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return NextResponse.json({ events });
}
