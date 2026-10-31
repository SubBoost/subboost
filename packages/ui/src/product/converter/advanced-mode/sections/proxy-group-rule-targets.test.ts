import { describe, expect, it } from "vitest";
import { buildManualRuleTargets, listCustomRulesForTarget } from "./proxy-group-rule-targets";

describe("proxy group rule targets", () => {
  it("lists rules by structured container identity when module and custom IDs coincide", () => {
    const rules = [
      { id: "builtin", target: { kind: "module", id: "cn" } },
      { id: "custom", target: { kind: "custom", id: "cn" } },
      { id: "node", target: "module:cn" },
    ] as any[];
    const groups = [{ id: "cn", name: "Regional", emoji: "", groupType: "select" as const }];
    const options = { moduleNames: { cn: "Domestic" }, customProxyGroups: groups,
      literalTargetNames: ["module:cn"], availablePolicyTargets: ["module:cn"] };
    expect(listCustomRulesForTarget(rules, "Domestic", { ...options, container: { kind: "module", id: "cn" } }))
      .toEqual([{ rule: rules[0], index: 0 }]);
    expect(listCustomRulesForTarget(rules, "Regional", { ...options, container: { kind: "custom", id: "cn" } }))
      .toEqual([{ rule: rules[1], index: 1 }]);
    expect(listCustomRulesForTarget(rules, "Regional", { customProxyGroups: groups, container: { kind: "custom", id: "cn" } }))
      .toEqual([{ rule: rules[1], index: 1 }]);
  });

  it("omits disabled custom groups even when no hidden-module list is supplied", () => {
    expect(buildManualRuleTargets({ enabledProxyGroups: [], customProxyGroups: [
      { id: "on", name: "On", emoji: "", groupType: "select" },
      { id: "off", name: "Off", emoji: "", groupType: "select", enabled: false },
    ] })).toEqual([{ kind: "custom", id: "on", name: "On" }]);
  });
  it("does not list a literal node name as a shorthand module target", () => {
    const rules = [{ id: "literal", type: "DOMAIN", value: "local.subboost.test", target: "module:cn" }] as any[];
    expect(listCustomRulesForTarget(rules, "🔒 国内服务", {
      moduleNames: { cn: "🔒 国内服务" }, literalTargetNames: ["module:cn"],
    })).toEqual([]);
  });
  it("lists custom rules that target the exact normalized group name", () => {
    const rules = [
      { target: "Proxy", payload: "A" },
      { target: " Proxy ", payload: "B" },
      { target: "Other", payload: "C" },
    ] as any[];

    expect(listCustomRulesForTarget(rules, " Proxy ")).toEqual([
      { rule: rules[0], index: 0 },
      { rule: rules[1], index: 1 },
    ]);
    expect(listCustomRulesForTarget(rules, " ")).toEqual([]);
  });

  it("builds enabled module and custom targets", () => {
    const targets = buildManualRuleTargets({
      enabledProxyGroups: ["auto", "load-balance"],
      hiddenProxyGroups: ["load-balance"],
      customProxyGroups: [
        { id: "custom-1", name: " Custom " },
        { id: "", name: "Missing" },
        { id: "custom-2", name: " " },
      ],
      proxyGroupNameOverrides: { auto: "Auto Override" },
    } as any);

    expect(targets).toEqual([
      { kind: "module", id: "auto", name: "⚡ Auto Override" },
      { kind: "custom", id: "custom-1", name: "Custom" },
    ]);
  });
});
