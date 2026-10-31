import { describe, expect, it } from "vitest";
import { buildGeneratedRuleEntries } from "@subboost/core/generator/rules";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { createProxyGroupActions } from "@subboost/ui/store/config-store/actions/proxy-group-actions";
import { createCustomActions } from "@subboost/ui/store/config-store/actions/custom-actions";
import { createTemplateActions } from "@subboost/ui/store/config-store/actions/template-actions";
import { computeGeneratedYaml } from "@subboost/ui/store/config-store/generated-yaml";
import { load } from "js-yaml";
import type { SetAndGenerateConfig, StoreState } from "@subboost/ui/store/config-store/store-types";

describe("builtin rule move lifecycle", () => {
  it("keeps preview rules and providers in step with destination toggles and restoration", () => {
    let state = {
      ...structuredClone(initialState),
      nodes: [{ name: "Test", type: "ss", server: "local.subboost.test", port: 8388, cipher: "aes-128-gcm", password: "test" }],
      enabledProxyGroups: ["select", "microsoft", "cn"],
    } as StoreState;
    const update: SetAndGenerateConfig = (updater) => { state = { ...state, ...updater(state) }; };
    const actions = createProxyGroupActions(() => undefined, () => state, update);
    const templates = createTemplateActions(() => undefined, () => state, update);
    const assertRules = (active: boolean) => {
      const config = load(computeGeneratedYaml(state)) as { rules: string[]; "rule-providers": Record<string, unknown> | null };
      for (const id of ["microsoft", "onedrive"]) {
        const matches = config.rules.filter((rule) => rule.startsWith(`RULE-SET,${id},`));
        expect(matches).toHaveLength(active ? 1 : 0);
        if (active) expect(matches[0]).toContain("国内服务");
        expect(Boolean(config["rule-providers"]?.[id])).toBe(active);
      }
    };

    actions.moveModuleRule("microsoft", "microsoft", { kind: "module", id: "cn" });
    actions.moveModuleRule("microsoft", "onedrive", { kind: "module", id: "cn" });
    templates.toggleProxyGroup("microsoft");
    assertRules(true);
    templates.toggleProxyGroup("cn");
    assertRules(false);
    templates.toggleProxyGroup("cn");
    assertRules(true);
    actions.removeModuleRule("cn", "onedrive");
    const deleted = load(computeGeneratedYaml(state)) as { rules: string[]; "rule-providers": Record<string, unknown> };
    expect(deleted.rules.some((rule) => rule.startsWith("RULE-SET,onedrive,"))).toBe(false);
    expect(deleted["rule-providers"]).not.toHaveProperty("onedrive");
    actions.restoreModuleRule("microsoft", "onedrive");
    assertRules(true);
  });

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
    const templates = createTemplateActions(() => undefined, () => state, update);
    const rule = (expectedCount = 1) => {
      const matches = buildGeneratedRuleEntries({ ...state, enabledModules: state.enabledProxyGroups })
        .filter((entry) => entry.key === "module:ai:openai");
      expect(matches).toHaveLength(expectedCount);
      return matches[0];
    };
    const originalTarget = rule().target;

    actions.moveModuleRule("ai", "openai", { kind: "custom", id: "first" });
    expect(rule()).toMatchObject({ target: "First", enabled: true });
    templates.toggleProxyGroup("ai");
    expect(rule().target).toBe("First");
    custom.updateCustomProxyGroup("first", { enabled: false });
    expect(rule(0)).toBeUndefined();
    custom.updateCustomProxyGroup("first", { name: "Renamed" });
    custom.updateCustomProxyGroup("first", { enabled: true });
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
    expect(rule(0)).toBeUndefined();
    templates.toggleProxyGroup("ai");
    expect(rule()).toMatchObject({ target: originalTarget, enabled: true });

    actions.moveModuleRule("ai", "openai", { kind: "custom", id: "first" });
    actions.moveModuleRule("first", "openai", { kind: "module", id: "ai" });
    expect(rule()).toMatchObject({ target: originalTarget, enabled: true });
    expect(state.customRuleSets).toEqual([]);
  });
});
