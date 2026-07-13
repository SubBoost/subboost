import { createHash, timingSafeEqual } from "node:crypto";

export type CronSecretValidationResult =
  | { ok: true }
  | { ok: false; reason: "missing-secret" | "unauthorized" };

export function extractBearerToken(authorization: string | null | undefined): string {
  if (!authorization) return "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export function validateCronSecret(params: {
  cronSecret: string | null | undefined;
  authorization: string | null | undefined;
}): CronSecretValidationResult {
  if (!params.cronSecret) return { ok: false, reason: "missing-secret" };
  const suppliedDigest = createHash("sha256").update(extractBearerToken(params.authorization)).digest();
  const expectedDigest = createHash("sha256").update(params.cronSecret).digest();
  if (!timingSafeEqual(suppliedDigest, expectedDigest)) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}
