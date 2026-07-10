import { createHmac, timingSafeEqual } from "crypto";

// 마케팅 메일 수신거부 링크용 서명 토큰 (0014 얼리버드 메일).
// 메일 속 링크가 /api/unsubscribe?uid=<id>&token=<hmac> 형태로 나가는데,
// 토큰이 없으면 아무나 남의 uid로 수신거부를 시킬 수 있으므로 서버 비밀로 서명한다.
// 비밀은 CRON_SECRET 재사용 (서버 전용 값 — 추가 env 부담 없음).

export function unsubscribeToken(userId: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`unsubscribe:${userId}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId);
  if (!expected || !token || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
