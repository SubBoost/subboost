import { describe, expect, it } from "vitest";
import {
  buildGenerateOptionsFromConfig,
  getEffectiveTestOptions,
} from "./config-utils";
import type { ParsedNode } from "@subboost/core/types/node";

function node(patch: Partial<ParsedNode> = {}): ParsedNode {
  return {
    name: "Node",
    type: "ss",
    server: "ss.example.com",
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
    "dialer-proxy": "Imported Control",
    ...patch,
  } as ParsedNode;
}

describe("subscription config utils", () => {
  it("normalizes effective test options with guarded fallbacks", () => {
    expect(getEffectiveTestOptions({ testUrl: " https://cp.cloudflare.com ", testInterval: 120 })).toEqual({
      testUrl: "https://cp.cloudflare.com",
      testInterval: 120,
    });
    expect(getEffectiveTestOptions({ testUrl: "ftp://bad", testInterval: -1 })).toMatchObject({
      testInterval: 300,
    });
  });

  it("builds generate options from persisted config and strips imported node controls", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        template: "full",
        enabledGroups: [" auto ", "", "direct"],
        enabledRules: ["global"],
        customRules: [
          { type: "DOMAIN-SUFFIX", value: " example.com ", target: " DIRECT ", noResolve: true },
          { type: "BAD", value: "bad", target: "DIRECT" },
        ],
        customProxyGroups: [
          {
            id: "media",
            name: "Media",
            emoji: "",
            memberSource: "filtered-nodes",
            includeInGroupMembers: false,
            groupType: "load-balance",
            strategy: "bad",
          },
        ],
        customRuleSets: [
          {
            id: "youtube",
            name: "YouTube",
            behavior: "domain",
            path: "https://rules.example.com/youtube.mrs",
            target: "Media",
          },
        ],
        dialerProxyGroups: [
          {
            id: "chain",
            name: "Chain",
            type: "load-balance",
            strategy: "round-robin",
            enabled: true,
            relayNodes: [" Relay ", ""],
            targetNodes: [" Target "],
          },
        ],
        listenerPorts: {
          Node: 12000,
          Bad: 70000,
        },
        proxyGroupNameOverrides: {
          auto: "Auto",
          empty: "",
        },
        proxyGroupOrder: ["auto", ""],
        mixedPort: 7897,
        allowLan: true,
        autoSelectStrategy: "fallback",
        cnIpNoResolve: false,
        experimentalCnUseCnRuleSet: true,
        dnsYaml: "dns: {}",
        ruleProviderBaseUrl: " https://rules.example.com ",
        testUrl: "https://cp.cloudflare.com",
        testInterval: 180,
      },
      { nodes: [node()] }
    );

    expect(options.template).toBe("full");
    expect(options.nodes[0]).not.toHaveProperty("dialer-proxy");
    const userConfig = options.userConfig;
    expect(userConfig).toBeDefined();
    if (!userConfig) throw new Error("Expected userConfig to be present");
    expect(userConfig).toMatchObject({
      enabledGroups: ["auto", "direct"],
      enabledRules: ["global"],
      mixedPort: 7897,
      allowLan: true,
      autoSelectStrategy: "fallback",
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
      testUrl: "https://cp.cloudflare.com",
      testInterval: 180,
      listenerPorts: { Node: 12000 },
    });
    expect(userConfig.customRules?.[0]).toMatchObject({
      type: "DOMAIN-SUFFIX",
      value: "example.com",
      target: "DIRECT",
      noResolve: true,
    });
    expect(options.customProxyGroups?.[0]).toMatchObject({
      id: "media",
      emoji: "",
      memberSource: "filtered-nodes",
      includeInGroupMembers: false,
      strategy: "consistent-hashing",
    });
    expect(options.customRuleSets?.[0]).toMatchObject({
      id: "youtube",
      name: "YouTube",
      target: "Media",
      path: "https://rules.example.com/youtube.mrs",
    });
    expect(options.dialerProxyGroups?.[0]).toMatchObject({
      id: "chain",
      type: "load-balance",
      strategy: "round-robin",
      relayNodes: ["Relay"],
      targetNodes: ["Target"],
    });
    expect(options.proxyGroupNameOverrides).toEqual({ auto: "Auto" });
    expect(options.proxyGroupOrder).toEqual(["auto"]);
  });

  it("drops malformed persisted config while keeping safe defaults", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        template: "bad",
        enabledGroups: "auto",
        enabledRules: [],
        customRules: [
          "bad",
          { type: "DOMAIN", value: "", target: "DIRECT" },
          { type: "DOMAIN", value: "example.com", target: "" },
          { type: "DOMAIN", value: " example.org ", target: " DIRECT ", id: " rule-1 " },
        ],
        customProxyGroups: [
          "bad",
          { id: "", name: "Bad", emoji: "B", groupType: "select" },
          { id: "fallback", name: "Fallback", emoji: "F", groupType: "fallback" },
          { id: "direct", name: "Direct", emoji: "D", groupType: "direct-first" },
          { id: "reject", name: "Reject", emoji: "R", groupType: "reject-first" },
        ],
        customRuleSets: [
          "bad",
          { id: "", name: "Bad", behavior: "domain", path: "geosite/bad.mrs", target: "Fallback" },
          { id: "bad-behavior", name: "Bad", behavior: "bad", path: "geosite/bad.mrs", target: "Fallback" },
          { id: "bad-path", name: "Bad", behavior: "domain", path: "plain.txt", target: "Fallback" },
        ],
        dialerProxyGroups: ["bad", { id: "bad", name: "Bad", type: "bad" }],
        listenerPorts: "bad",
        proxyGroupNameOverrides: "bad",
        proxyGroupOrder: [],
        mixedPort: 0,
        allowLan: "true",
        autoSelectStrategy: "bad",
        cnIpNoResolve: "no",
        experimentalCnUseCnRuleSet: "yes",
        dnsYaml: 123,
        ruleProviderBaseUrl: "ftp://bad",
      },
      { nodes: [node()], proxyProviders: { remote: { type: "http" } } }
    );

    expect(options.template).toBe("standard");
    expect(options.proxyProviders).toEqual({ remote: { type: "http" } });
    expect(options.userConfig).toMatchObject({
      testUrl: "https://www.gstatic.com/generate_204",
      testInterval: 300,
    });
    expect(options.userConfig).not.toHaveProperty("enabledGroups");
    expect(options.userConfig).not.toHaveProperty("enabledRules");
    expect(options.userConfig).not.toHaveProperty("mixedPort");
    expect(options.userConfig).not.toHaveProperty("allowLan");
    expect(options.customProxyGroups?.map((group) => group.groupType)).toEqual([
      "fallback",
      "direct-first",
      "reject-first",
    ]);
    expect(options.dialerProxyGroups).toBeUndefined();
    expect(options.proxyGroupNameOverrides).toBeUndefined();
    expect(options.proxyGroupOrder).toBeUndefined();
  });

  it("keeps alternate valid group and template variants", () => {
    const minimal = buildGenerateOptionsFromConfig(
      {
        template: "minimal",
        customProxyGroups: [
          { id: "select", name: "Select", emoji: "S", groupType: "select" },
          { id: "url-test", name: "Auto", emoji: "A", groupType: "url-test" },
        ],
      },
      { nodes: [node()] }
    );
    const standard = buildGenerateOptionsFromConfig({ template: "standard" }, { nodes: [node()] });

    expect(minimal.template).toBe("minimal");
    expect(standard.template).toBe("standard");
    expect(minimal.customProxyGroups?.map((group) => group.groupType)).toEqual([
      "select",
      "url-test",
    ]);
  });
});
