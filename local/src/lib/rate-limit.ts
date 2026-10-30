import { createHash } from "node:crypto";
import { apiError } from "./http";
import { clearUnknownLoginQueueForTests } from "./login-queue";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type LocalRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const scopes = new Map<string, Map<string, RateLimitBucket>>();
const CLEANUP_BATCH = 8;

function scopeCapacity(scope: string): number {
  if (scope === "auth-login-client") return 2_048;
  if (scope === "auth-login-client-username") return 4_096;
  if (scope.startsWith("subscription-yaml-")) return 10_000;
  return 2_048;
}

function cleanupExpiredBuckets(buckets: Map<string, RateLimitBucket>, now: number): void {
  const count = Math.min(CLEANUP_BATCH, buckets.size);
  for (let index = 0; index < count; index += 1) {
    const [key, bucket] = buckets.entries().next().value!;
    buckets.delete(key);
    if (bucket.resetAt > now) buckets.set(key, bucket);
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
  const now = Number.isFinite(options.now) ? options.now! : Date.now();
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : 1;
  const windowMs = Number.isFinite(options.windowMs) ? Math.max(1000, Math.floor(options.windowMs)) : 1000;
  let buckets = scopes.get(scope);
  if (!buckets) { buckets = new Map(); scopes.set(scope, buckets); }
  cleanupExpiredBuckets(buckets, now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    // Fail closed on saturation; active entries are never evicted by new identities.
    if (!current && buckets.size >= scopeCapacity(scope)) return { allowed: false, retryAfterSeconds: 1 };
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function getTrustedClientRateLimitKey(request: Request): string | null {
  const runtimeIp = (request as Request & { ip?: unknown }).ip;
  if (typeof runtimeIp === "string" && runtimeIp.trim()) {
    return hashLocalRateLimitKey(runtimeIp.trim());
  }
  if (process.env.TRUST_PROXY_HEADERS !== "true") return null;

  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || "";
  const normalized = forwarded.trim();
  return normalized ? hashLocalRateLimitKey(normalized) : null;
}

export function resetLocalRateLimit(scope: string, key: string): void {
  scopes.get(scope)?.delete(key);
}

export function localRateLimitResponse(message: string, retryAfterSeconds: number): Response {
  const response = apiError(message, "RATE_LIMITED", 429);
  response.headers.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return response;
}

export function clearLocalRateLimitsForTests(): void {
  if (process.env.NODE_ENV === "test") {
    scopes.clear();
    clearUnknownLoginQueueForTests();
  }
}
