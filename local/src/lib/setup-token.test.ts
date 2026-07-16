import { afterEach, describe, expect, it } from "vitest";
import { LOCAL_SETUP_TOKEN_HEADER, validateLocalSetupToken } from "./setup-token";

describe("local setup token", () => {
  const original = process.env.LOCAL_SETUP_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.LOCAL_SETUP_TOKEN;
    else process.env.LOCAL_SETUP_TOKEN = original;
  });

  it("fails closed when the operator token is missing", () => {
    delete process.env.LOCAL_SETUP_TOKEN;
    expect(validateLocalSetupToken(new Request("https://local.test"))).toBe("missing_config");
  });

  it("accepts only an exact setup token supplied through the dedicated header", () => {
    process.env.LOCAL_SETUP_TOKEN = "expected-secret";
    expect(validateLocalSetupToken(new Request("https://local.test"))).toBe("invalid");
    expect(validateLocalSetupToken(new Request("https://local.test", {
      headers: { [LOCAL_SETUP_TOKEN_HEADER]: "wrong-secret" },
    }))).toBe("invalid");
    expect(validateLocalSetupToken(new Request("https://local.test", {
      headers: { [LOCAL_SETUP_TOKEN_HEADER]: "expected-secret" },
    }))).toBe("valid");
  });
});
