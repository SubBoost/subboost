import { validateCronSecret } from "@subboost/server-core/cron-auth";
import { apiError } from "./http";

function getCronSecret(): string {
  return (process.env.CRON_SECRET || "").trim();
}

function isDevelopmentBypassAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_UNAUTHENTICATED_CRON === "true";
}

export function requireLocalCronAuth(request: Request): ReturnType<typeof apiError> | null {
  const cronSecret = getCronSecret();
  const auth = validateCronSecret({
    cronSecret,
    authorization: request.headers.get("authorization"),
  });

  if (auth.ok) return null;

  if (auth.reason === "missing-secret") {
    if (isDevelopmentBypassAllowed()) return null;
    return apiError("CRON_SECRET not configured.", "CONFIGURATION_ERROR", 503);
  }

  return apiError("Invalid cron secret.", "UNAUTHORIZED", 401);
}

export function isLocalCronSecretConfigured(): boolean {
  return Boolean(getCronSecret());
}
