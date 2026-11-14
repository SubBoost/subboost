import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLocalRateLimitsForTests,
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
} from "../../../local/src/lib/rate-limit";

describe("local rate-limit maintenance behavior", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    clearLocalRateLimitsForTests();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    clearLocalRateLimitsForTests();
    vi.unstubAllEnvs();
  });

  it("removes expired buckets during the scheduled bulk cleanup", () => {
    for (let index = 0; index < 1_024; index += 1) {
      consumeLocalRateLimit("expired", String(index), {
        limit: 1,
        windowMs: 1_000,
        now: 0,
      });
    }

    expect(consumeLocalRateLimit("fresh", "request", {
      limit: 1,
      windowMs: 1_000,
      now: 1_000,
    })).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("fails closed at capacity even with malformed timing input", () => {
    for (let index = 0; index < 2_048; index += 1) {
      consumeLocalRateLimit("malformed", String(index), {
        limit: 1,
        windowMs: Number.NaN,
        now: 0,
      });
    }

    expect(consumeLocalRateLimit("malformed", "overflow", {
      limit: 1,
      windowMs: Number.NaN,
      now: 0,
    })).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("returns no client key when trusted proxy headers are enabled but absent", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    expect(getTrustedClientRateLimitKey(
      new Request("http://local.subboost.test/api/auth/login"),
    )).toBeNull();
  });

  it("does not expose the test-only clearing hook outside the test runtime", () => {
    consumeLocalRateLimit("preserved", "key", { limit: 1, windowMs: 10_000, now: 0 });
    vi.stubEnv("NODE_ENV", "production");

    clearLocalRateLimitsForTests();

    expect(consumeLocalRateLimit("preserved", "key", {
      limit: 1,
      windowMs: 10_000,
      now: 1,
    }).allowed).toBe(false);
  });
});
