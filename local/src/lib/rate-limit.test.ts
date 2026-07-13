import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalRateLimitsForTests,
  consumeLocalRateLimit,
  hashLocalRateLimitKey,
  localRateLimitResponse,
  resetLocalRateLimit,
} from "./rate-limit";

describe("local rate limits", () => {
  beforeEach(() => clearLocalRateLimitsForTests());

  it("blocks requests above a fixed-window limit and resets after expiry", () => {
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 1_000 }).allowed).toBe(true);
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 2_000 }).allowed).toBe(true);
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 3_000 })).toEqual({
      allowed: false,
      retryAfterSeconds: 8,
    });
    expect(consumeLocalRateLimit("login", "all", { limit: 2, windowMs: 10_000, now: 11_000 }).allowed).toBe(true);
  });

  it("hashes sensitive keys and supports clearing successful identity buckets", () => {
    const key = hashLocalRateLimitKey("secret-token");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("secret-token");
    consumeLocalRateLimit("token", key, { limit: 1, windowMs: 10_000, now: 1_000 });
    expect(consumeLocalRateLimit("token", key, { limit: 1, windowMs: 10_000, now: 2_000 }).allowed).toBe(false);
    resetLocalRateLimit("token", key);
    expect(consumeLocalRateLimit("token", key, { limit: 1, windowMs: 10_000, now: 2_000 }).allowed).toBe(true);
  });

  it("returns a structured 429 response with Retry-After", async () => {
    const response = localRateLimitResponse("slow down", 7);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    await expect(response.json()).resolves.toEqual({ error: "slow down", code: "RATE_LIMITED" });
  });
});
