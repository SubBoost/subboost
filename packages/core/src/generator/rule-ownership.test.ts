import { describe, expect, it } from "vitest";
import type { BuiltinRuleEdits, CustomProxyGroup, ProxyGroupRuleTarget } from "@subboost/core/types/config";
import { generateClashConfig } from "./index";
import { PROXY_GROUP_MODULES } from "./proxy-groups";
import { buildGeneratedRuleEntries, normalizePersistedRuleOrder, resolveModuleName } from "./rules";

const customGroup: CustomProxyGroup = { id: "regional", name: "Regional", emoji: "", groupType: "select" };

function output(enabledModules: string[], edits: BuiltinRuleEdits, customProxyGroups: CustomProxyGroup[] = []) {
  const config = generateClashConfig({
    nodes: [],
    template: "full",
    userConfig: { enabledGroups: enabledModules, enabledRules: enabledModules, customRules: [],
      ruleProviderBaseUrl: "https://local.subboost.test/rules", experimentalCnUseCnRuleSet: false },
    builtinRuleEdits: edits,
    customProxyGroups,
  });
  return { rules: config.rules as string[], providers: config["rule-providers"] as Record<string, unknown> };
}

function expectRule(outputValue: ReturnType<typeof output>, id: string, target: string | null) {
  const matches = outputValue.rules.filter((rule) => rule.startsWith(`RULE-SET,${id},`));
  if (target === null) {
    expect(matches).toEqual([]);
    expect(outputValue.providers).not.toHaveProperty(id);
  } else {
    expect(matches).toHaveLength(1);
    expect(matches[0].split(",")[2]).toBe(target);
    expect(outputValue.providers).toHaveProperty(id);
  }
}

describe("moved rule ownership", () => {
  it.each<ProxyGroupRuleTarget>([
    { kind: "module", id: "cn" }, "module:cn", resolveModuleName("cn"),
  ])("uses the destination switch for module target %j", (target) => {
    const edits = { "module:microsoft:microsoft": { target }, "module:microsoft:onedrive": { target } };
    for (const id of ["microsoft", "onedrive"]) {
      expectRule(output(["select", "cn"], edits), id, resolveModuleName("cn"));
      expectRule(output(["select", "microsoft"], edits), id, null);
      expectRule(output(["select", "cn", "microsoft"], edits), id, resolveModuleName("cn"));
    }
  });

  it("respects literal-name collisions and follows a renamed structured custom target", () => {
    const collision = { ...customGroup, name: "module:cn" };
    const stringEdit = { "module:microsoft:onedrive": { target: "module:cn" } };
    const objectEdit = { "module:microsoft:onedrive": { target: { kind: "module" as const, id: "cn" } } };
    expectRule(output(["select", "cn"], stringEdit, [collision]), "onedrive", "module:cn");
    expectRule(output(["select", "cn", "microsoft"], stringEdit, [{ ...collision, enabled: false }]), "onedrive", null);
    expectRule(output(["select", "cn"], objectEdit, [{ ...collision, enabled: false }]), "onedrive", resolveModuleName("cn"));
    const renamed = { ...customGroup, name: "Renamed" };
    expectRule(output(["select"], { "module:microsoft:onedrive": { target: { kind: "custom", id: "regional" } } }, [renamed]),
      "onedrive", "Renamed");
  });

  it("activates a literal shared name when either matching group is active", () => {
    const sameName = { ...customGroup, name: resolveModuleName("cn") };
    const literal = { "module:microsoft:onedrive": { target: sameName.name } };
    const explicitModule = { "module:microsoft:onedrive": { target: { kind: "module" as const, id: "cn" } } };
    const explicitCustom = { "module:microsoft:onedrive": { target: { kind: "custom" as const, id: "regional" } } };
    expectRule(output(["select"], literal, [sameName]), "onedrive", sameName.name);
    expectRule(output(["select", "cn"], literal, [{ ...sameName, enabled: false }]), "onedrive", sameName.name);
    expectRule(output(["select", "microsoft"], literal, [{ ...sameName, enabled: false }]), "onedrive", null);
    expectRule(output(["select"], explicitModule, [sameName]), "onedrive", null);
    expectRule(output(["select", "cn"], explicitCustom, [{ ...sameName, enabled: false }]), "onedrive", null);
  });

  it.each(["module", "custom"] as const)("accepts a real node with a disabled %s group's literal name", (kind) => {
    const name = kind === "module" ? resolveModuleName("cn") : "Regional";
    const target = kind === "module" ? { kind: "module" as const, id: "cn" } : { kind: "custom" as const, id: "regional" };
    const make = (ruleTarget: ProxyGroupRuleTarget) => generateClashConfig({
      nodes: [{ name, type: "ss", server: "203.0.113.1", port: 8388, cipher: "aes-128-gcm", password: "fixture" }],
      template: "full", customProxyGroups: [{ ...customGroup, enabled: false }],
      builtinRuleEdits: { "module:microsoft:onedrive": { target: ruleTarget } },
      customRuleSets: [{ id: "named-set", name: "Named", behavior: "domain", path: "geosite/named.mrs", target: ruleTarget }],
      userConfig: { enabledGroups: ["select", "microsoft"], enabledRules: ["select", "microsoft"],
        customRules: [{ id: "named-rule", type: "DOMAIN", value: "local.subboost.test", target: ruleTarget }],
        ruleProviderBaseUrl: "https://local.subboost.test/rules" },
    });
    const literal = make(name);
    const literalRules = literal.rules as string[];
    expect(literalRules).toContain(`RULE-SET,onedrive,${name}`);
    expect(literalRules).toContain(`RULE-SET,named-set,${name}`);
    expect(literalRules).toContain(`DOMAIN,local.subboost.test,${name}`);
    expect(literal["rule-providers"]).toHaveProperty("onedrive");
    expect(literal["rule-providers"]).toHaveProperty("named-set");
    const structured = make(target);
    expect((structured.rules as string[]).some((rule) => rule.includes("onedrive") || rule.includes("named-set") || rule.includes("local.subboost.test"))).toBe(false);
    expect(structured["rule-providers"]).not.toHaveProperty("onedrive");
    expect(structured["rule-providers"]).not.toHaveProperty("named-set");
  });

  it("keeps known providers referenced by active nested logic rules without emitting their direct rules", () => {
    const make = (logicTarget: ProxyGroupRuleTarget) => generateClashConfig({
      nodes: [], template: "full", builtinRuleEdits: { "module:microsoft:onedrive": { target: "module:cn" } },
      customRuleSets: [{ id: "nested-set", name: "Nested", behavior: "domain", path: "geosite/nested.mrs", target: "module:cn" }],
      userConfig: { enabledGroups: ["select", "microsoft"], enabledRules: ["select", "microsoft"],
        customRules: [{ id: "logic", type: "AND", value: "((RULE-SET,onedrive),(OR,((RULE-SET,nested-set),(NETWORK,UDP))))", target: logicTarget }],
        ruleProviderBaseUrl: "https://local.subboost.test/rules" },
    });
    const active = make("DIRECT");
    expect((active.rules as string[]).some((rule) => rule.startsWith("AND,"))).toBe(true);
    expect((active.rules as string[]).some((rule) => rule.startsWith("RULE-SET,onedrive,") || rule.startsWith("RULE-SET,nested-set,"))).toBe(false);
    expect(active["rule-providers"]).toHaveProperty("onedrive");
    expect(active["rule-providers"]).toHaveProperty("nested-set");
    const inactive = make("module:cn");
    expect((inactive.rules as string[]).some((rule) => rule.startsWith("AND,"))).toBe(false);
    expect(inactive["rule-providers"]).not.toHaveProperty("onedrive");
    expect(inactive["rule-providers"]).not.toHaveProperty("nested-set");
  });

  it("keeps an active custom provider's metadata when an inactive preset shares its referenced ID", () => {
    const config = generateClashConfig({
      nodes: [], template: "full", builtinRuleEdits: { "module:microsoft:onedrive": { target: "module:cn" } },
      customRuleSets: [{ id: "onedrive", name: "Own OneDrive", behavior: "domain", path: "geosite/own-onedrive.mrs", target: "DIRECT" }],
      userConfig: { enabledGroups: ["select", "microsoft"], enabledRules: ["select", "microsoft"],
        customRules: [{ id: "logic", type: "AND", value: "((RULE-SET,onedrive),(NETWORK,UDP))", target: "DIRECT" }],
        ruleProviderBaseUrl: "https://local.subboost.test/rules" },
    });
    expect(config["rule-providers"]).toHaveProperty("onedrive.url", "https://local.subboost.test/rules/geosite/own-onedrive.mrs");
  });

  it("retains the experimental CN provider only for an active logical reference", () => {
    const make = (target: ProxyGroupRuleTarget) => generateClashConfig({
      nodes: [], template: "full",
      userConfig: { enabledGroups: ["select"], enabledRules: ["select"], experimentalCnUseCnRuleSet: false,
        customRules: [{ id: "logic", type: "NOT", value: "((RULE-SET,cn))", target }],
        ruleProviderBaseUrl: "https://local.subboost.test/rules" },
    });
    const active = make("DIRECT");
    expect(active.rules).toContain("NOT,((RULE-SET,cn)),DIRECT");
    expect((active.rules as string[]).some((rule) => rule.startsWith("RULE-SET,cn,"))).toBe(false);
    expect(active["rule-providers"]).toHaveProperty("cn.url", "https://local.subboost.test/rules/geosite/cn.mrs");
    const inactive = make({ kind: "module", id: "cn" });
    expect(inactive.rules).not.toContain("NOT,((RULE-SET,cn)),DIRECT");
    expect(inactive["rule-providers"]).not.toHaveProperty("cn");
  });

  it("uses custom CN provider metadata for a logical reference even when its direct target is disabled", () => {
    const config = generateClashConfig({
      nodes: [], template: "full",
      customRuleSets: [{ id: "cn", name: "Custom CN", behavior: "domain", path: "geosite/own-cn.mrs",
        target: { kind: "module", id: "cn" } }],
      userConfig: { enabledGroups: ["select"], enabledRules: ["select"], experimentalCnUseCnRuleSet: false,
        customRules: [{ id: "logic", type: "NOT", value: "((RULE-SET,cn))", target: "DIRECT" }],
        ruleProviderBaseUrl: "https://local.subboost.test/rules" },
    });
    expect(config["rule-providers"]).toHaveProperty("cn.url", "https://local.subboost.test/rules/geosite/own-cn.mrs");
    expect((config.rules as string[]).some((rule) => rule.startsWith("RULE-SET,cn,"))).toBe(false);
  });

  it("keeps explicit available policy targets and suppresses missing targets", () => {
    const entries = buildGeneratedRuleEntries({
      enabledModules: [], customRules: [], availablePolicyTargets: ["Node A", "DIRECT"],
      builtinRuleEdits: {
        "module:microsoft:microsoft": { target: "Node A" },
        "module:microsoft:onedrive": { target: "DIRECT" },
      },
    });
    expect(entries).toContainEqual(expect.objectContaining({ key: "module:microsoft:microsoft", target: "Node A" }));
    expect(entries).toContainEqual(expect.objectContaining({ key: "module:microsoft:onedrive", target: "DIRECT" }));
  });

  it("uses the destination for every preset source and retains the original key", () => {
    for (const source of PROXY_GROUP_MODULES) {
      for (const rule of source.rules) {
        const destination = source.id === "cn" ? "ai" : "cn";
        const key = `module:${source.id}:${rule.id}`;
        const edits = { [key]: { target: { kind: "module" as const, id: destination } } };
        const entries = buildGeneratedRuleEntries({ enabledModules: [destination], customRules: [], builtinRuleEdits: edits });
        expect(entries.filter((entry) => entry.key === key)).toHaveLength(1);
        expectRule(output(["select", destination], edits), rule.id, resolveModuleName(destination));
        expectRule(output(["select", source.id], edits), rule.id, null);
        expectRule(output(["select", destination], { [key]: { ...edits[key], enabled: false } }), rule.id, null);
      }
    }
  });

  it.each<ProxyGroupRuleTarget>([
    { kind: "custom", id: "regional" }, "custom:regional", "Regional",
  ])("follows the custom destination %j and omits disabled groups", (target) => {
    const edits = { "module:microsoft:onedrive": { target } };
    expectRule(output(["select"], edits, [customGroup]), "onedrive", "Regional");
    expectRule(output(["select", "microsoft"], edits, [{ ...customGroup, enabled: false }]), "onedrive", null);
  });

  it.each<[ProxyGroupRuleTarget, string]>([
    [{ kind: "custom", id: "missing" }, resolveModuleName("microsoft")],
    ["custom:missing", resolveModuleName("microsoft")],
    [{ kind: "module", id: "missing" }, resolveModuleName("microsoft")],
    ["module:missing", resolveModuleName("microsoft")],
    ["Missing", resolveModuleName("select")],
  ])("retains the existing fallback for an unknown target %j", (target, fallback) => {
    const edits = { "module:microsoft:onedrive": { target } };
    expectRule(output(["select", "microsoft"], edits), "onedrive", fallback);
    expectRule(output(["select"], edits), "onedrive", null);
  });

  it("retains special preset ordering and CN no-resolve after moving", () => {
    const edits = {
      "module:streaming-west:apple-tvplus": { target: { kind: "module" as const, id: "cn" } },
      "module:cn:cn-ip": { target: { kind: "module" as const, id: "apple" } },
    };
    const result = output(["select", "cn", "apple"], edits);
    expectRule(result, "apple-tvplus", resolveModuleName("cn"));
    expectRule(result, "cn-ip", resolveModuleName("apple"));
    expect(result.rules.indexOf(`RULE-SET,apple-tvplus,${resolveModuleName("cn")}`))
      .toBeLessThan(result.rules.indexOf(`RULE-SET,apple,${resolveModuleName("apple")}`));
    expect(result.rules).toContain(`RULE-SET,cn-ip,${resolveModuleName("apple")},no-resolve`);
    const cnDisabled = output(["select", "apple"], edits);
    expectRule(cnDisabled, "cn-ip", resolveModuleName("apple"));
    expectRule(cnDisabled, "apple-tvplus", null);
  });

  it("stops custom rules and rule sets when their builtin target is disabled", () => {
    const customRuleSets = [{ id: "custom-set", name: "Custom", behavior: "domain" as const,
      path: "geosite/custom.mrs", target: { kind: "module" as const, id: "cn" } }];
    const customRules = [{ id: "custom-rule", type: "DOMAIN" as const, value: "local.subboost.test", target: "module:cn" }];
    const config = generateClashConfig({ nodes: [], template: "full", customRuleSets,
      userConfig: { enabledGroups: ["select"], enabledRules: ["select"], customRules,
        ruleProviderBaseUrl: "https://local.subboost.test/rules" } });
    expect(config.rules).not.toContain(expect.stringContaining("custom-set"));
    expect(config.rules).not.toContain(expect.stringContaining("local.subboost.test"));
    expect(config["rule-providers"]).not.toHaveProperty("custom-set");
  });

  it("preserves the saved custom rule order while a target is disabled", () => {
    const customRuleSets = [{ id: "custom-set", name: "Custom", behavior: "domain" as const,
      path: "geosite/custom.mrs", target: { kind: "module" as const, id: "cn" } }];
    const customRules = [{ id: "custom-rule", type: "DOMAIN" as const, value: "local.subboost.test", target: "DIRECT" }];
    const base = { enabledModules: ["select"], customRuleSets, customRules,
      ruleOrder: ["custom-rule-set:custom-set", "custom-rule:custom-rule"] };
    const saved = normalizePersistedRuleOrder(base);
    expect(saved).toEqual(base.ruleOrder);
    expect(buildGeneratedRuleEntries({ ...base, ruleOrder: saved }).map((entry) => entry.key))
      .not.toContain("custom-rule-set:custom-set");
    expect(buildGeneratedRuleEntries({ ...base, enabledModules: ["select", "cn"], ruleOrder: saved })
      .map((entry) => entry.key).slice(0, 2)).toEqual(base.ruleOrder);
  });
});
