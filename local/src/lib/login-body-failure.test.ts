import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./http")>();
  return {
    ...actual,
    readJsonBody: async (request: Request, maxBytes: number) => {
      await actual.readJsonBody(request, maxBytes);
      throw new Error("unexpected body reader failure");
    },
  };
});
import { clearLoginBodyLimitForTests, readLoginBody } from "./login-body";

describe("login body unexpected reader failures", () => {
  afterEach(() => { clearLoginBodyLimitForTests(); vi.unstubAllEnvs(); });

  it("returns a body error and releases admission after each unexpected rejection", async () => {
    vi.stubEnv("NODE_ENV", "test");
    clearLoginBodyLimitForTests();
    for (let i = 0; i < 12; i += 1) {
      const request = new Request("http://local.subboost.test/api/auth/login", { method: "POST", body: "{}" });
      expect(await readLoginBody(request)).toEqual({ kind: "parsed", result: { ok: false, reason: "invalid_json" } });
    }
  });
});
