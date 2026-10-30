import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { apiError, getStringField, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";
import { enterUnknownLoginQueue } from "@local/lib/login-queue";
import {
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
  hashLocalRateLimitKey,
  localRateLimitResponse,
  resetLocalRateLimit,
} from "@local/lib/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const clientLimit = consumeLocalRateLimit("auth-login-client", clientKey, {
      limit: 30,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!clientLimit.allowed) {
      return localRateLimitResponse("Too many login attempts. Try again later.", clientLimit.retryAfterSeconds);
    }
  }

  const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsedBody.ok) return jsonBodyError(parsedBody);
  const body = parsedBody.value;

  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  if (!username || !password) return apiError("Invalid username or password.", "UNAUTHORIZED", 401);
  const usernameLimitKey = clientKey ? hashLocalRateLimitKey(`${clientKey}:${username.toLowerCase()}`) : null;
  if (usernameLimitKey) {
    const usernameLimit = consumeLocalRateLimit("auth-login-client-username", usernameLimitKey, {
      limit: 8,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!usernameLimit.allowed) {
      return localRateLimitResponse("Too many login attempts. Try again later.", usernameLimit.retryAfterSeconds);
    }
  }
  const release = clientKey ? null : await enterUnknownLoginQueue(request.signal);
  if (!clientKey && !release) {
    return localRateLimitResponse("Too many login attempts. Try again later.", 10);
  }
  let admin;
  let valid;
  try {
    admin = await prisma.localAdmin.findUnique({ where: { username }, select: { id: true, username: true, passwordHash: true } });
    valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  } finally {
    release?.();
  }
  if (!admin || !valid) {
    return apiError("Invalid username or password.", "UNAUTHORIZED", 401);
  }

  if (usernameLimitKey) resetLocalRateLimit("auth-login-client-username", usernameLimitKey);

  await prisma.localAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const response = NextResponse.json({ success: true, user: { id: admin.id, username: admin.username } });
  response.cookies.set(SESSION_COOKIE, await signSession({ adminId: admin.id, username: admin.username }), sessionCookieOptions());
  return response;
}
