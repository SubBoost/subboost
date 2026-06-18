import { afterEach, describe, expect, it, vi } from "vitest";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { buildGeneratedRuleEntries, resolveAppliedRuleOrder } from "@subboost/core/generator/rules";
import { initialState } from "../definitions";
import { createProxyGroupActions } from "./proxy-group-actions";

type HarnessState = typeof initialState & {
  enabledProxyGroups?: string[];
  hiddenProxyGroups?: string[];
  proxyGroupOrder?: string[];
};

function createHarness(overrides: Partial<HarnessState> = {}) {
  let state: HarnessState = {
    ...structuredClone(initialState),
    ...overrides,
  };

  const applyPatch = (patch?: Partial<HarnessState> | HarnessState) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const setAndGenerateConfig = (updater: (current: HarnessState) => Partial<HarnessState> | void) => {
    applyPatch(updater(state));
  };

  const actions = createProxyGroupActions(() => undefined, () => state, setAndGenerateConfig);
  return { actions, getState: () => state };
}

describe("createProxyGroupActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes proxy group display order", () => {
    const { actions, getState } = createHarness();

    actions.setProxyGroupOrder([
      " module:ai ",
      "",
      "module:ai",
      "filtered:fast",
      // Intentionally force a non-string runtime value to verify invalid input is ignored.
      123 as unknown as string,
    ]);

    expect(getState().proxyGroupOrder).toEqual(["module:ai", "filtered:fast"]);

    actions.setProxyGroupOrder("bad" as never);
    expect(getState().proxyGroupOrder).toEqual([]);
  });

  it("hides and restores builtin proxy groups", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      hiddenProxyGroups: ["youtube"],
    });

    actions.hideProxyGroup(" ai ");
    actions.hideProxyGroup("missing");

    expect(getState().hiddenProxyGroups).toEqual(["youtube", "ai"]);
    expect(getState().enabledProxyGroups).toEqual(["select", "auto"]);

    actions.restoreHiddenProxyGroup("ai");

    expect(getState().hiddenProxyGroups).toEqual(["youtube"]);
    expect(getState().enabledProxyGroups).toEqual(["select", "auto", "ai"]);

    const beforeRestoreNoop = getState();
    actions.restoreHiddenProxyGroup("ai");
    expect(getState()).toBe(beforeRestoreNoop);

    actions.hideProxyGroup("");
    actions.hideProxyGroup("custom");
    actions.restoreHiddenProxyGroup("custom");
    expect(getState().hiddenProxyGroups).toEqual(["youtube"]);
    expect(getState().enabledProxyGroups).toEqual(["select", "auto", "ai"]);
  });

  it("keeps builtin hide and restore no-ops stable when state already matches", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select"],
      hiddenProxyGroups: ["ai"],
    });

    const beforeHide = getState();
    actions.hideProxyGroup(undefined as never);
    actions.hideProxyGroup("ai");
    expect(getState()).toEqual(beforeHide);

    const beforeRestore = getState();
    actions.restoreHiddenProxyGroup(undefined as never);
    actions.restoreHiddenProxyGroup("custom");
    expect(getState()).toBe(beforeRestore);
  });

  it("adds, updates, renames, and removes filtered proxy groups", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const { actions, getState } = createHarness({
      filteredProxyGroups: [
        {
          id: "filtered-1",
          name: "Old Filter",
          enabled: true,
          groupType: "select",
          sourceIds: [],
          regions: [],
          excludedNodeNames: [],
        },
      ],
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "Old Filter" }],
      dialerProxyGroups: [
        {
          id: "dialer-1",
          name: "Relay",
          relayNodes: ["Old Filter", "Node A"],
          targetNodes: ["Node A"],
        },
        {
          id: "dialer-2",
          name: "Broken",
          relayNodes: "bad",
          targetNodes: ["Old Filter"],
        },
      ],
    });

    actions.addFilteredProxyGroup({
      name: "Fast Nodes",
      enabled: true,
      groupType: "load-balance",
      strategy: "bad" as never,
      emoji: "⚡",
      sourceIds: "bad" as never,
      regions: ["us"],
      excludeRegex: "Test",
      excludedNodeNames: [" Node A ", "Node A", "", "Node B"],
    });

    expect(getState().filteredProxyGroups.at(-1)).toMatchObject({
      id: "filtered-group-1700000000000",
      name: "Fast Nodes",
      enabled: true,
      groupType: "load-balance",
      strategy: "consistent-hashing",
      emoji: "⚡",
      sourceIds: [],
      regions: ["us"],
      excludeRegex: "Test",
      excludedNodeNames: ["Node A", "Node B"],
    });

    actions.addFilteredProxyGroup({
      name: "Plain Group",
      enabled: false,
      groupType: "invalid" as never,
      emoji: 123 as never,
      sourceIds: ["source-1"],
      regions: "bad" as never,
      includeRegex: "HK",
      excludeRegex: 42 as never,
      excludedNodeNames: "bad" as never,
    });

    expect(getState().filteredProxyGroups.at(-1)).toMatchObject({
      id: "filtered-group-1700000000000",
      name: "Plain Group",
      enabled: false,
      groupType: "select",
      sourceIds: ["source-1"],
      regions: [],
      includeRegex: "HK",
      excludedNodeNames: [],
    });
    expect(getState().filteredProxyGroups.at(-1)).not.toHaveProperty("strategy");
    expect(getState().filteredProxyGroups.at(-1)).toHaveProperty("emoji", undefined);

    actions.updateFilteredProxyGroup("filtered-1", {
      name: "New Filter",
      groupType: "load-balance",
      strategy: "round-robin",
      excludedNodeNames: ["Node C", "Node C"],
    });

    expect(getState().filteredProxyGroups[0]).toMatchObject({
      id: "filtered-1",
      name: "New Filter",
      groupType: "load-balance",
      strategy: "round-robin",
      excludedNodeNames: ["Node C"],
    });
    expect(getState().customRules[0].target).toBe("New Filter");
    expect(getState().dialerProxyGroups[0].relayNodes).toEqual(["New Filter", "Node A"]);
    expect(getState().dialerProxyGroups[1].relayNodes).toBe("bad");

    actions.updateFilteredProxyGroup("filtered-1", {
      groupType: "direct-first",
      enabled: "bad" as never,
      includeRegex: null as never,
      excludeRegex: null as never,
      sourceIds: "bad" as never,
      regions: "bad" as never,
    });

    expect(getState().filteredProxyGroups[0]).toMatchObject({
      groupType: "direct-first",
      enabled: true,
      includeRegex: undefined,
      excludeRegex: undefined,
      sourceIds: [],
      regions: [],
    });
    expect(getState().filteredProxyGroups[0]).toHaveProperty("strategy", undefined);

    actions.updateFilteredProxyGroup("filtered-1", {
      enabled: false,
      emoji: "N",
      groupType: "select",
      sourceIds: ["source-2"],
      regions: ["jp"],
      includeRegex: "JP",
      excludeRegex: "Relay",
    });

    expect(getState().filteredProxyGroups[0]).toMatchObject({
      enabled: false,
      emoji: "N",
      groupType: "select",
      sourceIds: ["source-2"],
      regions: ["jp"],
      includeRegex: "JP",
      excludeRegex: "Relay",
      strategy: undefined,
    });

    actions.updateFilteredProxyGroup("filtered-1", {
      groupType: "load-balance",
      strategy: undefined,
    });
    expect(getState().filteredProxyGroups[0].strategy).toBe("consistent-hashing");

    const beforeMissingUpdate = getState();
    actions.updateFilteredProxyGroup("", { name: "Ignored" });
    actions.updateFilteredProxyGroup("missing", { name: "Ignored" });
    expect(getState()).toBe(beforeMissingUpdate);

    actions.removeFilteredProxyGroup(" filtered-1 ");
    actions.removeFilteredProxyGroup("");
    expect(getState().filteredProxyGroups.map((group: { id: string }) => group.id)).toEqual([
      "filtered-group-1700000000000",
      "filtered-group-1700000000000",
    ]);
  });

  it("preserves filtered proxy group values when partial updates are invalid or omitted", () => {
    const { actions, getState } = createHarness({
      filteredProxyGroups: [
        {
          id: "filtered-1",
          name: "Stable",
          emoji: "S",
          enabled: false,
          groupType: "load-balance",
          strategy: "round-robin",
          sourceIds: ["source-1"],
          regions: ["hk"],
          includeRegex: "HK",
          excludeRegex: "Test",
          excludedNodeNames: "bad",
        },
      ],
    });

    actions.updateFilteredProxyGroup("filtered-1", {
      enabled: "bad" as never,
      emoji: 123 as never,
      groupType: "load-balance",
      strategy: "bad" as never,
      includeRegex: undefined,
      excludeRegex: undefined,
      sourceIds: undefined,
      regions: undefined,
    });

    expect(getState().filteredProxyGroups[0]).toMatchObject({
      name: "Stable",
      emoji: "S",
      enabled: false,
      groupType: "load-balance",
      strategy: "round-robin",
      sourceIds: ["source-1"],
      regions: ["hk"],
      includeRegex: "HK",
      excludeRegex: "Test",
      excludedNodeNames: [],
    });

    actions.updateFilteredProxyGroup("filtered-1", {
      groupType: "load-balance",
      strategy: undefined,
    });
    expect(getState().filteredProxyGroups[0].strategy).toBe("round-robin");
  });

  it("adds, updates, removes, and restores module rules", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      moduleRuleExclusions: { ai: ["openai"] },
      moduleRuleOverrides: {},
    });

    actions.addModuleRules("", [
      { id: "ignored", name: "Ignored", behavior: "domain", path: "geosite/ignored.mrs" },
    ]);
    actions.addModuleRules("ai", []);
    expect(getState().moduleRuleOverrides).toEqual({});

    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" },
      { id: "", name: "Invalid", behavior: "domain", path: "" },
    ]);

    expect(getState().moduleRuleExclusions).toEqual({});
    expect(getState().moduleRuleOverrides.ai).toEqual([
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" },
    ]);

    const beforeDuplicateAdd = getState();
    actions.addModuleRules("ai", [
      { id: "custom-ai", name: "Duplicate", behavior: "domain", path: "geosite/duplicate.mrs" },
      { id: " ", name: "Invalid", behavior: "domain", path: "geosite/invalid.mrs" },
    ]);
    expect(getState()).toBe(beforeDuplicateAdd);

    actions.updateModuleRule("ai", "custom-ai", {
      name: "Custom AI IP",
      path: "geoip/custom-ai.mrs",
    });

    expect(getState().moduleRuleOverrides.ai[0]).toEqual({
      id: "custom-ai",
      name: "Custom AI IP",
      behavior: "ipcidr",
      path: "geoip/custom-ai.mrs",
      noResolve: true,
    });

    const beforeMissingUpdate = getState();
    actions.updateModuleRule("", "custom-ai", { name: "Ignored" });
    actions.updateModuleRule("ai", "", { name: "Ignored" });
    actions.updateModuleRule("ai", "missing", { name: "Ignored" });
    actions.updateModuleRule("ai", "custom-ai", { path: "" });
    expect(getState()).toBe(beforeMissingUpdate);

    actions.removeModuleRule("ai", "openai");
    expect(getState().moduleRuleExclusions).toEqual({ ai: ["openai"] });

    actions.removeModuleRule("ai", "missing");
    actions.removeModuleRule("missing", "openai");
    expect(getState().moduleRuleExclusions).toEqual({ ai: ["openai"] });

    actions.restoreModuleRule("ai", "openai");
    expect(getState().moduleRuleExclusions).toEqual({});

    actions.restoreModuleRule("ai", "openai");
    actions.restoreModuleRule("missing", "openai");
    expect(getState().moduleRuleExclusions).toEqual({});

    actions.removeModuleRule("ai", "custom-ai");
    expect(getState().moduleRuleOverrides).toEqual({});
  });

  it("keeps full rule order positions across preset rule remove, restore, hide, and move", () => {
    const enabledProxyGroups = PROXY_GROUP_MODULES.map((module) => module.id);
    const baseRuleOptions = {
      enabledModules: enabledProxyGroups,
      customRules: [],
      customProxyGroups: [],
      moduleRuleOverrides: {},
      moduleRuleExclusions: {},
      proxyGroupNameOverrides: {},
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: true,
      fallbackPolicyTarget: "DIRECT",
    };
    const fullRuleOrder = buildGeneratedRuleEntries(baseRuleOptions)
      .filter((entry) => entry.key !== "special:match")
      .map((entry) => entry.key);
    const openAiKey = "module:ai:openai";
    const appleTvPlusKey = "module:streaming-west:apple-tvplus";
    const movedAppleTvPlusKey = "module:google:apple-tvplus";
    const openAiIndex = fullRuleOrder.indexOf(openAiKey);
    const appleTvPlusIndex = fullRuleOrder.indexOf(appleTvPlusKey);
    const getAppliedOrder = () => {
      const state = getState();
      return resolveAppliedRuleOrder({
        ...baseRuleOptions,
        enabledModules: state.enabledProxyGroups,
        customRules: state.customRules,
        customProxyGroups: state.customProxyGroups,
        moduleRuleOverrides: state.moduleRuleOverrides,
        moduleRuleExclusions: state.moduleRuleExclusions,
        proxyGroupNameOverrides: state.proxyGroupNameOverrides,
        ruleOrder: state.ruleOrder,
      });
    };
    const { actions, getState } = createHarness({
      enabledProxyGroups,
      moduleRuleOverrides: {},
      moduleRuleExclusions: {},
      proxyGroupNameOverrides: {},
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: true,
      ruleOrder: fullRuleOrder,
      allRulesOrderEditingEnabled: true,
    });

    actions.removeModuleRule("ai", "openai");
    expect(getState().ruleOrder).toContain(openAiKey);
    expect(getAppliedOrder()).not.toContain(openAiKey);
    actions.restoreModuleRule("ai", "openai");
    expect(getAppliedOrder().indexOf(openAiKey)).toBe(openAiIndex);

    actions.hideProxyGroup("ai");
    expect(getState().ruleOrder).toContain(openAiKey);
    expect(getAppliedOrder()).not.toContain(openAiKey);
    actions.restoreHiddenProxyGroup("ai");
    expect(getAppliedOrder().indexOf(openAiKey)).toBe(openAiIndex);

    actions.moveModuleRule("streaming-west", "apple-tvplus", { kind: "module", id: "google" });
    expect(getState().ruleOrder).toContain(appleTvPlusKey);
    expect(getAppliedOrder().indexOf(movedAppleTvPlusKey)).toBe(appleTvPlusIndex);
    actions.moveModuleRule("google", "apple-tvplus", { kind: "module", id: "streaming-west" });
    expect(getAppliedOrder().indexOf(appleTvPlusKey)).toBe(appleTvPlusIndex);
  });

  it("adds preset-only and custom module rules with normalized fallback fields", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      moduleRuleExclusions: { ai: ["openai"] },
      moduleRuleOverrides: undefined,
    });

    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
    ]);

    expect(getState().moduleRuleOverrides).toBeUndefined();
    expect(getState().moduleRuleExclusions).toEqual({});

    actions.addModuleRules("custom-module", [
      { id: "custom", name: "   ", behavior: "domain", path: "geoip/custom.mrs" },
    ]);

    expect(getState().moduleRuleOverrides["custom-module"]).toEqual([
      { id: "custom", name: "custom", behavior: "ipcidr", path: "geoip/custom.mrs", noResolve: true },
    ]);

    const beforePresetNoop = getState();
    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
    ]);
    expect(getState()).toEqual(beforePresetNoop);
  });

  it("keeps active preset module rules stable when nothing needs restoring", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      moduleRuleExclusions: {},
      moduleRuleOverrides: {},
    });

    const before = getState();
    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
    ]);

    expect(getState()).toEqual(before);
  });

  it("restores all default module rules for one module and accepts edit warnings", () => {
    const { actions, getState } = createHarness({
      moduleRuleExclusions: { ai: ["openai", "anthropic"], youtube: ["youtube"] },
      moduleRuleEditWarningAccepted: false,
    });

    actions.restoreModuleDefaultRules("ai");
    expect(getState().moduleRuleExclusions).toEqual({ youtube: ["youtube"] });

    actions.restoreModuleDefaultRules("");
    actions.restoreModuleDefaultRules("ai");
    expect(getState().moduleRuleExclusions).toEqual({ youtube: ["youtube"] });

    actions.acceptModuleRuleEditWarning();
    expect(getState().moduleRuleEditWarningAccepted).toBe(true);
  });

  it("moves module rules into another builtin group or a custom group", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      ruleProviderBaseUrl: "https://rules.example.com/base/",
      customProxyGroups: [
        {
          id: "custom-1",
          name: "Custom",
          emoji: "",
          groupType: "select",
          rules: [],
        },
        {
          id: "custom-2",
          name: "Other",
          emoji: "",
          groupType: "select",
          rules: [],
        },
      ],
      moduleRuleOverrides: {},
      moduleRuleExclusions: {},
    });

    actions.moveModuleRule("ai", "openai", { kind: "module", id: "youtube" });

    expect(getState().enabledProxyGroups).toContain("youtube");
    expect(getState().moduleRuleExclusions).toEqual({ ai: ["openai"] });
    expect(getState().moduleRuleOverrides.youtube).toEqual([
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
    ]);

    actions.moveModuleRule("ai", "anthropic", { kind: "custom", id: "custom-1" });

    expect(getState().customProxyGroups[0].rules).toEqual([
      {
        id: "anthropic",
        name: "Anthropic (Claude)",
        behavior: "domain",
        url: "https://rules.example.com/base/geosite/anthropic.mrs",
      },
    ]);
    expect(getState().customProxyGroups[1].rules).toEqual([]);
    expect(getState().moduleRuleExclusions.ai).toEqual(["openai", "anthropic"]);

    actions.moveModuleRule("ai", "anthropic", { kind: "custom", id: "custom-1" });
    expect(getState().customProxyGroups[0].rules).toHaveLength(1);

    const beforeIgnoredMoves = getState();
    actions.moveModuleRule("", "openai", { kind: "module", id: "youtube" });
    actions.moveModuleRule("ai", "", { kind: "module", id: "youtube" });
    actions.moveModuleRule("ai", "openai", { kind: "module", id: "" });
    actions.moveModuleRule("ai", "openai", { kind: "other" as never, id: "youtube" });
    actions.moveModuleRule("ai", "openai", { kind: "module", id: "ai" });
    actions.moveModuleRule("missing", "openai", { kind: "module", id: "youtube" });
    actions.moveModuleRule("ai", "missing", { kind: "module", id: "youtube" });
    actions.moveModuleRule("ai", "openai", { kind: "custom", id: "missing" });
    expect(getState()).toBe(beforeIgnoredMoves);
  });

  it("moves custom module override rules into builtin modules", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto"],
      moduleRuleOverrides: {
        ai: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" }],
      },
      moduleRuleExclusions: {},
    });

    actions.moveModuleRule("ai", "custom-ai", { kind: "module", id: "youtube" });

    expect(getState().enabledProxyGroups).toEqual(["select", "auto", "youtube"]);
    expect(getState().moduleRuleOverrides).toEqual({
      youtube: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" }],
    });
  });

  it("moves extra rules without duplicating target presets or existing target overrides", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "youtube"],
      moduleRuleOverrides: {
        ai: [
          { id: "youtube", name: "YouTube Copy", behavior: "domain", path: "geosite/youtube.mrs" },
          { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" },
        ],
        youtube: [
          { id: "custom-ai", name: "Existing Custom AI", behavior: "domain", path: "geosite/existing.mrs" },
        ],
      },
      moduleRuleExclusions: { youtube: ["youtube"] },
    });

    actions.moveModuleRule("ai", "youtube", { kind: "module", id: "youtube" });

    expect(getState().moduleRuleExclusions).toEqual({});
    expect(getState().moduleRuleOverrides.ai).toEqual([
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" },
    ]);
    expect(getState().moduleRuleOverrides.youtube).toEqual([
      { id: "custom-ai", name: "Existing Custom AI", behavior: "domain", path: "geosite/existing.mrs" },
    ]);

    actions.moveModuleRule("ai", "custom-ai", { kind: "module", id: "youtube" });

    expect(getState().moduleRuleOverrides).toEqual({
      youtube: [
        { id: "custom-ai", name: "Existing Custom AI", behavior: "domain", path: "geosite/existing.mrs" },
      ],
    });
  });

  it("keeps no-resolve when moving IP preset rules into custom groups", () => {
    const { actions, getState } = createHarness({
      ruleProviderBaseUrl: "https://rules.example.com/base",
      customProxyGroups: [
        {
          id: "custom-1",
          name: "Custom",
          emoji: "",
          groupType: "select",
          rules: [],
        },
      ],
      moduleRuleExclusions: {},
      moduleRuleOverrides: {},
    });

    actions.moveModuleRule("private", "private-ip", { kind: "custom", id: "custom-1" });

    expect(getState().customProxyGroups[0].rules).toEqual([
      {
        id: "private-ip",
        name: "私有IP",
        behavior: "ipcidr",
        url: "https://rules.example.com/base/geoip/private.mrs",
        noResolve: true,
      },
    ]);
    expect(getState().moduleRuleExclusions).toEqual({ private: ["private-ip"] });
  });

  it("renames non-core module groups and rewrites custom rule targets", () => {
    const { actions, getState } = createHarness({
      proxyGroupNameOverrides: {},
      customRules: [
        { id: "rule-1", type: "DOMAIN", value: "example.com", target: "🤖 AI 服务" },
        { id: "rule-2", type: "DOMAIN", value: "example.net", target: "🚀 节点选择" },
      ],
    });

    actions.setProxyGroupNameOverride("select", "Main");
    actions.setProxyGroupNameOverride("", "Ignored");
    expect(getState().proxyGroupNameOverrides).toEqual({});

    actions.setProxyGroupNameOverride("ai", "Labs");
    expect(getState().proxyGroupNameOverrides).toEqual({ ai: "Labs" });
    expect(getState().customRules[0].target).toBe("🤖 Labs");
    expect(getState().customRules[1].target).toBe("🚀 节点选择");

    actions.setProxyGroupNameOverride("ai", "");
    expect(getState().proxyGroupNameOverrides).toEqual({ ai: "" });
    expect(getState().customRules[0].target).toBe("🤖 AI 服务");

    actions.setProxyGroupNameOverride("ai", "Labs");
    actions.clearProxyGroupNameOverride("ai");
    actions.clearProxyGroupNameOverride("");
    actions.clearProxyGroupNameOverride("select");
    expect(getState().proxyGroupNameOverrides).toEqual({});
    expect(getState().customRules[0].target).toBe("🤖 AI 服务");
  });

  it("renames groups when override maps are not initialized", () => {
    const { actions, getState } = createHarness({
      proxyGroupNameOverrides: undefined,
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "🤖 AI 服务" }],
    });

    actions.setProxyGroupNameOverride("ai", "Labs");
    expect(getState().proxyGroupNameOverrides).toEqual({ ai: "Labs" });
    expect(getState().customRules[0].target).toBe("🤖 Labs");

    actions.clearProxyGroupNameOverride("ai");
    expect(getState().proxyGroupNameOverrides).toEqual({});
    expect(getState().customRules[0].target).toBe("🤖 AI 服务");
  });
});
