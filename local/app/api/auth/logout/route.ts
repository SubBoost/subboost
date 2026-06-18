import { NextResponse } from "next/server";
import {
  clearCsrfCookieOptions,
  clearSessionCookieOptions,
  CSRF_COOKIE,
  revokeSession,
  readSession,
  SESSION_COOKIE,
} from "@local/lib/session";

export async function POST() {
  const session = await readSession();
  if (session) {
    await revokeSession(session.sessionId);
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions());
  response.cookies.set(CSRF_COOKIE, "", clearCsrfCookieOptions());
  return response;
}
