import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeLocalRateLimit: vi.fn(),
  generateSubscriptionYaml: vi.fn(),
  getTrustedClientRateLimitKey: vi.fn(),
  hashLocalRateLimitKey: vi.fn(() => "token-hash"),
  localRateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "limited", code: "RATE_LIMITED" }), { status: 429 })
  ),
}));

vi.mock("@local/lib/rate-limit", () => ({
  consumeLocalRateLimit: mocks.consumeLocalRateLimit,
  getTrustedClientRateLimitKey: mocks.getTrustedClientRateLimitKey,
  hashLocalRateLimitKey: mocks.hashLocalRateLimitKey,
  localRateLimitResponse: mocks.localRateLimitResponse,
}));
vi.mock("@local/lib/subscription-service", () => ({
  generateSubscriptionYaml: mocks.generateSubscriptionYaml,
}));

import { GET } from "./route";

describe("local subscription YAML route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeLocalRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.getTrustedClientRateLimitKey.mockReturnValue("client-hash");
    mocks.generateSubscriptionYaml.mockResolvedValue({
      yaml: "mixed-port: 7890\n",
      name: "Test",
      subscriptionInfo: {},
      cacheExpirySeconds: 3600,
      autoUpdateIntervalSeconds: null,
      isAdmin: true,
    });
  });

  it("applies available client and per-token limits before generating YAML", async () => {
    const response = await GET(new Request("https://local.test/config.yaml"), {
      params: Promise.resolve({ id: "secret-token" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.hashLocalRateLimitKey).toHaveBeenCalledWith("secret-token");
    expect(mocks.consumeLocalRateLimit).toHaveBeenNthCalledWith(
      1,
      "subscription-yaml-client",
      "client-hash",
      { limit: 600, windowMs: 60_000 }
    );
    expect(mocks.consumeLocalRateLimit).toHaveBeenNthCalledWith(
      2,
      "subscription-yaml-token",
      "token-hash",
      { limit: 120, windowMs: 60_000 }
    );
    expect(mocks.generateSubscriptionYaml).toHaveBeenCalledWith("secret-token");
  });

  it("returns 429 before touching subscription data", async () => {
    mocks.consumeLocalRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 17 });

    const response = await GET(new Request("https://local.test/config.yaml"), {
      params: Promise.resolve({ id: "secret-token" }),
    });

    expect(response.status).toBe(429);
    expect(mocks.localRateLimitResponse).toHaveBeenCalledWith(
      "Too many subscription requests. Try again later.",
      17
    );
    expect(mocks.generateSubscriptionYaml).not.toHaveBeenCalled();
  });

  it("skips the client bucket when no trustworthy client key is available", async () => {
    mocks.getTrustedClientRateLimitKey.mockReturnValueOnce(null);

    const response = await GET(new Request("https://local.test/config.yaml"), {
      params: Promise.resolve({ id: "secret-token" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.consumeLocalRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.consumeLocalRateLimit).toHaveBeenCalledWith(
      "subscription-yaml-token",
      "token-hash",
      { limit: 120, windowMs: 60_000 }
    );
  });
});
