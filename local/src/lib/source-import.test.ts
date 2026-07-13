import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSourceUserInfoHeadersDirect, importSourceUrlDirect } from "./source-import";

const mocks = vi.hoisted(() => ({
  getAllowUnsafeSubscriptionSources: vi.fn(),
  lookup: vi.fn(),
  importSubscriptionFromUrl: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
}));

vi.mock("@local/lib/source-import-settings", () => ({
  getAllowUnsafeSubscriptionSources: mocks.getAllowUnsafeSubscriptionSources,
}));

vi.mock("@subboost/server-core/subscription", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@subboost/server-core/subscription")>();
  return {
    ...actual,
    importSubscriptionFromUrl: mocks.importSubscriptionFromUrl,
  };
});

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

function dnsResponse(addresses: string[]): Response {
  const question = new Uint8Array([
    3, 97, 112, 105, 4, 100, 108, 101, 114, 2, 105, 111, 0, 0, 1, 0, 1,
  ]);
  const answers: number[] = [];
  for (const address of addresses) {
    answers.push(0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04);
    answers.push(...address.split(".").map((part) => Number(part)));
  }
  const out = new Uint8Array(12 + question.length + answers.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, 0x8180);
  view.setUint16(4, 1);
  view.setUint16(6, addresses.length);
  out.set(question, 12);
  out.set(answers, 12 + question.length);
  return new Response(out, { status: 200 });
}

async function runTransport(url: string, overrides: Record<string, unknown> = {}) {
  mocks.importSubscriptionFromUrl.mockImplementationOnce(async (request, options) => {
    return options.fetchText({
      url,
      userAgent: "SubBoost Test",
      purpose: "content",
      timeoutMs: 15000,
      maxBytes: 1024,
      ...overrides,
    });
  });
  return importSourceUrlDirect({ url });
}

describe("local source import transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(false);
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    globalThis.fetch = vi.fn();
  });

  it("rejects private, local, credentialed, and unsupported URLs before fetching", async () => {
    await expect(runTransport("not a url")).resolves.toMatchObject({
      ok: false,
      publicReason: "无效的订阅 URL",
      errorInfo: { category: "security" },
    });
    await expect(runTransport("http://127.0.0.1/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
      errorInfo: { category: "security" },
    });
    await expect(runTransport("http://[::1]/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
    });
    await expect(runTransport("https://localhost/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
    });
    await expect(runTransport("https://router.local/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
    });
    await expect(runTransport("https://user:pass@example.com/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "订阅 URL 不允许包含用户名或密码",
    });
    await expect(runTransport("ftp://example.com/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "只支持 HTTP 或 HTTPS 订阅 URL",
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "10.0.0.2" }]);

    await expect(runTransport("https://example.com/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows all local and reserved address sources when the high-risk setting is enabled", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    const allowedUrls = [
      "http://localhost:8080/sub",
      "http://127.0.0.1/sub",
      "http://[::1]/sub",
      "http://router.local/sub",
      "http://10.1.2.3/sub",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/sub",
      "http://192.0.2.1/sub",
      "http://198.18.0.1/sub",
      "http://224.0.0.1/sub",
      "http://[fc00::1]/sub",
      "http://[fe80::1]/sub",
      "http://[::ffff:192.168.0.1]/sub",
    ];

    for (const url of allowedUrls) {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("ss://node", { status: 200 }));
      await expect(runTransport(url)).resolves.toMatchObject({ ok: true, content: "ss://node" });
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("keeps URL scheme and embedded-credential checks enabled for high-risk sources", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    await expect(runTransport("ftp://127.0.0.1/sub")).resolves.toMatchObject({ ok: false });
    await expect(runTransport("http://user:pass@127.0.0.1/sub")).resolves.toMatchObject({ ok: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rechecks fake-ip DNS answers with DoH before fetching the subscription", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "198.18.3.6" }]);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(dnsResponse(["93.184.216.34"]))
      .mockResolvedValueOnce(dnsResponse([]))
      .mockResolvedValueOnce(response("ss://node", { status: 200 }));

    await expect(runTransport("https://api.dler.io/sub")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "https://doh.pub/dns-query",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/dns-message",
          "Content-Type": "application/dns-message",
        },
        body: expect.any(ArrayBuffer),
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "https://api.dler.io/sub",
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
  });

  it("keeps blocking fake-ip DNS answers when DoH confirms an unsafe target", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "198.18.3.6" }]);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(dnsResponse(["10.0.0.2"]))
      .mockResolvedValueOnce(dnsResponse([]));

    await expect(runTransport("https://fake-ip-private.example/sub")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("lets the explicit high-risk setting bypass fake-ip DNS blocking", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("ss://node", { status: 200 }));

    await expect(runTransport("https://fake-ip-private.example/sub")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://fake-ip-private.example/sub",
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
  });

  it("rejects additional private IPv4 and IPv6 address ranges", async () => {
    const blockedUrls = [
      "http://0.0.0.0/sub",
      "http://10.1.2.3/sub",
      "http://100.64.0.1/sub",
      "http://169.254.1.1/sub",
      "http://172.16.0.1/sub",
      "http://192.168.1.1/sub",
      "http://192.0.2.1/sub",
      "http://198.18.0.1/sub",
      "http://198.51.100.1/sub",
      "http://203.0.113.1/sub",
      "http://224.0.0.1/sub",
      "http://[::]/sub",
      "http://[fc00::1]/sub",
      "http://[fd00::1]/sub",
      "http://[fe80::1]/sub",
      "http://[febf::1]/sub",
      "http://[ff00::1]/sub",
      "http://[2001:db8::1]/sub",
      "http://[::ffff:192.168.0.1]/sub",
    ];

    for (const url of blockedUrls) {
      await expect(runTransport(url)).resolves.toMatchObject({
        ok: false,
        publicReason: "禁止访问本机或内网地址",
      });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows fetch attempts when DNS lookup fails without private records", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("dns down"));
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("ss://node", { status: 200 }));

    await expect(runTransport("https://example.com/sub")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
    });
  });

  it("follows redirects and returns text plus normalized headers", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        response("", {
          status: 302,
          headers: { location: "/next" },
        })
      )
      .mockResolvedValueOnce(
        response("ss://node", {
          status: 200,
          headers: {
            "Subscription-Userinfo": "upload=2048; total=4096",
            "Content-Length": "9",
          },
        })
      );

    await expect(runTransport("https://example.com/sub")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
      responseStatus: 200,
      headers: {
        "content-length": "9",
        "subscription-userinfo": "upload=2048; total=4096",
      },
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "https://example.com/sub",
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "https://example.com/next",
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
  });

  it("reports HTTP failures and oversized responses with public reasons", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("bad", { status: 503 }));

    await expect(runTransport("https://example.com/sub")).resolves.toMatchObject({
      ok: false,
      error: "HTTP 503",
      publicReason: "HTTP 503",
      responseStatus: 503,
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      response("", {
        status: 200,
        headers: { "Content-Length": "2048" },
      })
    );
    await expect(runTransport("https://example.com/big")).resolves.toMatchObject({
      ok: false,
      publicReason: "HTTP 413",
      responseStatus: 413,
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("x".repeat(2048), { status: 200 }));
    await expect(runTransport("https://example.com/body-big")).resolves.toMatchObject({
      ok: false,
      publicReason: "HTTP 413",
      responseStatus: 413,
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      response("ss://node", {
        status: 200,
        headers: { "Content-Length": "unknown" },
      })
    );
    await expect(runTransport("https://example.com/unknown-length")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
    });
  });

  it("handles redirect loops, missing locations, and thrown fetch errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response("", { status: 302, headers: { location: "/next" } }));
    await expect(runTransport("https://example.com/loop")).resolves.toMatchObject({
      ok: false,
      publicReason: "HTTP 310",
      responseStatus: 310,
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("redirect", { status: 302 }));
    await expect(runTransport("https://example.com/missing-location")).resolves.toMatchObject({
      ok: false,
      error: "HTTP 302",
      publicReason: "HTTP 302",
      responseStatus: 302,
    });

    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network down"));
    await expect(runTransport("https://example.com/error")).resolves.toMatchObject({
      ok: false,
      error: "network down",
      publicReason: "network down",
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("", { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    await expect(runTransport("https://example.com/private-redirect")).resolves.toMatchObject({
      ok: false,
      publicReason: "禁止访问本机或内网地址",
    });
  });

  it("applies the enabled high-risk setting to redirect targets", async () => {
    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(response("", { status: 302, headers: { location: "http://127.0.0.1/sub" } }))
      .mockResolvedValueOnce(response("ss://node", { status: 200 }));

    await expect(runTransport("https://example.com/private-redirect")).resolves.toMatchObject({
      ok: true,
      content: "ss://node",
    });
    expect(mocks.getAllowUnsafeSubscriptionSources).toHaveBeenCalledTimes(1);
  });

  it("returns userinfo headers with HEAD and skips when no userinfo URL is configured", async () => {
    await expect(fetchSourceUserInfoHeadersDirect({})).resolves.toBeUndefined();

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      response("", {
        status: 200,
        headers: { "Subscription-Userinfo": "upload=1; total=2048" },
      })
    );

    await expect(
      fetchSourceUserInfoHeadersDirect({
        userinfoUrl: "https://example.com/userinfo",
        userinfoUserAgent: " Custom UA ",
      })
    ).resolves.toMatchObject({
      "subscription-userinfo": "upload=1; total=2048",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/userinfo",
      expect.objectContaining({
        method: "HEAD",
        headers: expect.objectContaining({ "User-Agent": "Custom UA" }),
      })
    );

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response("", { status: 404 }));
    await expect(fetchSourceUserInfoHeadersDirect({ userinfoUrl: "https://example.com/missing" })).resolves.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://example.com/missing",
      expect.objectContaining({
        method: "HEAD",
        headers: expect.objectContaining({ "User-Agent": expect.any(String) }),
      })
    );

    mocks.getAllowUnsafeSubscriptionSources.mockResolvedValue(true);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      response("", { status: 200, headers: { "Subscription-Userinfo": "upload=2; total=4096" } })
    );
    await expect(fetchSourceUserInfoHeadersDirect({ userinfoUrl: "http://127.0.0.1/userinfo" })).resolves.toMatchObject({
      "subscription-userinfo": "upload=2; total=4096",
    });
  });
});
