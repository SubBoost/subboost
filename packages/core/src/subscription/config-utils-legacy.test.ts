import { describe, expect, it, vi } from "vitest";
import { buildGenerateOptionsFromConfig } from "./config-utils";
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

describe("subscription config utils legacy and mixed persistence", () => {
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
