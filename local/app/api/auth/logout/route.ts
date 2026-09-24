import { NextResponse } from "next/server";
import {
  cleanupExpiredSessionRevocations,
  clearSessionCookieOptions,
  revokeCurrentSession,
  SessionRevocationStoreUnavailableError,
  SESSION_COOKIE,
} from "@local/lib/session";

export async function POST() {
  try {
    await revokeCurrentSession();
  } catch (error) {
    if (error instanceof SessionRevocationStoreUnavailableError) {
      return NextResponse.json(
        { error: "Session service unavailable.", code: "SESSION_STORE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    throw error;
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions());

  try {
    await cleanupExpiredSessionRevocations();
  } catch (error) {
    console.error("Local session revocation cleanup failed:", error);
  }

  return response;
}
