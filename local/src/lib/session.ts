import { cookies, headers } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { isHttpsAppUrl } from "./env";

export const SESSION_COOKIE = "subboost_local_session";
export const CSRF_COOKIE = "subboost_local_csrf";
export const CSRF_HEADER = "x-subboost-csrf";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  sessionId: string;
  userId: string;
  username: string;
};

function nowPlusSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseSessionToken(token: string): { sessionId: string; secret: string } | null {
  const [sessionId, secret] = token.split(".", 2);
  if (!sessionId || !secret) return null;
  return { sessionId, secret };
}

async function getUserAgent(): Promise<string | null> {
  const value = (await headers()).get("user-agent")?.trim();
  return value ? value.slice(0, 512) : null;
}

export function createCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createSession(payload: { userId: string; username: string }) {
  const secret = randomBytes(32).toString("base64url");
  const row = await prisma.localSession.create({
    data: {
      tokenHash: sha256(secret),
      ownerId: payload.userId,
      userAgent: await getUserAgent(),
      expiresAt: nowPlusSeconds(SESSION_TTL_SECONDS),
    },
    select: { id: true },
  });
  return {
    token: `${row.id}.${secret}`,
    csrfToken: createCsrfToken(),
  };
}

export async function rotateSession(sessionId: string) {
  await prisma.localSession.update({
    where: { id: sessionId },
    data: {
      lastSeenAt: new Date(),
      expiresAt: nowPlusSeconds(SESSION_TTL_SECONDS),
    },
  });
}

export async function revokeSession(sessionId: string) {
  await prisma.localSession.deleteMany({ where: { id: sessionId } });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.localSession.deleteMany({ where: { ownerId: userId } });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const parsed = parseSessionToken(token);
  if (!parsed) return null;

  const row = await prisma.localSession.findUnique({
    where: { id: parsed.sessionId },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      owner: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await revokeSession(row.id);
    return null;
  }
  if (!safeEqual(row.tokenHash, sha256(parsed.secret))) return null;

  await rotateSession(row.id);
  return {
    sessionId: row.id,
    userId: row.owner.id,
    username: row.owner.username,
  };
}

export async function readCsrfToken(): Promise<string | null> {
  return (await cookies()).get(CSRF_COOKIE)?.value ?? null;
}

export async function validateCsrfToken(request: Request): Promise<boolean> {
  const cookieToken = await readCsrfToken();
  const headerToken = request.headers.get(CSRF_HEADER)?.trim() ?? "";
  if (!cookieToken || !headerToken) return false;
  return safeEqual(cookieToken, headerToken);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsAppUrl(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: isHttpsAppUrl(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
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

export function clearCsrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: isHttpsAppUrl(),
    path: "/",
    maxAge: 0,
  };
}
