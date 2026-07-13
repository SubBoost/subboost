import { describe, expect, it, vi } from "vitest";
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
          {
            id: "disabled",
            name: "Disabled",
            emoji: "D",
            enabled: false,
            description: "Hidden group",
            memberSource: "bad",
            includeInGroupMembers: true,
            groupType: "select",
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
    expect(options.customProxyGroups?.[1]).toMatchObject({
      id: "disabled",
      enabled: false,
      description: "Hidden group",
      includeInGroupMembers: true,
    });
    expect(options.customProxyGroups?.[1]).not.toHaveProperty("memberSource");
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

  it("preserves empty YAML overrides and normalizes advanced proxy-group config", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        dnsYaml: "",
        customRules: [
          {
            type: "IP-CIDR6",
            value: "2001:db8::/32",
            target: { kind: "custom", id: " media " },
            noResolve: true,
          },
        ],
        customProxyGroups: [
          {
            id: "media",
            name: "Media",
            emoji: "",
            groupType: "load-balance",
            strategy: "round-robin",
            advanced: {
              sourceIds: [" source-a ", "source-a"],
              regions: ["jp", "bad"],
              extraMembers: [{ kind: "direct" }],
            },
          },
        ],
        proxyGroupAdvanced: {
          " auto ": {
            groupType: "fallback",
            excludedMembers: [{ kind: "node", name: " Node " }],
          },
          " ": { groupType: "select" },
          invalid: { regions: ["bad"] },
        },
        listenerPorts: {
          http: 1,
          zero: 0,
          high: 65536,
          float: 1200.5,
        },
      },
      { nodes: [node()] }
    );

    expect(options.userConfig?.dnsYaml).toBe("");
    expect(options.userConfig?.customRules?.[0]).toMatchObject({
      type: "IP-CIDR6",
      target: { kind: "custom", id: "media" },
      noResolve: true,
    });
    expect(options.userConfig?.listenerPorts).toEqual({ http: 1 });
    expect(options.customProxyGroups?.[0]).toMatchObject({
      id: "media",
      groupType: "load-balance",
      strategy: "round-robin",
      advanced: {
        sourceIds: ["source-a"],
        regions: ["jp"],
        extraMembers: [{ kind: "direct" }],
      },
    });
    expect(options.proxyGroupAdvanced).toEqual({
      auto: {
        groupType: "fallback",
        excludedMembers: [{ kind: "node", name: "Node" }],
      },
    });
  });

  it("keeps only valid optional persisted collections", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        enabledGroups: [null, " ", "auto"],
        enabledRules: "bad",
        customRules: "bad",
        customProxyGroups: [
          null,
          { id: " ", name: "Bad", groupType: "select" },
          { id: "bad", name: "Bad", groupType: "bad" },
          {
            id: "select",
            name: " Select ",
            emoji: null,
            groupType: "select",
            enabled: true,
            description: "",
            memberSource: "filtered-nodes",
            includeInGroupMembers: "yes",
          },
          {
            id: "balance",
            name: "Balance",
            emoji: "B",
            groupType: "load-balance",
            strategy: "consistent-hashing",
            advanced: "bad",
          },
        ],
        dialerProxyGroups: [
          null,
          { id: "bad", name: "Bad", type: "bad" },
          {
            id: "select-dialer",
            name: "Select Dialer",
            type: "select",
            enabled: false,
            relayNodes: "bad",
            targetNodes: [" target-a ", 1, ""],
          },
          {
            id: "balance-dialer",
            name: "Balance Dialer",
            type: "load-balance",
            strategy: "bad",
          },
        ],
        listenerPorts: {
          " ": 12000,
          stringPort: "12001",
          valid: 12002,
        },
        proxyGroupNameOverrides: {
          " ": "Name",
          valid: " Valid Name ",
        },
        ruleOrder: "bad",
      },
      { nodes: [node()] }
    );

    expect(options.userConfig?.enabledGroups).toEqual(["auto"]);
    expect(options.userConfig).not.toHaveProperty("enabledRules");
    expect(options.userConfig).not.toHaveProperty("customRules");
    expect(options.userConfig?.listenerPorts).toEqual({ valid: 12002 });
    expect(options.customProxyGroups).toEqual([
      {
        advanced: {},
        emoji: "",
        groupType: "select",
        id: "select",
        memberSource: "filtered-nodes",
        name: "Select",
      },
      {
        advanced: {},
        emoji: "B",
        groupType: "load-balance",
        id: "balance",
        name: "Balance",
        strategy: "consistent-hashing",
      },
    ]);
    expect(options.dialerProxyGroups).toEqual([
      {
        enabled: false,
        id: "select-dialer",
        name: "Select Dialer",
        relayNodes: [],
        targetNodes: ["target-a"],
        type: "select",
      },
      {
        id: "balance-dialer",
        name: "Balance Dialer",
        relayNodes: [],
        strategy: "consistent-hashing",
        targetNodes: [],
        type: "load-balance",
      },
    ]);
    expect(options.proxyGroupNameOverrides).toEqual({ valid: "Valid Name" });
  });

  it("omits empty optional maps and preserves a valid persisted rule order", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        customRules: [
          {
            id: "custom-rule",
            type: "DOMAIN-SUFFIX",
            value: "example.com",
            target: "DIRECT",
          },
        ],
        ruleOrder: ["custom-rule"],
        listenerPorts: {
          emptyName: "bad",
          invalid: 65536,
        },
        proxyGroupNameOverrides: {
          empty: " ",
        },
        customProxyGroups: [
          { id: "missing-name", name: " ", emoji: "", groupType: "select" },
          { id: "missing-type", name: "Missing Type", emoji: "" },
        ],
        dialerProxyGroups: [
          { id: "", name: "Bad", type: "select" },
          { id: "bad-name", name: " ", type: "select" },
        ],
      },
      { nodes: [node()] },
    );

    expect(options.userConfig?.ruleOrder).toEqual(["custom-rule:custom-rule"]);
    expect(options.userConfig).not.toHaveProperty("listenerPorts");
    expect(options.proxyGroupNameOverrides).toBeUndefined();
    expect(options.customProxyGroups).toBeUndefined();
    expect(options.dialerProxyGroups).toBeUndefined();
  });

  it("normalizes group listeners: trims fields, drops invalid entries and dedupes targets", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        groupListeners: [
          { id: " g1 ", target: " AI 组 ", port: 7891 },
          { id: "g2", target: "Media", port: "7892" },
          { id: "g3", target: "  ", port: 7893 },
          { id: "g4", target: "AI 组", port: 7894 },
          "bad",
          { id: "g5", target: "Games", port: 0 },
          { id: "g6", target: "Games", port: 65536 },
          { target: "Games", port: 7895 },
        ],
      },
      { nodes: [node()] },
    );

    expect(options.groupListeners).toEqual([
      { id: "g1", target: "AI 组", port: 7891 },
      { id: "group_listener_8", target: "Games", port: 7895 },
    ]);
  });

  it("omits group listeners when none survive normalization", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        groupListeners: [{ id: "g1", target: "", port: 7891 }, 42],
      },
      { nodes: [node()] },
    );

    expect(options).not.toHaveProperty("groupListeners");
  });

  it("uses legacy custom group fallback when rule model normalization returns no groups", async () => {
    vi.resetModules();
    vi.doMock("@subboost/core/rules/rule-model", () => ({
      normalizeRuleModelFromConfig: () => ({
        customProxyGroups: [],
        customRuleSets: [],
        builtinRuleEdits: {},
      }),
    }));

    try {
      const { buildGenerateOptionsFromConfig: buildWithMockedRuleModel } = await import("./config-utils");
      const options = buildWithMockedRuleModel(
        {
          template: "minimal",
          customProxyGroups: [
            "bad",
            { id: "", name: "Bad", emoji: "B", groupType: "select" },
            { id: "select", name: " Select ", emoji: null, groupType: "select", enabled: true },
            { id: "auto", name: "Auto", emoji: "A", groupType: "url-test" },
            { id: "fallback", name: "Fallback", emoji: "F", groupType: "fallback" },
            { id: "direct", name: "Direct", emoji: "D", groupType: "direct-first" },
            { id: "reject", name: "Reject", emoji: "R", groupType: "reject-first" },
            { id: "balance", name: "Balance", emoji: "B", groupType: "load-balance", strategy: "bad" },
          ],
          dialerProxyGroups: [
            {
              id: "direct-dialer",
              name: "Direct Dialer",
              type: "direct-first",
              enabled: true,
              relayNodes: [" Relay ", ""],
              targetNodes: "bad",
            },
            {
              id: "reject-dialer",
              name: "Reject Dialer",
              type: "reject-first",
              strategy: "round-robin",
            },
          ],
        },
        { nodes: [node()] },
      );

      expect(options.customProxyGroups?.map((group) => group.groupType)).toEqual([
        "select",
        "url-test",
        "fallback",
        "direct-first",
        "reject-first",
        "load-balance",
      ]);
      expect(options.customProxyGroups?.find((group) => group.id === "balance")).toMatchObject({
        strategy: "consistent-hashing",
      });
      expect(options.dialerProxyGroups).toEqual([
        {
          enabled: true,
          id: "direct-dialer",
          name: "Direct Dialer",
          relayNodes: ["Relay"],
          targetNodes: [],
          type: "direct-first",
        },
        {
          id: "reject-dialer",
          name: "Reject Dialer",
          relayNodes: [],
          targetNodes: [],
          type: "reject-first",
        },
      ]);

      const sparse = buildWithMockedRuleModel(
        {
          customProxyGroups: "bad",
          dialerProxyGroups: "bad",
          proxyGroupAdvanced: {
            " missing ": "bad",
            " select ": { groupType: "select" },
            " empty ": { regions: ["bad"] },
          },
        },
        { nodes: [node()] },
      );

      expect(sparse.customProxyGroups).toBeUndefined();
      expect(sparse.dialerProxyGroups).toBeUndefined();
      expect(sparse.proxyGroupAdvanced).toEqual({ select: { groupType: "select" } });
    } finally {
      vi.doUnmock("@subboost/core/rules/rule-model");
      vi.resetModules();
    }
  });

  it("normalizes legacy custom groups with dense optional field variants", async () => {
    vi.resetModules();
    vi.doMock("@subboost/core/rules/rule-model", () => ({
      normalizeRuleModelFromConfig: () => ({
        customProxyGroups: [],
        customRuleSets: [],
        builtinRuleEdits: {},
      }),
    }));

    try {
      const { buildGenerateOptionsFromConfig: buildWithMockedRuleModel } = await import("./config-utils");
      const options = buildWithMockedRuleModel(
        {
          customProxyGroups: [
            { id: "missing-name", name: "", emoji: "M", groupType: "select" },
            { id: "missing-type", name: "Missing Type", emoji: "M", groupType: "invalid" },
            {
              id: "select",
              name: " Select ",
              emoji: " S ",
              enabled: false,
              description: " Primary group ",
              memberSource: "filtered-nodes",
              includeInGroupMembers: false,
              groupType: "select",
              strategy: "round-robin",
              advanced: {
                includeRegex: "JP",
                regions: ["jp"],
              },
            },
            {
              id: "balance",
              name: "Balance",
              emoji: undefined,
              enabled: true,
              description: " ",
              memberSource: "all",
              includeInGroupMembers: "yes",
              groupType: "load-balance",
              strategy: "round-robin",
              advanced: { regions: ["bad"] },
            },
          ],
          dialerProxyGroups: [
            { id: "missing-name", name: "", type: "select" },
            { id: "missing-type", name: "Missing Type", type: "invalid" },
            {
              id: "balance-dialer",
              name: "Balance Dialer",
              type: "load-balance",
              enabled: "yes",
              relayNodes: [" Relay "],
              targetNodes: [" Target "],
            },
          ],
        },
        { nodes: [node()] },
      );

      expect(options.customProxyGroups).toEqual([
        {
          id: "select",
          name: "Select",
          emoji: "S",
          enabled: false,
          description: "Primary group",
          memberSource: "filtered-nodes",
          includeInGroupMembers: false,
          groupType: "select",
          advanced: {
            includeRegex: "JP",
            regions: ["jp"],
          },
        },
        {
          id: "balance",
          name: "Balance",
          emoji: "",
          groupType: "load-balance",
          strategy: "round-robin",
        },
      ]);
      expect(options.dialerProxyGroups).toEqual([
        {
          id: "balance-dialer",
          name: "Balance Dialer",
          type: "load-balance",
          strategy: "consistent-hashing",
          relayNodes: ["Relay"],
          targetNodes: ["Target"],
        },
      ]);
    } finally {
      vi.doUnmock("@subboost/core/rules/rule-model");
      vi.resetModules();
    }
  });

  it("normalizes mixed persisted options without emitting empty optional sections", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        template: "full",
        testUrl: " http://probe.example.com/204 ",
        testInterval: 0,
        enabledGroups: [1, " ", "auto", "auto", "cn"],
        enabledRules: [null, "global", " "],
        customRules: [
          { id: "", type: "DST-PORT", value: " 443 ", target: { kind: "module", id: " auto " } },
          { id: "bad-target", type: "DOMAIN", value: "bad.example", target: { kind: "node", name: "" } },
          { id: "src-port", type: "SRC-PORT", value: " 6881 ", target: { kind: "custom", id: " media " } },
        ],
        customProxyGroups: [
          {
            id: "media",
            name: " Media ",
            emoji: undefined,
            enabled: false,
            description: " Media group ",
            memberSource: "filtered-nodes",
            includeInGroupMembers: true,
            groupType: "load-balance",
            strategy: "round-robin",
            advanced: {
              sourceIds: ["source-a"],
              regions: ["tw"],
              includeRegex: "TW",
              excludeRegex: "test",
              extraMembers: [{ kind: "reject" }],
              excludedMembers: [{ kind: "direct" }],
              memberOrder: [{ kind: "reject" }],
            },
          },
        ],
        customRuleSets: [
          {
            id: "manual",
            name: " Manual ",
            behavior: "classical",
            path: "https://rules.example.com/manual.yaml",
            target: { kind: "module", id: " cn " },
            noResolve: true,
          },
        ],
        dialerProxyGroups: [
          {
            id: "direct",
            name: " Direct Dialer ",
            type: "direct-first",
            strategy: "round-robin",
            relayNodes: ["Relay", "Relay", ""],
            targetNodes: ["Target", null, "Target"],
          },
        ],
        listenerPorts: {
          socks: 65535,
          negative: -1,
          nan: Number.NaN,
        },
        proxyGroupNameOverrides: {
          cn: " China ",
        },
        proxyGroupOrder: [" cn ", "cn", "", null],
        mixedPort: 65535,
        allowLan: false,
        autoSelectStrategy: "load-balance",
        cnIpNoResolve: true,
        experimentalCnUseCnRuleSet: false,
      },
      { nodes: [node({ name: "TW Node" })] },
    );

    expect(options.template).toBe("full");
    expect(options.userConfig).toMatchObject({
      enabledGroups: ["auto", "auto", "cn"],
      enabledRules: ["global"],
      mixedPort: 65535,
      allowLan: false,
      autoSelectStrategy: "load-balance",
      cnIpNoResolve: true,
      experimentalCnUseCnRuleSet: false,
      listenerPorts: { socks: 65535 },
      testUrl: "http://probe.example.com/204",
      testInterval: 0,
    });
    expect(options.userConfig?.customRules).toEqual([
      {
        id: "custom-rule-dst-port-443-module-auto-1",
        type: "DST-PORT",
        value: "443",
        target: { kind: "module", id: "auto" },
      },
      {
        id: "src-port",
        type: "SRC-PORT",
        value: "6881",
        target: { kind: "custom", id: "media" },
      },
    ]);
    expect(options.customProxyGroups).toEqual([
      {
        id: "media",
        name: "Media",
        emoji: "",
        enabled: false,
        description: "Media group",
        memberSource: "filtered-nodes",
        includeInGroupMembers: true,
        groupType: "load-balance",
        strategy: "round-robin",
        advanced: {
          sourceIds: ["source-a"],
          regions: ["tw"],
          includeRegex: "TW",
          excludeRegex: "test",
          extraMembers: [{ kind: "reject" }],
          excludedMembers: [{ kind: "direct" }],
          memberOrder: [{ kind: "reject" }],
        },
      },
    ]);
    expect(options.customRuleSets).toBeUndefined();
    expect(options.dialerProxyGroups).toEqual([
      {
        id: "direct",
        name: "Direct Dialer",
        type: "direct-first",
        relayNodes: ["Relay", "Relay"],
        targetNodes: ["Target", "Target"],
      },
    ]);
    expect(options.proxyGroupNameOverrides).toEqual({ cn: "China" });
    expect(options.proxyGroupOrder).toEqual(["cn", "cn"]);
  });
});
