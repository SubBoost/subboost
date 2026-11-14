import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalRateLimitsForTests } from "@local/lib/rate-limit";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@local/lib/prisma", () => ({ prisma: { localAdmin: mocks } }));
vi.mock("@local/lib/session", () => ({
  SESSION_COOKIE: "session",
  sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
  signSession: async () => "signed",
}));
import { POST } from "./route";

function request(password: string): Request {
  return new Request("http://local.subboost.test/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password }),
  });
}

describe("unknown-client login with bcrypt", () => {
  afterEach(() => { clearLocalRateLimitsForTests(); vi.unstubAllEnvs(); });

  it("runs actual bcrypt checks while pacing a correct attempt after a wrong one", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    clearLocalRateLimitsForTests();
    const passwordHash = await bcrypt.hash("correct", 8);
    mocks.findUnique.mockResolvedValue({ id: "1", username: "admin", passwordHash });
    mocks.update.mockResolvedValue({});
    const start = performance.now();
    expect((await POST(request("wrong"))).status).toBe(401);
    expect((await POST(request("correct"))).status).toBe(200);
    expect(performance.now() - start).toBeGreaterThanOrEqual(9_000);
  }, 30_000);
});
