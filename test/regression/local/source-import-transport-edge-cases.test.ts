import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSubscriptionImportErrorInfo: vi.fn((value) => value),
  getAllowUnsafeSubscriptionSources: vi.fn(),
  importSubscriptionFromUrl: vi.fn(),
  inferSubscriptionImportErrorCategory: vi.fn(() => "network"),
  isPrivateOrReservedIp: vi.fn(() => false),
  lookup: vi.fn(),
  normalizeResolvedIpAddresses: vi.fn((addresses: string[]) => addresses),
  requestPinnedText: vi.fn(),
  resolveHostnameByDoh: vi.fn(),
  sanitizePublicErrorText: vi.fn((value: string) => value),
  selectDnsAddressesAfterFakeIpRecheck: vi.fn((_current: string[], next: string[]) => next),
  shouldRecheckFakeIpDnsAnswers: vi.fn(() => false),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("@subboost/core/subscription/import-error", () => ({
  createSubscriptionImportErrorInfo: mocks.createSubscriptionImportErrorInfo,
  inferSubscriptionImportErrorCategory: mocks.inferSubscriptionImportErrorCategory,
  sanitizePublicErrorText: mocks.sanitizePublicErrorText,
}));
vi.mock("@subboost/server-core/subscription", () => ({
  importSubscriptionFromUrl: mocks.importSubscriptionFromUrl,
  SUBSCRIPTION_IMPORT_USER_AGENTS: ["SubBoost Regression"],
}));
vi.mock("@subboost/server-core/subscription/doh-resolver", () => ({
  resolveHostnameByDoh: mocks.resolveHostnameByDoh,
}));
vi.mock("@subboost/server-core/subscription/ssrf-ip", () => ({
  isPrivateOrReservedIp: mocks.isPrivateOrReservedIp,
  normalizeResolvedIpAddresses: mocks.normalizeResolvedIpAddresses,
  selectDnsAddressesAfterFakeIpRecheck: mocks.selectDnsAddressesAfterFakeIpRecheck,
  shouldRecheckFakeIpDnsAnswers: mocks.shouldRecheckFakeIpDnsAnswers,
}));
vi.mock("../../../local/src/lib/source-import-settings", () => ({
  getAllowUnsafeSubscriptionSources: mocks.getAllowUnsafeSubscriptionSources,
}));
vi.mock("../../../local/src/lib/pinned-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../local/src/lib/pinned-http")>();
  return { ...actual, requestPinnedText: mocks.requestPinnedText };
});

import { importSourceUrlDirect } from "../../../local/src/lib/source-import";

async function runTransport(url: string, overrides: Record<string, unknown> = {}) {
  mocks.importSubscriptionFromUrl.mockImplementationOnce(async (_request, options) => options.fetchText({
    url,
    userAgent: "SubBoost Regression",
    purpose: "content",
    timeoutMs: 100,
    maxBytes: 64,
    ...overrides,
  }));
  return importSourceUrlDirect({ url });
}

function mockedResponse(params: {
  body: null | { cancel: ReturnType<typeof vi.fn>; getReader?: () => unknown };
  headers?: Headers;
  status: number;
}) {
  return {
    body: params.body,
    headers: params.headers ?? new Headers(),
    status: params.status,
  } as unknown as Response;
}

describe("local source-import transport edge behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(false);
    mocks.lookup.mockRejectedValue(new Error("dns unavailable"));
    mocks.normalizeResolvedIpAddresses.mockImplementation((addresses: string[]) => addresses);
    mocks.shouldRecheckFakeIpDnsAnswers.mockReturnValue(false);
    mocks.selectDnsAddressesAfterFakeIpRecheck.mockImplementation((_current, next) => next);
    mocks.isPrivateOrReservedIp.mockReturnValue(false);
    mocks.sanitizePublicErrorText.mockImplementation((value: string) => value);
    mocks.requestPinnedText.mockResolvedValue({ status: 200, headers: {}, content: "ss://node" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ss://node", { status: 200 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pins a validated public IP literal without DNS lookup", async () => {
    await expect(runTransport("http://8.8.8.8/sub")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
    });

    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.requestPinnedText).toHaveBeenCalledWith(expect.objectContaining({
      addresses: ["8.8.8.8"],
    }));
  });

  it("rejects a lookup that normalizes to no validated address", async () => {
    mocks.lookup.mockResolvedValue([{ address: "203.0.113.1" }]);
    mocks.normalizeResolvedIpAddresses.mockReturnValue([]);

    await expect(runTransport("https://example.test/sub")).resolves.toMatchObject({
      ok: false, errorInfo: { category: "network" },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.requestPinnedText).not.toHaveBeenCalled();
  });

  it.each(["failed", "empty"])("does not fetch when DNS is %s", async (answer) => {
    if (answer === "empty") mocks.lookup.mockResolvedValueOnce([]);
    else mocks.lookup.mockRejectedValueOnce(new Error("dns unavailable"));
    await expect(runTransport("https://local.subboost.test/sub")).resolves.toMatchObject({
      ok: false, errorInfo: { category: "network" },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.requestPinnedText).not.toHaveBeenCalled();
  });

  it("blocks original fake-IP answers when a recheck returns no usable address", async () => {
    mocks.lookup.mockResolvedValue([{ address: "198.18.3.6" }]);
    mocks.shouldRecheckFakeIpDnsAnswers.mockReturnValue(true);
    mocks.selectDnsAddressesAfterFakeIpRecheck.mockReturnValue([]);
    mocks.resolveHostnameByDoh.mockResolvedValueOnce([]);
    mocks.isPrivateOrReservedIp.mockReturnValueOnce(false).mockReturnValueOnce(true);

    await expect(runTransport("https://example.test/sub")).resolves.toMatchObject({
      ok: false, errorInfo: { category: "security" },
    });
    expect(mocks.resolveHostnameByDoh).toHaveBeenCalledTimes(1);
    expect(mocks.selectDnsAddressesAfterFakeIpRecheck).toHaveBeenCalledWith(["198.18.3.6"], []);
    expect(mocks.isPrivateOrReservedIp).toHaveBeenCalledWith("198.18.3.6");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.requestPinnedText).not.toHaveBeenCalled();
  });

  it("uses the stable fallback message for a blank thrown value", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    mocks.sanitizePublicErrorText.mockReturnValue("");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject("")));

    await expect(runTransport("https://example.test/sub")).resolves.toMatchObject({
      ok: false,
      error: "获取 url 失败",
      publicReason: "获取 url 失败",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("handles a missing response body without reading a stream", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => mockedResponse({ body: null, status: 200 })));

    await expect(runTransport("https://example.test/empty")).resolves.toMatchObject({
      ok: true,
      content: "",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("contains redirect-body cancellation failures", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    const cancel = vi.fn(async () => {
      throw new Error("cancel failed");
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(mockedResponse({
        body: { cancel },
        headers: new Headers({ location: "/next" }),
        status: 302,
      }))
      .mockResolvedValueOnce(mockedResponse({ body: null, status: 200 })));

    await expect(runTransport("https://example.test/start")).resolves.toMatchObject({ ok: true });
    expect(cancel).toHaveBeenCalledWith("redirect response is not consumed");
  });

  it("contains declared-length cancellation failures", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    const cancel = vi.fn(async () => {
      throw new Error("cancel failed");
    });
    vi.stubGlobal("fetch", vi.fn(async () => mockedResponse({
      body: { cancel },
      headers: new Headers({ "Content-Length": "1024" }),
      status: 200,
    })));

    await expect(runTransport("https://example.test/large")).resolves.toMatchObject({
      ok: false,
      responseStatus: 413,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("contains streamed-body cancellation failures", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    const cancel = vi.fn(async () => {
      throw new Error("cancel failed");
    });
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(65) })
      .mockResolvedValueOnce({ done: true, value: undefined });
    vi.stubGlobal("fetch", vi.fn(async () => mockedResponse({
      body: { cancel, getReader: () => ({ cancel, read }) },
      status: 200,
    })));

    await expect(runTransport("https://example.test/stream-large")).resolves.toMatchObject({
      ok: false,
      responseStatus: 413,
    });
    expect(cancel).toHaveBeenCalledWith("response too large");
  });

  it("aborts a request when the transport timeout expires", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")));
    })));

    const pending = runTransport("https://example.test/slow", { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: "request aborted",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
