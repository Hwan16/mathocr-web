// 서버 동작 플래그 (service_flags 테이블, 0020) — 현재는 결제 kill switch 전용.
//
// 결제 차단 판정 우선순위:
//  1) 서버 env PAYMENTS_KILL_SWITCH=true → 무조건 차단.
//     관리자 UI·DB가 불능일 때의 최후 수단 (변경에는 Vercel 재배포 필요).
//  2) service_flags.payments_disabled → 관리자 화면 토글로 즉시 반영.
//
// 플래그 조회 실패는 차단하지 않는다(fail-open): 스위치는 의도적 수동 차단용이고,
// DB 장애 중엔 크레딧 지급(grant)도 어차피 실패해 피해가 제한된다. 일시적 DB
// 오류로 정상 결제까지 막지 않는 쪽을 택한다.
import { createAdminClient } from "@/lib/supabase/admin";

const PAYMENTS_FLAG_KEY = "payments_disabled";

export function isPaymentsKilledByEnv(): boolean {
  return process.env.PAYMENTS_KILL_SWITCH === "true";
}

/** DB 플래그 조회. 미적용(0020)·오류 시 null. */
export async function getPaymentsDisabledFlag(): Promise<boolean | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("service_flags")
      .select("value")
      .eq("key", PAYMENTS_FLAG_KEY)
      .maybeSingle();
    if (error) {
      console.error("[service-flags] payments_disabled 조회 실패", error.message);
      return null;
    }
    return data?.value === true;
  } catch (error) {
    console.error(
      "[service-flags] payments_disabled 조회 예외",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/** 결제 승인 라우트가 호출하는 최종 판정. */
export async function isPaymentsKilled(): Promise<boolean> {
  if (isPaymentsKilledByEnv()) return true;
  return (await getPaymentsDisabledFlag()) === true;
}

/** 관리자 토글 — 성공 여부 반환 (0020 미적용이면 false). */
export async function setPaymentsDisabled(
  disabled: boolean,
  adminId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("service_flags").upsert({
    key: PAYMENTS_FLAG_KEY,
    value: disabled,
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  });
  if (error) {
    console.error("[service-flags] payments_disabled 변경 실패", error.message);
    return false;
  }
  console.error(
    `[service-flags] 결제 kill switch ${disabled ? "활성화(차단)" : "해제(허용)"} — admin=${adminId}`
  );
  return true;
}
