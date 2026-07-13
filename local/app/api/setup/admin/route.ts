import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getLocalAdminSetupCredentialError, LOCAL_ADMIN_CREDENTIAL_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, getStringField, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";
import { consumeLocalRateLimit, localRateLimitResponse } from "@local/lib/rate-limit";

export async function POST(request: Request) {
  const setupLimit = consumeLocalRateLimit("admin-setup", "all", {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!setupLimit.allowed) {
    return localRateLimitResponse("Too many setup attempts. Try again later.", setupLimit.retryAfterSeconds);
  }

  const body = await readJsonBody(request);
  if (!body) return apiError(LOCAL_ADMIN_CREDENTIAL_MESSAGES.invalidJson, "BAD_REQUEST", 400);

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
