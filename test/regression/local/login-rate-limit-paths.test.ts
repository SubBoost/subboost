import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bcryptCompare: vi.fn(),
  consumeLocalRateLimit: vi.fn(),
  getTrustedClientRateLimitKey: vi.fn(),
  hashLocalRateLimitKey: vi.fn((value: string) => `hash:${value}`),
  localRateLimitResponse: vi.fn((message: string, retryAfterSeconds: number) => new Response(
    JSON.stringify({ error: message, code: "RATE_LIMITED" }),
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Content-Type": "application/json" } },
  )),
  resetLocalRateLimit: vi.fn(),
  prisma: {
    localAdmin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  sessionCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/" })),
  signSession: vi.fn(async () => "signed-session"),
}));

vi.mock("bcryptjs", () => ({ default: { compare: mocks.bcryptCompare } }));
vi.mock("@local/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@local/lib/session", () => ({
  SESSION_COOKIE: "subboost-local-session",
  sessionCookieOptions: mocks.sessionCookieOptions,
  signSession: mocks.signSession,
}));
vi.mock("@local/lib/rate-limit", () => ({
  consumeLocalRateLimit: mocks.consumeLocalRateLimit,
  getTrustedClientRateLimitKey: mocks.getTrustedClientRateLimitKey,
  hashLocalRateLimitKey: mocks.hashLocalRateLimitKey,
  localRateLimitResponse: mocks.localRateLimitResponse,
  resetLocalRateLimit: mocks.resetLocalRateLimit,
}));

import { POST } from "../../../local/app/api/auth/login/route";

function loginRequest(body: unknown) {
  return new Request("http://local.subboost.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local login layered rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrustedClientRateLimitKey.mockReturnValue(null);
    mocks.consumeLocalRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.prisma.localAdmin.findUnique.mockResolvedValue(null);
  });

  it("stops before body parsing when the trusted client bucket is exhausted", async () => {
    mocks.getTrustedClientRateLimitKey.mockReturnValue("client-hash");
    mocks.consumeLocalRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 19 });

    const response = await POST(loginRequest({ username: "admin", password: "secret" }));

    expect(response.status).toBe(429);
    expect(mocks.consumeLocalRateLimit).toHaveBeenCalledWith(
      "auth-login-client",
      "client-hash",
      { limit: 30, windowMs: 15 * 60 * 1000 },
    );
    expect(mocks.hashLocalRateLimitKey).not.toHaveBeenCalled();
    expect(mocks.localRateLimitResponse).toHaveBeenCalledWith(
      "Too many login attempts. Try again later.",
      19,
    );
  });

  it("checks a client-specific username bucket after an allowed trusted-client attempt", async () => {
    mocks.getTrustedClientRateLimitKey.mockReturnValue("client-hash");
    mocks.consumeLocalRateLimit
      .mockReturnValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });

    const response = await POST(loginRequest({ username: "Admin", password: "secret" }));

    expect(response.status).toBe(429);
    expect(mocks.consumeLocalRateLimit).toHaveBeenNthCalledWith(
      2,
      "auth-login-client-username",
      "hash:client-hash:admin",
      { limit: 8, windowMs: 15 * 60 * 1000 },
    );
    expect(mocks.prisma.localAdmin.findUnique).not.toHaveBeenCalled();
  });

  it("skips lookup and rate-limit state for a missing username", async () => {
    const response = await POST(loginRequest({ username: "  ", password: "secret" }));

    expect(response.status).toBe(401);
    expect(mocks.consumeLocalRateLimit).not.toHaveBeenCalled();
    expect(mocks.prisma.localAdmin.findUnique).not.toHaveBeenCalled();
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });
});
