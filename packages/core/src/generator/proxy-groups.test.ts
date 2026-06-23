import { describe, expect, it } from "vitest";
import {
  generateProxyGroups,
  generateRuleProviders,
  generateRules,
  getAllGroupNames,
  getGroupTarget,
  getModulesForTemplate,
} from "./proxy-groups";
import type { CustomProxyGroup } from "@subboost/core/types/config";
import type { ParsedNode } from "@subboost/core/types/node";

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

function customGroup(id: string, groupType: CustomProxyGroup["groupType"]): CustomProxyGroup {
  return {
    id,
    name: `Custom ${id}`,
    emoji: "C",
    groupType,
    strategy: groupType === "load-balance" ? "round-robin" : undefined,
  };
}

describe("proxy group generator", () => {
  it("generates module, custom, advanced-filtered, and provider-backed groups", () => {
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B")],
      proxyProviderNames: ["remote"],
      enabledModules: ["select", "auto", "ad", "private", "cn", "global", "final", "ai"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [
        customGroup("select", "select"),
        customGroup("url", "url-test"),
        customGroup("fallback", "fallback"),
        {
          ...customGroup("balance", "load-balance"),
          advanced: { includeRegex: "Node A" },
        },
        customGroup("direct", "direct-first"),
        {
          ...customGroup("reject", "reject-first"),
          advanced: { excludedMembers: [{ kind: "node", name: "Node B" }] },
        },
      ],
    });

    expect(groups.find((group) => group.name === "Custom url")).toMatchObject({
      type: "url-test",
      use: ["remote"],
      lazy: false,
    });
    expect(groups.find((group) => group.name === "Custom fallback")).toMatchObject({ type: "fallback" });
    expect(groups.find((group) => group.name === "Custom balance")).toMatchObject({
      type: "load-balance",
      proxies: ["Node A"],
      strategy: "round-robin",
      url: "https://probe.example.com/204",
      interval: 120,
    });
    expect(groups.find((group) => group.name === "Custom direct")?.proxies?.[0]).toBe("DIRECT");
    const rejectProxies = groups.find((group) => group.name === "Custom reject")?.proxies ?? [];
    expect(rejectProxies.slice(0, 2)).toEqual(["REJECT", "DIRECT"]);
    expect(rejectProxies).not.toContain("Node B");
    expect(groups.find((group) => group.name.includes("节点选择"))).toMatchObject({
      type: "select",
      use: ["remote"],
    });
  });

  it("generates providers and template metadata helpers", () => {
    const providers = generateRuleProviders({
      nodes: [node("Node A")],
      enabledModules: ["cn"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      experimentalCnUseCnRuleSet: true,
      builtinRuleEdits: { "module:cn:geolocation-cn": { enabled: false } },
      customProxyGroups: [customGroup("custom", "select")],
      customRuleSets: [
        {
          id: "custom-rule",
          name: "Custom rule",
          behavior: "domain",
          path: "https://rules.example.com/custom.mrs",
          target: "Custom custom",
        },
      ],
    });

    expect(providers["cn-ip"]).toMatchObject({
      url: "https://rules.example.com/geoip/cn.mrs",
      behavior: "ipcidr",
    });
    expect(providers.cn).toMatchObject({
      url: "https://rules.example.com/geosite/cn.mrs",
    });
    expect(providers["custom-rule"]).toMatchObject({
      url: "https://rules.example.com/custom.mrs",
    });
    expect(getModulesForTemplate("minimal")).toContain("final");
    expect(getModulesForTemplate("standard")).toContain("github");
    expect(getModulesForTemplate("full")).not.toContain("adult");
    expect(getGroupTarget("missing")).toContain("节点选择");
    expect(getAllGroupNames(["select"], [customGroup("custom", "select")])).toContain("Custom custom");
  });

  it("applies built-in group type overrides and explicitly added members", () => {
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B")],
      enabledModules: ["select", "auto", "ai"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      proxyGroupAdvanced: {
        ai: {
          groupType: "fallback",
          extraMembers: [{ kind: "direct" }],
          memberOrder: [{ kind: "direct" }, { kind: "node", name: "Node B" }],
        },
      },
    });

    expect(groups.find((group) => group.name.includes("AI"))).toMatchObject({
      type: "fallback",
      proxies: ["DIRECT", "Node B", "Node A"],
      url: "https://probe.example.com/204",
      interval: 120,
    });
  });

  it("keeps filtered-node custom groups node-scoped while exposing them as policy members", () => {
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B"), node("Filtered")],
      proxyProviderNames: ["remote"],
      enabledModules: ["select", "auto", "private"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [
        {
          id: "filtered",
          name: "Filtered",
          emoji: "",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "select",
          advanced: { includeRegex: "Node A|Filtered" },
        },
        { ...customGroup("normal", "select"), includeInGroupMembers: true },
      ],
    });

    expect(groups[0]?.name).toBe("Filtered");
    expect(groups.find((group) => group.name === "Filtered")?.proxies).toEqual([
      "DIRECT",
      "REJECT",
      "Node A",
      "Filtered",
    ]);
    expect(groups.find((group) => group.name === "Filtered")).not.toHaveProperty("use");
    expect(groups.find((group) => group.name === "Filtered")?.proxies).not.toContain("Custom normal");
    expect(groups.find((group) => group.name === "Filtered")?.proxies).not.toContain("🚀 节点选择");
    expect(groups.find((group) => group.name === "Custom normal")?.proxies).toContain("Filtered");
    expect(groups.find((group) => group.name === "Custom normal")?.proxies).not.toContain("Custom normal");
    expect(groups.find((group) => group.name === "Custom normal")).toMatchObject({ use: ["remote"] });
    expect(groups.find((group) => group.name === "🚀 节点选择")?.proxies).toContain("Filtered");
    expect(groups.find((group) => group.name === "🚀 节点选择")?.proxies).toContain("Custom normal");
    expect(groups.find((group) => group.name === "🏠 私有网络")?.proxies.slice(0, 5)).toEqual([
      "DIRECT",
      "REJECT",
      "Filtered",
      "Custom normal",
      "🚀 节点选择",
    ]);
  });

  it("omits disabled custom groups from groups, providers, names, and custom rules", () => {
    const disabledGroup = { ...customGroup("disabled", "select"), enabled: false };
    const groups = generateProxyGroups({
      nodes: [node("Node A")],
      enabledModules: ["select"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [disabledGroup],
    });
    const providers = generateRuleProviders({
      nodes: [node("Node A")],
      enabledModules: [],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [disabledGroup],
      customRuleSets: [
        {
          id: "disabled-rule",
          name: "Disabled rule",
          behavior: "domain",
          path: "geosite/disabled.mrs",
          target: { kind: "custom", id: "disabled" },
        },
      ],
    });
    const rules = generateRules({
      enabledModules: [],
      customRules: [
        {
          id: "disabled-manual",
          type: "DOMAIN",
          value: "disabled.example",
          target: { kind: "custom", id: "disabled" },
        },
      ],
      customRuleSets: [
        {
          id: "disabled-rule",
          name: "Disabled rule",
          behavior: "domain",
          path: "geosite/disabled.mrs",
          target: { kind: "custom", id: "disabled" },
        },
      ],
      customProxyGroups: [disabledGroup],
      availablePolicyTargets: ["DIRECT"],
      fallbackPolicyTarget: "DIRECT",
    });

    expect(groups.some((group) => group.name === "Custom disabled")).toBe(false);
    expect(getAllGroupNames(["select"], [disabledGroup])).not.toContain("Custom disabled");
    expect(providers["disabled-rule"]).toBeUndefined();
    expect(rules).toEqual(["MATCH,DIRECT"]);
  });
});
