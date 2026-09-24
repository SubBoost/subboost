import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  deriveSessionRevocationIdentity,
  SESSION_CLOCK_TOLERANCE_SECONDS,
} from "./session-revocation";

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function tokenFor(payload: Record<string, unknown>, signature?: string) {
  const signingInput = `${base64UrlJson({ alg: "HS256" })}.${base64UrlJson(payload)}`;
  return `${signingInput}.${signature ?? createHmac("sha256", "secret").update(signingInput).digest("base64url")}`;
}

describe("session revocation identity", () => {
  it("uses the verified jti so separate sessions have separate keys", () => {
    const first = deriveSessionRevocationIdentity({
      namespace: "service",
      token: tokenFor({ exp: 100, jti: "session-a" }),
      claims: { exp: 100, jti: "session-a" },
    });
    const second = deriveSessionRevocationIdentity({
      namespace: "service",
      token: tokenFor({ exp: 100, jti: "session-b" }),
      claims: { exp: 100, jti: "session-b" },
    });

    expect(first.kind).toBe("jti");
    expect(first.key).not.toBe(second.key);
  });

  it("uses verified header.payload for legacy tokens, independent of signature spelling", () => {
    const payload = { exp: 100, sub: "user-1" };
    const original = tokenFor(payload, "signature-one");
    const equivalent = tokenFor(payload, "signature-two");

    const first = deriveSessionRevocationIdentity({ namespace: "service", token: original, claims: payload });
    const second = deriveSessionRevocationIdentity({ namespace: "service", token: equivalent, claims: payload });

    expect(first.kind).toBe("legacy");
    expect(first.key).toBe(second.key);
  });

  it("separates namespaces and retains records through the verification tolerance", () => {
    const token = tokenFor({ exp: 100, jti: "same-session" });
    const service = deriveSessionRevocationIdentity({
      namespace: "service",
      token,
      claims: { exp: 100, jti: "same-session" },
    });
    const local = deriveSessionRevocationIdentity({
      namespace: "local",
      token,
      claims: { exp: 100, jti: "same-session" },
    });

    expect(service.key).not.toBe(local.key);
    expect(service.expiresAt).toEqual(new Date((100 + SESSION_CLOCK_TOLERANCE_SECONDS) * 1000));
  });

  it("rejects malformed legacy tokens and sessions without a bounded expiration", () => {
    expect(() =>
      deriveSessionRevocationIdentity({ namespace: " ", token: "header.payload.signature", claims: { exp: 100 } })
    ).toThrow("namespace is required");
    expect(() =>
      deriveSessionRevocationIdentity({ namespace: "service", token: "broken", claims: { exp: 100 } })
    ).toThrow("compact JWS");
    expect(() =>
      deriveSessionRevocationIdentity({
        namespace: "service",
        token: tokenFor({ jti: "session" }),
        claims: { jti: "session" },
      })
    ).toThrow("expiration");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid expiration %s", (exp) => {
    expect(() => deriveSessionRevocationIdentity({
      namespace: "local",
      token: "header.payload.signature",
      claims: { exp, jti: "session" },
    })).toThrow("expiration");
  });

  it("uses legacy identity for blank jti and respects explicit clock tolerance", () => {
    const token = tokenFor({ exp: 100 });
    const identity = deriveSessionRevocationIdentity({
      namespace: "local", token, claims: { exp: 100, jti: " " }, clockToleranceSeconds: 0,
    });
    expect(identity.kind).toBe("legacy");
    expect(identity.expiresAt).toEqual(new Date(100000));
    expect(() => deriveSessionRevocationIdentity({
      namespace: "local", token: "header..signature", claims: { exp: 100 },
    })).toThrow("compact JWS");
  });
});
