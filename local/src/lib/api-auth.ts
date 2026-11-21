import { getCurrentAdmin, type CurrentAdmin } from "@local/lib/auth";
import { apiError } from "@local/lib/http";

type AdminResponseHandler = (admin: CurrentAdmin) => Response | Promise<Response>;

export function localAdminRequiredResponse(): Response {
  return apiError("Authentication required.", "UNAUTHORIZED", 401);
}

export async function getOptionalCurrentAdmin(): Promise<CurrentAdmin | null> {
  return getCurrentAdmin();
}

export async function withCurrentAdmin(handler: AdminResponseHandler): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();
  return handler(admin);
}

export function localAccountAdminRequiredResponse(): Response {
  return apiError("Only the administrator can manage accounts.", "FORBIDDEN", 403);
}

/** Runs the handler only for the first (administrator) account. */
export async function withAccountAdmin(handler: AdminResponseHandler): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return localAdminRequiredResponse();
  if (!admin.isAdmin) return localAccountAdminRequiredResponse();
  return handler(admin);
}
