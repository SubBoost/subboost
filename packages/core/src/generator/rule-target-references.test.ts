import { describe, expect, it } from "vitest";
import type { CustomProxyGroup, CustomRuleSet } from "@subboost/core/types/config";
import { collectCustomRoutingRuleSets } from "@subboost/core/rules/custom-routing-rule-sets";
import { generateRuleProviders } from "./proxy-groups";
import { buildGeneratedRuleEntries, resolveModuleName } from "./rules";

const regional: CustomProxyGroup = { id: "regional", name: "Regional", emoji: "", groupType: "select" };
const disabled: CustomProxyGroup = { ...regional, id: "disabled", name: "Disabled", enabled: false };
const set = (target: CustomRuleSet["target"], id = "bilibili"): CustomRuleSet => ({
  id, name: id, behavior: "domain", path: `geosite/${id}.mrs`, target,
});
const options = {
  nodes: [], enabledModules: ["select", "cn"], customRules: [],
  ruleProviderBaseUrl: "https://local.subboost.test/rules",
  testUrl: "https://local.subboost.test/probe", testInterval: 60,
  fallbackPolicyTarget: "🚀 节点选择",
  availablePolicyTargets: ["🚀 节点选择", "🔒 国内服务", "Regional", "DIRECT", "REJECT"],
};

describe("rule target string references", () => {
  it.each(["module:cn", { kind: "module", id: "cn" } as const])("resolves the reported target %j", (target) => {
    expect(buildGeneratedRuleEntries({ ...options, customRuleSets: [set(target)] }))
      .toContainEqual(expect.objectContaining({ text: "RULE-SET,bilibili,🔒 国内服务" }));
  });

  it("follows renamed module and custom groups for rule sets, rules and builtin edits", () => {
    const proxyGroupNameOverrides = { cn: "Domestic" };
    const domesticName = resolveModuleName("cn", proxyGroupNameOverrides);
    const entries = buildGeneratedRuleEntries({
      ...options, proxyGroupNameOverrides, customProxyGroups: [{ ...regional, name: "Renamed" }],
      availablePolicyTargets: [...options.availablePolicyTargets, domesticName, "Renamed"],
      customRuleSets: [set(" module: cn "), set("custom:regional", "regional-rule")],
      customRules: [{ id: "plain", type: "DOMAIN", value: "local.subboost.test", target: "custom:regional" }],
      builtinRuleEdits: { "module:cn:cn-ip": { target: "custom:regional" } },
    });
    expect(entries.map((entry) => entry.text)).toEqual(expect.arrayContaining([
      `RULE-SET,bilibili,${domesticName}`, "RULE-SET,regional-rule,Renamed",
      "DOMAIN,local.subboost.test,Renamed", "RULE-SET,cn-ip,Renamed,no-resolve",
    ]));
  });

  it("omits disabled custom references from both rules and providers", () => {
    const customRuleSets = [set("custom:disabled", "disabled-rule"), set("module:cn")];
    const config = {
      ...options, customRuleSets, customProxyGroups: [disabled],
      customRules: [{ id: "disabled", type: "DOMAIN" as const, value: "local.subboost.test", target: "custom:disabled" }],
    };
    expect(buildGeneratedRuleEntries(config).some((entry) => entry.key.includes("disabled"))).toBe(false);
    const providers = generateRuleProviders(config);
    expect(providers).not.toHaveProperty("disabled-rule");
    expect(providers).toHaveProperty("bilibili");
  });

  it("preserves literal names that resemble references, including collisions with disabled IDs", () => {
    const customProxyGroups = [disabled, { ...regional, name: "custom:disabled" },
      { ...regional, id: "literal", name: "module:cn" }];
    const customRuleSets = [set("custom:disabled"), set("module:cn", "literal-rule")];
    const config = { ...options, customProxyGroups, customRuleSets,
      availablePolicyTargets: [...options.availablePolicyTargets, "custom:disabled", "module:cn"] };
    expect(buildGeneratedRuleEntries(config).map((entry) => entry.text)).toEqual(expect.arrayContaining([
      "RULE-SET,bilibili,custom:disabled", "RULE-SET,literal-rule,module:cn",
    ]));
    expect(generateRuleProviders(config)).toHaveProperty("bilibili");
    expect(collectCustomRoutingRuleSets({ customProxyGroups, customRuleSets }).map((item) => item.target.id))
      .toEqual(["regional", "literal"]);
  });

  it("shows string references in the editor and preserves unknown-target fallback", () => {
    const customRuleSets = [set("module:cn"), set("custom:regional", "regional-rule"), set("module:missing", "missing")];
    const items = collectCustomRoutingRuleSets({ customRuleSets, customProxyGroups: [regional] });
    expect(items.map((item) => item.target)).toEqual([
      { kind: "module", id: "cn", name: "🔒 国内服务", value: "module:cn" },
      { kind: "custom", id: "regional", name: "Regional", value: "custom:regional" },
    ]);
    const entries = buildGeneratedRuleEntries({ ...options, customRuleSets, customProxyGroups: [regional] });
    expect(entries).toContainEqual(expect.objectContaining({ key: "custom-rule-set:missing", target: "🚀 节点选择" }));
  });

  it("preserves disabled literal-name precedence without emitting a builtin fallback", () => {
    const customProxyGroups = [regional, { ...disabled, id: "literal", name: "custom:regional" }];
    const entries = buildGeneratedRuleEntries({ ...options, customProxyGroups,
      builtinRuleEdits: { "module:cn:cn-ip": { target: "custom:regional" } },
    });
    expect(entries.some((entry) => entry.key === "module:cn:cn-ip")).toBe(false);
    const objectEntries = buildGeneratedRuleEntries({ ...options, customProxyGroups,
      builtinRuleEdits: { "module:cn:cn-ip": { target: { kind: "custom", id: "literal" } } },
    });
    expect(objectEntries.some((entry) => entry.key === "module:cn:cn-ip")).toBe(false);
    expect(collectCustomRoutingRuleSets({ customProxyGroups, customRuleSets: [set("custom:regional")] })[0].target.id)
      .toBe("literal");
  });
});
