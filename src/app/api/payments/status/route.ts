import { NextResponse } from "next/server";
import { isPaymentsKilled } from "@/lib/service-flags";

// 결제 가능 여부 (공개) — 충전 페이지가 결제창을 열기 전에 확인해,
// kill switch 활성 중엔 인증 절차를 밟기 전에 안내한다.
// 노출 정보는 "일시 중단 여부" 뿐 (기존 NEXT_PUBLIC_PAYMENTS_ENABLED와 동급).
export async function GET() {
  const paused = await isPaymentsKilled();
  return NextResponse.json(
    { paused },
    { headers: { "Cache-Control": "no-store" } }
  );
}
