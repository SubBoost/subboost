import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  readJsonBody: vi.fn(),
  jsonBodyError: vi.fn((result: { reason: string }, message: string) => new Response(JSON.stringify({
    error: result.reason === "too_large" ? "Request body is too large." : message,
    code: result.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
  }), { status: result.reason === "too_large" ? 413 : 400 })),
  apiError: vi.fn((message: string, code: string, status: number) => new Response(JSON.stringify({ error: message, code }), { status })),
  getStringField: vi.fn((body: Record<string, unknown>, key: string) => (typeof body[key] === "string" ? String(body[key]).trim() : "")),
  count: vi.fn(),
  create: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  signSession: vi.fn(),
  sessionCookieOptions: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@local/lib/http", () => ({
  apiError: mocks.apiError,
  getStringField: mocks.getStringField,
  jsonBodyError: mocks.jsonBodyError,
  LOCAL_JSON_BODY_LIMITS: { small: 64 * 1024 },
  readJsonBody: mocks.readJsonBody,
}));
vi.mock("@local/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    localAdmin: {
      count: mocks.count,
      create: mocks.create,
    },
  },
}));
vi.mock("@local/lib/session", () => ({
  SESSION_COOKIE: "subboost_local_session",
  signSession: mocks.signSession,
  sessionCookieOptions: mocks.sessionCookieOptions,
}));

import { POST } from "./route";
import { clearLocalRateLimitsForTests } from "@local/lib/rate-limit";

async function readJson(response: Response) {
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function setupRequest(token = "setup-secret") {
  return new Request("https://local.test/api/setup/admin", {
    headers: token ? { "X-SubBoost-Setup-Token": token } : {},
  });
}

describe("local setup admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalRateLimitsForTests();
    process.env.LOCAL_SETUP_TOKEN = "setup-secret";
    mocks.count.mockResolvedValue(0);
    mocks.hash.mockResolvedValue("hash");
    mocks.create.mockResolvedValue({ id: "admin-1", username: "ry" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.queryRaw,
      localAdmin: { count: mocks.count, create: mocks.create },
    }));
    mocks.signSession.mockResolvedValue("signed-session");
    mocks.sessionCookieOptions.mockReturnValue({ httpOnly: true, path: "/" });
  });

  it("rejects invalid JSON, existing admins, and invalid credentials", async () => {
    mocks.readJsonBody.mockResolvedValueOnce({ ok: false, reason: "invalid_json" });
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "请求格式有误，请刷新页面后重试", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "ry", password: "long-password", passwordConfirm: "long-password" } });
    mocks.count.mockResolvedValueOnce(1);
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 409,
      body: { error: "已有管理员账号，请直接登录", code: "CONFLICT" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "ry", password: "short", passwordConfirm: "short" } });
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "密码至少需要 10 个字符", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "", password: "long-password", passwordConfirm: "long-password" } });
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "请输入管理员账号", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ ok: true, value: { username: "ry", password: "long-password", passwordConfirm: "different-password" } });
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 400,
      body: { error: "两次输入的密码不一致，请重新确认", code: "BAD_REQUEST" },
    });
  });

  it("creates the first local admin and sets the session cookie", async () => {
    mocks.readJsonBody.mockResolvedValue({ ok: true, value: {
      username: " ry ",
      password: "long-password",
      passwordConfirm: "long-password",
    } });

    const result = await readJson(await POST(setupRequest()));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, user: { id: "admin-1", username: "ry" } });
    expect(mocks.hash).toHaveBeenCalledWith("long-password", 12);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { username: "ry", passwordHash: "hash", lastLoginAt: expect.any(Date) },
      select: { id: true, username: true },
    });
    expect(mocks.signSession).toHaveBeenCalledWith({ adminId: "admin-1", username: "ry" });
    expect(result.headers.get("set-cookie")).toContain("subboost_local_session=signed-session");
  });

  it("rechecks setup state under a database lock", async () => {
    mocks.readJsonBody.mockResolvedValue({ ok: true, value: {
      username: "ry",
      password: "long-password",
      passwordConfirm: "long-password",
    } });
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await readJson(await POST(setupRequest()));

    expect(result).toMatchObject({
      status: 409,
      body: { error: "已有管理员账号，请直接登录", code: "CONFLICT" },
    });
    expect(mocks.queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining(["SELECT pg_advisory_xact_lock(", ') IS NULL AS "locked"']),
      1_397_704_283
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("fails closed when the setup token is missing or misconfigured", async () => {
    expect(await readJson(await POST(setupRequest("wrong")))).toMatchObject({
      status: 403,
      body: { code: "FORBIDDEN" },
    });

    delete process.env.LOCAL_SETUP_TOKEN;
    expect(await readJson(await POST(setupRequest()))).toMatchObject({
      status: 503,
      body: { code: "CONFIGURATION_ERROR" },
    });
    expect(mocks.readJsonBody).not.toHaveBeenCalled();
  });
});
