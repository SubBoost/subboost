import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), reset: vi.fn() }));
vi.mock("@local/lib/api-auth", () => ({ withCurrentAdmin: mocks.admin }));
vi.mock("@local/lib/subscription-service", () => ({ resetSubscriptionLink: mocks.reset }));
const context = { params: Promise.resolve({ id: "sub-1" }) };
const request = (token = "a".repeat(43)) => new Request("http://local.subboost.test/api/subscriptions/sub-1/reset-link", {
  method: "POST", headers: { "If-Match": `"${token}"` },
});

describe("local reset subscription link route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockImplementation((handler) => handler({ id: "owner-1" }));
    mocks.reset.mockResolvedValue({ status: "updated", subscription: { id: "sub-1", token: "new" } });
  });

  it("authenticates before reading or rotating the link", async () => {
    mocks.admin.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect((await POST(request(), context)).status).toBe(401);
    expect((await POST(request("invalid"), context)).status).toBe(400);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it.each([["not_found", 404], ["stale", 409]])("reports %s without a new link", async (status, code) => {
    mocks.reset.mockResolvedValueOnce({ status });
    const response = await POST(request(), context);
    expect(response.status).toBe(code);
    expect(await response.json()).not.toHaveProperty("subscription");
  });

  it("returns a non-cacheable link for the authenticated owner", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.reset).toHaveBeenCalledWith("owner-1", "sub-1", "a".repeat(43));
  });

  it("rejects missing preconditions and invalid subscription IDs without rotating", async () => {
    const missing = new Request("http://local.subboost.test/api/subscriptions/sub-1/reset-link", { method: "POST" });
    expect((await POST(missing, context)).status).toBe(400);
    for (const id of ["", "x".repeat(129)]) {
      expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(400);
    }
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
