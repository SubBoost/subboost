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

function login(password: string, ip?: string, forwarded?: string): Request {
  const request = new Request("http://local.subboost.test/api/auth/login", {
    method: "POST",
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    body: JSON.stringify({ username: "admin", password }),
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
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("isolates trusted clients even when another client targets the same username", async () => {
    for (let i = 0; i < 8; i += 1) expect((await POST(login("wrong", "203.0.113.1"))).status).toBe(401);
    expect((await POST(login("correct", "203.0.113.1"))).status).toBe(429);
    expect((await POST(login("correct", "203.0.113.2"))).status).toBe(200);
  });

  it("keeps an unknown client recovery opportunity while limiting guesses and ignoring untrusted headers", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 8; i += 1) expect((await POST(login("wrong", undefined, `203.0.113.${i}`))).status).toBe(401);
    expect((await POST(login("wrong", undefined, "203.0.113.100"))).status).toBe(401);
    const blocked = await POST(login("correct", undefined, "203.0.113.101"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("30");
    expect(mocks.compare).toHaveBeenCalledTimes(9);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await POST(login("correct"))).status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledTimes(10);
  });

  it("caps simultaneous unknown-client password work without queuing more checks", async () => {
    const releases: Array<(value: boolean) => void> = [];
    mocks.compare.mockImplementation(() => new Promise<boolean>((resolve) => releases.push(resolve)));
    const first = POST(login("wrong"));
    const second = POST(login("wrong"));
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect((await POST(login("wrong"))).status).toBe(429);
    expect(mocks.compare).toHaveBeenCalledTimes(2);
    releases.forEach((resolve) => resolve(false));
    expect((await first).status).toBe(401);
    expect((await second).status).toBe(401);
  });
});
