import { describe, expect, it } from "vitest";
import {
  areSubscriptionUrlListsEquivalent,
  normalizeSubscriptionConfigForPersistence,
  normalizeSubscriptionInfoForPersistence,
  normalizeSubscriptionName,
  normalizeSubscriptionNodeList,
  normalizeSubscriptionUrlList,
  serializeSubscriptionDetailData,
  serializeSubscriptionSummaryData,
  validateSubscriptionNodeList,
} from "./crud";

describe("subscription CRUD shared helpers", () => {
  it("normalizes create/update payload fields", () => {
    expect(normalizeSubscriptionName("  Demo  ")).toBe("Demo");
    expect(normalizeSubscriptionName(123)).toBe("");
    expect(normalizeSubscriptionUrlList([" https://example.com/sub ", 123, ""])).toEqual(["https://example.com/sub"]);
    expect(
      normalizeSubscriptionNodeList([
        { name: "Node", type: "ss", server: "node.example.com", port: 443, "dialer-proxy": "proxy" },
      ] as any)
    ).toEqual([{ name: "Node", type: "ss", server: "node.example.com", port: 443 }]);
    expect(normalizeSubscriptionInfoForPersistence({ upload: 1, download: 2, total: 3, ignored: "x" })).toEqual({
      upload: 1,
      download: 2,
      total: 3,
    });
    expect(areSubscriptionUrlListsEquivalent(["b", "a"], ["a", "b"])).toBe(true);
    expect(areSubscriptionUrlListsEquivalent(["a"], ["a", "b"])).toBe(false);
  });

  it("strictly validates persisted node lists without blocking unknown forward-compatible types", () => {
    expect(
      validateSubscriptionNodeList([
        { name: "Future", type: "future-protocol", server: "future.example.com", port: 443, "dialer-proxy": "x" },
        { name: "Direct", type: "direct" },
        { name: "DNS", type: "dns" },
        { name: "Relay", type: "relay", proxies: ["Future"] },
      ])
    ).toEqual([
      { name: "Future", type: "future-protocol", server: "future.example.com", port: 443 },
      { name: "Direct", type: "direct" },
      { name: "DNS", type: "dns" },
      { name: "Relay", type: "relay", proxies: ["Future"] },
    ]);

    for (const [value, message] of [
      ["bad", "节点列表必须是数组"],
      [[null], "节点 #1 必须是对象"],
      [[{ name: "", type: "ss", server: "x", port: 1 }], "节点 #1 缺少有效名称"],
      [[{ name: "A", type: "ss", server: "", port: 1 }], "节点 #1 缺少有效服务器地址"],
      [[{ name: "A", type: "ss", server: "x", port: 0 }], "节点 #1 的端口"],
      [[{ name: "A", type: "relay", proxies: [""] }], "relay proxies"],
    ] as const) {
      expect(() => validateSubscriptionNodeList(value)).toThrow(message);
    }
  });

  it("normalizes config, sources, and smart node matching state", () => {
    expect(
      normalizeSubscriptionConfigForPersistence(
        {
          config: {
            theme: "dark",
            sources: [{ type: "url", content: " https://example.com/a\nhttps://example.com/b " }],
          },
          smartNodeMatchingEnabled: false,
        },
        {
          existingConfig: { keep: true },
          idFactory: () => "source-id",
          splitUrlLines: true,
          defaultSmartNodeMatchingEnabled: true,
        }
      )
    ).toEqual({
      keep: true,
      theme: "dark",
      sources: [
        { id: "source-id", type: "url", content: "https://example.com/a" },
        { id: "source-id-2", type: "url", content: "https://example.com/b" },
      ],
      smartNodeMatchingEnabled: false,
    });

    expect(
      normalizeSubscriptionConfigForPersistence(
        { config: { theme: "light" } },
        { existingConfig: { old: true }, mergeExistingConfig: false }
      )
    ).toEqual({ theme: "light" });

    expect(
      normalizeSubscriptionConfigForPersistence(
        { config: undefined, smartNodeMatchingEnabled: undefined },
        { existingConfig: { old: true }, defaultSmartNodeMatchingEnabled: true }
      )
    ).toEqual({ old: true, smartNodeMatchingEnabled: true });
  });

  it("serializes summary and detail response data", () => {
    const subscription = {
      id: "sub-1",
      name: "Saved",
      token: "token-1",
      isPrimary: true,
      autoUpdateInterval: 3600,
      cacheExpiresAt: new Date("2026-06-01T01:00:00.000Z"),
      lastAccessedAt: null,
      lastUpdatedAt: new Date("2026-06-01T02:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T03:00:00.000Z"),
      autoUpdateState: {
        externalFailureCount: 2,
        lastFailedAt: new Date("2026-06-01T04:00:00.000Z"),
      },
    };
    const secrets = {
      urls: ["https://example.com/sub"],
      nodes: [{ name: "Node" }],
      config: { sources: [{ id: "source-1" }], smartNodeMatchingEnabled: false },
      subscriptionInfo: { total: 4096 },
    };

    expect(
      serializeSubscriptionSummaryData(subscription, secrets, {
        subscriptionUrl: "https://subboost.example/s/token-1",
        yamlUrl: "https://subboost.example/s/token-1.yaml",
        dateMode: "iso",
        includeCounts: true,
      })
    ).toMatchObject({
      id: "sub-1",
      nodeCount: 1,
      sourceCount: 1,
      smartNodeMatchingEnabled: false,
      cacheExpiresAt: "2026-06-01T01:00:00.000Z",
      lastAccessedAt: null,
      autoUpdateState: {
        externalFailureCount: 2,
        lastFailedAt: "2026-06-01T04:00:00.000Z",
        disabledAt: null,
      },
      yamlUrl: "https://subboost.example/s/token-1.yaml",
    });

    expect(
      serializeSubscriptionDetailData(subscription, secrets, {
        subscriptionUrl: "https://subboost.example/s/token-1",
        dateMode: "preserve",
        includeLastAttemptedAt: false,
      })
    ).toMatchObject({
      urls: ["https://example.com/sub"],
      nodes: [{ name: "Node" }],
      config: secrets.config,
      subscriptionInfo: { total: 4096 },
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(
      serializeSubscriptionDetailData(subscription, secrets, {
        subscriptionUrl: "https://subboost.example/s/token-1",
        includeLastAttemptedAt: false,
      }).autoUpdateState
    ).not.toHaveProperty("lastAttemptedAt");
  });
});
