import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getLocalAdminSetupCredentialError, LOCAL_ADMIN_CREDENTIAL_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, getStringField, readJsonBody } from "@local/lib/http";
import { isLanMode } from "@local/lib/lan-mode";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";

export async function POST(request: Request) {
  // 局域网模式：默认管理员由系统自动创建，禁止任何人在此抢先创建自定义管理员账号。
  if (isLanMode()) {
    return apiError(LOCAL_ADMIN_CREDENTIAL_MESSAGES.lanModeSetupDisabled, "FORBIDDEN", 403);
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
  const admin = await prisma.localAdmin.create({
    data: { username, passwordHash, lastLoginAt: new Date() },
    select: { id: true, username: true },
  });

  const response = NextResponse.json({
    success: true,
    user: admin,
  });
  response.cookies.set(SESSION_COOKIE, await signSession({ adminId: admin.id, username: admin.username }), sessionCookieOptions());
  return response;
}
