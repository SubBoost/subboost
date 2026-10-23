import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), fetch: vi.fn(), limit: vi.fn() }));
vi.mock("@local/lib/api-auth", () => ({ withCurrentAdmin: mocks.admin }));
vi.mock("@local/lib/source-import", () => ({ fetchRuleContentDirect: mocks.fetch }));
vi.mock("@local/lib/rate-limit", () => ({ consumeLocalRateLimit: mocks.limit,
  localRateLimitResponse: () => Response.json({}, { status: 429 }) }));
const request = () => new Request("http://local.subboost.test/api/rules/detect", {
  method: "POST", body: JSON.stringify({ url: "https://local.subboost.test/rules" }),
});

describe("local rule detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockImplementation((handler) => handler({ id: "admin-1" }));
    mocks.limit.mockReturnValue({ allowed: true });
    mocks.fetch.mockResolvedValue({ ok: true, content: "example.test" });
  });
  it("requires admin identity and applies the limit before fetching", async () => {
    mocks.admin.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect((await POST(request())).status).toBe(401);
    mocks.limit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 60 });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledWith("rule-detection", "admin-1", expect.anything());
  });
  it("uses the guarded transport and hides its internal errors", async () => {
    expect(await (await POST(request())).json()).toMatchObject({ format: "text", behavior: "domain" });
    mocks.fetch.mockResolvedValueOnce({ ok: false, error: "private upstream details" });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("private");
  });
  it("rejects a transport success without a body", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true });
    expect((await POST(request())).status).toBe(422);
  });
});
