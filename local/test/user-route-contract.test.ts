import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentAdmin } from "@local/lib/auth";
import { validateCsrfToken } from "@local/lib/session";
import { createLocalUser, listLocalUsers, updateLocalUserAccount } from "@local/lib/local-user-service";
import * as usersRoute from "../app/api/users/route";
import * as meRoute from "../app/api/users/me/route";

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/session", () => ({
  validateCsrfToken: vi.fn(),
}));

vi.mock("@local/lib/local-user-service", () => ({
  createLocalUser: vi.fn(),
  listLocalUsers: vi.fn(),
  updateLocalUserAccount: vi.fn(),
}));

const admin = { id: "user-1", username: "alice" };

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", "x-subboost-csrf": "csrf-token" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
  vi.mocked(validateCsrfToken).mockResolvedValue(true);
  vi.mocked(listLocalUsers).mockResolvedValue([
    {
      id: "user-1",
      username: "alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
      subscriptionCount: 1,
      templateCount: 0,
    },
  ] as never);
  vi.mocked(createLocalUser).mockResolvedValue({ id: "user-2", username: "bob" } as never);
  vi.mocked(updateLocalUserAccount).mockResolvedValue({ id: "user-1", username: "alice-updated" } as never);
});

describe("user routes", () => {
  it("lists users and returns current user detail", async () => {
    await expect(readJson(await usersRoute.GET())).resolves.toEqual({
      status: 200,
      body: {
        users: [
          {
            id: "user-1",
            username: "alice",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            lastLoginAt: null,
            subscriptionCount: 1,
            templateCount: 0,
          },
        ],
      },
    });

    await expect(readJson(await meRoute.GET())).resolves.toEqual({
      status: 200,
      body: {
        user: {
          id: "user-1",
          username: "alice",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastLoginAt: null,
          subscriptionCount: 1,
          templateCount: 0,
        },
      },
    });
  });

  it("creates users and updates current user with csrf", async () => {
    const createResponse = await usersRoute.POST(
      jsonRequest("http://local.test/api/users", "POST", {
        username: "bob",
        password: "very-secret-password",
        passwordConfirm: "very-secret-password",
      })
    );
    expect(await readJson(createResponse)).toEqual({
      status: 201,
      body: { user: { id: "user-2", username: "bob" } },
    });
    expect(createLocalUser).toHaveBeenCalled();

    const updateResponse = await meRoute.PUT(
      jsonRequest("http://local.test/api/users/me", "PUT", {
        username: "alice-updated",
        currentPassword: "old-password",
        newPassword: "new-password-123",
        passwordConfirm: "new-password-123",
      })
    );
    expect(await readJson(updateResponse)).toEqual({
      status: 200,
      body: { user: { id: "user-1", username: "alice-updated" } },
    });
    expect(updateLocalUserAccount).toHaveBeenCalledWith("user-1", expect.any(Object));
  });

  it("rejects unauthenticated or csrf-invalid writes", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValueOnce(null);
    await expect(
      readJson(
        await usersRoute.POST(
          jsonRequest("http://local.test/api/users", "POST", {
            username: "bob",
            password: "very-secret-password",
            passwordConfirm: "very-secret-password",
          })
        )
      )
    ).resolves.toEqual({
      status: 401,
      body: { error: "Authentication required.", code: "UNAUTHORIZED" },
    });

    vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
    vi.mocked(validateCsrfToken).mockResolvedValueOnce(false);
    await expect(
      readJson(
        await meRoute.PUT(
          jsonRequest("http://local.test/api/users/me", "PUT", {
            username: "alice-updated",
          })
        )
      )
    ).resolves.toEqual({
      status: 403,
      body: { error: "CSRF validation failed.", code: "FORBIDDEN" },
    });
  });
});
