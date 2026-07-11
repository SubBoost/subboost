import { describe, expect, it } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import type { DialerProxyGroup } from "@subboost/core/types/template-config";
import {
  applyDialerProxy,
  generateDialerProxyGroups,
  getDialerRelayNodes,
  getDialerTargetNodes,
  suggestDialerGroups,
  validateDialerConfig,
} from "./chain";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

function dialerGroup(patch: Partial<DialerProxyGroup> = {}): DialerProxyGroup {
  return {
    id: "us-relay",
    name: "US Relay",
    type: "select",
    relayNodes: ["Relay A"],
    targetNodes: ["Target A"],
    ...patch,
  };
}

describe("dialer proxy chain helpers", () => {
  it("applies global url-test overrides without changing legacy defaults", () => {
    const groups = [
      dialerGroup({
        id: "auto-relay",
        name: "Auto Relay",
        type: "url-test",
        relayNodes: ["Relay A"],
      }),
    ];

    expect(
      generateDialerProxyGroups(
        groups,
        "https://probe.example.com/204",
        120,
        [],
        { urlTestLazy: false, urlTestTolerance: 50 },
      ),
    ).toEqual([
      {
        name: "Auto Relay",
        type: "url-test",
        proxies: ["Relay A"],
        url: "https://probe.example.com/204",
        interval: 120,
        lazy: false,
        tolerance: 50,
      },
    ]);

    expect(generateDialerProxyGroups(groups)[0]).not.toHaveProperty("tolerance");
    expect(generateDialerProxyGroups(groups)[0]).toMatchObject({ lazy: true });
  });

  it("generates typed dialer groups with shared proxy group fields", () => {
    expect(
      generateDialerProxyGroups(
        [
          dialerGroup(),
          dialerGroup({
            id: "auto-relay",
            name: "Auto Relay",
            type: "url-test",
            relayNodes: ["Relay B"],
          }),
          dialerGroup({
            id: "fallback-relay",
            name: "Fallback Relay",
            type: "fallback",
            relayNodes: ["Relay C"],
          }),
          dialerGroup({
            id: "balance-relay",
            name: "Balance Relay",
            type: "load-balance",
            strategy: "round-robin",
            relayNodes: ["Relay D"],
          }),
          dialerGroup({
            id: "direct-relay",
            name: "Direct Relay",
            type: "direct-first",
            relayNodes: ["DIRECT", "Relay E"],
          }),
          dialerGroup({
            id: "reject-relay",
            name: "Reject Relay",
            type: "reject-first",
            relayNodes: ["Relay F"],
          }),
          dialerGroup({
            id: "direct-empty",
            name: "Direct Empty",
            type: "direct-first",
            relayNodes: [],
          }),
          dialerGroup({ id: "empty", name: "Empty", relayNodes: [] }),
        ],
        "https://probe.example.com/204",
        120,
        ["provider-a", "provider-b"]
      )
    ).toEqual([
      {
        name: "US Relay",
        type: "select",
        proxies: ["Relay A"],
        use: ["provider-a", "provider-b"],
      },
      {
        name: "Auto Relay",
        type: "url-test",
        proxies: ["Relay B"],
        use: ["provider-a", "provider-b"],
        url: "https://probe.example.com/204",
        interval: 120,
        lazy: true,
      },
      {
        name: "Fallback Relay",
        type: "fallback",
        proxies: ["Relay C"],
        use: ["provider-a", "provider-b"],
        url: "https://probe.example.com/204",
        interval: 120,
      },
      {
        name: "Balance Relay",
        type: "load-balance",
        proxies: ["Relay D"],
        use: ["provider-a", "provider-b"],
        url: "https://probe.example.com/204",
        interval: 120,
        strategy: "round-robin",
      },
      {
        name: "Direct Relay",
        type: "select",
        proxies: ["DIRECT", "Relay E"],
        use: ["provider-a", "provider-b"],
      },
      {
        name: "Reject Relay",
        type: "select",
        proxies: ["REJECT", "Relay F"],
        use: ["provider-a", "provider-b"],
      },
      {
        name: "Direct Empty",
        type: "select",
        proxies: ["DIRECT"],
        use: ["provider-a", "provider-b"],
      },
    ]);
  });

  it("applies the first matching dialer group to target nodes", () => {
    const nodes = [node("Relay A"), node("Target A"), node("Target B")];
    const result = applyDialerProxy(nodes, [
      dialerGroup({ name: "First Relay", targetNodes: ["Target A", "Target B"] }),
      dialerGroup({ name: "Second Relay", targetNodes: ["Target A"] }),
    ]);

    expect(result).toEqual([
      nodes[0],
      { ...nodes[1], "dialer-proxy": "First Relay" },
      { ...nodes[2], "dialer-proxy": "First Relay" },
    ]);
  });

  it("collects dialer target and relay names", () => {
    const groups = [
      dialerGroup({ relayNodes: ["Relay A", "DIRECT"], targetNodes: ["Target A"] }),
      dialerGroup({ relayNodes: ["Relay B"], targetNodes: ["Target A", "Target B"] }),
    ];

    expect(Array.from(getDialerTargetNodes(groups)).sort()).toEqual(["Target A", "Target B"]);
    expect(Array.from(getDialerRelayNodes(groups)).sort()).toEqual(["DIRECT", "Relay A", "Relay B"]);
  });

  it("validates missing nodes and relay-target overlap", () => {
    expect(
      validateDialerConfig([node("Relay A"), node("Target A")], dialerGroup({ relayNodes: ["DIRECT"] }))
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateDialerConfig(
        [node("Relay A")],
        dialerGroup({
          relayNodes: ["Relay A", "Missing Relay", "Target A"],
          targetNodes: ["Target A", "Missing Target"],
        })
      )
    ).toEqual({
      valid: false,
      errors: [
        '中转节点 "Missing Relay" 不存在',
        '中转节点 "Target A" 不存在',
        '目标节点 "Target A" 不存在',
        '目标节点 "Missing Target" 不存在',
        '节点 "Target A" 不能同时作为中转节点和目标节点',
      ],
    });
  });

  it("suggests regional relay groups from node names", () => {
    const suggestions = suggestDialerGroups([
      node("US Los Angeles 01"),
      node("美国 New York 02"),
      node("香港 HK 01"),
      node("Unknown 01"),
    ]);

    expect(suggestions).toEqual([
      {
        name: "🇺🇸 美国中转",
        relayNodes: ["US Los Angeles 01", "美国 New York 02"],
        description: "使用美国节点作为中转",
      },
      {
        name: "🇭🇰 香港中转",
        relayNodes: ["香港 HK 01"],
        description: "使用香港节点作为中转",
      },
    ]);
  });
});
