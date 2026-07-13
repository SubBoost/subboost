import { describe, expect, it } from "vitest";

import { extractBearerToken, validateCronSecret } from "./cron-auth";

describe("server-core cron auth helpers", () => {
  it("extracts bearer tokens case-insensitively and trims padding", () => {
    expect(extractBearerToken(null)).toBe("");
    expect(extractBearerToken("secret")).toBe("");
    expect(extractBearerToken("Bearer secret  ")).toBe("secret");
    expect(extractBearerToken("bearer secret  ")).toBe("secret");
  });

  it("validates cron secrets without deciding shell response details", () => {
    expect(validateCronSecret({ cronSecret: "", authorization: "Bearer secret" })).toEqual({
      ok: false,
      reason: "missing-secret",
    });
    expect(validateCronSecret({ cronSecret: "secret", authorization: "Bearer wrong" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(validateCronSecret({ cronSecret: "a-much-longer-secret", authorization: "Bearer short" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(validateCronSecret({ cronSecret: "secret", authorization: "bearer secret  " })).toEqual({
      ok: true,
    });
  });
});
