import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshNodeSnapshot } from "./refresh-node-snapshot";
import type { ParsedNode } from "@subboost/core/types/node";
import { SOURCE_IDS_KEY } from "@subboost/core/subscription/node-source-state";
import * as parser from "@subboost/core/parser";

const node: ParsedNode = {
  name: "node-a",
  type: "trojan",
  server: "example.com",
  port: 443,
  password: "secret",
};

describe("refreshNodeSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses shared saved-source normalization for fallback URLs", async () => {
    const fetchUrlNodes = vi.fn(async () => ({
      ok: true,
      nodes: [node],
      headers: {},
    }));

    const result = await refreshNodeSnapshot({
      config: {},
      urls: [" https://example.com/sub&token=abc "],
      storedNodes: [],
      fetchUrlNodes,
    });

    expect(fetchUrlNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "source_1",
        type: "url",
        content: "https://example.com/sub?token=abc",
      })
    );
    expect(result.savedSources).toEqual([
      {
        id: "source_1",
        type: "url",
        content: "https://example.com/sub?token=abc",
        lastParsedContent: "https://example.com/sub?token=abc",
      },
    ]);
    expect(result.nodes).toHaveLength(1);
    expect(result.attemptedUrlFetch).toBe(true);
    expect(result.usedUrlFetch).toBe(true);
  });

  it("detaches proxy-provider source nodes and still collects supplemental userinfo", async () => {
    const fetchUrlNodes = vi.fn();
    const fetchUrlUserInfo = vi.fn(async () => ({
      "subscription-userinfo": "upload=1024; download=2048; total=4096",
      "profile-web-page-url": "https://profile.example.com/",
      "plan-name": "Premium",
    }));

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "provider",
            type: "url",
            content: "https://provider.example.com/sub",
            useProxyProviders: true,
            userinfoUrl: "https://provider.example.com/userinfo",
          },
        ],
      },
      urls: [],
      storedNodes: [
        {
          ...node,
          name: "provider node",
          [SOURCE_IDS_KEY]: ["provider"],
        } as ParsedNode,
        {
          ...node,
          name: "manual node",
          server: "manual.example.com",
        },
      ],
      fetchUrlNodes,
      fetchUrlUserInfo,
    });

    expect(fetchUrlNodes).not.toHaveBeenCalled();
    expect(fetchUrlUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "provider",
        useProxyProviders: true,
      })
    );
    expect(result.nodes.map((item) => item.name)).toEqual(["manual node"]);
    expect(result.detachedSourceCount).toBe(1);
    expect(result.refreshedSourceCount).toBe(1);
    expect(result.subscriptionInfo).toMatchObject({
      upload: 1024,
      download: 2048,
      total: 4096,
      profileWebPageUrl: "https://profile.example.com/",
      planName: "Premium",
    });
  });

  it("records URL fetch failures with structured import metadata", async () => {
    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "broken",
            type: "url",
            content: "https://broken.example.com/sub",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(async () => ({
        ok: false,
        nodes: [],
        errors: ["parse fallback"],
        errorInfo: {
          category: "network" as const,
          message: "HTTP 403",
          detail: "blocked by upstream",
          httpStatus: 403,
        },
        publicReason: "目标订阅服务返回 HTTP 403",
        responseStatus: 403,
      })),
    });

    expect(result.usedUrlFetch).toBe(false);
    expect(result.failedSourceCount).toBe(1);
    expect(result.failedSources).toEqual([
      {
        id: "broken",
        type: "url",
        content: "https://broken.example.com/sub",
        errorMessage: "blocked by upstream",
        errorCategory: "network",
        httpStatus: 403,
        publicReason: "目标订阅服务返回 HTTP 403",
      },
    ]);
  });

  it("refreshes static node sources and records parse failures", async () => {
    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "static-ok",
            type: "nodes",
            content: "trojan://secret@static.example.com:443#Static",
            tag: "Local",
            nameTemplate: "[{tag}]{name}",
          },
          {
            id: "static-bad",
            type: "nodes",
            content: "not a node link",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(),
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      name: "[Local]Static",
      server: "static.example.com",
      [SOURCE_IDS_KEY]: ["static-ok"],
    });
    expect(result.refreshedStaticSourceCount).toBe(1);
    expect(result.failedSourceCount).toBe(1);
    expect(result.failedSources[0]).toMatchObject({
      id: "static-bad",
      errorCategory: "parse",
      errorMessage: "未解析到可用节点",
    });
  });

  it("uses supplemental userinfo after a successful URL refresh when headers are incomplete", async () => {
    const fetchUrlUserInfo = vi.fn(async () => ({
      "subscription-userinfo": "upload=4096; download=8192; total=16384",
      "plan-name": "URL Plan",
    }));

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "url",
            type: "url",
            content: "https://url.example.com/sub",
            userinfoUrl: "https://url.example.com/userinfo",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(async () => ({
        ok: true,
        nodes: [node],
        headers: {
          "profile-web-page-url": "https://profile.example.com/",
        },
      })),
      fetchUrlUserInfo,
    });

    expect(fetchUrlUserInfo).toHaveBeenCalledTimes(1);
    expect(result.usedUrlFetch).toBe(true);
    expect(result.refreshedUrlSourceCount).toBe(1);
    expect(result.subscriptionInfo).toMatchObject({
      upload: 4096,
      download: 8192,
      total: 16384,
      profileWebPageUrl: "https://profile.example.com/",
      planName: "URL Plan",
    });
    expect(result.savedSources[0]).toMatchObject({
      id: "url",
      subscriptionUserInfo: {
        upload: 4096,
        download: 8192,
        total: 16384,
      },
    });
  });

  it("updates per-source userinfo without copying it to unrelated sources", async () => {
    const fetchUrlNodes = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        nodes: [{ ...node, name: "source a", server: "a.example.com" }],
        headers: { "subscription-userinfo": "upload=1024; download=2048; total=4096" },
      })
      .mockResolvedValueOnce({
        ok: true,
        nodes: [{ ...node, name: "source b", server: "b.example.com" }],
        headers: {},
      });

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          { id: "a", type: "url", content: "https://a.example.com/sub" },
          { id: "b", type: "url", content: "https://b.example.com/sub" },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes,
    });

    expect(result.subscriptionInfo).toMatchObject({ upload: 1024, download: 2048, total: 4096 });
    expect(result.savedSources).toEqual([
      expect.objectContaining({
        id: "a",
        subscriptionUserInfo: { upload: 1024, download: 2048, total: 4096 },
      }),
      expect.not.objectContaining({
        subscriptionUserInfo: expect.anything(),
      }),
    ]);
  });

  it("preserves failed source userinfo snapshots", async () => {
    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "stale",
            type: "url",
            content: "https://stale.example.com/sub",
            subscriptionUserInfo: { upload: 1, total: 1024 },
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(async () => ({
        ok: false,
        nodes: [],
        error: "network",
      })),
    });

    expect(result.failedSourceCount).toBe(1);
    expect(result.savedSources[0]).toMatchObject({
      id: "stale",
      subscriptionUserInfo: { upload: 1, total: 1024 },
    });
  });

  it("ignores malformed deleted-node descriptors while preserving identical stable metadata", async () => {
    const fetchUrlNodes = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        nodes: [{ ...node, name: "source a", server: "a.example.com" }],
        headers: {
          "profile-web-page-url": "https://same-profile.example.com/",
          "plan-name": "Shared Plan",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        nodes: [{ ...node, name: "source b", server: "b.example.com" }],
        headers: {
          "profile-web-page-url": "https://same-profile.example.com/",
          "plan-name": "Shared Plan",
        },
      });

    const result = await refreshNodeSnapshot({
      config: {
        deletedNodes: [null, ["bad"], { sourceId: "url-a", name: "Missing" }],
        sources: [
          { id: "url-a", type: "url", content: "https://a.example.com/sub" },
          { id: "url-b", type: "url", content: "https://b.example.com/sub" },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes,
    });

    expect(result.subscriptionInfo).toMatchObject({
      profileWebPageUrl: "https://same-profile.example.com/",
      planName: "Shared Plan",
    });
    expect(result.usedUrlFetch).toBe(true);
  });

  it("skips provider supplemental fetches when no userinfo metadata is configured", async () => {
    const fetchUrlUserInfo = vi.fn();

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "provider",
            type: "url",
            content: "https://provider.example.com/sub",
            useProxyProviders: true,
          },
        ],
      },
      urls: [],
      storedNodes: [
        {
          ...node,
          name: "provider node",
          [SOURCE_IDS_KEY]: ["provider"],
        } as ParsedNode,
      ],
      fetchUrlNodes: vi.fn(),
      fetchUrlUserInfo,
    });

    expect(fetchUrlUserInfo).not.toHaveBeenCalled();
    expect(result.detachedSourceCount).toBe(1);
    expect(result.refreshedSourceCount).toBe(1);
  });

  it("merges supplemental stable metadata even when supplemental userinfo is absent", async () => {
    const fetchUrlUserInfo = vi.fn(async () => ({
      "profile-web-page-url": "https://supplemental.example.com/",
      "plan-name": "Supplemental Plan",
    }));

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "url",
            type: "url",
            content: "https://url.example.com/sub",
            userinfoUrl: "https://url.example.com/userinfo",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(async () => ({
        ok: true,
        nodes: [{ ...node, name: "url node", server: "url.example.com" }],
        headers: {},
      })),
      fetchUrlUserInfo,
    });

    expect(fetchUrlUserInfo).toHaveBeenCalledTimes(1);
    expect(result.subscriptionInfo).toMatchObject({
      profileWebPageUrl: "https://supplemental.example.com/",
      planName: "Supplemental Plan",
    });
    expect(result.savedSources[0]).not.toHaveProperty("subscriptionUserInfo");
  });

  it("merges URL userinfo from nodes while suppressing conflicted stable metadata", async () => {
    const fetchUrlNodes = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        nodes: [
          { name: "剩余流量: 8 GB", type: "direct" } as ParsedNode,
          { name: "总流量: 10 GB", type: "direct" } as ParsedNode,
        ],
        headers: {
          "profile-web-page-url": "https://profile-a.example.com/",
          "plan-name": "Plan A",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        nodes: [{ ...node, name: "regular node", server: "b.example.com" }],
        headers: {
          "profile-web-page-url": "https://profile-b.example.com/",
          "plan-name": "Plan B",
        },
      });

    const result = await refreshNodeSnapshot({
      config: {
        smartNodeMatchingEnabled: false,
        deletedNodeNames: ["deleted"],
        sources: [
          {
            id: "url-a",
            type: "url",
            content: "https://a.example.com/sub",
            lastParsedContent: "https://old.example.com/sub",
          },
          {
            id: "url-b",
            type: "url",
            content: "https://b.example.com/sub",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes,
    });

    expect(result.usedUrlFetch).toBe(true);
    expect(result.refreshedUrlSourceCount).toBe(2);
    expect(result.subscriptionInfo).toMatchObject({
      upload: 2 * 1024 ** 3,
      download: 0,
      total: 10 * 1024 ** 3,
    });
    expect(result.subscriptionInfo).not.toHaveProperty("profileWebPageUrl");
    expect(result.subscriptionInfo).not.toHaveProperty("planName");
  });

  it("records URL failures from message, fetch error, parse error, and default fallback", async () => {
    const fetchUrlNodes = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        nodes: [],
        errorInfo: {
          category: "network",
          message: "HTTP 500",
        },
        responseStatus: 500,
      })
      .mockResolvedValueOnce({
        ok: false,
        nodes: [],
        error: "fetch failed",
      })
      .mockResolvedValueOnce({
        ok: true,
        nodes: [],
        errors: ["parse failed"],
      })
      .mockResolvedValueOnce({
        ok: true,
        nodes: [],
      });

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          { id: "message", type: "url", content: "https://message.example.com/sub" },
          { id: "fetch", type: "url", content: "https://fetch.example.com/sub" },
          { id: "parse", type: "url", content: "https://parse.example.com/sub" },
          { id: "default", type: "url", content: "https://default.example.com/sub" },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes,
    });

    expect(result.failedSources).toEqual([
      expect.objectContaining({ id: "message", errorMessage: "HTTP 500", errorCategory: "network", httpStatus: 500 }),
      expect.objectContaining({ id: "fetch", errorMessage: "fetch failed" }),
      expect.objectContaining({ id: "parse", errorMessage: "parse failed", errorCategory: "parse" }),
      expect.objectContaining({ id: "default", errorMessage: "未解析到可用节点" }),
    ]);
    expect(result.failedSourceCount).toBe(4);
    expect(result.usedUrlFetch).toBe(false);
  });

  it("skips supplemental provider userinfo when no headers are returned", async () => {
    const fetchUrlUserInfo = vi.fn(async () => undefined);

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "provider",
            type: "url",
            content: "https://provider.example.com/sub",
            useProxyProviders: true,
            userinfoUrl: "https://provider.example.com/userinfo",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(),
      fetchUrlUserInfo,
    });

    expect(fetchUrlUserInfo).toHaveBeenCalledTimes(1);
    expect(result.subscriptionInfo).toEqual({});
    expect(result.detachedSourceCount).toBe(0);
    expect(result.refreshedSourceCount).toBe(0);
  });

  it("records non-Error static parse exceptions with the generic parse message", async () => {
    vi.spyOn(parser, "parseSubscription").mockImplementationOnce(() => {
      throw "bad parser";
    });

    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "static-throw",
            type: "nodes",
            content: "trojan://secret@static.example.com:443#Static",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(),
    });

    expect(result.failedSources).toEqual([
      expect.objectContaining({
        id: "static-throw",
        errorCategory: "parse",
        errorMessage: "解析失败",
      }),
    ]);
  });

  it("keeps provider settings on saved sources after refresh", async () => {
    const result = await refreshNodeSnapshot({
      config: {
        sources: [
          {
            id: "provider",
            type: "url",
            content: "https://provider.example.com/sub",
            useProxyProviders: true,
            providerKey: "my_key",
            providerMode: "grouped",
            providerGroupName: "✈️ 机场A",
            providerFilter: "",
          },
        ],
      },
      urls: [],
      storedNodes: [],
      fetchUrlNodes: vi.fn(),
    });

    expect(result.savedSources).toEqual([
      {
        id: "provider",
        type: "url",
        content: "https://provider.example.com/sub",
        useProxyProviders: true,
        providerKey: "my_key",
        providerMode: "grouped",
        providerGroupName: "✈️ 机场A",
        providerFilter: "",
      },
    ]);
  });
});
