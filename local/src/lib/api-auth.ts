import { getCurrentAdmin, type CurrentAdmin } from "@local/lib/auth";
import { getAppOrigin } from "@local/lib/env";
import { apiError } from "@local/lib/http";
import { validateCsrfToken } from "@local/lib/session";

type AdminResponseHandler = (admin: CurrentAdmin) => Response | Promise<Response>;

export function localAdminRequiredResponse(): Response {
  return apiError("Authentication required.", "UNAUTHORIZED", 401);
}

export function csrfValidationFailedResponse(): Response {
  return apiError("CSRF validation failed.", "FORBIDDEN", 403);
}

export function invalidRequestOriginResponse(): Response {
  return apiError("Invalid request origin.", "FORBIDDEN", 403);
}

export async function getOptionalCurrentAdmin(): Promise<CurrentAdmin | null> {
  return getCurrentAdmin();
}

export async function requireCsrfProtection(request: Request): Promise<Response | null> {
  const origin = request.headers.get("origin")?.trim();
  const appOrigin = getAppOrigin();
  if (origin && appOrigin && origin !== appOrigin) {
    return invalidRequestOriginResponse();
  }
  const ok = await validateCsrfToken(request);
  return ok ? null : csrfValidationFailedResponse();
}

export async function withCurrentAdmin(handler: AdminResponseHandler): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();
  return handler(admin);
}

export async function withCurrentAdminAndCsrf(request: Request, handler: AdminResponseHandler): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();
  const csrfError = await requireCsrfProtection(request);
  if (csrfError) return csrfError;
  return handler(admin);
}
