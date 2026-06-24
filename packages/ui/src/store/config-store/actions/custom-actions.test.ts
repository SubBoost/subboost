import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomRule } from "@subboost/core/types/config";
import { initialState } from "../definitions";
import { createCustomActions } from "./custom-actions";

function createHarness(overrides: Record<string, unknown> = {}) {
  let state = {
    ...structuredClone(initialState),
    ...overrides,
  } as any;

  const applyPatch = (patch: any) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const setAndGenerateConfig = (updater: any) => {
    applyPatch(updater(state));
  };

  const actions = createCustomActions(vi.fn(), () => state, setAndGenerateConfig);
  return { actions, getState: () => state };
}

function rule(overrides: Partial<CustomRule> = {}): CustomRule {
  return {
    id: "",
    type: "DOMAIN-SUFFIX",
    value: "example.com",
    target: "DIRECT",
    ...overrides,
  } as CustomRule;
}

describe("custom config-store actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("adds, updates, removes, and orders custom rules", () => {
    const { actions, getState } = createHarness();

    actions.addCustomRule(rule({ value: "one.example" }));
    expect(getState().customRules).toHaveLength(1);
    expect(getState().customRules[0]).toEqual(expect.objectContaining({ value: "one.example", target: "DIRECT" }));
    expect(getState().customRules[0].id).toBeTruthy();

    const firstId = getState().customRules[0].id;
    actions.addCustomRules([rule({ id: "provided", value: "two.example" }), rule({ value: "three.example" })]);
    expect(getState().customRules.map((item: CustomRule) => item.value)).toEqual([
      "one.example",
      "two.example",
      "three.example",
    ]);
    expect(getState().customRules[1].id).toBe("provided");

    actions.updateCustomRule(firstId, { target: "Proxy" });
    expect(getState().customRules[0].target).toBe("Proxy");

    actions.setRuleOrder(["custom-rule:provided"]);
    expect(getState().ruleOrder).toContain("custom-rule:provided");

    actions.removeCustomRule(1);
    expect(getState().customRules.map((item: CustomRule) => item.value)).toEqual(["one.example", "three.example"]);
  });

  it("ignores empty bulk rule additions", () => {
    const { actions, getState } = createHarness({ customRules: [rule({ id: "existing" })] });
    const before = getState();

    actions.addCustomRules([]);

    expect(getState()).toBe(before);
  });

  it("adds, removes, and renames custom proxy groups while updating matching rules", () => {
    const { actions, getState } = createHarness({
      customRules: [rule({ id: "r1", target: "Old Group" }), rule({ id: "r2", target: "DIRECT" })],
      customRuleSets: [{ id: "cg-rule-1", name: "CG Rule", behavior: "domain", path: "geosite/example.mrs", target: "Old Group" }],
      builtinRuleEdits: { "module:ai:openai": { target: "Old Group" } },
    });

    actions.addCustomProxyGroup({ name: "Old Group", emoji: "🧩", groupType: "select" });
    const groupId = getState().customProxyGroups[0].id;
    expect(groupId).toBe("custom-group-1767225600000");
    expect(getState().customProxyGroups[0]).toEqual(
      expect.objectContaining({ includeInGroupMembers: false })
    );

    actions.updateCustomProxyGroup(groupId, {
      name: "New Group",
    });
    expect(getState().customProxyGroups[0]).toEqual(
      expect.objectContaining({
        name: "New Group",
      })
    );
    expect(getState().customRules[0].target).toBe("New Group");
    expect(getState().customRules[1].target).toBe("DIRECT");
    expect(getState().customRuleSets[0].target).toBe("New Group");
    expect(getState().builtinRuleEdits["module:ai:openai"].target).toBe("New Group");

    actions.removeCustomProxyGroup(groupId);
    expect(getState().customProxyGroups).toEqual([]);
    expect(getState().customRuleSets).toEqual([]);
  });

  it("normalizes advanced custom proxy group fields and keeps blank-name removals narrow", () => {
    const { actions, getState } = createHarness({
      customProxyGroups: [
        { id: "blank", name: " ", emoji: "", groupType: "select" },
      ],
      customRuleSets: [
        { id: "keep", name: "Keep", behavior: "domain", path: "geosite/keep.mrs", target: "Keep" },
      ],
    });

    actions.addCustomProxyGroup({
      name: "Load Balance",
      emoji: "LB",
      enabled: false,
      description: "  Fast nodes  ",
      memberSource: "filtered-nodes",
      includeInGroupMembers: false,
      groupType: "load-balance",
      strategy: "round-robin",
      advanced: {
        includeRegex: "HK",
        sourceIds: ["s1", "s1", ""],
      },
    });

    const groupId = getState().customProxyGroups[1].id;
    expect(getState().customProxyGroups[1]).toEqual(
      expect.objectContaining({
        advanced: expect.objectContaining({ includeRegex: "HK", sourceIds: ["s1"] }),
        description: "Fast nodes",
        enabled: false,
        includeInGroupMembers: false,
        memberSource: "filtered-nodes",
        strategy: "round-robin",
      })
    );

    actions.updateCustomProxyGroup(groupId, {
      enabled: true,
      description: "  Updated  ",
      advanced: { excludeRegex: "US" },
    });
    expect(getState().customProxyGroups[1]).toEqual(
      expect.objectContaining({
        advanced: expect.objectContaining({ excludeRegex: "US" }),
        description: "Updated",
        enabled: true,
      })
    );

    actions.removeCustomProxyGroup("blank");
    expect(getState().customProxyGroups.map((group: { id: string }) => group.id)).toEqual([groupId]);
    expect(getState().customRuleSets).toEqual([
      { id: "keep", name: "Keep", behavior: "domain", path: "geosite/keep.mrs", target: "Keep" },
    ]);
  });

  it("keeps custom rule targets unchanged when group updates do not rename a group", () => {
    const { actions, getState } = createHarness({
      customRules: [rule({ id: "r1", target: "Stable Group" })],
      customProxyGroups: [
        { id: "group-1", name: "Stable Group", emoji: "", groupType: "select" },
      ],
    });

    actions.updateCustomProxyGroup("missing", { name: "Ghost Group" });
    expect(getState().customProxyGroups).toEqual([
      { id: "group-1", name: "Stable Group", emoji: "", groupType: "select" },
    ]);
    expect(getState().customRules[0].target).toBe("Stable Group");

    actions.updateCustomProxyGroup("group-1", { emoji: "S" });
    expect(getState().customProxyGroups[0]).toEqual(
      expect.objectContaining({ name: "Stable Group", emoji: "S" })
    );
    expect(getState().customRules[0].target).toBe("Stable Group");
  });
});
