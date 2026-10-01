import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importSourceUrlDirect } from "./source-import";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("./source-import-settings", () => ({ getAllowUnsafeSubscriptionSources: mocks.settings }));
const basic = "{name: ss, type: ss, server: local.subboost.test, port: 443, cipher: aes-128-gcm, password: secret}";
const anytls = "{name: tls, type: anytls, server: local.subboost.test, port: 8443, password: pass}";

describe("local guarded snapshot negotiation", () => {
  beforeEach(() => {
    mocks.settings.mockResolvedValue(false);
    mocks.lookup.mockRejectedValue(new Error("synthetic unresolved hostname"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("imports a hidden protocol through the actual local adapter and shared parser", async () => {
    const fetch = vi.fn(async (_url, options) => {
      const ua = options.headers["User-Agent"];
      return new Response(`proxies: [${basic}${ua === "clash-verge/v2.5.2" ? ", " + anytls : ""}]`, { headers: { profile: ua } });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await importSourceUrlDirect({ url: "https://local.subboost.test/sub" });
    expect(result).toMatchObject({ ok: true, parsedNodes: [expect.objectContaining({ type: "ss" }), expect.objectContaining({ type: "anytls" })], headers: { profile: "clash-verge/v2.5.2" } });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.every(([, options]) => options.redirect === "manual" && options.signal instanceof AbortSignal)).toBe(true);
  });

  it("retains the valid candidate when later profiles redirect into a private address", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(`proxies: [${basic}]`))
      .mockImplementation(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    vi.stubGlobal("fetch", fetch);
    const result = await importSourceUrlDirect({ url: "https://local.subboost.test/sub" });
    expect(result).toMatchObject({ ok: true, parsedNodes: [expect.objectContaining({ type: "ss" })] });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([url]) => url === "https://local.subboost.test/sub")).toBe(true);
  });
});
