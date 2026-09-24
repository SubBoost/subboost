import { describe, expect, it } from "vitest";
import { buildGeneratedRuleEntries } from "@subboost/core/generator/rules";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { createProxyGroupActions } from "@subboost/ui/store/config-store/actions/proxy-group-actions";
import { createCustomActions } from "@subboost/ui/store/config-store/actions/custom-actions";
import type { SetAndGenerateConfig, StoreState } from "@subboost/ui/store/config-store/store-types";

describe("builtin rule move lifecycle", () => {
  it("keeps one rule through custom and builtin targets, rename, removal and recovery", () => {
    let state = {
      ...structuredClone(initialState),
      enabledProxyGroups: ["select", "ai", "cn"],
      customProxyGroups: [
        { id: "first", name: "First", emoji: "", groupType: "select" },
        { id: "second", name: "Second", emoji: "", groupType: "select" },
      ],
    } as StoreState;
    const update: SetAndGenerateConfig = (updater) => {
      state = { ...state, ...updater(state) };
    };
    const actions = createProxyGroupActions(() => undefined, () => state, update);
    const custom = createCustomActions(() => undefined, () => state, update);
    const rule = (expectedCount = 1) => {
      const matches = buildGeneratedRuleEntries({ ...state, enabledModules: state.enabledProxyGroups })
        .filter((entry) => entry.key === "module:ai:openai");
      expect(matches).toHaveLength(expectedCount);
      return matches[0];
    };
    const originalTarget = rule().target;

    actions.moveModuleRule("ai", "openai", { kind: "custom", id: "first" });
    expect(rule()).toMatchObject({ target: "First", enabled: true });
    custom.updateCustomProxyGroup("first", { name: "Renamed" });
    expect(rule().target).toBe("Renamed");
    actions.moveModuleRule("first", "openai", { kind: "custom", id: "second" });
    expect(rule().target).toBe("Second");
    actions.moveModuleRule("second", "openai", { kind: "module", id: "cn" });
    expect(rule().target).not.toBe("Second");
    actions.removeModuleRule("cn", "openai");
    expect(rule(0)).toBeUndefined();
    actions.restoreModuleRule("ai", "openai");
    expect(rule().enabled).toBe(true);
    actions.resetModuleRuleTarget("ai", "openai");
    expect(rule()).toMatchObject({ target: originalTarget, enabled: true });

    actions.moveModuleRule("ai", "openai", { kind: "custom", id: "first" });
    actions.moveModuleRule("first", "openai", { kind: "module", id: "ai" });
    expect(rule()).toMatchObject({ target: originalTarget, enabled: true });
    expect(state.customRuleSets).toEqual([]);
  });
});
