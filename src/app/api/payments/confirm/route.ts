import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";

// 결제 승인 — successUrl 리다이렉트 직후 브라우저가 호출한다.
//
// 보안 설계:
//  - 금액은 클라이언트 값을 믿지 않고 orderId의 플랜에서 재계산해 토스에 보낸다.
//    실제 결제 금액과 다르면 토스가 승인 자체를 거절한다.
//  - 지급은 grant_plan_credits(멱등: paymentKey가 거래 ID) — 웹훅과 중복 호출돼도
//    한 번만 지급된다(0009 unique 인덱스).
export async function POST(request: NextRequest) {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "결제 기능이 아직 열리지 않았습니다." },
      { status: 503 }
    );
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  let body: { paymentKey?: unknown; orderId?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 JSON을 읽을 수 없습니다." },
      { status: 400 }
    );
  }

  const { paymentKey, orderId, amount } = body;
  if (
    typeof paymentKey !== "string" ||
    !paymentKey ||
    typeof orderId !== "string" ||
    typeof amount !== "number"
  ) {
    return NextResponse.json(
      { error: "결제 정보가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const parsed = parseOrderId(orderId);
  if (!parsed) {
    return NextResponse.json(
      { error: "주문번호 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  if (parsed.userId !== user.id) {
    return NextResponse.json(
      { error: "본인의 주문만 승인할 수 있습니다." },
      { status: 403 }
    );
  }
  const { plan } = parsed;
  if (amount !== plan.price) {
    return NextResponse.json(
      { error: "결제 금액이 플랜 가격과 일치하지 않습니다." },
      { status: 400 }
    );
  }

  // 토스 결제 승인 (서버 간 호출, Basic 인증 = base64(시크릿키 + ':'))
  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount: plan.price }),
    cache: "no-store",
  });
  const payment = (await tossRes.json().catch(() => null)) as {
    status?: string;
    code?: string;
    message?: string;
  } | null;

  if (!tossRes.ok) {
    // ALREADY_PROCESSED_PAYMENT: 이미 승인된 결제 재승인 시도(새로고침 등) — 지급 단계로 진행해
    // 멱등 처리에 맡긴다. 그 외에는 토스 안내 메시지를 그대로 전달.
    if (payment?.code !== "ALREADY_PROCESSED_PAYMENT") {
      return NextResponse.json(
        {
          error: payment?.message ?? "결제 승인에 실패했습니다.",
          code: payment?.code,
        },
        { status: 400 }
      );
    }
  } else if (payment?.status !== "DONE") {
    return NextResponse.json(
      { error: `결제가 완료 상태가 아닙니다. (${payment?.status ?? "알 수 없음"})` },
      { status: 400 }
    );
  }

  // 크레딧 지급 (원자적 + 멱등)
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_plan_credits", {
    p_user_id: user.id,
    p_credits: plan.credits,
    p_validity_days: plan.validityDays,
    p_amount: plan.price,
    p_transaction_id: paymentKey,
  });

  if (error) {
    console.error("[payments/confirm] grant_plan_credits 실패:", error.message);
    return NextResponse.json(
      {
        error:
          "결제는 완료됐으나 크레딧 지급 처리 중 오류가 발생했습니다. 잠시 후 자동으로 재처리됩니다.",
      },
      { status: 500 }
    );
  }

  const result = data as {
    success?: boolean;
    error?: string;
    new_credits?: number;
    expires_at?: string;
  } | null;

  if (result?.success === false && result.error === "duplicate_transaction") {
    // 웹훅이 먼저 지급을 끝낸 경우 — 사용자에게는 정상 완료로 보여준다.
    const { data: profile } = await admin
      .from("profiles")
      .select("credits, expires_at")
      .eq("id", user.id)
      .single();
    return NextResponse.json({
      success: true,
      credits: profile?.credits,
      expires_at: profile?.expires_at,
    });
  }

  if (result?.success !== true) {
    console.error("[payments/confirm] 지급 결과 이상:", JSON.stringify(result));
    return NextResponse.json(
      { error: "크레딧 지급에 실패했습니다. 문의해주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    credits: result.new_credits,
    expires_at: result.expires_at,
  });
}
