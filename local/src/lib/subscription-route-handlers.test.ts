import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubscriptionResponse,
  deleteSubscriptionResponse,
  getSubscriptionIdFromQuery,
  getSubscriptionResponse,
  listSubscriptionsResponse,
  refreshSubscriptionResponse,
  updateSubscriptionResponse,
} from "./subscription-route-handlers";

const mocks = vi.hoisted(() => ({
  apiError: vi.fn(),
  createSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  getSubscription: vi.fn(),
  json: vi.fn(),
  listSubscriptions: vi.fn(),
  readJsonBody: vi.fn(),
  refreshSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  withCurrentAdmin: vi.fn(),
  withCurrentAdminAndCsrf: vi.fn(),
}));

vi.mock("@local/lib/api-auth", () => ({
  withCurrentAdmin: mocks.withCurrentAdmin,
  withCurrentAdminAndCsrf: mocks.withCurrentAdminAndCsrf,
}));
vi.mock("@local/lib/http", () => ({
  apiError: mocks.apiError,
  json: mocks.json,
  readJsonBody: mocks.readJsonBody,
}));
vi.mock("@local/lib/subscription-service", () => ({
  createSubscription: mocks.createSubscription,
  deleteSubscription: mocks.deleteSubscription,
  getSubscription: mocks.getSubscription,
  listSubscriptions: mocks.listSubscriptions,
  refreshSubscription: mocks.refreshSubscription,
  updateSubscription: mocks.updateSubscription,
}));

const request = new Request("http://localhost/api/subscriptions", { method: "POST" });

describe("local subscription route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withCurrentAdmin.mockImplementation(async (handler: (admin: { id: string }) => unknown) =>
      handler({ id: "admin-1" })
    );
    mocks.withCurrentAdminAndCsrf.mockImplementation(async (_request: Request, handler: (admin: { id: string }) => unknown) =>
      handler({ id: "admin-1" })
    );
    mocks.json.mockImplementation((body: unknown, status = 200) => ({ body, status }));
    mocks.apiError.mockImplementation((message: string, code: string, status: number) => ({ message, code, status }));
  });

  it("extracts subscription ids from query strings", () => {
    expect(getSubscriptionIdFromQuery(new Request("http://localhost/api/subscriptions?id=%20sub-1%20"))).toBe("sub-1");
    expect(getSubscriptionIdFromQuery(new Request("http://localhost/api/subscriptions"))).toBe("");
  });

  it("lists and reads subscriptions for the current admin", async () => {
    mocks.listSubscriptions.mockResolvedValueOnce([{ id: "sub-1" }]);
    await expect(listSubscriptionsResponse()).resolves.toEqual({ body: { subscriptions: [{ id: "sub-1" }] }, status: 200 });
    expect(mocks.listSubscriptions).toHaveBeenCalledWith("admin-1");

    mocks.getSubscription.mockResolvedValueOnce({ id: "sub-1" });
    await expect(getSubscriptionResponse("sub-1")).resolves.toEqual({ body: { subscription: { id: "sub-1" } }, status: 200 });

    mocks.getSubscription.mockResolvedValueOnce(null);
    await expect(getSubscriptionResponse("missing")).resolves.toEqual({
      message: "Subscription not found.",
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("creates subscriptions and reports bad input", async () => {
    mocks.readJsonBody.mockResolvedValueOnce(null);
    await expect(createSubscriptionResponse(request)).resolves.toEqual({
      message: "Invalid JSON body.",
      code: "BAD_REQUEST",
      status: 400,
    });

    mocks.readJsonBody.mockResolvedValueOnce({ name: "A" });
    mocks.createSubscription.mockResolvedValueOnce({ id: "sub-1" });
    await expect(createSubscriptionResponse(request)).resolves.toEqual({
      body: { subscription: { id: "sub-1" } },
      status: 201,
    });
    expect(mocks.createSubscription).toHaveBeenCalledWith("admin-1", { name: "A" });

    mocks.readJsonBody.mockResolvedValueOnce({ name: "" });
    mocks.createSubscription.mockRejectedValueOnce(new Error("Name required"));
    await expect(createSubscriptionResponse(request)).resolves.toEqual({
      message: "Name required",
      code: "BAD_REQUEST",
      status: 400,
    });

    mocks.readJsonBody.mockResolvedValueOnce({ name: "" });
    mocks.createSubscription.mockRejectedValueOnce("bad");
    await expect(createSubscriptionResponse(request)).resolves.toEqual({
      message: "Unable to create subscription.",
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("updates subscriptions and validates JSON body shape", async () => {
    mocks.readJsonBody.mockResolvedValueOnce([]);
    await expect(updateSubscriptionResponse(request, "sub-1")).resolves.toEqual({
      message: "Invalid JSON body.",
      code: "BAD_REQUEST",
      status: 400,
    });

    mocks.readJsonBody.mockResolvedValueOnce({ name: "B" });
    mocks.updateSubscription.mockResolvedValueOnce({ id: "sub-1", name: "B" });
    await expect(updateSubscriptionResponse(request, "sub-1")).resolves.toEqual({
      body: { subscription: { id: "sub-1", name: "B" } },
      status: 200,
    });

    mocks.readJsonBody.mockResolvedValueOnce({ name: "B" });
    mocks.updateSubscription.mockResolvedValueOnce(null);
    await expect(updateSubscriptionResponse(request, "missing")).resolves.toEqual({
      message: "Subscription not found.",
      code: "NOT_FOUND",
      status: 404,
    });

    mocks.readJsonBody.mockResolvedValueOnce({ name: "" });
    mocks.updateSubscription.mockRejectedValueOnce("bad");
    await expect(updateSubscriptionResponse(request, "sub-1")).resolves.toEqual({
      message: "Unable to update subscription.",
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("deletes and refreshes subscriptions", async () => {
    mocks.deleteSubscription.mockResolvedValueOnce(false);
    await expect(deleteSubscriptionResponse(request, "missing")).resolves.toEqual({
      message: "Subscription not found.",
      code: "NOT_FOUND",
      status: 404,
    });

    mocks.deleteSubscription.mockResolvedValueOnce(true);
    await expect(deleteSubscriptionResponse(request, "sub-1")).resolves.toEqual({ body: { success: true }, status: 200 });

    mocks.refreshSubscription.mockResolvedValueOnce(null);
    await expect(refreshSubscriptionResponse(request, "missing")).resolves.toEqual({
      message: "Subscription not found.",
      code: "NOT_FOUND",
      status: 404,
    });

    mocks.refreshSubscription.mockResolvedValueOnce({ ok: false, response: { body: { error: "bad" }, status: 502 } });
    await expect(refreshSubscriptionResponse(request, "sub-1")).resolves.toEqual({ body: { error: "bad" }, status: 502 });

    mocks.refreshSubscription.mockResolvedValueOnce({ ok: true, body: { nodeCount: 2 } });
    await expect(refreshSubscriptionResponse(request, "sub-1")).resolves.toEqual({ body: { nodeCount: 2 }, status: 200 });
  });
});
