import { createHash } from "node:crypto";

export const SESSION_CLOCK_TOLERANCE_SECONDS = 5;

export type VerifiedSessionClaims = {
  exp?: unknown;
  jti?: unknown;
};

export type SessionRevocationIdentity = {
  expiresAt: Date;
  key: string;
  kind: "jti" | "legacy";
};

function compactHeaderAndPayload(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error("Session token must be a compact JWS.");
  }
  return `${parts[0]}.${parts[1]}`;
}

function acceptedUntil(exp: unknown, clockToleranceSeconds: number): Date {
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) {
    throw new Error("Session token is missing a valid expiration time.");
  }
  return new Date((exp + clockToleranceSeconds) * 1000);
}

export function deriveSessionRevocationIdentity(options: {
  namespace: string;
  token: string;
  claims: VerifiedSessionClaims;
  clockToleranceSeconds?: number;
}): SessionRevocationIdentity {
  const namespace = options.namespace.trim();
  if (!namespace) throw new Error("Session revocation namespace is required.");

  const jti = typeof options.claims.jti === "string" ? options.claims.jti.trim() : "";
  const kind = jti ? "jti" : "legacy";
  const stableIdentity = jti || compactHeaderAndPayload(options.token);
  const key = createHash("sha256")
    .update(`subboost-session-revocation:v1:${namespace}:${kind}:${stableIdentity}`, "utf8")
    .digest("hex");

  return {
    key,
    kind,
    expiresAt: acceptedUntil(
      options.claims.exp,
      options.clockToleranceSeconds ?? SESSION_CLOCK_TOLERANCE_SECONDS
    ),
  };
}
