import { createHash } from "node:crypto";
import { apiError } from "./http";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type LocalRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();

function cleanupExpiredBuckets(now: number): void {
  if (buckets.size < 1024) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function hashLocalRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function consumeLocalRateLimit(
  scope: string,
  key: string,
  options: { limit: number; windowMs: number; now?: number }
): LocalRateLimitResult {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  cleanupExpiredBuckets(now);

  const bucketKey = `${scope}:${key}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function resetLocalRateLimit(scope: string, key: string): void {
  buckets.delete(`${scope}:${key}`);
}

export function localRateLimitResponse(message: string, retryAfterSeconds: number): Response {
  const response = apiError(message, "RATE_LIMITED", 429);
  response.headers.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return response;
}

export function clearLocalRateLimitsForTests(): void {
  if (process.env.NODE_ENV === "test") buckets.clear();
}
