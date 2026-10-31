import { describe, expect, it } from "vitest";
import { buildGeneratedRuleEntries } from "@subboost/core/generator/rules";
import { resolveModuleName } from "@subboost/core/generator/rules";
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

  it("keeps full-order anchors when every visible preset is paused", () => {
    const h = harness({ enabledProxyGroups: ["select"],
      builtinRuleEdits: { "module:microsoft:onedrive": { target: { kind: "module", id: "cn" } } },
      customRules: [
        { id: "a", type: "DOMAIN", value: "a.local.subboost.test", target: "DIRECT" },
        { id: "b", type: "DOMAIN", value: "b.local.subboost.test", target: "DIRECT" },
      ],
      ruleOrder: ["custom-rule:a", "module:microsoft:onedrive", "custom-rule:b"] });
    h.custom.setRuleOrder(["custom-rule:b", "custom-rule:a"]);
    expect(h.state().ruleOrder).toEqual(["custom-rule:b", "module:microsoft:onedrive", "custom-rule:a"]);
    h.templates.toggleProxyGroup("cn");
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .map((entry) => entry.key).slice(0, 3)).toEqual(h.state().ruleOrder);
    h.custom.setRuleOrder(["custom-rule:a", "custom-rule:b"], false);
    expect(h.state().ruleOrder).toEqual(["custom-rule:a", "custom-rule:b"]);
  });

  it("reuses a deleted preset when adding the same rule to another group", () => {
    const h = harness({ enabledProxyGroups: ["select", "microsoft", "cn"] });
    h.groups.removeModuleRule("microsoft", "onedrive");
    h.groups.addModuleRules("cn", [{ id: "onedrive", name: "OneDrive", behavior: "domain", path: "geosite/onedrive.mrs" }]);
    expect(h.state().customRuleSets).toEqual([]);
    expect(h.state().builtinRuleEdits["module:microsoft:onedrive"]).toEqual({ target: { kind: "module", id: "cn" } });
    h.groups.restoreModuleRule("microsoft", "onedrive");
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .filter((entry) => entry.text.startsWith("RULE-SET,onedrive,"))).toHaveLength(1);
  });

  it("preserves different custom metadata and prevents a conflicting preset restore", () => {
    const h = harness({ enabledProxyGroups: ["select"],
      customProxyGroups: [{ id: "regional", name: "Regional", emoji: "", groupType: "select" }] });
    h.groups.addModuleRules("regional", [{ id: "telegram", name: "Own IP", behavior: "ipcidr", path: "geoip/telegram.mrs" }]);
    expect(h.state().customRuleSets).toContainEqual(expect.objectContaining({ id: "telegram", behavior: "ipcidr", path: "geoip/telegram.mrs" }));
    expect(h.state().builtinRuleEdits["module:telegram:telegram"]).toEqual({ enabled: false });
    h.groups.restoreModuleRule("telegram", "telegram");
    h.groups.restoreModuleDefaultRules("telegram");
    h.templates.toggleProxyGroup("telegram");
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .filter((entry) => entry.text.startsWith("RULE-SET,telegram,"))).toHaveLength(1);
    expect(h.state().builtinRuleEdits["module:telegram:telegram"]).toEqual({ enabled: false });
    h.groups.moveModuleRule("regional", "telegram", { kind: "module", id: "telegram" });
    expect(h.state().customRuleSets).toContainEqual(expect.objectContaining({ id: "telegram", behavior: "ipcidr",
      path: "geoip/telegram.mrs", target: { kind: "module", id: "telegram" } }));
    expect(h.state().builtinRuleEdits["module:telegram:telegram"]).toEqual({ enabled: false });
  });

  it("moves between distinct structured groups even when their names coincide", () => {
    const name = resolveModuleName("cn");
    const h = harness({ enabledProxyGroups: ["select"],
      customProxyGroups: [{ id: "regional", name, emoji: "", groupType: "select" }],
      customRuleSets: [{ id: "custom-set", name: "Custom", behavior: "domain", path: "geosite/custom.mrs", target: { kind: "custom", id: "regional" } }] });
    h.groups.moveModuleRule("regional", "custom-set", { kind: "module", id: "cn" });
    expect(h.state().customRuleSets[0].target).toEqual({ kind: "module", id: "cn" });
    expect(h.state().enabledProxyGroups).toContain("cn");
  });

  it("edits and deletes a literal node target without rewriting or removing its namesake preset", () => {
    const name = resolveModuleName("cn");
    const h = harness({ enabledProxyGroups: ["select"],
      customRuleSets: [{ id: "cn-ip", name: "Custom IP", behavior: "ipcidr", path: "geoip/custom.mrs", target: name }] });
    h.groups.updateModuleRule("cn", "cn-ip", { noResolve: true }, name);
    expect(h.state().customRuleSets[0].target).toBe(name);
    h.groups.removeModuleRule("cn", "cn-ip", name);
    expect(h.state().customRuleSets).toEqual([]);
    expect(h.state().builtinRuleEdits).toEqual({});
  });

  it("moves a literal policy target to an explicitly selected group", () => {
    const h = harness({ enabledProxyGroups: ["select"],
      customRuleSets: [{ id: "literal-set", name: "Literal", behavior: "domain", path: "geosite/literal.mrs", target: "DIRECT" }] });
    h.groups.moveModuleRule("DIRECT", "literal-set", { kind: "module", id: "cn" }, "DIRECT");
    expect(h.state().customRuleSets[0].target).toEqual({ kind: "module", id: "cn" });
    expect(h.state().enabledProxyGroups).toContain("cn");
  });

  it("preserves changed custom metadata when an edited rule moves to its preset's group", () => {
    const h = harness({ enabledProxyGroups: ["select"],
      builtinRuleEdits: { "module:microsoft:onedrive": { enabled: false } },
      customRuleSets: [{ id: "onedrive", name: "OneDrive", behavior: "domain", path: "geosite/onedrive.mrs", target: "DIRECT" }] });
    h.groups.updateModuleRule("DIRECT", "onedrive", { noResolve: true }, "DIRECT");
    h.groups.moveModuleRule("DIRECT", "onedrive", { kind: "module", id: "microsoft" }, "DIRECT");
    expect(h.state().customRuleSets).toContainEqual(expect.objectContaining({ id: "onedrive", noResolve: true,
      target: { kind: "module", id: "microsoft" } }));
    expect(h.state().builtinRuleEdits["module:microsoft:onedrive"]).toEqual({ enabled: false });
  });

  it("clears no-resolve while retaining a literal node target", () => {
    const name = resolveModuleName("cn");
    const h = harness({ enabledProxyGroups: ["select"], customRuleSets: [
      { id: "custom", name: "Custom", behavior: "domain", path: "geosite/custom.mrs", target: name, noResolve: true },
    ] });
    h.groups.updateModuleRule(name, "custom", { noResolve: false }, name);
    expect(h.state().customRuleSets[0]).toEqual(expect.objectContaining({ target: name }));
    expect(h.state().customRuleSets[0].noResolve).toBeUndefined();
  });

  it("keeps the custom group identity for add, edit, move and delete when ids collide", () => {
    const custom = { kind: "custom" as const, id: "cn" };
    const h = harness({ enabledProxyGroups: ["select"],
      customProxyGroups: [{ id: "cn", name: "Regional", emoji: "", groupType: "select" }] });
    h.groups.addModuleRules(custom, [{ id: "own-set", name: "Own Set", behavior: "domain", path: "geosite/own-set.mrs" }]);
    expect(h.state().customRuleSets[0].target).toEqual(custom);
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .find((entry) => entry.key === "custom-rule-set:own-set")?.target).toBe("Regional");
    h.groups.updateModuleRule(custom, "own-set", { noResolve: true });
    expect(h.state().customRuleSets[0].noResolve).toBe(true);
    h.groups.moveModuleRule(custom, "own-set", { kind: "module", id: "ai" });
    expect(h.state().customRuleSets[0].target).toEqual({ kind: "module", id: "ai" });
    h.groups.moveModuleRule("ai", "own-set", custom);
    expect(h.state().customRuleSets[0].target).toEqual(custom);
    h.groups.removeModuleRule(custom, "own-set");
    expect(h.state().customRuleSets).toEqual([]);
  });

  it("moves and deletes a preset from a custom group sharing a built-in id", () => {
    const custom = { kind: "custom" as const, id: "cn" };
    const h = harness({ enabledProxyGroups: ["select", "microsoft"],
      customProxyGroups: [{ id: "cn", name: "Regional", emoji: "", groupType: "select" }] });
    h.groups.moveModuleRule("microsoft", "onedrive", custom);
    h.templates.toggleProxyGroup("microsoft");
    h.groups.moveModuleRule(custom, "onedrive", { kind: "module", id: "ai" });
    expect(h.state().builtinRuleEdits["module:microsoft:onedrive"].target).toEqual({ kind: "module", id: "ai" });
    h.groups.moveModuleRule("ai", "onedrive", custom);
    h.groups.removeModuleRule(custom, "onedrive");
    expect(h.state().builtinRuleEdits["module:microsoft:onedrive"].enabled).toBe(false);
  });

  it("adds a preset to a custom group whose id matches its source module", () => {
    const custom = { kind: "custom" as const, id: "microsoft" };
    const h = harness({ enabledProxyGroups: ["select"],
      customProxyGroups: [{ id: "microsoft", name: "Regional", emoji: "", groupType: "select" }] });
    h.groups.addModuleRules(custom, [{ id: "onedrive", name: "OneDrive", behavior: "domain", path: "geosite/onedrive.mrs" }]);
    expect(h.state().builtinRuleEdits["module:microsoft:onedrive"].target).toEqual(custom);
    expect(buildGeneratedRuleEntries({ ...h.state(), enabledModules: h.state().enabledProxyGroups })
      .find((entry) => entry.key === "module:microsoft:onedrive")?.target).toBe("Regional");
  });
});
