import { randomUUID } from "node:crypto";
import {
  deriveSessionRevocationIdentity,
  SESSION_CLOCK_TOLERANCE_SECONDS,
} from "@subboost/server-core/session-revocation";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { isHttpsAppUrl, requireEnv } from "./env";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "subboost_local_session";
const SESSION_ISSUER = "subboost-local";
const SESSION_REVOCATION_NAMESPACE = "subboost-local";

export type SessionPayload = {
  adminId: string;
  username: string;
};

type VerifiedSession = SessionPayload & {
  expiresAt: Date;
  revocationKey: string;
};

export class SessionRevocationStoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Session revocation state is unavailable.", { cause });
    this.name = "SessionRevocationStoreUnavailableError";
  }
}

function key(): Uint8Array {
  return new TextEncoder().encode(requireEnv("JWT_SECRET"));
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.adminId)
    .setIssuer(SESSION_ISSUER)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());
}

async function verifySignedSession(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
      clockTolerance: SESSION_CLOCK_TOLERANCE_SECONDS,
    });
    if (payload.iss !== undefined && payload.iss !== SESSION_ISSUER) return null;
    const adminId = typeof payload.sub === "string" ? payload.sub : "";
    const username = typeof payload.username === "string" ? payload.username : "";
    if (!adminId || !username) return null;
    const identity = deriveSessionRevocationIdentity({
      namespace: SESSION_REVOCATION_NAMESPACE,
      token,
      claims: payload,
    });
    return { adminId, username, expiresAt: identity.expiresAt, revocationKey: identity.key };
  } catch {
    return null;
  }
}

async function currentSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = await currentSessionToken();
  if (!token) return null;
  const session = await verifySignedSession(token);
  if (!session) return null;

  try {
    const revoked = await prisma.revokedSession.findUnique({
      where: { revocationKey: session.revocationKey },
      select: { revocationKey: true },
    });
    return revoked ? null : { adminId: session.adminId, username: session.username };
  } catch (error) {
    throw new SessionRevocationStoreUnavailableError(error);
  }
}

export async function revokeCurrentSession(): Promise<boolean> {
  const token = await currentSessionToken();
  if (!token) return false;
  const session = await verifySignedSession(token);
  if (!session) return false;

  try {
    await prisma.revokedSession.upsert({
      where: { revocationKey: session.revocationKey },
      create: { revocationKey: session.revocationKey, expiresAt: session.expiresAt },
      update: { expiresAt: session.expiresAt },
    });
    return true;
  } catch (error) {
    throw new SessionRevocationStoreUnavailableError(error);
  }
}

export async function cleanupExpiredSessionRevocations(options?: {
  limit?: number;
  now?: Date;
}): Promise<number> {
  const limit = Math.max(1, Math.min(1000, Math.floor(options?.limit ?? 100)));
  const rows = await prisma.revokedSession.findMany({
    where: { expiresAt: { lte: options?.now ?? new Date() } },
    select: { revocationKey: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  if (rows.length === 0) return 0;
  const result = await prisma.revokedSession.deleteMany({
    where: { revocationKey: { in: rows.map((row) => row.revocationKey) } },
  });
  return result.count;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsAppUrl(),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsAppUrl(),
    path: "/",
    maxAge: 0,
  };
}
