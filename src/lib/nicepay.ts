// 나이스페이 신결제(Server 승인) 서버 전용 헬퍼 — 서명 검증·승인 API.
//
// 신뢰 모델(토스 연동과 동일한 원칙):
//  - 금액은 클라이언트 값을 믿지 않고 orderId의 플랜에서 재계산해 승인 API에 보낸다.
//  - returnUrl·웹훅 페이로드는 시크릿 키 기반 signature 검증을 통과해야만 신뢰한다.
//  - 지급은 grant_plan_credits(멱등: tid가 거래 ID)라 return·웹훅이 중복 실행돼도
//    한 번만 지급된다.
//
// 샌드박스: 키가 S1_/S2_로 시작하면 테스트 상점이며, API 호출도
// sandbox-api.nicepay.co.kr 로 보내야 한다(NICEPAY_API_BASE로 지정).
import { createHash } from "crypto";

const API_BASE = process.env.NICEPAY_API_BASE ?? "https://api.nicepay.co.kr";

export function nicepayConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY &&
    !!process.env.NICEPAY_SECRET_KEY
  );
}

function keys(): { clientKey: string; secretKey: string } {
  const clientKey = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY;
  const secretKey = process.env.NICEPAY_SECRET_KEY;
  if (!clientKey || !secretKey) {
    throw new Error("nicepay keys not configured");
  }
  return { clientKey, secretKey };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// 결제창 인증 결과(returnUrl POST)의 위변조 검증
// signature = hex(sha256(authToken + clientId + amount + secretKey))
export function verifyAuthSignature(p: {
  authToken: string;
  amount: string;
  signature: string;
}): boolean {
  const { clientKey, secretKey } = keys();
  return (
    sha256Hex(p.authToken + clientKey + p.amount + secretKey) === p.signature
  );
}

// 웹훅 페이로드의 위변조 검증
// signature = hex(sha256(tid + amount + ediDate + secretKey))
export function verifyWebhookSignature(p: {
  tid: string;
  amount: string | number;
  ediDate: string;
  signature: string;
}): boolean {
  const { secretKey } = keys();
  return sha256Hex(`${p.tid}${p.amount}${p.ediDate}${secretKey}`) === p.signature;
}

export type NicePayment = {
  resultCode?: string;
  resultMsg?: string;
  status?: string;
  tid?: string;
  orderId?: string;
  amount?: number;
} | null;

// 결제 승인 — POST /v1/payments/{tid} (Basic 인증: base64(clientKey:secretKey))
export async function approvePayment(
  tid: string,
  amount: number
): Promise<NicePayment> {
  const { clientKey, secretKey } = keys();
  const res = await fetch(
    `${API_BASE}/v1/payments/${encodeURIComponent(tid)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientKey}:${secretKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount }),
      cache: "no-store",
    }
  );
  return (await res.json().catch(() => null)) as NicePayment;
}
