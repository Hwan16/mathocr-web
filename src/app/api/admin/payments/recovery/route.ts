import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId } from "@/lib/payments";

// 미지급 결제 조회·재지급 (관리자 전용) — LA-06 잔여 "승인 성공·지급 실패 복구".
//
// 미지급 판정: payment_events의 approved/grant_failed 이벤트 중, payments에
// pg_transaction_id=tid 행이 없는 것 (지급 성공 = grant_plan_credits가 payments
// 행을 만들므로 별도 상태 갱신 없이 자동으로 목록에서 빠진다).
//
// 재지급: 지급량·유효기간·금액은 승인 이벤트에 저장된 "승인 시점 플랜 스냅샷"
// (raw.plan_snapshot, 72.1 P1-3)에서 나온다 — 이후 플랜 구성이 바뀌어도 결제
// 당시 조건 그대로 복구된다. 스냅샷이 없는 과거 기록은 자동 재지급하지 않고
// 수동 충전으로 안내한다(현재 구성으로 오지급할 위험 차단). 대상 사용자는
// order_id에서 파싱하고(클라이언트가 보내는 건 tid뿐), tid 멱등이라 이미 지급된
// 주문은 중복 지급되지 않는다(duplicate_transaction → 이미 지급됨 응답).

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

type EventRow = {
  tid: string | null;
  order_id: string | null;
  amount: string | null;
  event_type: string;
  received_at: string;
  raw: unknown;
};

// 승인 시점 플랜 스냅샷 (payment-recovery.ts가 raw.plan_snapshot으로 저장).
// 숫자 필드가 하나라도 비정상이면 스냅샷 없음으로 취급한다(부분 신뢰 금지).
type PlanSnapshot = {
  plan_name: string;
  credits: number;
  validity_days: number;
  price: number;
};

function readSnapshot(raw: unknown): PlanSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = (raw as { plan_snapshot?: unknown }).plan_snapshot;
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  if (
    typeof o.credits !== "number" ||
    !Number.isInteger(o.credits) ||
    o.credits <= 0 ||
    typeof o.validity_days !== "number" ||
    !Number.isInteger(o.validity_days) ||
    o.validity_days <= 0 ||
    typeof o.price !== "number" ||
    o.price <= 0
  ) {
    return null;
  }
  return {
    plan_name: typeof o.plan_name === "string" ? o.plan_name : "(플랜명 없음)",
    credits: o.credits,
    validity_days: o.validity_days,
    price: o.price,
  };
}

function firstSnapshot(events: EventRow[]): PlanSnapshot | null {
  for (const ev of events) {
    const snap = readSnapshot(ev.raw);
    if (snap) return snap;
  }
  return null;
}

export async function GET() {
  const adminUser = await requireAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const admin = createAdminClient();
  // 최근 90일·최신순 — 해결된 이벤트가 쌓여도 조회 창이 오래된 것들로 채워져
  // 새 미지급 건을 놓치는 일이 없도록 한다. (미지급은 경보 메일로 즉시 처리되는
  // 성격이라 90일·500건 창을 벗어난 잔존 건은 현실적으로 없다)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await admin
    .from("payment_events")
    .select("tid, order_id, amount, event_type, received_at, raw")
    .in("event_type", ["approved", "grant_failed"])
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(500);

  if (error) {
    // payment_events 자체가 없는 환경(0020 미적용)은 조회 불가로 안내
    return NextResponse.json(
      { error: "조회 실패 — 0020 마이그레이션 적용 여부를 확인하세요.", detail: error.message },
      { status: 503 }
    );
  }

  // tid별로 묶는다 (approved·grant_failed가 같은 tid에 둘 다 있을 수 있음)
  const byTid = new Map<string, EventRow[]>();
  for (const ev of (events ?? []) as EventRow[]) {
    if (!ev.tid) continue;
    const list = byTid.get(ev.tid) ?? [];
    list.push(ev);
    byTid.set(ev.tid, list);
  }
  const tids = [...byTid.keys()];
  if (tids.length === 0) {
    return NextResponse.json({ pending: [], resolvedCount: 0 });
  }

  // 지급 완료 여부: payments.pg_transaction_id 존재
  const { data: paidRows, error: paidErr } = await admin
    .from("payments")
    .select("pg_transaction_id")
    .in("pg_transaction_id", tids);
  if (paidErr) {
    return NextResponse.json(
      { error: "지급 대조 실패", detail: paidErr.message },
      { status: 500 }
    );
  }
  const paidTids = new Set(
    (paidRows ?? []).map((r) => r.pg_transaction_id as string)
  );

  const pendingTids = tids.filter((t) => !paidTids.has(t));

  // 표시용 사용자 이메일 조회 (탈퇴 등으로 없으면 null)
  const userIds = new Set<string>();
  const pending = pendingTids.map((tid) => {
    const list = byTid.get(tid)!;
    const first = list.find((e) => e.order_id) ?? list[0];
    const firstSeen = list.reduce(
      (min, e) => (e.received_at < min ? e.received_at : min),
      list[0].received_at
    );
    const parsed = first.order_id ? parseOrderId(first.order_id) : null;
    if (parsed) userIds.add(parsed.userId);
    // 표시·지급 모두 스냅샷 우선 — 없으면 현재 플랜 구성은 "표시"에만 쓴다
    const snapshot = firstSnapshot(list);
    const manualReason = !parsed
      ? "주문번호 해석 불가"
      : !snapshot
        ? "승인 기록에 플랜 스냅샷 없음(도입 전 주문)"
        : null;
    return {
      tid,
      orderId: first.order_id,
      amount: first.amount,
      firstSeen,
      hasGrantFailed: list.some((e) => e.event_type === "grant_failed"),
      planId: parsed?.plan.id ?? null,
      planName: snapshot?.plan_name ?? parsed?.plan.name ?? null,
      credits: snapshot?.credits ?? parsed?.plan.credits ?? null,
      userId: parsed?.userId ?? null,
      userEmail: null as string | null,
      // 자동 재지급 가능 = 주문번호 파싱 가능 + 승인 시점 스냅샷 존재.
      // 불가 건은 나이스 콘솔·유저 관리 수동 충전으로 처리(manualReason 표시).
      recoverable: !!parsed && !!snapshot,
      manualReason,
    };
  });

  if (userIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", [...userIds]);
    const emailById = new Map(
      (profiles ?? []).map((p) => [p.id as string, p.email as string | null])
    );
    for (const p of pending) {
      if (p.userId) p.userEmail = emailById.get(p.userId) ?? null;
    }
  }

  return NextResponse.json({ pending, resolvedCount: paidTids.size });
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: { tid?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽을 수 없습니다." }, { status: 400 });
  }
  const tid = typeof body.tid === "string" ? body.tid.trim() : "";
  if (!tid) {
    return NextResponse.json({ error: "tid가 필요합니다." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 서버에 기록된 승인 이벤트가 있는 tid만 재지급 대상 — 임의 tid로 지급을
  // 만들어낼 수 없다.
  const { data: events, error: evErr } = await admin
    .from("payment_events")
    .select("tid, order_id, amount, event_type, received_at, raw")
    .eq("tid", tid)
    .in("event_type", ["approved", "grant_failed"])
    .limit(10);
  if (evErr) {
    return NextResponse.json({ error: "이벤트 조회 실패", detail: evErr.message }, { status: 500 });
  }
  const eventRows = (events ?? []) as EventRow[];
  const event = eventRows.find((e) => e.order_id) ?? null;
  if (!event || !event.order_id) {
    return NextResponse.json(
      { error: "해당 거래의 승인 기록이 없습니다." },
      { status: 404 }
    );
  }

  const parsed = parseOrderId(event.order_id);
  if (!parsed) {
    return NextResponse.json(
      { error: "주문번호를 해석할 수 없습니다 — 유저 관리에서 수동 충전으로 처리하세요." },
      { status: 422 }
    );
  }
  // 지급 근거는 승인 시점 스냅샷(72.1 P1-3) — 현재 플랜 구성은 쓰지 않는다.
  // 스냅샷 없는 과거 기록을 현재 구성으로 지급하면 결제 당시와 다른 지급이
  // 될 수 있으므로 자동 재지급을 멈추고 수동 판단으로 넘긴다.
  const snapshot = firstSnapshot(eventRows);
  if (!snapshot) {
    return NextResponse.json(
      {
        error:
          "승인 기록에 플랜 스냅샷이 없습니다(스냅샷 도입 전 주문) — 결제 당시 플랜을 확인해 유저 관리에서 수동 충전으로 처리하세요.",
      },
      { status: 409 }
    );
  }
  // 기록된 승인 금액과 스냅샷 가격이 다르면(기록 손상 등 비정상) 자동 재지급 중단.
  if (event.amount !== null && Number(event.amount) !== snapshot.price) {
    return NextResponse.json(
      {
        error: `승인 금액(${event.amount}원)과 스냅샷 가격(${snapshot.price}원)이 다릅니다 — 수동 충전으로 처리하세요.`,
      },
      { status: 409 }
    );
  }

  const { data, error } = await admin.rpc("grant_plan_credits", {
    p_user_id: parsed.userId,
    p_credits: snapshot.credits,
    p_validity_days: snapshot.validity_days,
    p_amount: snapshot.price,
    p_transaction_id: tid,
  });
  if (error) {
    return NextResponse.json(
      { error: "지급 실패: " + error.message },
      { status: 500 }
    );
  }
  const result = data as { success?: boolean; error?: string } | null;
  if (result?.error === "duplicate_transaction") {
    return NextResponse.json({ success: true, already: true });
  }
  if (result?.success !== true) {
    return NextResponse.json(
      { error: "지급 거부: " + JSON.stringify(result) },
      { status: 500 }
    );
  }

  // 감사 흔적: 누가 언제 복구했는지 (실패해도 지급 결과에는 영향 없음)
  try {
    await admin.from("payment_events").upsert(
      {
        event_key: `${tid}:recovered`,
        event_type: "recovered",
        tid,
        order_id: event.order_id,
        amount: event.amount,
        signature_valid: true,
        raw: { recovered_by: adminUser.id, source: "admin_recovery" },
      },
      { onConflict: "event_key", ignoreDuplicates: true }
    );
  } catch {
    // 감사 기록 실패는 무시 (지급은 이미 완료)
  }
  console.info("[admin/payments/recovery] 재지급 완료", {
    tid,
    order: event.order_id,
    by: adminUser.id,
  });

  return NextResponse.json({
    success: true,
    credits: snapshot.credits,
    planName: snapshot.plan_name,
  });
}
