import { describe, expect, it } from "vitest";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { isModuleRuleMovedFrom } from "@subboost/core/generator/module-rules";
import { buildTargetRuleView } from "./proxy-group-rule-projection";

describe("rule projection", () => {
  it("does not project a custom destination into a built-in group with the same id", () => {
    const view = buildTargetRuleView({ modules: PROXY_GROUP_MODULES, enabledModules: ["cn"],
      customProxyGroups: [{ id: "cn", name: "Regional", emoji: "", groupType: "select" }], customRuleSets: [],
      builtinRuleEdits: { "module:microsoft:onedrive": { target: { kind: "custom", id: "cn" } } },
      proxyGroupNameOverrides: {}, cnIpNoResolve: false, literalTargetNames: ["Regional"] });
    expect(view.ruleSetsByTarget.cn || []).not.toContainEqual(expect.objectContaining({ id: "onedrive" }));
    expect(view.ruleSetsByTarget["custom:cn"]).toContainEqual(expect.objectContaining({ id: "onedrive" }));
    expect(view.hiddenPresetRuleIds.microsoft).toContain("onedrive");
  });

  it("marks a direct-target preset as moved in its original group", () => {
    const view = buildTargetRuleView({ modules: PROXY_GROUP_MODULES, enabledModules: [], customProxyGroups: [], customRuleSets: [],
      builtinRuleEdits: { "module:microsoft:onedrive": { target: "DIRECT" } }, proxyGroupNameOverrides: {},
      cnIpNoResolve: false, literalTargetNames: ["DIRECT"] });
    expect(isModuleRuleMovedFrom("microsoft", "onedrive", view.ruleSetsByTarget)).toBe(true);
  });
});
