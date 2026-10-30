import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalRateLimitsForTests } from "../../../local/src/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@local/lib/prisma", () => ({ prisma: { localAdmin: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock("@local/lib/session", () => ({
  SESSION_COOKIE: "session",
  sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
  signSession: async () => "signed",
}));
import { POST } from "../../../local/app/api/auth/login/route";

function login(password: string, ip?: string, forwarded?: string, signal?: AbortSignal): Request {
  const request = new Request("http://local.subboost.test/api/auth/login", {
    method: "POST",
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    body: JSON.stringify({ username: "admin", password }),
    signal,
  });
  return ip ? Object.assign(request, { ip }) : request;
}

describe("local login protection", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    clearLocalRateLimitsForTests();
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: "1", username: "admin", passwordHash: "hash" });
    mocks.update.mockResolvedValue({});
    mocks.compare.mockImplementation(async (password: string) => password === "correct");
  });
  afterEach(() => { clearLocalRateLimitsForTests(); vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("isolates trusted clients even when another client targets the same username", async () => {
    for (let i = 0; i < 8; i += 1) expect((await POST(login("wrong", "203.0.113.1"))).status).toBe(401);
    expect((await POST(login("correct", "203.0.113.1"))).status).toBe(429);
    expect((await POST(login("correct", "203.0.113.2"))).status).toBe(200);
  });

  it("admits a correct password behind repeated low-rate wrong attempts without trusting headers", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 8; i += 1) {
      const attempt = POST(login("wrong", undefined, `203.0.113.${i}`));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await attempt).status).toBe(401);
    }
    for (let round = 0; round < 3; round += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
      const bad = POST(login("wrong", undefined, "203.0.113.100"));
      await vi.advanceTimersByTimeAsync(0);
      expect((await bad).status).toBe(401);
      const malformed = await POST(new Request("http://local.subboost.test/api/auth/login", { method: "POST", body: "{" }));
      expect(malformed.status).toBe(400);
      const before = mocks.compare.mock.calls.length;
      const good = POST(login("correct", undefined, "203.0.113.101"));
      await vi.advanceTimersByTimeAsync(9_999);
      expect(mocks.compare).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect((await good).status).toBe(200);
      expect(mocks.compare).toHaveBeenCalledTimes(before + 1);
    }
  });

  it("bounds active password checks and queued requests under load", async () => {
    vi.useFakeTimers();
    const releases: Array<(value: boolean) => void> = [];
    mocks.compare.mockImplementation(() => new Promise<boolean>((resolve) => releases.push(resolve)));
    const first = POST(login("wrong"));
    await vi.advanceTimersByTimeAsync(0);
    const second = POST(login("wrong"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(releases).toHaveLength(2);
    const third = POST(login("wrong"));
    const fourth = POST(login("wrong"));
    await vi.advanceTimersByTimeAsync(0);
    const overflow = POST(login("wrong"));
    await vi.advanceTimersByTimeAsync(0);
    const response = await overflow;
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(await response.json()).toEqual({ error: "Too many login attempts. Try again later.", code: "RATE_LIMITED" });
    expect(mocks.compare).toHaveBeenCalledTimes(2);
    releases[0](false);
    releases[1](false);
    expect((await first).status).toBe(401);
    expect((await second).status).toBe(401);
    await vi.advanceTimersByTimeAsync(10_000);
    releases[2](false);
    expect((await third).status).toBe(401);
    await vi.advanceTimersByTimeAsync(10_000);
    releases[3](false);
    expect((await fourth).status).toBe(401);
  });

  it("does not spend verification capacity on malformed or empty bodies", async () => {
    for (let i = 0; i < 20; i += 1) {
      expect((await POST(new Request("http://local.subboost.test/api/auth/login", { method: "POST", body: "{" }))).status).toBe(400);
      expect((await POST(new Request("http://local.subboost.test/api/auth/login", { method: "POST", body: "{}" }))).status).toBe(401);
    }
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect((await POST(login("correct"))).status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledTimes(1);
  });

  it("continues serving queued requests when a password check throws", async () => {
    vi.useFakeTimers();
    mocks.compare.mockRejectedValueOnce(new Error("verification failed"));
    const failed = POST(login("wrong"));
    const failure = expect(failed).rejects.toThrow("verification failed");
    await vi.advanceTimersByTimeAsync(0);
    await failure;
    const next = POST(login("correct"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await next).status).toBe(200);
  });

  it("removes a disconnected request without consuming the next verification", async () => {
    vi.useFakeTimers();
    const first = POST(login("wrong"));
    await vi.advanceTimersByTimeAsync(0);
    expect((await first).status).toBe(401);
    const controller = new AbortController();
    const disconnected = POST(login("wrong", undefined, undefined, controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await disconnected).status).toBe(429);
    const next = POST(login("correct"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await next).status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledTimes(2);
  });
});
