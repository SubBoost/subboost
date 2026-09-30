import { describe, expect, it, vi } from "vitest";
import {
  buildSourceImportParseResult,
  importSubscriptionFromUrl,
  type SourceImportTransportRequest,
  type SourceImportTransportResult,
} from "./source-import";

const mihomoYaml = `
proxies:
  - name: node-a
    type: trojan
    server: example.com
    port: 443
    password: secret
`;

function ssLink(name = "SS Node"): string {
  const credential = Buffer.from("aes-128-gcm:secret").toString("base64url");
  return `ss://${credential}@ss.example.com:8388#${encodeURIComponent(name)}`;
}

describe("importSubscriptionFromUrl", () => {
  it("tries client user agents and keeps supplemental userinfo headers", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.purpose === "userinfo") {
        return {
          ok: true,
          content: "",
          headers: { "subscription-userinfo": "upload=1; download=2; total=3" },
        };
      }
      if (request.userAgent.startsWith("v2rayN/")) {
        return { ok: true, content: "please update your client", headers: {} };
      }
      return { ok: true, content: mihomoYaml, headers: { "content-type": "text/yaml" } };
    });

    const result = await importSubscriptionFromUrl(
      {
        url: "https://example.com/sub.yaml",
        userinfoUrl: "https://example.com/userinfo",
        userinfoUserAgent: "mihomo/1.19.24",
      },
      { fetchText }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsedNodes).toHaveLength(1);
    expect(result.headers["content-type"]).toBe("text/yaml");
    expect(result.headers["subscription-userinfo"]).toContain("total=3");
    expect(buildSourceImportParseResult(result)).toEqual({
      nodes: result.parsedNodes,
      errors: result.parseErrors,
      totalParsed: 1,
      totalFailed: 0,
    });
    expect(fetchText).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "v2rayN/7.20.4" }));
    expect(fetchText).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "mihomo/1.19.24" }));
  });

  it("continues to Mihomo when the v2rayN response is link-only and may be incomplete", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.userAgent.startsWith("v2rayN/")) {
        return { ok: true, content: ssLink("v2rayn"), headers: { "content-type": "text/plain" } };
      }
      return {
        ok: true,
        content: [
          "proxies:",
          "  - name: clash-a",
          "    type: trojan",
          "    server: clash-a.example.com",
          "    port: 443",
          "    password: secret",
          "  - name: clash-b",
          "    type: trojan",
          "    server: clash-b.example.com",
          "    port: 443",
          "    password: secret",
        ].join("\n"),
        headers: { "content-type": "text/yaml" },
      };
    });

    const result = await importSubscriptionFromUrl({ url: "https://example.com/sub.yaml" }, { fetchText });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsedNodes.map((node) => node.name)).toEqual(["clash-a", "clash-b"]);
    expect(fetchText).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "v2rayN/7.20.4" }));
    expect(fetchText).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "mihomo/1.19.24" }));
  });

  it("returns structured network failures", async () => {
    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      {
        fetchText: async () => ({
          ok: false,
          error: "HTTP 403",
          publicReason: "blocked",
          responseStatus: 403,
        }),
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.publicReason).toBe("blocked");
    expect(result.responseStatus).toBe(403);
    expect(result.errorInfo.category).toBe("network");
    expect(result.errorInfo.httpStatus).toBe(403);
  });

  it("rejects invalid urls before transport", async () => {
    const fetchText = vi.fn();
    const result = await importSubscriptionFromUrl({ url: "not a url" }, { fetchText });

    expect(result.ok).toBe(false);
    expect(fetchText).not.toHaveBeenCalled();
    if (result.ok) return;
    expect(result.error).toBe("无效的 url 格式");
    expect(result.errorInfo.category).toBe("format");
  });

  it("rejects non-http urls before transport", async () => {
    const fetchText = vi.fn();
    const result = await importSubscriptionFromUrl({ url: "file:///tmp/sub.yaml" }, { fetchText });

    expect(result.ok).toBe(false);
    expect(fetchText).not.toHaveBeenCalled();
    if (result.ok) return;
    expect(result.errorInfo.category).toBe("format");
  });

  it("returns parse failures when all fetched content is unusable placeholders", async () => {
    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      {
        userAgents: ["custom-agent"],
        fetchText: async () => ({
          ok: true,
          content: "请更新客户端后继续使用",
          headers: { " Content-Type ": "text/plain" },
        }),
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorInfo.category).toBe("parse");
  });

  it("keeps the better parsed attempt and uses fallback URL for userinfo headers", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.purpose === "userinfo") {
        return {
          ok: true,
          content: "",
          headers: {
            " Subscription-Userinfo ": "upload=10; download=20; total=30",
            "bad-header": 42 as unknown as string,
          },
        };
      }
      if (request.userAgent === "first") {
        return {
          ok: true,
          content: [
            "proxies:",
            "  - name: first",
            "    type: trojan",
            "    server: first.example.com",
            "    port: 443",
            "    password: secret",
          ].join("\n"),
          headers: { "Content-Type": "text/yaml" },
        };
      }
      return {
        ok: true,
        content: mihomoYaml,
        headers: { "Content-Type": "application/yaml" },
      };
    });

    const result = await importSubscriptionFromUrl(
      {
        url: "https://example.com/sub.yaml",
        userinfoUserAgent: "userinfo-agent",
      },
      {
        fetchText,
        userAgents: ["first", "second"],
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsedNodes[0]?.name).toBe("first");
    expect(result.headers["content-type"]).toBe("text/yaml");
    expect(result.headers["subscription-userinfo"]).toContain("total=30");
    expect(fetchText).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "userinfo",
        url: "https://example.com/sub.yaml",
        userAgent: "userinfo-agent",
        timeoutMs: 8000,
      })
    );
  });

  it("ignores invalid supplemental userinfo URLs", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.purpose === "userinfo") throw new Error("userinfo should not be fetched");
      return { ok: true, content: mihomoYaml, headers: { "content-type": "text/yaml" } };
    });

    const result = await importSubscriptionFromUrl(
      {
        url: "https://example.com/sub.yaml",
        userinfoUrl: "not a url",
      },
      { fetchText }
    );

    expect(result.ok).toBe(true);
    expect(fetchText).toHaveBeenCalledTimes(4);
  });

  it("prefers later usable attempts over failed transport attempts", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.userAgent === "bad") {
        return { ok: false, error: "HTTP 500", responseStatus: 500, publicReason: null };
      }
      return { ok: true, content: mihomoYaml, headers: { " ": "ignored", "Content-Type": "text/yaml" } };
    });

    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      { fetchText, userAgents: ["bad", "good"] }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsedNodes[0]?.name).toBe("node-a");
    expect(result.headers).toEqual({ "content-type": "text/yaml" });
  });

  it("prefers attempts with more nodes and fewer parse errors", async () => {
    const oneNodeWithError = [
      "proxies:",
      "  - name: first",
      "    type: trojan",
      "    server: first.example.com",
      "    port: 443",
      "    password: secret",
      "not a valid node",
    ].join("\n");
    const twoNodes = [
      "proxies:",
      "  - name: second-a",
      "    type: trojan",
      "    server: second-a.example.com",
      "    port: 443",
      "    password: secret",
      "  - name: second-b",
      "    type: trojan",
      "    server: second-b.example.com",
      "    port: 443",
      "    password: secret",
    ].join("\n");
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => ({
      ok: true,
      content: request.userAgent === "first" ? oneNodeWithError : twoNodes,
      headers: {},
    }));

    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      { fetchText, userAgents: ["first", "second"] }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsedNodes.map((node) => node.name)).toEqual(["second-a", "second-b"]);
  });

  it("returns fallback parse failures for empty parsed content and missing content", async () => {
    let result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      {
        fetchText: async () => ({
          ok: true,
          content: "",
          headers: {},
        }),
        userAgents: ["empty"],
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("未解析到有效节点");
      expect(result.errorInfo.category).toBe("parse");
    }

    result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      {
        fetchText: async () => ({
          ok: true,
          error: "",
          responseStatus: 204,
        }),
        userAgents: ["missing-content"],
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("获取 url 失败");
      expect(result.responseStatus).toBe(204);
    }
  });

  it("ignores failed supplemental userinfo fetches and uses the default user agent", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.purpose === "userinfo") {
        return { ok: false, error: "userinfo failed", headers: { "subscription-userinfo": "total=1" } };
      }
      return { ok: true, content: mihomoYaml, headers: { "content-type": "text/yaml" } };
    });

    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml", userinfoUrl: "https://example.com/userinfo" },
      { fetchText, userAgents: ["ok"], timeoutMs: 20_000 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headers).not.toHaveProperty("subscription-userinfo");
    expect(fetchText).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "userinfo",
        userAgent: "v2rayN/7.20.4",
        timeoutMs: 8000,
      })
    );
  });

  it("keeps an unusable parsed attempt over a later transport failure", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => {
      if (request.userAgent === "empty") {
        return { ok: true, content: "", headers: undefined };
      }
      return { ok: false, error: "HTTP 500", responseStatus: 500, publicReason: "HTTP 500" };
    });

    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      { fetchText, userAgents: ["empty", "failed"] }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("未解析到有效节点");
    expect(result.errorInfo.category).toBe("parse");
  });

  it("keeps the first transport failure when every attempt fails", async () => {
    const fetchText = vi.fn(async (request: SourceImportTransportRequest): Promise<SourceImportTransportResult> => ({
      ok: false,
      error: request.userAgent === "first" ? "HTTP 502" : "HTTP 403",
      responseStatus: request.userAgent === "first" ? 502 : 403,
      publicReason: request.userAgent === "first" ? "bad gateway" : "blocked",
    }));

    const result = await importSubscriptionFromUrl(
      { url: "https://example.com/sub.yaml" },
      { fetchText, userAgents: ["first", "second"] }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("HTTP 502");
    expect(result.responseStatus).toBe(502);
    expect(result.publicReason).toBe("bad gateway");
  });
});
