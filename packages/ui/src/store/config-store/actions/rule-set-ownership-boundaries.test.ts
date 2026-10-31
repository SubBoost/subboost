import { describe, expect, it, vi } from "vitest";
import { initialState } from "../definitions";
import type { SetAndGenerateConfig, StoreState } from "../store-types";
import { createProxyGroupActions } from "./proxy-group-actions";

const regional = { id: "cn", name: "Regional", emoji: "", groupType: "select" as const };
const customTarget = { kind: "custom" as const, id: "cn" };
const ownDraft = { id: "own", name: "Own", behavior: "domain" as const, path: "geosite/own.mrs" };

function harness(overrides: Partial<StoreState> = {}) {
  let state = { ...structuredClone(initialState), enabledProxyGroups: ["select"], customProxyGroups: [regional], ...overrides } as StoreState;
  const update: SetAndGenerateConfig = (updater) => { state = { ...state, ...updater(state) }; };
  return { actions: createProxyGroupActions(vi.fn(), () => state, update), getState: () => state };
}

describe("rule-set ownership boundaries", () => {
  it("rejects missing structured containers and preserves a colliding custom container", () => {
    const { actions, getState } = harness();
    actions.addModuleRules({ kind: "custom", id: "missing" }, [ownDraft]);
    actions.addModuleRules({ kind: "module", id: "missing" }, [ownDraft]);
    expect(getState().customRuleSets).toEqual([]);
    actions.addModuleRules(customTarget, [ownDraft]);
    expect(getState().customRuleSets).toEqual([expect.objectContaining({ id: "own", target: customTarget })]);
    actions.removeModuleRule({ kind: "module", id: "missing" }, "own");
    actions.updateModuleRule({ kind: "custom", id: "missing" }, "own", { name: "Wrong" });
    expect(getState().customRuleSets[0].name).toBe("Own");
    actions.removeModuleRule({ kind: "module", id: "cn" }, "own");
    expect(getState().customRuleSets).toHaveLength(1);
    actions.removeModuleRule(customTarget, "own");
    expect(getState().customRuleSets).toEqual([]);
  });

  it("applies edits and deletion to the exact saved raw identity", () => {
    const structured = { kind: "module" as const, id: "cn" };
    const { actions, getState } = harness({ customRuleSets: [
      { ...ownDraft, target: "module:cn" }, { ...ownDraft, target: structured },
    ] });
    actions.updateModuleRule("module:cn", "own", { name: "Structured" }, structured);
    expect(getState().customRuleSets.map((rule) => rule.name)).toEqual(["Own", "Structured"]);
    actions.removeModuleRule("module:cn", "own", "other");
    expect(getState().customRuleSets).toHaveLength(2);
    actions.moveModuleRule("module:cn", "own", customTarget, "other");
    expect(getState().customRuleSets.map((rule) => rule.target)).toEqual(["module:cn", structured]);
    actions.removeModuleRule("module:cn", "own", "module:cn");
    expect(getState().customRuleSets).toEqual([expect.objectContaining({ name: "Structured", target: structured })]);
    actions.moveModuleRule("module:cn", "own", customTarget, structured);
    expect(getState().customRuleSets[0].target).toEqual(customTarget);
  });

  it("protects an active preset when a different custom provider has the same ID", () => {
    const customOneDrive = { id: "onedrive", name: "Own OneDrive", behavior: "domain" as const,
      path: "geosite/own-onedrive.mrs", target: customTarget };
    const { actions, getState } = harness({ enabledProxyGroups: ["select", "microsoft"], customRuleSets: [customOneDrive] });
    actions.moveModuleRule(customTarget, "onedrive", { kind: "module", id: "microsoft" });
    expect(getState().customRuleSets).toEqual([customOneDrive]);
    expect(getState().builtinRuleEdits).toEqual({});
    actions.removeModuleRule("microsoft", "onedrive");
    actions.moveModuleRule(customTarget, "onedrive", { kind: "module", id: "microsoft" });
    expect(getState().customRuleSets).toEqual([
      expect.objectContaining({ id: "onedrive", path: "geosite/own-onedrive.mrs", target: { kind: "module", id: "microsoft" } }),
    ]);
    expect(getState().builtinRuleEdits["module:microsoft:onedrive"]).toEqual({ enabled: false });
  });

  it("keeps a different custom provider when moving it into a previously disabled preset group", () => {
    const { actions, getState } = harness({ customRuleSets: [{
      id: "onedrive", name: "Own", behavior: "domain", path: "geosite/own-onedrive.mrs", target: customTarget,
    }] });
    actions.moveModuleRule(customTarget, "onedrive", { kind: "module", id: "microsoft" });
    expect(getState().enabledProxyGroups).toContain("microsoft");
    expect(getState().builtinRuleEdits["module:microsoft:onedrive"]).toEqual({ enabled: false });
    expect(getState().customRuleSets[0]).toMatchObject({ path: "geosite/own-onedrive.mrs", target: { kind: "module", id: "microsoft" } });
  });

  it("deduplicates a batch by ID and keeps the first valid metadata", () => {
    const { actions, getState } = harness();
    actions.addModuleRules(customTarget, [
      ownDraft,
      { ...ownDraft, path: "geosite/different.mrs" },
      { id: "bad-format", name: "Bad", behavior: "classical", format: "mrs", path: "geosite/bad.mrs" },
      { id: "text", name: "Text", behavior: "domain", format: "text", path: "https://local.subboost.test/rules/geosite/text.txt" },
    ]);
    expect(getState().customRuleSets).toEqual([
      expect.objectContaining({ id: "own", path: "geosite/own.mrs", target: customTarget }),
      expect.objectContaining({ id: "text", format: "text", target: customTarget }),
    ]);
  });

  it.each([
    [true, undefined, true],
    [true, "mrs", true],
    [false, "mrs", false],
    [true, "text", false],
  ] as const)("reuses a CN preset only when no-resolve and format match (%s, %s)", (cnIpNoResolve, format, samePreset) => {
    const { actions, getState } = harness({ cnIpNoResolve });
    actions.addModuleRules(customTarget, [{
      id: "cn-ip", name: "CN IP", behavior: "ipcidr", path: "geoip/cn.mrs", format, noResolve: true,
    }]);
    const edit = getState().builtinRuleEdits["module:cn:cn-ip"];
    if (samePreset) {
      expect(edit).toEqual({ target: customTarget });
      expect(getState().customRuleSets).toEqual([]);
    } else {
      expect(edit).toEqual({ enabled: false });
      expect(getState().customRuleSets).toEqual([expect.objectContaining({ id: "cn-ip", format, target: customTarget })]);
    }
  });
});
