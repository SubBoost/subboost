import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readJsonBody: vi.fn(),
  apiError: vi.fn((message: string, code: string, status: number) => new Response(JSON.stringify({ error: message, code }), { status })),
  createInitialAdmin: vi.fn(),
  createSession: vi.fn(),
  sessionCookieOptions: vi.fn(() => ({ httpOnly: true, path: "/" })),
  csrfCookieOptions: vi.fn(() => ({ path: "/" })),
}));

vi.mock("@local/lib/http", () => ({
  apiError: mocks.apiError,
  readJsonBody: mocks.readJsonBody,
}));

vi.mock("@local/lib/local-user-service", () => ({
  createInitialAdmin: mocks.createInitialAdmin,
}));

vi.mock("@local/lib/session", () => ({
  createSession: mocks.createSession,
  sessionCookieOptions: mocks.sessionCookieOptions,
  csrfCookieOptions: mocks.csrfCookieOptions,
  SESSION_COOKIE: "subboost_local_session",
  CSRF_COOKIE: "subboost_local_csrf",
}));

import { POST } from "./route";

async function readJson(response: Response) {
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe("local setup admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInitialAdmin.mockResolvedValue({ id: "admin-1", username: "ry" });
    mocks.createSession.mockResolvedValue({ token: "session-token", csrfToken: "csrf-token" });
  });

  it("rejects invalid json and surfaces service errors", async () => {
    mocks.readJsonBody.mockResolvedValueOnce(null);
    expect(await readJson(await POST(new Request("https://local.test/api/setup/admin")))).toMatchObject({
      status: 400,
      body: { error: "Invalid JSON body.", code: "BAD_REQUEST" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ username: "ry", password: "bad", passwordConfirm: "bad" });
    mocks.createInitialAdmin.mockRejectedValueOnce(new Error("系统已初始化，请直接登录。"));
    expect(await readJson(await POST(new Request("https://local.test/api/setup/admin")))).toMatchObject({
      status: 409,
      body: { error: "系统已初始化，请直接登录。", code: "CONFLICT" },
    });

    mocks.readJsonBody.mockResolvedValueOnce({ username: "ry", password: "bad", passwordConfirm: "bad" });
    mocks.createInitialAdmin.mockRejectedValueOnce(new Error("密码长度至少为 12 位。"));
    expect(await readJson(await POST(new Request("https://local.test/api/setup/admin")))).toMatchObject({
      status: 400,
      body: { error: "密码长度至少为 12 位。", code: "BAD_REQUEST" },
    });
  });

  it("creates the first local admin and sets session and csrf cookies", async () => {
    mocks.readJsonBody.mockResolvedValue({
      username: " ry ",
      password: "very-secret-password",
      passwordConfirm: "very-secret-password",
    });

    const result = await readJson(await POST(new Request("https://local.test/api/setup/admin")));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, user: { id: "admin-1", username: "ry" } });
    expect(mocks.createInitialAdmin).toHaveBeenCalledWith({
      username: " ry ",
      password: "very-secret-password",
      passwordConfirm: "very-secret-password",
    });
    expect(mocks.createSession).toHaveBeenCalledWith({ userId: "admin-1", username: "ry" });
    expect(result.headers.get("set-cookie")).toContain("subboost_local_session=session-token");
    expect(result.headers.get("set-cookie")).toContain("subboost_local_csrf=csrf-token");
  });
});
