import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  readJsonBody: vi.fn(),
  jsonBodyError: vi.fn((result: { reason: string }, message: string) => new Response(JSON.stringify({
    error: result.reason === "too_large" ? "Request body is too large." : message,
    code: result.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
  }), { status: result.reason === "too_large" ? 413 : 400 })),
  apiError: vi.fn((message: string, code: string, status: number) => new Response(JSON.stringify({ error: message, code }), { status })),
  json: vi.fn((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
  getStringField: vi.fn((body: Record<string, unknown>, key: string) => (typeof body[key] === "string" ? String(body[key]).trim() : "")),
  getCurrentAdmin: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@local/lib/http", () => ({
  apiError: mocks.apiError,
  getStringField: mocks.getStringField,
  json: mocks.json,
  jsonBodyError: mocks.jsonBodyError,
  LOCAL_JSON_BODY_LIMITS: { small: 64 * 1024 },
  readJsonBody: mocks.readJsonBody,
}));
vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: mocks.getCurrentAdmin,
  normalizeLocalAdminRole: (value: unknown) => (value === "ADMIN" ? "ADMIN" : "USER"),
}));
vi.mock("@local/lib/prisma", () => ({
  prisma: {
    localAdmin: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));

import { GET, POST } from "./route";

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

const admin = { id: "admin-1", username: "root", role: "ADMIN", isAdmin: true };
const regular = { id: "user-1", username: "friend", role: "USER", isAdmin: false };

function postRequest() {
  return new Request("https://local.test/api/admin/users", { method: "POST" });
}

describe("admin users route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("hash");
    mocks.findMany.mockResolvedValue([
      { id: "admin-1", username: "root", role: "ADMIN", createdAt: new Date("2026-11-01T00:00:00.000Z"), lastLoginAt: new Date("2026-11-17T00:00:00.000Z") },
      { id: "user-1", username: "friend", role: "USER", createdAt: new Date("2026-11-17T00:00:00.000Z"), lastLoginAt: null },
    ]);
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({
      id: "user-2", username: "guest", role: "USER", createdAt: new Date("2026-11-18T00:00:00.000Z"), lastLoginAt: null,
    });
  });

  it("requires an administrator for listing and creating accounts", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);
    expect(await readJson(await GET())).toMatchObject({ status: 401, body: { code: "UNAUTHORIZED" } });

    mocks.getCurrentAdmin.mockResolvedValue(regular);
    expect(await readJson(await GET())).toMatchObject({ status: 403, body: { code: "FORBIDDEN" } });
    expect(await readJson(await POST(postRequest()))).toMatchObject({ status: 403, body: { code: "FORBIDDEN" } });
    expect(mocks.readJsonBody).not.toHaveBeenCalled();
  });

  it("lists accounts without password hashes", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(admin);

    expect(await readJson(await GET())).toEqual({
      status: 200,
      body: {
        users: [
          { id: "admin-1", username: "root", role: "ADMIN", createdAt: "2026-11-01T00:00:00.000Z", lastLoginAt: "2026-11-17T00:00:00.000Z" },
          { id: "user-1", username: "friend", role: "USER", createdAt: "2026-11-17T00:00:00.000Z", lastLoginAt: null },
        ],
      },
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      select: { id: true, username: true, role: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("rejects invalid credentials and duplicate usernames", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(admin);

    mocks.readJsonBody.mockResolvedValueOnce({ ok: false, reason: "invalid_json" });
    expect(await readJson(await POST(postRequest()))).toMatchObject({ status: 400, body: { code: "BAD_REQUEST" } });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "guest", password: "short", passwordConfirm: "short" } });
    expect(await readJson(await POST(postRequest()))).toMatchObject({
      status: 400,
      body: { error: "密码至少需要 10 个字符", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "guest", password: "long-password", passwordConfirm: "different-password" } });
    expect(await readJson(await POST(postRequest()))).toMatchObject({
      status: 400,
      body: { error: "两次输入的密码不一致，请重新确认", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "friend", password: "long-password", passwordConfirm: "long-password" } });
    mocks.findUnique.mockResolvedValueOnce({ id: "user-1" });
    expect(await readJson(await POST(postRequest()))).toMatchObject({
      status: 409,
      body: { error: "用户名已存在", code: "CONFLICT" },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a regular account and maps a username race to a conflict", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(admin);
    mocks.readJsonBody.mockResolvedValue({ ok: true, value: { username: " guest ", password: "long-password", passwordConfirm: "long-password" } });

    expect(await readJson(await POST(postRequest()))).toEqual({
      status: 201,
      body: { success: true, user: { id: "user-2", username: "guest", role: "USER", createdAt: "2026-11-18T00:00:00.000Z", lastLoginAt: null } },
    });
    expect(mocks.hash).toHaveBeenCalledWith("long-password", 12);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { username: "guest", passwordHash: "hash", role: "USER" },
      select: { id: true, username: true, role: true, createdAt: true, lastLoginAt: true },
    });

    mocks.create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    expect(await readJson(await POST(postRequest()))).toMatchObject({
      status: 409,
      body: { error: "用户名已存在", code: "CONFLICT" },
    });
  });
});
