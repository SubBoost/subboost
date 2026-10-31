import { describe, expect, it, vi } from "vitest";
import { initialState } from "../definitions";
import type { SetAndGenerateConfig, StoreState } from "../store-types";
import { createCustomActions } from "./custom-actions";
import { createProxyGroupActions } from "./proxy-group-actions";
import { findBuiltinRuleEditKeyByTarget, ruleTargetMatchesContainer } from "./proxy-group-rule-set-helpers";

function harness(overrides: Partial<StoreState>) {
  let state = { ...structuredClone(initialState), ...overrides } as StoreState;
  const update: SetAndGenerateConfig = (updater) => { state = { ...state, ...updater(state) }; };
  return {
    actions: { ...createCustomActions(vi.fn(), () => state, update), ...createProxyGroupActions(vi.fn(), () => state, update) },
    getState: () => state,
  };
}
const media = { id: "media", name: "Media", emoji: "", groupType: "select" as const };
const ruleSet = { id: "bilibili", name: "Bilibili", behavior: "domain" as const, path: "geosite/bilibili.mrs", target: "module:cn" };

describe("editing rule-set string references", () => {
  it("preserves legacy literal matching when no state context is supplied", () => {
    const target = { kind: "custom", id: "literal" } as const;
    expect(ruleTargetMatchesContainer("custom:regional", target, "custom:regional")).toBe(true);
    expect(findBuiltinRuleEditKeyByTarget({ "module:cn:cn-ip": { target: "custom:regional" } },
      target, "custom:regional", "cn-ip")).toBe("module:cn:cn-ip");
  });
  it("updates, moves and removes a rule set imported with a module string reference", () => {
    const { actions, getState } = harness({ customProxyGroups: [media], customRuleSets: [ruleSet] });
    actions.updateModuleRule("cn", "bilibili", { name: "Updated" });
    expect(getState().customRuleSets[0]).toMatchObject({ name: "Updated", target: "module:cn" });
    actions.moveModuleRule("cn", "bilibili", { kind: "custom", id: "media" });
    expect(getState().customRuleSets[0].target).toEqual({ kind: "custom", id: "media" });
    actions.removeModuleRule("media", "bilibili");
    expect(getState().customRuleSets).toEqual([]);
  });

  it("cleans string-reference rules when their custom group is deleted", () => {
    const { actions, getState } = harness({ customProxyGroups: [media],
      customRules: [{ id: "plain", type: "DOMAIN", value: "local.subboost.test", target: "custom:media" }],
      customRuleSets: [{ ...ruleSet, target: "custom:media" }],
      builtinRuleEdits: { "module:cn:cn-ip": { target: "custom:media" } },
    });
    actions.removeCustomProxyGroup("media");
    expect(getState().customRules).toEqual([]);
    expect(getState().customRuleSets).toEqual([]);
    expect(getState().builtinRuleEdits).toEqual({});
  });

  it("preserves a colliding literal name when the referenced ID is deleted", () => {
    const { actions, getState } = harness({ customProxyGroups: [media, { ...media, id: "literal", name: "custom:media" }],
      customRuleSets: [{ ...ruleSet, target: "custom:media" }],
    });
    actions.removeCustomProxyGroup("media");
    expect(getState().customRuleSets).toHaveLength(1);
    actions.removeCustomProxyGroup("literal");
    expect(getState().customRuleSets).toEqual([]);
  });
});
