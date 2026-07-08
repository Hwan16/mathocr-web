// 결제 주문번호(orderId) 인코딩/디코딩 — 클라이언트·서버 공용 (비밀값 없음).
//
// 형식: mo_{planId}_{userIdHex32}_{suffix}
//  - 토스 orderId 규칙(영문 대소문자·숫자·`-`,`_`,`=`, 6~64자)을 지키면서,
//    승인 API·웹훅이 주문번호만 보고 "누구에게 어떤 플랜을" 지급할지 알 수 있게 한다.
//  - 금액은 orderId에 넣지 않는다: 서버가 planId → PLANS 가격으로 재계산해 검증하므로
//    클라이언트가 금액을 조작하면 토스 승인 단계에서 불일치로 거절된다.
import { PLANS } from "./plans";

export type Plan = (typeof PLANS)[number];

export function getPlan(planId: string): Plan | null {
  return PLANS.find((p) => p.id === planId) ?? null;
}

export function buildOrderId(planId: Plan["id"], userId: string): string {
  const hex = userId.replace(/-/g, "").toLowerCase();
  const suffix =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `mo_${planId}_${hex}_${suffix}`;
}

const ORDER_ID_RE = /^mo_([a-z0-9]+)_([0-9a-f]{32})_[a-z0-9]{6,20}$/;

export function parseOrderId(
  orderId: string
): { plan: Plan; userId: string } | null {
  const m = ORDER_ID_RE.exec(orderId);
  if (!m) return null;
  const plan = getPlan(m[1]);
  if (!plan) return null;
  const h = m[2];
  const userId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { plan, userId };
}
