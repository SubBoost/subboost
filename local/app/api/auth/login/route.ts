import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { apiError, getStringField, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";
import {
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
  hashLocalRateLimitKey,
  localRateLimitResponse,
  resetLocalRateLimit,
} from "@local/lib/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const UNKNOWN_RECOVERY_WINDOW_MS = 30 * 1000;
const MAX_UNKNOWN_CHECKS = 2;
let unknownChecks = 0;

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
  } else {
    const limit = consumeLocalRateLimit("auth-login-unknown", "all", { limit: 8, windowMs: LOGIN_WINDOW_MS });
    if (!limit.allowed) {
      const recovery = consumeLocalRateLimit("auth-login-unknown-recovery", "all", {
        limit: 1, windowMs: UNKNOWN_RECOVERY_WINDOW_MS,
      });
      if (!recovery.allowed) {
        return localRateLimitResponse("Too many login attempts. Try again later.", recovery.retryAfterSeconds);
      }
    }
  }

  const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsedBody.ok) return jsonBodyError(parsedBody);
  const body = parsedBody.value;

  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  const usernameLimitKey = clientKey ? hashLocalRateLimitKey(`${clientKey}:${username.toLowerCase() || "missing"}`) : null;
  if (usernameLimitKey) {
    const usernameLimit = consumeLocalRateLimit("auth-login-client-username", usernameLimitKey, {
      limit: 8,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!usernameLimit.allowed) {
      return localRateLimitResponse("Too many login attempts. Try again later.", usernameLimit.retryAfterSeconds);
    }
  }
  if (!clientKey && unknownChecks >= MAX_UNKNOWN_CHECKS) {
    return localRateLimitResponse("Too many login attempts. Try again later.", 1);
  }
  if (!clientKey) unknownChecks += 1;
  let admin;
  let valid;
  try {
    admin = username
      ? await prisma.localAdmin.findUnique({ where: { username }, select: { id: true, username: true, passwordHash: true } })
      : null;
    valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  } finally {
    if (!clientKey) unknownChecks -= 1;
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
