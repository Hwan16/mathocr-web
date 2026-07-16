import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPaymentsDisabledFlag,
  isPaymentsKilledByEnv,
  setPaymentsDisabled,
} from "@/lib/service-flags";
import { NextRequest, NextResponse } from "next/server";

// 결제 kill switch 조회/토글 (관리자 전용) — LA-06.
// 토글은 service_flags.payments_disabled를 바꾸며 재배포 없이 즉시 반영된다.
// env PAYMENTS_KILL_SWITCH=true 강제 차단 중에는 토글로 해제할 수 없다.

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const disabled = await getPaymentsDisabledFlag();
  if (disabled === null) {
    return NextResponse.json(
      { error: "migration_pending", detail: "0020 마이그레이션 적용 필요" },
      { status: 503 }
    );
  }
  return NextResponse.json({
    disabled,
    envForced: isPaymentsKilledByEnv(),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: { disabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }
  if (typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "disabled(boolean)가 필요합니다." }, { status: 400 });
  }

  if (isPaymentsKilledByEnv() && body.disabled === false) {
    return NextResponse.json(
      {
        error:
          "서버 환경변수(PAYMENTS_KILL_SWITCH)로 강제 차단 중입니다. 해제는 Vercel 환경변수에서 하세요.",
      },
      { status: 409 }
    );
  }

  const okSet = await setPaymentsDisabled(body.disabled, admin.id);
  if (!okSet) {
    return NextResponse.json(
      { error: "변경 실패 — 0020 마이그레이션 적용 여부를 확인하세요." },
      { status: 503 }
    );
  }
  return NextResponse.json({ success: true, disabled: body.disabled });
}
