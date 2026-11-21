import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  importSourceUrlDirect: vi.fn(),
  prisma: {
    localAdmin: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@local/lib/auth", () => ({ getCurrentAdmin: mocks.getCurrentAdmin }));
vi.mock("@local/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@local/lib/source-import", () => ({
  importSourceUrlDirect: mocks.importSourceUrlDirect,
}));

import { GET, PATCH } from "../../../local/app/api/settings/source-import/route";
import { POST } from "../../../local/app/api/source-import/route";

function request(pathname: string, body: unknown) {
  return new Request(`http://local.subboost.test${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local source-import route edge behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAdmin.mockResolvedValue({ id: "admin-1", username: "admin", role: "ADMIN", isAdmin: true });
    mocks.importSourceUrlDirect.mockResolvedValue({
      ok: true,
      content: "ss://node",
      headers: {},
      parsedNodes: [],
      parseErrors: [],
    });
  });

  it("returns the instance default when no administrator row exists", async () => {
    mocks.prisma.localAdmin.findFirst.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      allowUnsafeSubscriptionSources: false,
    });
  });

  it("rejects an array settings payload", async () => {
    const response = await PATCH(request("/api/settings/source-import", []));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();
  });

  it("normalizes non-string source fields to empty values", async () => {
    const response = await POST(request("/api/source-import", {
      url: 123,
      userinfoUrl: null,
      userinfoUserAgent: { name: "agent" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.importSourceUrlDirect).toHaveBeenCalledWith({
      url: "",
      userinfoUrl: undefined,
      userinfoUserAgent: undefined,
    });
  });

  it("maps a format failure without an HTTP status to a bad request", async () => {
    mocks.importSourceUrlDirect.mockResolvedValue({
      ok: false,
      error: "invalid subscription",
      errorInfo: { category: "format" },
    });

    const response = await POST(request("/api/source-import", { url: "invalid" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "BAD_REQUEST",
      error: "invalid subscription",
    });
  });
});
