// Rate limiter (T3) — Upstash Redis 기반 고정 윈도 카운터.
//
// Vercel 서버리스는 인스턴스가 수시로 교체되어 메모리 카운터가 리셋되므로,
// 카운트를 공유 저장소(Upstash Redis, REST API)에 둔다.
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 이 없거나 Redis 호출이
// 실패하면 기존 인스턴스 메모리 방식으로 폴백한다 — 제한이 느슨해질 뿐
// 서비스 요청 자체는 절대 막지 않는다(fail-open).

type RateLimitBucket = {
  count: number;
  windowStart: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

// ── 인스턴스 메모리 폴백 (기존 동작 그대로) ──

const globalRateLimit = globalThis as typeof globalThis & {
  __mathocrRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets = globalRateLimit.__mathocrRateLimitBuckets ?? new Map<string, RateLimitBucket>();
globalRateLimit.__mathocrRateLimitBuckets = buckets;

function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.windowStart)) / 1000));
    return { allowed: false, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

// ── Upstash Redis (REST) ──

// 제한 판정이 본 요청을 오래 붙잡지 않도록 짧은 타임아웃을 건다.
const REDIS_TIMEOUT_MS = 2000;

async function checkRateLimitRedis(
  url: string,
  token: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  // 고정 윈도: 키에 윈도 번호를 넣으면 원자적 INCR 하나로 판정이 끝난다.
  // (윈도가 바뀌면 키 자체가 바뀌므로 리셋 로직이 필요 없음. TTL은 청소용.)
  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${windowIndex}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs * 2)],
      ]),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[rate-limit] upstash http error", { status: res.status });
      return null;
    }

    const data: unknown = await res.json();
    const count = Array.isArray(data)
      ? Number((data[0] as { result?: unknown } | undefined)?.result)
      : NaN;
    if (!Number.isFinite(count)) {
      console.warn("[rate-limit] upstash unexpected response");
      return null;
    }

    if (count > limit) {
      const windowEnd = (windowIndex + 1) * windowMs;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
      };
    }
    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    console.warn("[rate-limit] upstash unreachable, falling back to memory", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 공개 API ──

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const result = await checkRateLimitRedis(url, token, key, limit, windowMs);
    if (result) {
      return result;
    }
  }

  return checkRateLimitMemory(key, limit, windowMs);
}
