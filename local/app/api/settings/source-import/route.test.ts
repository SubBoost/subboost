import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  prisma: {
    localAdmin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: mocks.getCurrentAdmin,
}));

vi.mock("@local/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

import { GET, PATCH } from "./route";

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

function patchRequest(body: string) {
  return new Request("https://local.test/api/settings/source-import", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("local source import settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAdmin.mockResolvedValue({ id: "admin-1", username: "admin" });
  });

  it("requires the local administrator for reads and writes", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);

    await expect(readJson(await GET())).resolves.toEqual({
      status: 401,
      body: { error: "Authentication required.", code: "UNAUTHORIZED" },
    });
    await expect(readJson(await PATCH(patchRequest("{}")))).resolves.toEqual({
      status: 401,
      body: { error: "Authentication required.", code: "UNAUTHORIZED" },
    });
    expect(mocks.prisma.localAdmin.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();
  });

  it("returns the persisted setting", async () => {
    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce({
      allowUnsafeSubscriptionSources: true,
    });

    await expect(readJson(await GET())).resolves.toEqual({
      status: 200,
      body: { allowUnsafeSubscriptionSources: true },
    });
    expect(mocks.prisma.localAdmin.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { allowUnsafeSubscriptionSources: true },
    });
  });

  it("updates the setting with a boolean value", async () => {
    mocks.prisma.localAdmin.update.mockResolvedValueOnce({
      allowUnsafeSubscriptionSources: true,
    });

    await expect(
      readJson(await PATCH(patchRequest(JSON.stringify({ allowUnsafeSubscriptionSources: true }))))
    ).resolves.toEqual({
      status: 200,
      body: { allowUnsafeSubscriptionSources: true },
    });
    expect(mocks.prisma.localAdmin.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { allowUnsafeSubscriptionSources: true },
      select: { allowUnsafeSubscriptionSources: true },
    });
  });

  it("rejects malformed JSON and non-boolean values", async () => {
    await expect(readJson(await PATCH(patchRequest("{")))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid JSON body.", code: "BAD_REQUEST" },
    });
    await expect(
      readJson(await PATCH(patchRequest(JSON.stringify({ allowUnsafeSubscriptionSources: "yes" }))))
    ).resolves.toEqual({
      status: 400,
      body: {
        error: "allowUnsafeSubscriptionSources must be a boolean.",
        code: "VALIDATION_ERROR",
      },
    });
    expect(mocks.prisma.localAdmin.update).not.toHaveBeenCalled();
  });

  it("rejects settings bodies above 64 KiB", async () => {
    const response = await PATCH(new Request("https://local.test/api/settings/source-import", {
      method: "PATCH",
      headers: { "content-length": String(64 * 1024 + 1) },
      body: "{}",
    }));
    expect(await readJson(response)).toEqual({
      status: 413,
      body: { error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" },
    });
  });
});
