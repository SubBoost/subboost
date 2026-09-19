import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  jwtVerify: vi.fn(),
  prisma: {
    revokedSession: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  signPayload: null as unknown,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => (mocks.cookieValue === undefined ? undefined : { value: mocks.cookieValue }),
  })),
}));

vi.mock("jose", () => ({
  SignJWT: class SignJWT {
    private payload: unknown;
    constructor(payload: unknown) {
      this.payload = payload;
    }
    setProtectedHeader() {
      return this;
    }
    setSubject(subject: string) {
      mocks.signPayload = { ...(this.payload as Record<string, unknown>), sub: subject };
      return this;
    }
    setIssuer(issuer: string) {
      mocks.signPayload = { ...(mocks.signPayload as Record<string, unknown>), iss: issuer };
      return this;
    }
    setJti(jti: string) {
      mocks.signPayload = { ...(mocks.signPayload as Record<string, unknown>), jti };
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return "signed-session-token";
    }
  },
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import {
  clearSessionCookieOptions,
  cleanupExpiredSessionRevocations,
  readSession,
  revokeCurrentSession,
  sessionCookieOptions,
  SessionRevocationStoreUnavailableError,
  signSession,
} from "./session";

describe("local session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
    mocks.signPayload = null;
    process.env.JWT_SECRET = "test-secret";
    process.env.APP_URL = "https://local.example";
    mocks.prisma.revokedSession.findUnique.mockResolvedValue(null);
    mocks.prisma.revokedSession.findMany.mockResolvedValue([]);
    mocks.prisma.revokedSession.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.revokedSession.upsert.mockResolvedValue({});
    mocks.jwtVerify.mockResolvedValue({
      payload: { exp: 4102444800, iss: "subboost-local", jti: "session-1", sub: "admin-1", username: "ry" },
    });
  });

  it("signs sessions with the admin id as JWT subject", async () => {
    await expect(signSession({ adminId: "admin-1", username: "ry" })).resolves.toBe("signed-session-token");
    expect(mocks.signPayload).toEqual({
      iss: "subboost-local",
      jti: expect.any(String),
      sub: "admin-1",
      username: "ry",
    });
  });

  it("reads valid sessions and rejects missing, malformed, or invalid tokens", async () => {
    await expect(readSession()).resolves.toBeNull();

    mocks.cookieValue = "header.payload.signature";
    await expect(readSession()).resolves.toEqual({ adminId: "admin-1", username: "ry" });

    mocks.prisma.revokedSession.findUnique.mockResolvedValueOnce({ revocationKey: "revoked" });
    await expect(readSession()).resolves.toBeNull();

    mocks.jwtVerify.mockResolvedValueOnce({ payload: { exp: 4102444800, sub: 123, username: "ry" } });
    await expect(readSession()).resolves.toBeNull();

    mocks.jwtVerify.mockResolvedValueOnce({ payload: { exp: 4102444800, sub: "admin-1", username: "" } });
    await expect(readSession()).resolves.toBeNull();

    mocks.jwtVerify.mockRejectedValueOnce(new Error("bad token"));
    await expect(readSession()).resolves.toBeNull();
  });

  it("fails closed when revocation state cannot be read", async () => {
    mocks.cookieValue = "header.payload.signature";
    mocks.prisma.revokedSession.findUnique.mockRejectedValueOnce(new Error("db down"));

    await expect(readSession()).rejects.toBeInstanceOf(SessionRevocationStoreUnavailableError);
  });

  it("revokes the current session idempotently and cleans expired rows in a bounded batch", async () => {
    mocks.cookieValue = "header.payload.signature";
    await expect(revokeCurrentSession()).resolves.toBe(true);
    expect(mocks.prisma.revokedSession.upsert).toHaveBeenCalledWith({
      where: { revocationKey: expect.any(String) },
      create: { revocationKey: expect.any(String), expiresAt: expect.any(Date) },
      update: { expiresAt: expect.any(Date) },
    });

    mocks.prisma.revokedSession.findMany.mockResolvedValueOnce([
      { revocationKey: "expired-1" },
      { revocationKey: "expired-2" },
    ]);
    mocks.prisma.revokedSession.deleteMany.mockResolvedValueOnce({ count: 2 });
    const now = new Date("2026-09-20T00:00:00.000Z");

    await expect(cleanupExpiredSessionRevocations({ limit: 2, now })).resolves.toBe(2);
    expect(mocks.prisma.revokedSession.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
      select: { revocationKey: true },
      orderBy: { expiresAt: "asc" },
      take: 2,
    });
  });

  it("builds secure session cookie options and clear options", () => {
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(clearSessionCookieOptions()).toEqual({
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: true,
    });

    process.env.APP_URL = "http://local.example";
    expect(sessionCookieOptions()).toEqual(expect.objectContaining({ secure: false }));
    expect(clearSessionCookieOptions()).toEqual(expect.objectContaining({ secure: false }));
  });
});
