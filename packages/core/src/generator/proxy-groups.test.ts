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

  it("defaults ordinary custom groups to node-only members without adding them to node select", () => {
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B")],
      enabledModules: ["select", "auto"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [
        customGroup("one", "select"),
        customGroup("two", "select"),
        customGroup("direct", "direct-first"),
        customGroup("reject", "reject-first"),
      ],
    });

    expect(groups.find((group) => group.name === "🚀 节点选择")?.proxies).toEqual([
      "⚡ 自动选择",
      "DIRECT",
      "REJECT",
      "Node A",
      "Node B",
    ]);
    expect(groups.find((group) => group.name === "Custom one")?.proxies).toEqual([
      "DIRECT",
      "REJECT",
      "Node A",
      "Node B",
    ]);
    expect(groups.find((group) => group.name === "Custom two")?.proxies).toEqual([
      "DIRECT",
      "REJECT",
      "Node A",
      "Node B",
    ]);
    expect(groups.find((group) => group.name === "Custom direct")?.proxies).toEqual([
      "DIRECT",
      "REJECT",
      "Node A",
      "Node B",
    ]);
    expect(groups.find((group) => group.name === "Custom reject")?.proxies).toEqual([
      "REJECT",
      "DIRECT",
      "Node A",
      "Node B",
    ]);
  });

  it("keeps filtered-node custom groups node-scoped while exposing them as non-select policy members", () => {
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
          name: "Filtered Group",
          emoji: "",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "select",
          advanced: { includeRegex: "Node A|Filtered" },
        },
        { ...customGroup("normal", "select"), includeInGroupMembers: true },
      ],
    });

    expect(groups[0]?.name).toBe("Filtered Group");
    expect(groups.find((group) => group.name === "Filtered Group")?.proxies).toEqual([
      "DIRECT",
      "REJECT",
      "Node A",
      "Filtered",
    ]);
    expect(groups.find((group) => group.name === "Filtered Group")).not.toHaveProperty("use");
    expect(groups.find((group) => group.name === "Filtered Group")?.proxies).not.toContain("Custom normal");
    expect(groups.find((group) => group.name === "Filtered Group")?.proxies).not.toContain("🚀 节点选择");
    expect(groups.find((group) => group.name === "Custom normal")?.proxies).not.toContain("Filtered Group");
    expect(groups.find((group) => group.name === "Custom normal")?.proxies).not.toContain("🚀 节点选择");
    expect(groups.find((group) => group.name === "Custom normal")?.proxies).not.toContain("Custom normal");
    expect(groups.find((group) => group.name === "Custom normal")).toMatchObject({ use: ["remote"] });
    expect(groups.find((group) => group.name === "🚀 节点选择")?.proxies).not.toContain("Filtered Group");
    expect(groups.find((group) => group.name === "🚀 节点选择")?.proxies).not.toContain("Custom normal");
    expect(groups.find((group) => group.name === "🏠 私有网络")?.proxies?.slice(0, 5)).toEqual([
      "DIRECT",
      "REJECT",
      "Filtered Group",
      "Custom normal",
      "🚀 节点选择",
    ]);
  });

  it("keeps filtered-node generated group variants node-scoped and appends inline custom groups without an insert point", () => {
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B")],
      proxyProviderNames: ["remote"],
      enabledModules: ["select"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [
        {
          id: "filtered-url",
          name: "Filtered URL",
          emoji: "",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "url-test",
          advanced: { includeRegex: "Node A" },
        },
        {
          id: "filtered-fallback",
          name: "Filtered Fallback",
          emoji: "",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "fallback",
        },
        {
          id: "filtered-balance",
          name: "Filtered Balance",
          emoji: "",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "load-balance",
        },
        customGroup("inline", "select"),
      ],
    });

    expect(groups.slice(0, 3).map((group) => group.name)).toEqual([
      "Filtered URL",
      "Filtered Fallback",
      "Filtered Balance",
    ]);
    expect(groups.find((group) => group.name === "Filtered URL")).toMatchObject({
      type: "url-test",
      proxies: ["Node A"],
    });
    expect(groups.find((group) => group.name === "Filtered URL")).not.toHaveProperty("use");
    expect(groups.find((group) => group.name === "Filtered Fallback")).toMatchObject({
      type: "fallback",
      proxies: ["Node A", "Node B"],
    });
    expect(groups.find((group) => group.name === "Filtered Fallback")).not.toHaveProperty("use");
    expect(groups.find((group) => group.name === "Filtered Balance")).toMatchObject({
      type: "load-balance",
      strategy: "consistent-hashing",
      proxies: ["Node A", "Node B"],
    });
    expect(groups.find((group) => group.name === "Filtered Balance")).not.toHaveProperty("use");
    expect(groups.at(-1)).toMatchObject({ name: "Custom inline", use: ["remote"] });
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

  it("covers provider target guards and module group type overrides", () => {
    const disabledByName = { ...customGroup("disabled-name", "select"), enabled: false };
    const groups = generateProxyGroups({
      nodes: [node("Node A"), node("Node B")],
      proxyProviderNames: ["remote"],
      enabledModules: ["select", "auto", "ai", "private", "cn", "global", "final"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [
        disabledByName,
        {
          id: "blank-name",
          name: "" as never,
          emoji: "",
          includeInGroupMembers: true,
          groupType: "select",
        },
      ],
      proxyGroupAdvanced: {
        auto: { groupType: "load-balance", strategy: "round-robin" },
        ai: { groupType: "url-test", regions: ["other"] },
        private: { groupType: "direct-first", extraMembers: [{ kind: "node", name: "Node B" }] },
        cn: { groupType: "reject-first" },
      },
    });
    const providers = generateRuleProviders({
      nodes: [node("Node A")],
      enabledModules: ["cn"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 120,
      customProxyGroups: [disabledByName],
      customRuleSets: [
        {
          id: "skip-by-name",
          name: "Skip",
          behavior: "domain",
          path: "geosite/skip.mrs",
          target: "Custom disabled-name",
        },
        {
          id: "relative-path",
          name: "Relative",
          behavior: "domain",
          path: "geosite/relative.mrs",
          target: "DIRECT",
        },
        {
          id: "relative-path",
          name: "Duplicate",
          behavior: "domain",
          path: "geosite/duplicate.mrs",
          target: "DIRECT",
        },
        {
          id: "",
          name: "Missing id",
          behavior: "domain",
          path: "geosite/missing.mrs",
          target: "DIRECT",
        },
      ],
    });

    expect(groups.find((group) => group.name === "⚡ 自动选择")).toMatchObject({
      type: "load-balance",
      strategy: "round-robin",
    });
    expect(groups.find((group) => group.name.includes("AI"))).toMatchObject({
      type: "url-test",
      proxies: [],
      use: ["remote"],
    });
    expect(groups.find((group) => group.name === "🏠 私有网络")?.proxies?.slice(0, 2)).toEqual(["DIRECT", "REJECT"]);
    expect(groups.find((group) => group.name === "🔒 国内服务")?.proxies?.slice(0, 2)).toEqual(["REJECT", "DIRECT"]);
    expect(providers["skip-by-name"]).toBeUndefined();
    expect(providers["relative-path"]).toMatchObject({
      url: "https://rules.example.com/geosite/relative.mrs",
    });
  });

  it("builds groups without providers while keeping info nodes out of testable groups", () => {
    const groups = generateProxyGroups({
      nodes: [node("余额 | 10GB"), node("Korea Node"), node("US Node")],
      enabledModules: ["auto", "ai", "private", "global", "final"],
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://probe.example.com/204",
      testInterval: 60,
      customProxyGroups: [
        {
          id: "direct-local",
          name: "Direct Local",
          emoji: "",
          includeInGroupMembers: true,
          groupType: "direct-first",
          advanced: { memberOrder: [{ kind: "direct" }, { kind: "node", name: "US Node" }] },
        },
        {
          id: "reject-local",
          name: "Reject Local",
          emoji: "",
          includeInGroupMembers: true,
          groupType: "reject-first",
        },
        {
          id: "filtered-reject",
          name: "Filtered Reject",
          emoji: "",
          memberSource: "filtered-nodes",
          groupType: "reject-first",
          advanced: { includeRegex: "Korea|余额" },
        },
      ],
      proxyGroupAdvanced: {
        ai: {
          groupType: "select",
          extraMembers: [{ kind: "custom", id: "direct-local" }],
          excludedMembers: [{ kind: "node", name: "US Node" }],
        },
      },
    });

    const auto = groups.find((group) => group.name === "⚡ 自动选择");
    const ai = groups.find((group) => group.name.includes("AI"));
    const directLocal = groups.find((group) => group.name === "Direct Local");
    const rejectLocal = groups.find((group) => group.name === "Reject Local");
    const filteredReject = groups.find((group) => group.name === "Filtered Reject");

    expect(auto).toMatchObject({
      type: "url-test",
      proxies: ["Korea Node", "US Node"],
      url: "https://probe.example.com/204",
      interval: 60,
    });
    expect(auto).not.toHaveProperty("use");
    expect(auto?.proxies).not.toContain("余额 | 10GB");
    expect(ai?.proxies).toContain("Direct Local");
    expect(ai?.proxies).not.toContain("US Node");
    expect(directLocal?.proxies?.slice(0, 2)).toEqual(["DIRECT", "US Node"]);
    expect(directLocal?.proxies).not.toContain("Direct Local");
    expect(rejectLocal?.proxies?.slice(0, 2)).toEqual(["REJECT", "DIRECT"]);
    expect(filteredReject?.proxies).toEqual(["REJECT", "DIRECT", "Korea Node"]);
    expect(groups.find((group) => group.name === "🐟 漏网之鱼")?.proxies).toContain("Direct Local");
  });
});
