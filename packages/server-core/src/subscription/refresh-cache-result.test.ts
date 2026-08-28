import { describe, expect, it } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import type { RefreshNodeSnapshotResult } from "./refresh-node-snapshot";
import { prepareRefreshCacheResult } from "./refresh-cache-result";

const node: ParsedNode = {
  name: "node-a",
  type: "trojan",
  server: "node-a.example.com",
  port: 443,
  password: "secret",
};

function snapshot(patch: Partial<RefreshNodeSnapshotResult> = {}): RefreshNodeSnapshotResult {
  return {
    nodes: [node],
    subscriptionInfo: {},
    savedSources: [],
    attemptedUrlFetch: false,
    usedUrlFetch: false,
    refreshableSourceCount: 0,
    refreshedSourceCount: 0,
    refreshedUrlSourceCount: 0,
    refreshedStaticSourceCount: 0,
    detachedSourceCount: 0,
    failedSourceCount: 0,
    failedSources: [],
    ...patch,
  };
}

describe("prepareRefreshCacheResult", () => {
  it("keeps previous cache when every refreshable source failed", () => {
    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({
          refreshableSourceCount: 2,
          refreshedSourceCount: 0,
          nodes: [node],
        }),
        maxNodesPerSubscription: 10,
      })
    ).toMatchObject({
      ok: false,
      reason: "all_sources_failed",
      nodeCount: 1,
    });
  });

  it("rejects empty snapshots unless proxy providers can still generate output", () => {
    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({ nodes: [] }),
        maxNodesPerSubscription: 10,
      })
    ).toMatchObject({
      ok: false,
      reason: "empty_result",
      nodeCount: 0,
    });

    const providerOnly = prepareRefreshCacheResult({
      config: { enabledGroups: ["select", "final"], enabledRules: ["final"] },
      snapshot: snapshot({ nodes: [] }),
      maxNodesPerSubscription: 10,
      proxyProviders: {
        remote: {
          type: "http",
          url: "https://provider.example.com/sub.yaml",
          path: "./remote.yaml",
        },
      },
    });

    expect(providerOnly.ok).toBe(true);
    if (!providerOnly.ok) return;
    expect(providerOnly.nodeCount).toBe(0);
    expect(providerOnly.generatedYaml).toContain("proxy-providers:");
    expect(providerOnly.cacheEntry.nodes).toEqual([]);

    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({ nodes: [] }),
        maxNodesPerSubscription: 10,
        proxyProviders: {},
      })
    ).toMatchObject({
      ok: false,
      reason: "empty_result",
    });
  });

  it("keeps the raw cache snapshot but rejects refreshes with no effective nodes", () => {
    const filtered = prepareRefreshCacheResult({
      config: {
        nodeNameFilter: {
          enabled: true,
          excludeRegexes: ["^node-a$"],
        },
      },
      snapshot: snapshot({ nodes: [node] }),
      maxNodesPerSubscription: 10,
    });

    expect(filtered).toMatchObject({
      ok: false,
      reason: "empty_result",
      nodeCount: 1,
    });
  });

  it("allows provider output when all raw nodes are excluded and caches the raw snapshot", () => {
    const filtered = prepareRefreshCacheResult({
      config: {
        nodeNameFilter: {
          enabled: true,
          excludeRegexes: ["^node-a$"],
        },
      },
      snapshot: snapshot({ nodes: [node] }),
      maxNodesPerSubscription: 10,
      proxyProviders: {
        remote: {
          type: "http",
          url: "https://provider.example.com/sub.yaml",
          path: "./remote.yaml",
        },
      },
    });

    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.nodeCount).toBe(1);
    expect(filtered.cacheEntry.nodes).toEqual([node]);
    expect(filtered.generatedYaml).toContain("proxy-providers:");
    expect(filtered.generatedYaml).not.toContain("node-a.example.com");
  });

  it("enforces node quota before generating YAML", () => {
    expect(
      prepareRefreshCacheResult({
        config: {},
        snapshot: snapshot({ nodes: [node, { ...node, name: "node-b" }] }),
        maxNodesPerSubscription: 1,
      })
    ).toMatchObject({
      ok: false,
      reason: "node_quota_exceeded",
      nodeCount: 2,
      maxNodesPerSubscription: 1,
    });

    expect(
      prepareRefreshCacheResult({
        config: {
          nodeNameFilter: {
            enabled: true,
            excludeRegexes: [".*"],
          },
        },
        snapshot: snapshot({ nodes: [node, { ...node, name: "node-b" }] }),
        maxNodesPerSubscription: 1,
      })
    ).toMatchObject({
      ok: false,
      reason: "node_quota_exceeded",
      nodeCount: 2,
      maxNodesPerSubscription: 1,
    });
  });

  it("returns cache entries with generated YAML for valid snapshots", () => {
    const result = prepareRefreshCacheResult({
      config: {
        testUrl: "https://probe.example.com/204",
        testInterval: 120,
      },
      snapshot: snapshot({
        subscriptionInfo: {
          upload: 1,
          download: 2,
          total: 3,
        },
      }),
      maxNodesPerSubscription: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodeCount).toBe(1);
    expect(result.generatedYaml).toContain("node-a");
    expect(result.cacheEntry).toMatchObject({
      nodes: [node],
      subscriptionInfo: {
        upload: 1,
        download: 2,
        total: 3,
      },
    });
  });

  it("generates and persists from reconciled node relationships", () => {
    const renamedNode = { ...node, name: "New Node" };
    const result = prepareRefreshCacheResult({
      config: {
        listenerPorts: { "Old Node": 12000 },
        dialerProxyGroups: [
          {
            id: "chain",
            name: "Chain",
            type: "select",
            relayNodes: ["DIRECT", "Old Node"],
            targetNodes: ["Old Node"],
          },
        ],
        proxyGroupAdvanced: {
          auto: { memberOrder: [{ kind: "node", name: "Old Node" }] },
        },
      },
      snapshot: snapshot({
        nodes: [renamedNode],
        savedSources: [{ id: "source", type: "url", content: "https://example.com/sub" }],
        renameMap: new Map([["Old Node", "New Node"]]),
      }),
      maxNodesPerSubscription: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshedConfig).toMatchObject({
      listenerPorts: { "New Node": 12000 },
      dialerProxyGroups: [
        expect.objectContaining({ relayNodes: ["DIRECT", "New Node"], targetNodes: ["New Node"] }),
      ],
      proxyGroupAdvanced: {
        auto: { memberOrder: [{ kind: "node", name: "New Node" }] },
      },
      sources: [{ id: "source", type: "url", content: "https://example.com/sub" }],
    });
    expect(result.generatedYaml).toContain('port: 12000, proxy: "New Node"');
    expect(result.generatedYaml).toContain("dialer-proxy: Chain");
  });

  it("preserves a migrated custom proxy group relay through refresh and YAML generation", () => {
    const migratedCustomGroupName = "🧩 筛选组  美国";
    const result = prepareRefreshCacheResult({
      config: {
        enabledGroups: ["select", "auto", "final"],
        customProxyGroups: [
          {
            id: "legacy-us",
            name: migratedCustomGroupName,
            emoji: "🧩",
            enabled: true,
            groupType: "select",
          },
        ],
        dialerProxyGroups: [
          {
            id: "group-relay",
            name: "Group Relay",
            type: "select",
            relayNodes: [migratedCustomGroupName],
            targetNodes: ["node-a"],
          },
        ],
      },
      snapshot: snapshot(),
      maxNodesPerSubscription: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshedConfig).toMatchObject({
      dialerProxyGroups: [
        expect.objectContaining({ relayNodes: [migratedCustomGroupName], targetNodes: ["node-a"] }),
      ],
    });
    expect(result.generatedYaml).toContain('dialer-proxy: "Group Relay"');
    expect(result.generatedYaml).toContain(migratedCustomGroupName);
  });

  it.each([[], "auto"])(
    "does not restore template proxy groups for explicit enabledGroups=%j",
    (enabledGroups) => {
      const result = prepareRefreshCacheResult({
        config: { enabledGroups },
        snapshot: snapshot(),
        maxNodesPerSubscription: 10,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.generatedYaml).not.toContain("⚡ 自动选择");
    }
  );

  it("rejects invalid persisted filters before publishing refresh output", () => {
    expect(() =>
      prepareRefreshCacheResult({
        config: {
          nodeNameFilter: {
            enabled: true,
            excludeRegexes: ["(a+)+$"],
          },
        },
        snapshot: snapshot(),
        maxNodesPerSubscription: 10,
      })
    ).toThrow("节点名称过滤配置无效");
  });
});
