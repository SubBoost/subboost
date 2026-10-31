import { describe, expect, it } from "vitest";
import {
  buildGeneratedRuleEntries,
  generateRules,
  hasFullRuleOrderKeys,
  normalizePersistedRuleOrder,
  resolveAppliedRuleOrder,
  resolveModuleName,
} from "./rules";
import { generateClashConfig } from "./index";
import { PROXY_GROUP_MODULES } from "./proxy-groups";
import type { CustomRule, CustomRuleSet } from "@subboost/core/types/config";

const customRules: CustomRule[] = [
  {
    id: "domain-rule",
    type: "DOMAIN-SUFFIX",
    value: "example.com",
    target: "Missing Target",
  },
  {
    id: "ip-rule",
    type: "IP-CIDR",
    value: "203.0.113.0/24",
    target: "DIRECT",
    noResolve: true,
  },
];

const customRuleSets: CustomRuleSet[] = [
  {
    id: "media-rule",
    name: "Media Rule",
    behavior: "domain",
    path: "https://rules.example.com/media.mrs",
    target: "Media",
    noResolve: true,
  },
];

describe("rule generator", () => {
  it("builds generated rule entries with fallback targets and special rules", () => {
    const entries = buildGeneratedRuleEntries({
      enabledModules: ["cn", "global", "final", "streaming-west"],
      customRules,
      customRuleSets,
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: false,
      proxyGroupNameOverrides: {
        cn: "CN Direct",
        final: "Final",
        "streaming-west": "Streaming",
      },
      availablePolicyTargets: ["DIRECT", "🔒 CN Direct", "🐟 Final", "📺 Streaming", "Media"],
      fallbackPolicyTarget: "DIRECT",
    });
    const texts = entries.map((entry) => entry.text);
    const customIpEntry = entries.find((entry) => entry.key === "custom-rule:ip-rule");
    const customRuleSetEntry = entries.find((entry) => entry.key === "custom-rule-set:media-rule");
    const appleTvPlusEntry = entries.find((entry) => entry.key === "module:streaming-west:apple-tvplus");

    expect(resolveModuleName("cn", { cn: "CN Direct" })).toBe("🔒 CN Direct");
    expect(texts).toContain("DOMAIN-SUFFIX,example.com,DIRECT");
    expect(texts).toContain("IP-CIDR,203.0.113.0/24,DIRECT,no-resolve");
    expect(customIpEntry).toMatchObject({
      summary: "203.0.113.0/24",
      text: "IP-CIDR,203.0.113.0/24,DIRECT,no-resolve",
    });
    expect(texts).toContain("RULE-SET,media-rule,Media,no-resolve");
    expect(texts).toContain("RULE-SET,apple-tvplus,📺 Streaming");
    expect(customIpEntry).toMatchObject({ editable: true });
    expect(customRuleSetEntry).toMatchObject({ editable: true });
    expect(appleTvPlusEntry).toMatchObject({
      key: "module:streaming-west:apple-tvplus",
      kind: "module",
      editable: false,
    });
    expect(entries.some((entry) => entry.key === "special:apple-tvplus")).toBe(false);
    expect(texts).toContain("RULE-SET,cn,🔒 CN Direct");
    expect(texts).toContain("MATCH,🐟 Final");
    expect(texts.find((text) => text.startsWith("RULE-SET,cn-ip,"))).toBe("RULE-SET,cn-ip,🔒 CN Direct");
  });

  it("removes deleted preset module rules from generated rules and providers", () => {
    const enabledModules = PROXY_GROUP_MODULES.map((proxyModule) => proxyModule.id);
    const allPresetRuleIds = PROXY_GROUP_MODULES.flatMap((proxyModule) => proxyModule.rules.map((rule) => rule.id));
    const duplicateRuleIds = allPresetRuleIds.filter((id, index) => allPresetRuleIds.indexOf(id) !== index);

    expect(duplicateRuleIds).toEqual([]);

    for (const proxyModule of PROXY_GROUP_MODULES) {
      for (const rule of proxyModule.rules) {
        const config = generateClashConfig({
          nodes: [],
          template: "full",
          userConfig: {
            enabledGroups: enabledModules,
            enabledRules: enabledModules,
            customRules: [],
            ruleProviderBaseUrl: "https://example.com/rules",
            experimentalCnUseCnRuleSet: false,
          },
          builtinRuleEdits: { [`module:${proxyModule.id}:${rule.id}`]: { enabled: false } },
        });
        const rules = Array.isArray(config.rules) ? config.rules : [];
        const providers = config["rule-providers"] as Record<string, unknown> | undefined;

        expect(rules.filter((line) => line.startsWith(`RULE-SET,${rule.id},`))).toEqual([]);
        expect(providers?.[rule.id]).toBeUndefined();
      }
    }
  });

  it("handles Apple TV+ deletion and moves without special-rule leftovers", () => {
    const enabledModules = PROXY_GROUP_MODULES.map((proxyModule) => proxyModule.id);
    const baseConfig = {
      nodes: [],
      template: "full" as const,
      userConfig: {
        enabledGroups: enabledModules,
        enabledRules: enabledModules,
        customRules: [],
        ruleProviderBaseUrl: "https://example.com/rules",
        experimentalCnUseCnRuleSet: false,
      },
    };
    const baseline = generateClashConfig(baseConfig);
    const deleted = generateClashConfig({
      ...baseConfig,
      builtinRuleEdits: { "module:streaming-west:apple-tvplus": { enabled: false } },
    });
    const moved = generateClashConfig({
      ...baseConfig,
      builtinRuleEdits: { "module:streaming-west:apple-tvplus": { target: "🔍 谷歌服务" } },
    });
    const baselineRules = baseline.rules as string[];
    const appleTvPlusIndex = baselineRules.indexOf("RULE-SET,apple-tvplus,📺 欧美流媒体");
    const appleIndex = baselineRules.indexOf("RULE-SET,apple,🍏 苹果服务");
    const hboIndex = baselineRules.indexOf("RULE-SET,hbo,📺 欧美流媒体");

    expect(appleTvPlusIndex).toBeGreaterThanOrEqual(0);
    expect(appleTvPlusIndex).toBeLessThan(appleIndex);
    expect(appleTvPlusIndex).toBeLessThan(hboIndex);
    expect((deleted.rules as string[]).filter((line) => line.startsWith("RULE-SET,apple-tvplus,"))).toEqual([]);
    expect((deleted["rule-providers"] as Record<string, unknown> | undefined)?.["apple-tvplus"]).toBeUndefined();
    expect((moved.rules as string[]).filter((line) => line.startsWith("RULE-SET,apple-tvplus,"))).toEqual([
      "RULE-SET,apple-tvplus,🔍 谷歌服务",
    ]);
    expect((moved["rule-providers"] as Record<string, { url?: string }> | undefined)?.["apple-tvplus"]?.url).toBe(
      "https://example.com/rules/geosite/apple-tvplus.mrs"
    );
  });

  it("normalizes persisted order in editable-only and full-order modes", () => {
    const editableOrder = normalizePersistedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customRuleSets,
      ruleOrder: ["custom-rule-set:media-rule", "missing", "custom-rule:domain-rule"],
    });
    const fullOrder = normalizePersistedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customRuleSets,
      ruleOrder: ["module:global:geolocation-!cn", "custom-rule:domain-rule", "special:match"],
    });
    const applied = resolveAppliedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customRuleSets,
      ruleOrder: ["module:global:geolocation-!cn"],
    });

    expect(hasFullRuleOrderKeys(["custom-rule:domain-rule"])).toBe(false);
    expect(hasFullRuleOrderKeys(["module:global:geolocation-!cn"])).toBe(true);
    expect(editableOrder).toEqual(["custom-rule-set:media-rule", "custom-rule:domain-rule", "custom-rule:ip-rule"]);
    expect(fullOrder).toEqual(["module:global:geolocation-!cn", "custom-rule:domain-rule"]);
    expect(applied).toContain("module:global:geolocation-!cn");
    expect(applied.indexOf("custom-rule:domain-rule")).toBeLessThan(applied.indexOf("module:global:geolocation-!cn"));
    expect(resolveAppliedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules,
      customRuleSets,
      ruleOrder: ["custom-rule-set:media-rule", "custom-rule:ip-rule"],
    }).slice(0, 3)).toEqual(["custom-rule-set:media-rule", "custom-rule:ip-rule", "custom-rule:domain-rule"]);
    expect(generateRules({
      enabledModules: [],
      customRules: [],
      fallbackPolicyTarget: "DIRECT",
    })).toEqual(["MATCH,DIRECT"]);
  });

  it("keeps inactive preset anchors so deleted or moved rules can restore their full-order position", () => {
    const options = {
      enabledModules: PROXY_GROUP_MODULES.map((proxyModule) => proxyModule.id),
      customRules: [],
      customRuleSets: [],
      fallbackPolicyTarget: "DIRECT",
    };
    const baselineOrder = buildGeneratedRuleEntries(options)
      .filter((entry) => entry.key !== "special:match")
      .map((entry) => entry.key);

    for (const proxyModule of PROXY_GROUP_MODULES) {
      for (const rule of proxyModule.rules) {
        const sourceKey = `module:${proxyModule.id}:${rule.id}`;
        const targetModuleId = proxyModule.id === "google" ? "ai" : "google";
        const baselineIndex = baselineOrder.indexOf(sourceKey);
        expect(baselineIndex).toBeGreaterThanOrEqual(0);

        const afterDeleteOrder = normalizePersistedRuleOrder({
          ...options,
          builtinRuleEdits: { [sourceKey]: { enabled: false } },
          ruleOrder: baselineOrder,
        });
        const afterDeleteApplied = resolveAppliedRuleOrder({
          ...options,
          builtinRuleEdits: { [sourceKey]: { enabled: false } },
          ruleOrder: afterDeleteOrder,
        });
        const afterRestoreApplied = resolveAppliedRuleOrder({
          ...options,
          ruleOrder: afterDeleteOrder,
        });
        const afterMoveOrder = normalizePersistedRuleOrder({
          ...options,
          builtinRuleEdits: { [sourceKey]: { target: resolveModuleName(targetModuleId) } },
          ruleOrder: baselineOrder,
        });
        const afterMoveApplied = resolveAppliedRuleOrder({
          ...options,
          builtinRuleEdits: { [sourceKey]: { target: resolveModuleName(targetModuleId) } },
          ruleOrder: afterMoveOrder,
        });

        expect(afterDeleteOrder).toContain(sourceKey);
        expect(afterDeleteApplied).not.toContain(sourceKey);
        expect(afterRestoreApplied.indexOf(sourceKey)).toBe(baselineIndex);
        expect(afterMoveOrder).toContain(sourceKey);
        expect(afterMoveApplied.indexOf(sourceKey)).toBe(baselineIndex);
      }
    }
  });

  it("keeps missing editable rules near their canonical neighbors in full-order mode", () => {
    const options = {
      enabledModules: ["ad", "private", "global", "final"],
      customRules,
      customRuleSets: [],
      fallbackPolicyTarget: "DIRECT",
    };
    const entries = buildGeneratedRuleEntries(options);
    const adKey = entries.find((entry) => entry.key.startsWith("module:ad:"))?.key;
    if (!adKey) throw new Error("Expected ad module rule");

    const applied = resolveAppliedRuleOrder({
      ...options,
      ruleOrder: [adKey],
    });

    expect(resolveModuleName("missing-module")).toBe("missing-module");
    expect(applied.slice(applied.indexOf(adKey) + 1, applied.indexOf(adKey) + 3)).toEqual([
      "custom-rule:domain-rule",
      "custom-rule:ip-rule",
    ]);
    expect(
      buildGeneratedRuleEntries({
        enabledModules: ["final"],
        customRules: [
          {
            id: "domain-no-resolve",
            type: "DOMAIN-SUFFIX",
            value: "example.org",
            target: "DIRECT",
            noResolve: true,
          },
        ],
        customRuleSets: [
          {
            id: "plain-rule",
            name: "Plain Rule",
            behavior: "domain",
            path: "https://rules.example.com/plain.mrs",
            target: "Plain",
          },
        ],
        fallbackPolicyTarget: "DIRECT",
      }).map((entry) => entry.text)
    ).toEqual(["DOMAIN-SUFFIX,example.org,DIRECT", "RULE-SET,plain-rule,Plain", "MATCH,🐟 漏网之鱼"]);
    expect(
      normalizePersistedRuleOrder({
        enabledModules: [],
        customRules: [],
        ruleOrder: ["custom-rule:missing"],
      })
    ).toEqual([]);
    expect(
      normalizePersistedRuleOrder({
        enabledModules: ["streaming-west"],
        customRules: [],
        customRuleSets: [],
        ruleOrder: ["special:apple-tvplus", "module:streaming-west:apple-tvplus"],
      })
    ).toEqual(["module:streaming-west:apple-tvplus"]);
  });

  it("drops custom rules and sets targeted at disabled groups", () => {
    const entries = buildGeneratedRuleEntries({
      enabledModules: ["private", "apple"],
      customProxyGroups: [
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      customRules: [
        {
          id: "module-target",
          type: "DOMAIN",
          value: "module.example",
          target: { kind: "module", id: "select" },
          noResolve: true,
        },
        {
          id: "disabled-name",
          type: "DOMAIN",
          value: "disabled-name.example",
          target: "Disabled",
        },
        {
          id: "disabled-ref",
          type: "DOMAIN",
          value: "disabled-ref.example",
          target: { kind: "custom", id: "disabled" },
        },
      ],
      customRuleSets: [
        {
          id: "module-set",
          name: "Module Set",
          behavior: "domain",
          path: "https://rules.example.com/module.mrs",
          target: { kind: "module", id: "select" },
        },
      ],
      fallbackPolicyTarget: "DIRECT",
    });
    const texts = entries.map((entry) => entry.text);

    expect(texts.some((text) => text.includes("module.example"))).toBe(false);
    expect(texts.some((text) => text.startsWith("RULE-SET,module-set,"))).toBe(false);
    expect(texts.some((text) => text.includes("disabled-name.example"))).toBe(false);
    expect(texts.some((text) => text.includes("disabled-ref.example"))).toBe(false);
    expect(texts.some((text) => text.startsWith("RULE-SET,private-ip,🏠 私有网络,no-resolve"))).toBe(true);
    expect(texts.some((text) => text.startsWith("RULE-SET,apple,🍏 苹果服务"))).toBe(true);

    expect(hasFullRuleOrderKeys(undefined)).toBe(false);
    expect(
      normalizePersistedRuleOrder({
        enabledModules: [],
        customRules,
        customRuleSets: [],
        ruleOrder: undefined,
      })
    ).toEqual([]);
    expect(
      resolveAppliedRuleOrder({
        enabledModules: [],
        customRules,
        customRuleSets: [],
        ruleOrder: ["module:global:geolocation-!cn"],
      })
    ).toEqual(["custom-rule:domain-rule", "custom-rule:ip-rule"]);
  });

  it("applies builtin module target edits and cn no-resolve overrides", () => {
    const entries = buildGeneratedRuleEntries({
      enabledModules: ["cn"],
      customRules: [],
      customRuleSets: [],
      customProxyGroups: [
        { id: "regional", name: "Regional", emoji: "R", groupType: "select" },
      ],
      builtinRuleEdits: {
        "module:cn:cn-ip": { target: { kind: "custom", id: "regional" } },
      },
      cnIpNoResolve: true,
      availablePolicyTargets: ["Regional", "DIRECT"],
      fallbackPolicyTarget: "DIRECT",
    });
    const texts = entries.map((entry) => entry.text);

    expect(texts).toContain("RULE-SET,cn-ip,Regional,no-resolve");
    expect(texts).toContain("MATCH,DIRECT");
    expect(entries.find((entry) => entry.key === "module:cn:cn-ip")).toMatchObject({
      noResolve: true,
      sourceLabel: "🔒 国内服务",
      target: "Regional",
    });
  });

  it("cleans noisy persisted full-order keys without losing active editable rules", () => {
    const applied = resolveAppliedRuleOrder({
      enabledModules: ["global"],
      customRules,
      customRuleSets,
      ruleOrder: [
        " module:global:geolocation-!cn ",
        "module:global:geolocation-!cn",
        1 as never,
        "custom-rule:ip-rule",
        "custom-rule:missing",
        "module:unknown:missing",
        "special:match",
      ],
      fallbackPolicyTarget: "DIRECT",
    });
    const persisted = normalizePersistedRuleOrder({
      enabledModules: ["global"],
      customRules,
      customRuleSets,
      ruleOrder: [
        " module:global:geolocation-!cn ",
        "module:global:geolocation-!cn",
        1 as never,
        "custom-rule:ip-rule",
        "custom-rule:missing",
        "module:unknown:missing",
        "special:match",
      ],
      fallbackPolicyTarget: "DIRECT",
    });

    expect(persisted).toEqual(["module:global:geolocation-!cn", "custom-rule:ip-rule"]);
    expect(applied).toEqual([
      "custom-rule:domain-rule",
      "custom-rule-set:media-rule",
      "module:global:geolocation-!cn",
      "custom-rule:ip-rule",
    ]);
  });

  it("applies fallback policy targets and no-resolve guards for mixed custom rules", () => {
    const entries = buildGeneratedRuleEntries({
      enabledModules: ["cn", "global", "final"],
      customRules: [
        {
          id: "cidr6",
          type: "IP-CIDR6",
          value: "2001:db8::/32",
          target: "Missing",
          noResolve: true,
        },
        {
          id: "process",
          type: "PROCESS-NAME",
          value: "curl",
          target: "DIRECT",
          noResolve: true,
        },
      ],
      customRuleSets: [
        {
          id: "fallback-set",
          name: "Fallback Set",
          behavior: "domain",
          path: "https://rules.example.com/fallback.mrs",
          target: "Missing",
          noResolve: false,
        },
        {
          id: "custom-set",
          name: "Custom Set",
          behavior: "classical" as never,
          path: "https://rules.example.com/custom.yaml",
          target: { kind: "custom", id: "regional" },
          noResolve: true,
        },
      ],
      customProxyGroups: [
        { id: "regional", name: "Regional", emoji: "", groupType: "select" },
      ],
      builtinRuleEdits: {
        "module:cn:cn-ip": { enabled: false },
        "module:global:geolocation-!cn": { target: "Missing" },
      },
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: true,
      availablePolicyTargets: ["DIRECT", "Regional", "🐟 漏网之鱼"],
      fallbackPolicyTarget: "DIRECT",
      ruleOrder: [
        "module:cn:cn-ip",
        "custom-rule:process",
        "custom-rule-set:custom-set",
        "special:experimental-cn",
        "special:match",
      ],
    });
    const texts = entries.map((entry) => entry.text);
    const persisted = normalizePersistedRuleOrder({
      enabledModules: ["cn", "global", "final"],
      customRules: [
        { id: "cidr6", type: "IP-CIDR6", value: "2001:db8::/32", target: "Missing", noResolve: true },
        { id: "process", type: "PROCESS-NAME", value: "curl", target: "DIRECT", noResolve: true },
      ],
      customRuleSets: [
        {
          id: "custom-set",
          name: "Custom Set",
          behavior: "classical" as never,
          path: "https://rules.example.com/custom.yaml",
          target: { kind: "custom", id: "regional" },
          noResolve: true,
        },
      ],
      builtinRuleEdits: {
        "module:cn:cn-ip": { enabled: false },
      },
      ruleOrder: [
        "module:cn:cn-ip",
        "custom-rule:process",
        "custom-rule:missing",
        "special:experimental-cn",
        "special:match",
      ],
      experimentalCnUseCnRuleSet: true,
      fallbackPolicyTarget: "DIRECT",
    });

    expect(texts).toContain("IP-CIDR6,2001:db8::/32,DIRECT,no-resolve");
    expect(texts).toContain("PROCESS-NAME,curl,DIRECT");
    expect(texts).not.toContain("PROCESS-NAME,curl,DIRECT,no-resolve");
    expect(texts).toContain("RULE-SET,fallback-set,DIRECT");
    expect(texts).toContain("RULE-SET,custom-set,Regional,no-resolve");
    expect(texts).not.toContain("RULE-SET,cn-ip,🔒 国内服务,no-resolve");
    expect(texts).toContain("RULE-SET,geolocation-!cn,DIRECT");
    expect(texts).toContain("RULE-SET,cn,DIRECT");
    expect(texts).toContain("RULE-SET,geolocation-cn,DIRECT");
    expect(texts.at(-1)).toBe("MATCH,🐟 漏网之鱼");
    expect(persisted).toEqual([
      "module:cn:cn-ip",
      "custom-rule:process",
      "special:experimental-cn",
    ]);
  });
});
