import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCsrfCookieOptions,
  clearSessionCookieOptions,
  csrfCookieOptions,
  createCsrfToken,
  CSRF_HEADER,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from "./session";

describe("local session helpers", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://local.example";
  });

  it("creates csrf tokens and secure cookie options", () => {
    expect(createCsrfToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(csrfCookieOptions()).toEqual({
      httpOnly: false,
      maxAge: SESSION_TTL_SECONDS,
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
    expect(clearCsrfCookieOptions()).toEqual({
      httpOnly: false,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("switches cookie secure flag for http app urls", () => {
    process.env.APP_URL = "http://local.example";
    expect(sessionCookieOptions()).toEqual(expect.objectContaining({ secure: false }));
    expect(csrfCookieOptions()).toEqual(expect.objectContaining({ secure: false }));
    expect(clearSessionCookieOptions()).toEqual(expect.objectContaining({ secure: false }));
    expect(clearCsrfCookieOptions()).toEqual(expect.objectContaining({ secure: false }));
  });

  it("exposes the csrf header constant", () => {
    expect(CSRF_HEADER).toBe("x-subboost-csrf");
  });
});
