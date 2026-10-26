// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BaseConfigYamlError, generateClashConfig } from "@subboost/core/generator";
import {
  buildGeneratedRuleEntries,
  generateRules,
  hasFullRuleOrderKeys,
  normalizePersistedRuleOrder,
  resolveAppliedRuleOrder,
} from "@subboost/core/generator/rules";
import {
  detachSourceNodesFromState,
  mergeParsedSourceNodes,
  prepareSourceParsedNodes,
} from "@subboost/core/subscription/source-node-refresh";
import { ORIGIN_NAME_KEY, SOURCE_IDS_KEY } from "@subboost/core/subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";
import { YamlHighlight } from "@subboost/ui/product/preview/diff-highlight";
import { createNodeActions } from "@subboost/ui/store/config-store/actions/node-actions";
import { createProxyGroupActions } from "@subboost/ui/store/config-store/actions/proxy-group-actions";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { PagePager } from "@subboost/ui/components/ui/page-pager";
import { ProtocolBadge, getProtocolBadgeClass } from "@subboost/ui/components/ui/protocol-badge";
import { SmartNodeMatchingHelp } from "@subboost/ui/components/subscription/smart-node-matching-help";
import { SubscriptionImportErrorBadge } from "@subboost/ui/product/converter/subscription-import-error";
import { DashboardStatsCards } from "@subboost/ui/dashboard/dashboard-stats-cards";
import { buildRefreshSubscriptionSuccessToast } from "@subboost/ui/dashboard/dashboard-refresh-toast";
import { formatDashboardDate, formatIntervalLabel } from "@subboost/ui/dashboard/dashboard-format";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  pickRandomEmoji,
  toProxyGroupNameDraft,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-name-editor";
import {
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-type-menu";
import {
  buildManualRuleTargets,
  listCustomRulesForTarget,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-rule-targets";
import {
  getRuleDisplayName,
  replaceRuleProviderBase,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-groups-rules-search";
import { parseCustomRuleBatchImport } from "@subboost/core/rules/custom-rule-batch-import";
import {
  buildCnRuleCandidatesFromSources,
  buildCnRuleVariantIds,
  buildLocalCnRuleCandidates,
  collectCnCandidateParents,
  normalizeRuleListLines,
} from "@subboost/core/rules/cn-candidate-utils";

const UUID = "11111111-1111-4111-8111-111111111111";
const REALITY_PUBLIC_KEY = "A".repeat(43);

function ssNode(name: string, patch: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "node"}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
    ...patch,
  } as unknown as ParsedNode;
}

function vmessNode(name: string, patch: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "vmess",
    server: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "vmess"}.example.com`,
    port: 443,
    uuid: UUID,
    alterId: 0,
    cipher: "auto",
    tls: true,
    ...patch,
  } as unknown as ParsedNode;
}

function createProxyGroupHarness(overrides: Record<string, unknown> = {}) {
  let state = {
    ...structuredClone(initialState),
    ...overrides,
  } as any;

  const applyPatch = (patch: any) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const setAndGenerateConfig = (updater: any) => {
    applyPatch(updater(state));
  };

  const actions = createProxyGroupActions(() => undefined, () => state, setAndGenerateConfig);
  return { actions, getState: () => state };
}

function createNodeHarness(overrides: Record<string, unknown> = {}) {
  let state = {
    ...structuredClone(initialState),
    ...overrides,
  } as any;

  const applyPatch = (patch: any) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const set = (patch: any) => {
    applyPatch(typeof patch === "function" ? patch(state) : patch);
  };
  const setAndGenerateConfig = (updater: any) => {
    applyPatch(updater(state));
  };

  const actions = createNodeActions(set, () => state, setAndGenerateConfig);
  return { actions, getState: () => state };
}

describe("public generator and refresh branch coverage", () => {
  it("covers custom rule batch import and CN rule candidate ordering branches", () => {
    const importResult = parseCustomRuleBatchImport({
      text: [
        "",
        "# comment",
        "// comment",
        "rules:",
        "-",
        "- DOMAIN,example.com,Proxy",
        "- \"DOMAIN-REGEX\",\"quoted,example.com\",Proxy",
        "- DOMAIN,example.com,Proxy",
        "DOMAIN,existing.example.com,Proxy",
        "DOMAIN,bad.example.com,Missing",
        "DOMAIN,",
        "DOMAIN,bad-tail.example.com,Proxy,bad-tail",
        "DOMAIN,too,many,columns,here",
        "\"unclosed",
        "simple.example.com",
      ].join("\n"),
      defaultType: "DOMAIN",
      defaultTarget: "Fallback",
      defaultNoResolve: true,
      targetOptions: ["Proxy", "Fallback"],
      existingRules: [
        { id: "existing", type: "DOMAIN", value: "existing.example.com", target: "Proxy", noResolve: false },
      ],
    });
    expect(importResult.readyCount).toBe(3);
    expect(importResult.skippedCount).toBe(5);
    expect(importResult.errorCount).toBe(5);
    expect(importResult.duplicateCount).toBe(2);
    expect(importResult.canImport).toBe(false);
    expect(importResult.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "example.com", noResolve: false }),
        expect.objectContaining({ value: "quoted,example.com", noResolve: false }),
        expect.objectContaining({ value: "simple.example.com", target: "Fallback", noResolve: false }),
      ]),
    );

    expect(buildCnRuleVariantIds("")).toEqual([]);
    expect(buildCnRuleVariantIds(" geolocation-!cn ")).toEqual(
      expect.arrayContaining([
        { id: "geolocation-!cn-cn", variantKind: "dash-cn" },
        { id: "geolocation-cn", variantKind: "dash-cn" },
      ]),
    );

    expect(collectCnCandidateParents([], { defaultToAll: false })).toEqual([]);
    expect(collectCnCandidateParents([""], { defaultToAll: false })).toEqual([]);
    expect(normalizeRuleListLines(["", "# comment", "domain:example.com", "domain:example.com", null as any])).toEqual([
      "domain:example.com",
    ]);

    const candidates = buildCnRuleCandidatesFromSources(
      [
        {
          id: " parent-cn ",
          parentRuleId: "parent",
          parentModuleId: "b-module",
          variantKind: "dash-cn",
          lines: ["domain:example.com", "# comment"],
        },
        {
          id: "parent@cn",
          parentRuleId: "parent",
          parentModuleId: "b-module",
          variantKind: "at-cn",
          lines: ["domain:example.com"],
        },
        {
          id: "covered-cn",
          parentRuleId: "covered",
          parentModuleId: "a-module",
          variantKind: "dash-cn-at-cn",
          lines: ["domain:cn.example"],
        },
        {
          id: "empty-cn",
          parentRuleId: "empty",
          parentModuleId: "a-module",
          variantKind: "at-cn",
          lines: [],
        },
        {
          id: " ",
          parentRuleId: "skip",
          parentModuleId: "skip",
          variantKind: "dash-cn",
          lines: ["domain:skip.example"],
        },
      ],
      ["domain:cn.example"],
    );
    expect(candidates.map((candidate) => candidate.parentModuleId)).toEqual([
      "a-module",
      "a-module",
      "b-module",
      "b-module",
    ]);
    expect(candidates.find((candidate) => candidate.id === "parent@cn")).toMatchObject({
      duplicateOf: "parent-cn",
      actionable: false,
    });
    expect(candidates.find((candidate) => candidate.id === "covered-cn")).toMatchObject({
      coveredByGeolocationCn: true,
      actionable: false,
    });
    expect(candidates.find((candidate) => candidate.id === "empty-cn")).toMatchObject({
      empty: true,
      actionable: false,
    });

    expect(buildLocalCnRuleCandidates({ moduleIds: ["google"], excludedRuleKeys: [] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "google-cn",
          name: "google-cn（谷歌中国）",
          parentModuleId: "google",
        }),
      ]),
    );
  });

  it("normalizes generated rule ordering across full and editable-only persisted keys", () => {
    const options = {
      enabledModules: ["ad", "streaming-west", "cn", "final"],
      customRules: [
        { id: "domain", type: "DOMAIN" as const, value: "custom.example.com", target: "Missing Target" },
        { id: "ip", type: "IP-CIDR" as const, value: "10.0.0.0/8", target: "Missing Target", noResolve: true },
      ],
      customRuleSets: [
        {
          id: "custom-set",
          name: "Custom Set",
          behavior: "ipcidr" as const,
          path: "https://rules.example.com/geoip/custom-set.mrs",
          target: "Custom Group",
          noResolve: true,
        },
      ],
      proxyGroupNameOverrides: {
        "streaming-west": "Streaming",
        cn: "CN Proxy",
        final: "Final Proxy",
      },
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: false,
      availablePolicyTargets: ["Fallback", "Streaming", "CN Proxy", "Final Proxy", "Custom Group"],
      fallbackPolicyTarget: "Fallback",
    };

    const canonicalEntries = buildGeneratedRuleEntries(options);
    const editableKeys = canonicalEntries
      .filter((entry) => entry.kind === "custom-rule" || entry.kind === "custom-rule-set")
      .map((entry) => entry.key);
    const moduleKey = canonicalEntries.find((entry) => entry.key.startsWith("module:ad:"))?.key;
    const laterFullKey = canonicalEntries.find((entry) => entry.key === "special:experimental-cn")?.key;
    expect(moduleKey).toBeTruthy();
    expect(laterFullKey).toBeTruthy();

    expect(hasFullRuleOrderKeys([" custom-rule:domain "])).toBe(false);
    expect(hasFullRuleOrderKeys(["module:ad:category-ads-all"])).toBe(true);

    const fullPersisted = normalizePersistedRuleOrder({
      ...options,
      ruleOrder: [" ", laterFullKey!, laterFullKey!, "missing", moduleKey!, editableKeys[0]],
    });
    expect(fullPersisted).toEqual([laterFullKey, moduleKey, editableKeys[0]]);

    const appliedFromLaterKey = resolveAppliedRuleOrder({
      ...options,
      ruleOrder: [laterFullKey!],
    });
    expect(appliedFromLaterKey).toEqual(expect.arrayContaining(editableKeys));
    expect(appliedFromLaterKey.indexOf(editableKeys[0])).toBeLessThan(appliedFromLaterKey.indexOf(laterFullKey!));

    const appliedEditableOnly = resolveAppliedRuleOrder({
      ...options,
      ruleOrder: [editableKeys[2], editableKeys[0]],
    });
    expect(appliedEditableOnly.filter((key) => editableKeys.includes(key))).toEqual([
      editableKeys[2],
      editableKeys[0],
      editableKeys[1],
    ]);

    const rules = generateRules({ ...options, ruleOrder: [moduleKey!] });
    expect(rules).toContain("DOMAIN,custom.example.com,Fallback");
    expect(rules).toContain("IP-CIDR,10.0.0.0/8,Fallback,no-resolve");
    expect(rules.at(-1)).toBe("MATCH,Fallback");
  });

  it("formats base YAML parse failures and guards generated merge-only sections", () => {
    expect(() =>
      generateClashConfig({
        nodes: [ssNode("Node")],
        userConfig: {
          dnsYaml: "dns:\n  nameserver: [",
        },
      })
    ).toThrow(/第 \d+ 行，第 \d+ 列/);

    expect(() =>
      generateClashConfig({
        nodes: [ssNode("Node")],
        proxyProviders: {
          remote: { type: "http", url: "https://provider.example.com/sub.yaml" },
        },
        userConfig: {
          dnsYaml: "proxy-providers: []",
        },
      })
    ).toThrow(BaseConfigYamlError);

    expect(() =>
      generateClashConfig({
        nodes: [ssNode("Node")],
        userConfig: {
          dnsYaml: "listeners: bad",
          listenerPorts: { Node: 12000 },
        },
      })
    ).toThrow("listeners 必须是数组");
  });

  it("normalizes generator inputs with sparse nodes, policy order, and relay cleanup", () => {
    const config = generateClashConfig({
      nodes: [
        null as unknown as ParsedNode,
        { name: "  ", type: undefined, server: "bad.example.com", port: 443 } as unknown as ParsedNode,
        ssNode("Relay"),
        vmessNode("Target", { "client-fingerprint": "" }),
        {
          name: "Reality",
          type: "vless",
          server: "reality.example.com",
          port: 443,
          uuid: UUID,
          tls: true,
          "reality-opts": {
            "public-key": REALITY_PUBLIC_KEY,
          },
        } as ParsedNode,
      ],
      customProxyGroups: [
        {
          id: "custom-blank",
          name: "",
          emoji: "",
          groupType: "select",
        },
        {
          id: "custom-main",
          name: "Custom Main",
          emoji: "",
          groupType: "select",
        },
        {
          id: "migrated-filtered-blank",
          name: "",
          emoji: "",
          groupType: "select",
          advanced: {},
        },
        {
          id: "migrated-filtered-main",
          name: "Filtered Main",
          emoji: "",
          groupType: "select",
          advanced: {},
        },
      ],
      dialerProxyGroups: [
        {
          id: "dialer-blank",
          name: "",
          type: "select",
          enabled: true,
          relayNodes: ["", "Missing"],
          targetNodes: ["Target"],
        },
        {
          id: "dialer-main",
          name: "Dialer Main",
          type: "select",
          enabled: true,
          relayNodes: ["Relay", "Relay", "Filtered Main", "Custom Main", "DIRECT"],
          targetNodes: ["Target", "Missing"],
        },
      ],
      proxyGroupOrder: [
        "name:Dialer Main",
        "custom:migrated-filtered-main",
        "custom:custom-main",
        "module:select",
        "module:select",
        "missing",
      ],
      userConfig: {
        dnsYaml: [
          "global-client-fingerprint: chrome",
          "nameserver-policy:",
          "  '+.example.com': 1.1.1.1",
        ].join("\n"),
        enabledGroups: ["select", "auto", "global", "final"],
        listenerPorts: {
          Relay: 12000,
          Target: 12001,
          Reality: 12002,
          Missing: 12003,
          Bad: "12004" as never,
        },
      },
    });

    expect(config.dns).toMatchObject({
      "nameserver-policy": { "+.example.com": "1.1.1.1" },
    });
    expect(config.proxies?.map((node) => node.name)).toContain("Target");
    expect(config.proxies?.find((node) => node.name === "Target")).toMatchObject({
      "client-fingerprint": "chrome",
      "dialer-proxy": "Dialer Main",
    });
    expect(config["global-client-fingerprint"]).toBe("chrome");
    expect(config.listeners?.map((listener: { proxy?: string }) => listener.proxy).filter(Boolean)).toEqual([
      "Relay",
      "Target",
      "Reality",
    ]);
    expect(config["proxy-groups"]?.slice(0, 3).map((group) => group.name)).toEqual([
      "Filtered Main",
      "Custom Main",
      "🚀 节点选择",
    ]);
  });

  it("keeps base YAML validation and merge branches observable through public config generation", () => {
    for (const dnsYaml of ["[]", "null", "true"]) {
      expect(() =>
        generateClashConfig({
          nodes: [ssNode("Node")],
          userConfig: { dnsYaml },
        })
      ).toThrow("基础和 DNS 配置必须是 YAML 对象");
    }

    expect(() =>
      generateClashConfig({
        nodes: [ssNode("Node")],
        userConfig: {
          dnsYaml: ["proxies: []", "rules: []"].join("\n"),
        },
      })
    ).toThrow("proxies, rules");

    const defaultBase = generateClashConfig({
      nodes: [ssNode("Node")],
      proxyProviders: {},
      userConfig: {
        listenerPorts: null as never,
      },
    });
    expect(defaultBase).toMatchObject({
      "mixed-port": expect.any(Number),
      "allow-lan": expect.any(Boolean),
    });
    expect(defaultBase.listeners).toBeUndefined();
    expect(defaultBase["proxy-providers"]).toBeUndefined();

    const baseProviderOnly = generateClashConfig({
      nodes: [ssNode("Node")],
      userConfig: {
        dnsYaml: [
          "proxy-providers:",
          "  local:",
          "    type: file",
          "    path: ./local.yaml",
        ].join("\n"),
      },
    });
    expect(baseProviderOnly["proxy-providers"]).toEqual({
      local: { type: "file", path: "./local.yaml" },
    });
  });

  it("covers generator DNS merge, stable duplicate names, and name-based group ordering edge cases", () => {
    expect(() =>
      generateClashConfig({
        nodes: [ssNode("Node")],
        userConfig: {
          dnsYaml: [
            "nameserver-policy:",
            "  '+.example.com': 1.1.1.1",
            "dns: disabled",
          ].join("\n"),
        },
      })
    ).toThrow("dns 必须是对象");

    const dnsWithOwnPolicy = generateClashConfig({
      nodes: [ssNode("Node")],
      userConfig: {
        dnsYaml: [
          "nameserver-policy:",
          "  '+.top.example': 1.1.1.1",
          "dns:",
          "  nameserver-policy:",
          "    '+.inner.example': 8.8.8.8",
        ].join("\n"),
      },
    });
    expect(dnsWithOwnPolicy.dns).toEqual({
      "nameserver-policy": { "+.inner.example": "8.8.8.8" },
    });

    const config = generateClashConfig({
      nodes: [
        ssNode("Dup"),
        ssNode("Dup (2)"),
        ssNode(" Dup "),
        { ...ssNode("Numeric"), name: 123 } as unknown as ParsedNode,
        vmessNode("Plain Vmess", { tls: false, "client-fingerprint": "" }),
        {
          name: "AnyTLS",
          type: "anytls",
          server: "anytls.example.com",
          port: 443,
          password: "secret",
        } as unknown as ParsedNode,
      ],
      customProxyGroups: [
        { id: "bad-custom", name: 123 as never, emoji: "", groupType: "select" },
        { id: "custom-main", name: "Custom Main", emoji: "", groupType: "select" },
        { id: "filtered-main", name: "Filtered Main", emoji: "", groupType: "select", advanced: {} },
      ],
      dialerProxyGroups: [
        {
          id: "bad-dialer",
          name: "",
          type: "select",
          enabled: true,
          relayNodes: [123 as never, "DIRECT"],
          targetNodes: [456 as never],
        },
        {
          id: "dialer-main",
          name: "Dialer Main",
          type: "select",
          enabled: true,
          relayNodes: ["DIRECT", "Custom Main", "Filtered Main"],
          targetNodes: ["Dup"],
        },
      ],
      proxyGroupOrder: ["name:Dialer Main", "custom:filtered-main", "custom:custom-main"],
      userConfig: {
        dnsYaml: "global-client-fingerprint: chrome",
        enabledGroups: ["select", "auto", "final"],
      },
    });

    expect(config.proxies?.map((node) => node.name)).toEqual(
      expect.arrayContaining(["Dup", "Dup (2)", "Dup (3)", "123", "Plain Vmess", "AnyTLS"])
    );
    expect(config.proxies?.find((node) => node.name === "Plain Vmess")).toMatchObject({
      "client-fingerprint": "",
    });
    expect(config["global-client-fingerprint"]).toBe("chrome");
    expect(config.proxies?.find((node) => node.name === "AnyTLS")).toMatchObject({
      "client-fingerprint": "chrome",
    });
    const generatedGroupNames = config["proxy-groups"]?.map((group) => group.name) ?? [];
    expect(generatedGroupNames).toEqual(expect.arrayContaining(["Filtered Main", "Custom Main", "Dialer Main"]));
    expect(generatedGroupNames.indexOf("Filtered Main")).toBeLessThan(generatedGroupNames.indexOf("🚀 节点选择"));
  });

});
