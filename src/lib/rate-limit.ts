type RateLimitBucket = {
  count: number;
  windowStart: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  __mathocrRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets = globalRateLimit.__mathocrRateLimitBuckets ?? new Map<string, RateLimitBucket>();
globalRateLimit.__mathocrRateLimitBuckets = buckets;

export function checkRateLimit(
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
