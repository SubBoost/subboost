import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiError: vi.fn((message: string, code: string, status: number) => new Response(JSON.stringify({ error: message, code }), { status })),
  json: vi.fn((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
  getCurrentAdmin: vi.fn(),
  findUnique: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@local/lib/http", () => ({
  apiError: mocks.apiError,
  json: mocks.json,
}));
vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: mocks.getCurrentAdmin,
  normalizeLocalAdminRole: (value: unknown) => (value === "ADMIN" ? "ADMIN" : "USER"),
}));
vi.mock("@local/lib/prisma", () => ({
  prisma: {
    localAdmin: {
      findUnique: mocks.findUnique,
      delete: mocks.delete,
    },
  },
}));

import { DELETE } from "./route";

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

const admin = { id: "admin-1", username: "root", role: "ADMIN", isAdmin: true };
const regular = { id: "user-1", username: "friend", role: "USER", isAdmin: false };

function deleteRequest(id: string) {
  return new Request(`https://local.test/api/admin/users/${id}`, { method: "DELETE" });
}

function deleteContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("admin users delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.delete.mockResolvedValue({ id: "user-1" });
  });

  it("requires an administrator", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);
    expect(await readJson(await DELETE(deleteRequest("user-1"), deleteContext("user-1")))).toMatchObject({
      status: 401,
      body: { code: "UNAUTHORIZED" },
    });

    mocks.getCurrentAdmin.mockResolvedValue(regular);
    expect(await readJson(await DELETE(deleteRequest("user-1"), deleteContext("user-1")))).toMatchObject({
      status: 403,
      body: { code: "FORBIDDEN" },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown account", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(admin);
    mocks.findUnique.mockResolvedValue(null);

    expect(await readJson(await DELETE(deleteRequest("missing"), deleteContext("missing")))).toMatchObject({
      status: 404,
      body: { error: "账号不存在", code: "NOT_FOUND" },
    });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete the current account or an administrator account", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(admin);

    mocks.findUnique.mockResolvedValueOnce({ id: "admin-1", role: "ADMIN" });
    expect(await readJson(await DELETE(deleteRequest("admin-1"), deleteContext("admin-1")))).toMatchObject({
      status: 403,
      body: { error: "不能删除当前登录的账号", code: "FORBIDDEN" },
    });

    mocks.findUnique.mockResolvedValueOnce({ id: "admin-2", role: "ADMIN" });
    expect(await readJson(await DELETE(deleteRequest("admin-2"), deleteContext("admin-2")))).toMatchObject({
      status: 403,
      body: { error: "不能删除管理员账号", code: "FORBIDDEN" },
    });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("deletes a regular account", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(admin);
    mocks.findUnique.mockResolvedValue({ id: "user-1", role: "USER" });

    expect(await readJson(await DELETE(deleteRequest("user-1"), deleteContext("user-1")))).toEqual({
      status: 200,
      body: { success: true },
    });
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });
});
