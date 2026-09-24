import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalRateLimitsForTests } from "@local/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  bcryptCompare: vi.fn(),
  cleanupExpiredSessionRevocations: vi.fn(async () => 0),
  clearSessionCookieOptions: vi.fn(() => ({ maxAge: 0, path: "/" })),
  getCurrentAdmin: vi.fn(),
  isSetupRequired: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    localAdmin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    localTemplate: {
      count: vi.fn(),
    },
    subscription: {
      count: vi.fn(),
    },
  },
  sessionCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/" })),
  revokeCurrentSession: vi.fn(async () => true),
  SessionRevocationStoreUnavailableError: class SessionRevocationStoreUnavailableError extends Error {},
  signSession: vi.fn(async () => "signed-session"),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: mocks.bcryptCompare },
}));

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: mocks.getCurrentAdmin,
  isSetupRequired: mocks.isSetupRequired,
}));

vi.mock("@local/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@local/lib/session", () => ({
  cleanupExpiredSessionRevocations: mocks.cleanupExpiredSessionRevocations,
  clearSessionCookieOptions: mocks.clearSessionCookieOptions,
  revokeCurrentSession: mocks.revokeCurrentSession,
  SessionRevocationStoreUnavailableError: mocks.SessionRevocationStoreUnavailableError,
  SESSION_COOKIE: "subboost-local-session",
  sessionCookieOptions: mocks.sessionCookieOptions,
  signSession: mocks.signSession,
}));

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("local auth and health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalRateLimitsForTests();
  });

  it("logs in a valid local admin and sets the session cookie", async () => {
    const { POST } = await import("./login/route");
    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce({
      id: "admin-1",
      username: "admin",
      passwordHash: "hash",
    });
    mocks.bcryptCompare.mockResolvedValueOnce(true);

    const response = await POST(
      new Request("https://local.test/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "secret" }),
      })
    );

    expect(await readJson(response)).toEqual({
      status: 200,
      body: { success: true, user: { id: "admin-1", username: "admin" } },
    });
    expect(mocks.prisma.localAdmin.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(mocks.signSession).toHaveBeenCalledWith({ adminId: "admin-1", username: "admin" });
    expect(response.headers.get("set-cookie")).toContain("subboost-local-session=signed-session");
  });

  it("rejects invalid JSON or invalid credentials", async () => {
    const { POST } = await import("./login/route");

    await expect(readJson(await POST(new Request("https://local.test/api/auth/login", { method: "POST", body: "{" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid JSON body.", code: "BAD_REQUEST" },
    });

    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce(null);
    await expect(
      readJson(
        await POST(
          new Request("https://local.test/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ username: "admin", password: "bad" }),
          })
        )
      )
    ).resolves.toEqual({
      status: 401,
      body: { error: "Invalid username or password.", code: "UNAUTHORIZED" },
    });

    await expect(readJson(await POST(new Request("https://local.test/api/auth/login", {
      method: "POST",
      headers: { "content-length": String(64 * 1024 + 1) },
      body: "{}",
    })))).resolves.toEqual({
      status: 413,
      body: { error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("persists logout revocation before clearing the session cookie", async () => {
    const { POST } = await import("./logout/route");

    const response = await POST();

    expect(await readJson(response)).toEqual({ status: 200, body: { success: true } });
    expect(mocks.revokeCurrentSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie")).toContain("subboost-local-session=");
  });

  it("does not clear the cookie or report success when revocation storage fails", async () => {
    const { POST } = await import("./logout/route");
    mocks.revokeCurrentSession.mockRejectedValueOnce(
      new mocks.SessionRevocationStoreUnavailableError("db down")
    );

    const response = await POST();

    expect(await readJson(response)).toEqual({
      status: 503,
      body: { error: "Session service unavailable.", code: "SESSION_STORE_UNAVAILABLE" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("preserves successful logout when expired-session cleanup fails", async () => {
    const { POST } = await import("./logout/route");
    const cause = new Error("cleanup unavailable");
    mocks.cleanupExpiredSessionRevocations.mockRejectedValueOnce(cause);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST();
      expect(await readJson(response)).toEqual({ status: 200, body: { success: true } });
      expect(response.headers.get("set-cookie")).toContain("subboost-local-session=");
      expect(log).toHaveBeenCalledWith("Local session revocation cleanup failed:", cause);
    } finally {
      log.mockRestore();
    }
  });

  it("propagates unexpected revocation errors without clearing the cookie", async () => {
    const { POST } = await import("./logout/route");
    const cause = new Error("unexpected failure");
    mocks.revokeCurrentSession.mockRejectedValueOnce(cause);
    await expect(POST()).rejects.toBe(cause);
    expect(mocks.clearSessionCookieOptions).not.toHaveBeenCalled();
    expect(mocks.cleanupExpiredSessionRevocations).not.toHaveBeenCalled();
  });

  it("returns the current admin snapshot and anonymous setup state", async () => {
    const { GET } = await import("./me/route");
    mocks.isSetupRequired.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.getCurrentAdmin.mockResolvedValueOnce({ id: "admin-1", username: "admin" }).mockResolvedValueOnce(null);
    mocks.prisma.subscription.count.mockResolvedValueOnce(2);
    mocks.prisma.localTemplate.count.mockResolvedValueOnce(3);

    let response = await GET();
    let payload = await response.json();
    expect(payload).toMatchObject({
      setupRequired: false,
      authenticated: true,
      user: {
        id: "admin-1",
        username: "admin",
        subscriptionCount: 2,
        templateCount: 3,
        quota: { maxSubscriptions: 9999 },
      },
    });

    response = await GET();
    payload = await response.json();
    expect(payload).toEqual({ setupRequired: true, authenticated: false, user: null });
  });

  it("reports live and ready health states", async () => {
    const live = await import("../health/live/route");
    const ready = await import("../health/ready/route");

    await expect(readJson(await live.GET())).resolves.toEqual({
      status: 200,
      body: { ok: true, service: "subboost-local" },
    });

    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]).mockRejectedValueOnce(new Error("db down"));
    await expect(readJson(await ready.GET())).resolves.toEqual({
      status: 200,
      body: { ok: true, database: "ready" },
    });
    await expect(readJson(await ready.GET())).resolves.toEqual({
      status: 503,
      body: { ok: false, database: "unavailable" },
    });
  });
});
