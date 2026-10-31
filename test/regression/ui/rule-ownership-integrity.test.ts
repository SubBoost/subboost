import { describe, expect, it } from "vitest";
import { buildGeneratedRuleEntries } from "@subboost/core/generator/rules";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { createProxyGroupActions } from "@subboost/ui/store/config-store/actions/proxy-group-actions";
import { createCustomActions } from "@subboost/ui/store/config-store/actions/custom-actions";
import { createTemplateActions } from "@subboost/ui/store/config-store/actions/template-actions";
import type { SetAndGenerateConfig, StoreState } from "@subboost/ui/store/config-store/store-types";

function harness(overrides: Partial<StoreState> = {}) {
  let state = { ...structuredClone(initialState), ...overrides } as StoreState;
  const update: SetAndGenerateConfig = (updater) => { state = { ...state, ...updater(state) }; };
  return {
    state: () => state,
    groups: createProxyGroupActions(() => undefined, () => state, update),
    custom: createCustomActions(() => undefined, () => state, update),
    templates: createTemplateActions(() => undefined, () => state, update),
  };
}

describe("moved rule integrity", () => {
  it("reuses a hidden preset's identity when adding it elsewhere and later restoring its source", () => {
    const h = harness({ enabledProxyGroups: ["select"], hiddenProxyGroups: ["microsoft"],
      customProxyGroups: [{ id: "regional", name: "Regional", emoji: "", groupType: "select" }] });
    h.groups.addModuleRules("regional", [{ id: "onedrive", name: "OneDrive", behavior: "domain", path: "geosite/onedrive.mrs" }]);
    expect(h.state().customRuleSets).toEqual([]);
    expect(h.state().builtinRuleEdits["module:microsoft:onedrive"]).toEqual({ target: { kind: "custom", id: "regional" } });
    h.groups.restoreHiddenProxyGroup("microsoft");
    const entries = buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups });
    expect(entries.filter((entry) => entry.text.startsWith("RULE-SET,onedrive,"))).toHaveLength(1);
    expect(entries.find((entry) => entry.key === "module:microsoft:onedrive")?.target).toBe("Regional");
  });
  it("does not add a second rule set for a moved preset, even after its source is hidden", () => {
    const h = harness({ enabledProxyGroups: ["select", "microsoft", "cn"],
      customProxyGroups: [{ id: "regional", name: "Regional", emoji: "", groupType: "select" }] });
    h.groups.moveModuleRule("microsoft", "onedrive", { kind: "module", id: "cn" });
    h.groups.hideProxyGroup("microsoft");
    const draft = { id: "onedrive", name: "OneDrive", behavior: "domain" as const, path: "geosite/onedrive.mrs" };
    h.groups.addModuleRules("regional", [draft]);
    h.groups.addModuleRules("cn", [draft]);
    expect(h.state().customRuleSets).toEqual([]);
    const entries = buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups });
    expect(entries.filter((entry) => entry.text.startsWith("RULE-SET,onedrive,"))).toHaveLength(1);
  });

  it("keeps an inactive custom rule's position when visible rules are reordered", () => {
    const h = harness({ enabledProxyGroups: ["select"],
      customProxyGroups: [{ id: "regional", name: "Regional", emoji: "", groupType: "select" }],
      customRules: [
        { id: "hidden", type: "DOMAIN", value: "hidden.local.subboost.test", target: { kind: "custom", id: "regional" } },
        { id: "first", type: "DOMAIN", value: "first.local.subboost.test", target: "DIRECT" },
        { id: "second", type: "DOMAIN", value: "second.local.subboost.test", target: "DIRECT" },
      ],
      ruleOrder: ["custom-rule:hidden", "custom-rule:first", "custom-rule:second"] });
    h.custom.updateCustomProxyGroup("regional", { enabled: false });
    h.custom.setRuleOrder(["custom-rule:second", "custom-rule:first"]);
    expect(h.state().ruleOrder).toEqual(["custom-rule:hidden", "custom-rule:second", "custom-rule:first"]);
    h.custom.updateCustomProxyGroup("regional", { enabled: true });
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .map((entry) => entry.key).slice(0, 3)).toEqual(h.state().ruleOrder);
  });

  it("keeps moved preset anchors when visible full-order entries are rearranged", () => {
    const h = harness({ enabledProxyGroups: ["select", "microsoft", "cn", "global", "ad"], experimentalCnUseCnRuleSet: false });
    h.groups.moveModuleRule("microsoft", "onedrive", { kind: "module", id: "cn" });
    const original = buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .filter((entry) => entry.key !== "special:match").map((entry) => entry.key);
    h.custom.setRuleOrder(original);
    const originalIndex = original.indexOf("module:microsoft:onedrive");
    h.templates.toggleProxyGroup("cn");
    const visible = buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .filter((entry) => entry.key !== "special:match").map((entry) => entry.key).reverse();
    h.custom.setRuleOrder(visible);
    expect(h.state().ruleOrder.indexOf("module:microsoft:onedrive")).toBe(originalIndex);
    h.templates.toggleProxyGroup("cn");
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .findIndex((entry) => entry.key === "module:microsoft:onedrive")).toBe(originalIndex);
  });
});
