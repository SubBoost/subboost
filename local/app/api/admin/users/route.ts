import bcrypt from "bcryptjs";
import { withAccountAdmin } from "@local/lib/api-auth";
import {
  getLocalAdminSetupCredentialError,
  LOCAL_ACCOUNT_MANAGEMENT_MESSAGES,
  LOCAL_ADMIN_CREDENTIAL_MESSAGES,
} from "@local/lib/admin-credentials";
import { apiError, getStringField, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { normalizeLocalAdminRole } from "@local/lib/auth";

type LocalAccountSummary = {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  createdAt: string;
  lastLoginAt: string | null;
};

function toLocalAccountSummary(account: {
  id: string;
  username: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}): LocalAccountSummary {
  return {
    id: account.id,
    username: account.username,
    role: normalizeLocalAdminRole(account.role),
    createdAt: account.createdAt.toISOString(),
    lastLoginAt: account.lastLoginAt ? account.lastLoginAt.toISOString() : null,
  };
}

const accountSelect = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

export async function GET() {
  return withAccountAdmin(async () => {
    const accounts = await prisma.localAdmin.findMany({
      select: accountSelect,
      orderBy: { createdAt: "asc" },
    });
    return json({ users: accounts.map(toLocalAccountSummary) });
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function POST(request: Request) {
  return withAccountAdmin(async () => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody, LOCAL_ADMIN_CREDENTIAL_MESSAGES.invalidJson);
    const body = parsedBody.value;

    const username = getStringField(body, "username");
    const password = getStringField(body, "password");
    const passwordConfirm = getStringField(body, "passwordConfirm");
    const credentialError = getLocalAdminSetupCredentialError({ username, password, passwordConfirm });
    if (credentialError) {
      return apiError(credentialError, "BAD_REQUEST", 400);
    }

    const existing = await prisma.localAdmin.findUnique({ where: { username }, select: { id: true } });
    if (existing) {
      return apiError(LOCAL_ACCOUNT_MANAGEMENT_MESSAGES.usernameExists, "CONFLICT", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const account = await prisma.localAdmin.create({
        data: { username, passwordHash, role: "USER" },
        select: accountSelect,
      });
      return json({ success: true, user: toLocalAccountSummary(account) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return apiError(LOCAL_ACCOUNT_MANAGEMENT_MESSAGES.usernameExists, "CONFLICT", 409);
      }
      throw error;
    }
  });
}
