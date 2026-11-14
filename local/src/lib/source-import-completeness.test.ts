import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshNodeSnapshot } from "@subboost/server-core/subscription";
import { importSourceUrlDirect } from "./source-import";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("./source-import-settings", () => ({ getAllowUnsafeSubscriptionSources: mocks.settings }));
vi.mock("./pinned-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("./pinned-http")>(), requestPinnedText: mocks.request,
}));
vi.mock("@subboost/server-core/subscription/ssrf-ip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@subboost/server-core/subscription/ssrf-ip")>();
  // Stand in for a previously validated public address without contacting it.
  return { ...actual, isPrivateOrReservedIp: (ip: string) => ip === "203.0.113.1" ? false : actual.isPrivateOrReservedIp(ip) };
});
const basic = "{name: ss, type: ss, server: local.subboost.test, port: 443, cipher: aes-128-gcm, password: secret}";
const anytls = "{name: tls, type: anytls, server: local.subboost.test, port: 8443, password: pass}";

describe("local guarded snapshot negotiation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.settings.mockResolvedValue(false);
    mocks.lookup.mockResolvedValue([{ address: "203.0.113.1" }]);
  });
  it("imports a hidden protocol through the actual local adapter and shared parser", async () => {
    mocks.request.mockImplementation(async (options) => {
      const ua = options.userAgent;
      return { status: 200, headers: { profile: ua }, content: `proxies: [${basic}${ua === "clash-verge/v2.5.2" ? ", " + anytls : ""}]` };
    });
    const result = await importSourceUrlDirect({ url: "https://local.subboost.test/sub" });
    expect(result).toMatchObject({ ok: true, parsedNodes: [expect.objectContaining({ type: "ss" }), expect.objectContaining({ type: "anytls" })], headers: { profile: "clash-verge/v2.5.2" } });
    expect(mocks.request).toHaveBeenCalledTimes(4);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls.every(([options]) => options.addresses[0] === "203.0.113.1" && options.signal instanceof AbortSignal)).toBe(true);
  });

  it("retains the valid candidate when later profiles redirect into a private address", async () => {
    mocks.request.mockResolvedValueOnce({ status: 200, headers: {}, content: `proxies: [${basic}]` })
      .mockImplementation(async () => ({ status: 302, headers: { location: "http://127.0.0.1/private" }, content: "" }));
    const result = await importSourceUrlDirect({ url: "https://local.subboost.test/sub" });
    expect(result).toMatchObject({ ok: true, parsedNodes: [expect.objectContaining({ type: "ss" })] });
    expect(mocks.request).toHaveBeenCalledTimes(4);
    expect(mocks.request.mock.calls.every(([options]) => options.url === "https://local.subboost.test/sub")).toBe(true);
  });

  it("keeps stored nodes when a safe-mode DNS outage stops a refresh", async () => {
    mocks.lookup.mockRejectedValue(new Error("synthetic DNS outage"));
    const source = { id: "source", type: "url", content: "https://local.subboost.test/sub" };
    const stored = { name: "saved", type: "trojan", server: "local.subboost.test", port: 443, password: "test", _sourceIds: ["source"] } as const;
    const result = await refreshNodeSnapshot({
      config: { sources: [source] }, urls: [], storedNodes: [{ ...stored, _sourceIds: [...stored._sourceIds] }],
      fetchUrlNodes: async () => {
        const imported = await importSourceUrlDirect({ url: source.content });
        return imported.ok
          ? { ok: true, nodes: imported.parsedNodes }
          : { ok: false, nodes: [], error: imported.error, errorInfo: imported.errorInfo };
      },
    });
    expect(result.nodes).toEqual([expect.objectContaining(stored)]);
    expect(result.failedSources).toEqual([expect.objectContaining({ id: "source", errorCategory: "network" })]);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
