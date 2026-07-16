import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getLocalAdminSetupCredentialError, LOCAL_ADMIN_CREDENTIAL_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, getStringField, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";
import { consumeLocalRateLimit, getTrustedClientRateLimitKey, localRateLimitResponse } from "@local/lib/rate-limit";
import { validateLocalSetupToken } from "@local/lib/setup-token";

export async function POST(request: Request) {
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const setupLimit = consumeLocalRateLimit("admin-setup-client", clientKey, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!setupLimit.allowed) {
      return localRateLimitResponse("Too many setup attempts. Try again later.", setupLimit.retryAfterSeconds);
    }
  }

  const setupToken = validateLocalSetupToken(request);
  if (setupToken === "missing_config") {
    return apiError("LOCAL_SETUP_TOKEN is not configured.", "CONFIGURATION_ERROR", 503);
  }
  if (setupToken === "invalid") {
    return apiError("Invalid setup token.", "FORBIDDEN", 403);
  }

  const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsedBody.ok) return jsonBodyError(parsedBody, LOCAL_ADMIN_CREDENTIAL_MESSAGES.invalidJson);
  const body = parsedBody.value;

  const existingCount = await prisma.localAdmin.count();
  if (existingCount > 0) {
    return apiError(LOCAL_ADMIN_CREDENTIAL_MESSAGES.adminExists, "CONFLICT", 409);
  }

  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  const passwordConfirm = getStringField(body, "passwordConfirm");
  const credentialError = getLocalAdminSetupCredentialError({ username, password, passwordConfirm });
  if (credentialError) {
    return apiError(credentialError, "BAD_REQUEST", 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${1_397_704_283}) IS NULL AS "locked"`;
    if (await transaction.localAdmin.count()) return null;
    return transaction.localAdmin.create({
      data: { username, passwordHash, lastLoginAt: new Date() },
      select: { id: true, username: true },
    });
  });
  if (!admin) {
    return apiError(LOCAL_ADMIN_CREDENTIAL_MESSAGES.adminExists, "CONFLICT", 409);
  }

  const response = NextResponse.json({
    success: true,
    user: admin,
  });
  response.cookies.set(SESSION_COOKIE, await signSession({ adminId: admin.id, username: admin.username }), sessionCookieOptions());
  return response;
}
