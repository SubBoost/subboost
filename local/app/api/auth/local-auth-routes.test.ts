import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInitialAdmin: vi.fn(),
  clearSessionCookieOptions: vi.fn(() => ({ maxAge: 0, path: "/" })),
  clearCsrfCookieOptions: vi.fn(() => ({ maxAge: 0, path: "/" })),
  csrfCookieOptions: vi.fn(() => ({ path: "/" })),
  createSession: vi.fn(async () => ({ token: "session-token", csrfToken: "csrf-token" })),
  getCurrentAdmin: vi.fn(),
  isSetupRequired: vi.fn(),
  listLocalUsers: vi.fn(),
  readCsrfToken: vi.fn(async () => "csrf-token"),
  prisma: {
    $queryRaw: vi.fn(),
    localTemplate: {
      count: vi.fn(),
    },
    subscription: {
      count: vi.fn(),
    },
  },
  sessionCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/" })),
  verifyLocalUser: vi.fn(),
  revokeSession: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock("@local/lib/local-user-service", () => ({
  createInitialAdmin: mocks.createInitialAdmin,
  listLocalUsers: mocks.listLocalUsers,
  verifyLocalUser: mocks.verifyLocalUser,
}));

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: mocks.getCurrentAdmin,
  isSetupRequired: mocks.isSetupRequired,
}));

vi.mock("@local/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@local/lib/session", () => ({
  clearSessionCookieOptions: mocks.clearSessionCookieOptions,
  clearCsrfCookieOptions: mocks.clearCsrfCookieOptions,
  createSession: mocks.createSession,
  CSRF_COOKIE: "subboost-local-csrf",
  csrfCookieOptions: mocks.csrfCookieOptions,
  SESSION_COOKIE: "subboost-local-session",
  readSession: mocks.readSession,
  readCsrfToken: mocks.readCsrfToken,
  revokeSession: mocks.revokeSession,
  sessionCookieOptions: mocks.sessionCookieOptions,
}));

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("local auth and health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in a valid local admin and sets the session cookie", async () => {
    const { POST } = await import("./login/route");
    mocks.verifyLocalUser.mockResolvedValueOnce({
      id: "admin-1",
      username: "admin",
    });

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
    expect(mocks.createSession).toHaveBeenCalledWith({ userId: "admin-1", username: "admin" });
    expect(response.headers.get("set-cookie")).toContain("subboost-local-session=session-token");
    expect(response.headers.get("set-cookie")).toContain("subboost-local-csrf=csrf-token");
  });

  it("rejects invalid JSON or invalid credentials", async () => {
    const { POST } = await import("./login/route");

    await expect(readJson(await POST(new Request("https://local.test/api/auth/login", { method: "POST", body: "{" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid JSON body.", code: "BAD_REQUEST" },
    });

    mocks.verifyLocalUser.mockResolvedValueOnce(null);
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
  });

  it("logs out by clearing the session cookie", async () => {
    const { POST } = await import("./logout/route");
    mocks.readSession.mockResolvedValueOnce({ sessionId: "sess-1", userId: "admin-1", username: "admin" });

    const response = await POST();

    expect(await readJson(response)).toEqual({ status: 200, body: { success: true } });
    expect(response.headers.get("set-cookie")).toContain("subboost-local-session=");
    expect(response.headers.get("set-cookie")).toContain("subboost-local-csrf=");
    expect(mocks.revokeSession).toHaveBeenCalledWith("sess-1");
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
    expect(payload).toEqual({ setupRequired: true, authenticated: false, csrfToken: "csrf-token", user: null });
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
