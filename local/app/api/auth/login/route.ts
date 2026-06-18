import { NextResponse } from "next/server";
import { apiError, readJsonBody } from "@local/lib/http";
import { verifyLocalUser } from "@local/lib/local-user-service";
import {
  createSession,
  csrfCookieOptions,
  sessionCookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "@local/lib/session";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

  const user = await verifyLocalUser(
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).username : "",
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).password : ""
  );
  if (!user) {
    return apiError("Invalid username or password.", "UNAUTHORIZED", 401);
  }

  const session = await createSession({ userId: user.id, username: user.username });
  const response = NextResponse.json({ success: true, user });
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
  response.cookies.set(CSRF_COOKIE, session.csrfToken, csrfCookieOptions());
  return response;
}
