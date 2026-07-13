import { afterEach, describe, expect, it, vi } from "vitest";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { buildGeneratedRuleEntries, resolveAppliedRuleOrder } from "@subboost/core/generator/rules";
import { initialState, type ConfigState } from "../definitions";
import type { SetAndGenerateConfig, StoreState } from "../store-types";
import { createProxyGroupActions } from "./proxy-group-actions";

type HarnessState = ConfigState & Record<string, unknown>;

function createHarness(overrides: Record<string, unknown> = {}) {
  let state: HarnessState = {
    ...structuredClone(initialState),
    ...overrides,
  };

  const applyPatch = (patch?: Partial<StoreState> | StoreState | void) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch } as HarnessState;
  };

  const setAndGenerateConfig: SetAndGenerateConfig = (updater) => {
    // createProxyGroupActions only reads ConfigState fields; actions are outside this test harness.
    applyPatch(updater(state as unknown as StoreState));
  };

  const actions = createProxyGroupActions(() => undefined, () => state as unknown as StoreState, setAndGenerateConfig);
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
      "name:External",
      // Intentionally force a non-string runtime value to verify invalid input is ignored.
      123 as unknown as string,
    ]);

    expect(getState().proxyGroupOrder).toEqual(["module:ai", "name:External"]);

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

  it("normalizes legacy hidden group lists while hiding builtin groups", () => {
    const harness = createHarness({
      enabledProxyGroups: ["select", "ai"],
      hiddenProxyGroups: "ai" as never,
    });

    harness.actions.hideProxyGroup("ai");

    expect(harness.getState().hiddenProxyGroups).toEqual(["ai"]);
    expect(harness.getState().enabledProxyGroups).toEqual(["select"]);

    const duplicateHarness = createHarness({
      enabledProxyGroups: ["select", "ai"],
      hiddenProxyGroups: ["ai"],
    });

    duplicateHarness.actions.hideProxyGroup("ai");

    expect(duplicateHarness.getState().hiddenProxyGroups).toEqual(["ai"]);
    expect(duplicateHarness.getState().enabledProxyGroups).toEqual(["select"]);
  });

  it("updates advanced config for builtin proxy groups", () => {
    const { actions, getState } = createHarness({
      proxyGroupAdvanced: {
        ai: {
          sourceIds: ["source-1"],
          regions: ["hk"],
          includeRegex: "HK",
          excludedMembers: [{ kind: "node", name: "Old" }],
        },
      },
    });

    actions.updateProxyGroupAdvanced(" ai ", {
      sourceIds: [" source-2 ", "", "source-2"],
      regions: "bad" as never,
      includeRegex: "Node",
      excludeRegex: "Test",
      excludedMembers: [
        { kind: "node", name: " Node A " },
        { kind: "node", name: "Node A" },
        { kind: "dialer", id: "relay" } as never,
      ],
    });

    expect(getState().proxyGroupAdvanced.ai).toMatchObject({
      sourceIds: ["source-2"],
      includeRegex: "Node",
      excludeRegex: "Test",
      excludedMembers: [{ kind: "node", name: "Node A" }],
    });
    expect(getState().proxyGroupAdvanced.ai.regions).toBeUndefined();

    const beforeMissingUpdate = getState();
    actions.updateProxyGroupAdvanced("", { includeRegex: "Ignored" });
    actions.updateProxyGroupAdvanced("missing", { includeRegex: "Ignored" });
    expect(getState()).toBe(beforeMissingUpdate);
  });

  it("updates advanced config from empty state and empty patches", () => {
    const { actions, getState } = createHarness({
      proxyGroupAdvanced: undefined,
    });

    actions.updateProxyGroupAdvanced("ai", undefined as never);

    expect(getState().proxyGroupAdvanced.ai).toEqual({});
  });

  it("adds, updates, removes, and restores module rules", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      customRuleSets: [],
    });

    actions.addModuleRules("", [
      { id: "ignored", name: "Ignored", behavior: "domain", path: "geosite/ignored.mrs" },
    ]);
    actions.addModuleRules("ai", []);
    expect(getState().customRuleSets).toEqual([]);

    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs" },
      { id: "", name: "Invalid", behavior: "domain", path: "" },
    ]);

    expect(getState().builtinRuleEdits).toEqual({});
    expect(getState().customRuleSets).toEqual([
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: { kind: "module", id: "ai" } },
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

    expect(getState().customRuleSets[0]).toEqual({
      id: "custom-ai",
      name: "Custom AI IP",
      behavior: "ipcidr",
      path: "geoip/custom-ai.mrs",
      target: { kind: "module", id: "ai" },
      noResolve: true,
    });

    const beforeMissingUpdate = getState();
    actions.updateModuleRule("", "custom-ai", { name: "Ignored" });
    actions.updateModuleRule("ai", "", { name: "Ignored" });
    actions.updateModuleRule("ai", "missing", { name: "Ignored" });
    actions.updateModuleRule("ai", "custom-ai", { path: "" });
    expect(getState()).toBe(beforeMissingUpdate);

    actions.removeModuleRule("ai", "openai");
    expect(getState().builtinRuleEdits).toEqual({ "module:ai:openai": { enabled: false } });

    actions.removeModuleRule("ai", "missing");
    actions.removeModuleRule("missing", "openai");
    expect(getState().builtinRuleEdits).toEqual({ "module:ai:openai": { enabled: false } });

    actions.restoreModuleRule("ai", "openai");
    expect(getState().builtinRuleEdits).toEqual({});

    actions.restoreModuleRule("ai", "openai");
    actions.restoreModuleRule("missing", "openai");
    expect(getState().builtinRuleEdits).toEqual({});

    actions.removeModuleRule("ai", "custom-ai");
    expect(getState().customRuleSets).toEqual([]);
  });

  it("disables moved builtin rule edits when removed from custom target groups", () => {
    const { actions, getState } = createHarness({
      customProxyGroups: [{ id: "custom-1", name: "Custom", emoji: "", groupType: "select" }],
      builtinRuleEdits: {
        "module:ai:openai": { target: "Custom", enabled: true },
      },
    });

    actions.removeModuleRule("custom-1", "openai");

    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: "Custom", enabled: false },
    });

    actions.restoreModuleRule("ai", "openai");

    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: "Custom" },
    });
  });

  it("keeps missing rule-set targets as no-ops and retargets moved builtin edits", () => {
    const { actions, getState } = createHarness({
      customProxyGroups: [
        { id: "blank", name: " ", emoji: "", groupType: "select" },
      ],
      customRuleSets: [
        { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" },
      ],
      builtinRuleEdits: {
        "module:ai:openai": { target: "🤖 AI 服务", enabled: false },
      },
    });

    const beforeMissingTargets = getState();
    actions.addModuleRules("blank", [
      { id: "ignored", name: "Ignored", behavior: "domain", path: "geosite/ignored.mrs" },
    ]);
    actions.updateModuleRule("blank", "custom-ai", { name: "Ignored" });
    expect(getState()).toBe(beforeMissingTargets);

    actions.removeModuleRule("ai", "openai");
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: "🤖 AI 服务", enabled: false },
    });

    actions.moveModuleRule("ai", "openai", { kind: "module", id: "youtube" });
    expect(getState().enabledProxyGroups).toContain("youtube");
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: { kind: "module", id: "youtube" } },
    });
  });

  it("keeps full rule order positions across preset rule remove, restore, hide, and move", () => {
    const enabledProxyGroups = PROXY_GROUP_MODULES.map((module) => module.id);
    const baseRuleOptions = {
      enabledModules: enabledProxyGroups,
      customRules: [],
      customProxyGroups: [],
      customRuleSets: [],
      builtinRuleEdits: {},
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
    const openAiIndex = fullRuleOrder.indexOf(openAiKey);
    const appleTvPlusIndex = fullRuleOrder.indexOf(appleTvPlusKey);
    const getAppliedOrder = () => {
      const state = getState();
      return resolveAppliedRuleOrder({
        ...baseRuleOptions,
        enabledModules: state.enabledProxyGroups,
        customRules: state.customRules,
        customRuleSets: state.customRuleSets,
        builtinRuleEdits: state.builtinRuleEdits,
        proxyGroupNameOverrides: state.proxyGroupNameOverrides,
        ruleOrder: state.ruleOrder,
      });
    };
    const { actions, getState } = createHarness({
      enabledProxyGroups,
      customRuleSets: [],
      builtinRuleEdits: {},
      proxyGroupNameOverrides: {},
      experimentalCnUseCnRuleSet: true,
      cnIpNoResolve: true,
      ruleOrder: fullRuleOrder,
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
    expect(getState().builtinRuleEdits[appleTvPlusKey]).toEqual({ target: { kind: "module", id: "google" } });
    expect(getAppliedOrder().indexOf(appleTvPlusKey)).toBe(appleTvPlusIndex);
    actions.resetModuleRuleTarget("streaming-west", "apple-tvplus");
    expect(getState().builtinRuleEdits).toEqual({});
    expect(getAppliedOrder().indexOf(appleTvPlusKey)).toBe(appleTvPlusIndex);
  });

  it("adds preset-only and custom module rules with normalized fallback fields", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "ai"],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      customRuleSets: [],
      customProxyGroups: [{ id: "custom-module", name: "Custom Module", emoji: "", groupType: "select" }],
    });

    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
    ]);

    expect(getState().customRuleSets).toEqual([]);
    expect(getState().builtinRuleEdits).toEqual({});

    actions.addModuleRules("custom-module", [
      { id: "custom", name: "   ", behavior: "domain", path: "geoip/custom.mrs" },
    ]);

    expect(getState().customRuleSets).toEqual([
      { id: "custom", name: "custom", behavior: "ipcidr", path: "geoip/custom.mrs", target: { kind: "custom", id: "custom-module" }, noResolve: true },
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
      builtinRuleEdits: {},
      customRuleSets: [],
    });

    const before = getState();
    actions.addModuleRules("ai", [
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
    ]);

    expect(getState()).toEqual(before);
  });

  it("adds, updates, moves, and removes custom rule sets for custom groups", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto"],
      customProxyGroups: [
        {
          id: "custom-1",
          name: "Custom",
          emoji: "",
          groupType: "select",
        },
        {
          id: "custom-2",
          name: "Target",
          emoji: "",
          groupType: "select",
        },
      ],
      customRuleSets: [],
    });

    actions.addModuleRules("custom-1", [
      { id: "telegram", name: "Telegram", behavior: "ipcidr", path: "geoip/telegram.mrs" },
    ]);

    expect(getState().customRuleSets).toEqual([
      {
        id: "telegram",
        name: "Telegram",
        behavior: "ipcidr",
        path: "geoip/telegram.mrs",
        target: { kind: "custom", id: "custom-1" },
        noResolve: true,
      },
    ]);

    actions.updateModuleRule("custom-1", "telegram", {
      name: "Telegram Custom",
      path: "geoip/telegram.mrs",
    });
    expect(getState().customRuleSets[0]).toMatchObject({
      id: "telegram",
      name: "Telegram Custom",
      target: { kind: "custom", id: "custom-1" },
    });

    actions.moveModuleRule("custom-1", "telegram", { kind: "custom", id: "custom-2" });
    expect(getState().customRuleSets[0].target).toEqual({ kind: "custom", id: "custom-2" });

    actions.removeModuleRule("custom-2", "telegram");
    expect(getState().customRuleSets).toEqual([]);
  });

  it("restores all default module rules for one module and accepts edit warnings", () => {
    const { actions, getState } = createHarness({
      builtinRuleEdits: {
        "module:ai:openai": { enabled: false },
        "module:ai:anthropic": { target: "Custom", enabled: false },
        "module:youtube:youtube": { enabled: false },
      },
      moduleRuleEditWarningAccepted: false,
    });

    actions.restoreModuleDefaultRules("ai");
    actions.restoreModuleDefaultRules("missing");
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:anthropic": { target: "Custom" },
      "module:youtube:youtube": { enabled: false },
    });

    actions.restoreModuleDefaultRules("");
    actions.restoreModuleDefaultRules("ai");
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:anthropic": { target: "Custom" },
      "module:youtube:youtube": { enabled: false },
    });

    actions.acceptModuleRuleEditWarning();
    expect(getState().moduleRuleEditWarningAccepted).toBe(true);
  });

  it("keeps reset rule target no-ops stable for invalid or already-default rules", () => {
    const { actions, getState } = createHarness({
      builtinRuleEdits: {},
    });

    const before = getState();
    actions.resetModuleRuleTarget("", "openai");
    actions.resetModuleRuleTarget("ai", "");
    actions.resetModuleRuleTarget("missing", "openai");
    actions.resetModuleRuleTarget("ai", "missing");
    actions.resetModuleRuleTarget("ai", "openai");

    expect(getState()).toBe(before);
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
        },
        {
          id: "custom-2",
          name: "Other",
          emoji: "",
          groupType: "select",
        },
      ],
      customRuleSets: [],
      builtinRuleEdits: {},
    });

    actions.moveModuleRule("ai", "openai", { kind: "module", id: "youtube" });

    expect(getState().enabledProxyGroups).toContain("youtube");
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: { kind: "module", id: "youtube" } },
    });

    actions.moveModuleRule("ai", "anthropic", { kind: "custom", id: "custom-1" });

    expect(getState().customRuleSets).toEqual([]);
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: { kind: "module", id: "youtube" } },
      "module:ai:anthropic": { target: { kind: "custom", id: "custom-1" } },
    });

    actions.moveModuleRule("ai", "anthropic", { kind: "custom", id: "custom-1" });
    expect(getState().builtinRuleEdits).toEqual({
      "module:ai:openai": { target: { kind: "module", id: "youtube" } },
      "module:ai:anthropic": { target: { kind: "custom", id: "custom-1" } },
    });

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
      customRuleSets: [
        { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" },
      ],
      builtinRuleEdits: {},
    });

    actions.moveModuleRule("ai", "custom-ai", { kind: "module", id: "youtube" });

    expect(getState().enabledProxyGroups).toEqual(["select", "auto", "youtube"]);
    expect(getState().customRuleSets).toEqual([
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: { kind: "module", id: "youtube" } },
    ]);
  });

  it("moves extra rules without duplicating target presets or existing target overrides", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "auto", "youtube"],
      customRuleSets: [
        { id: "youtube", name: "YouTube Copy", behavior: "domain", path: "geosite/youtube.mrs", target: "🤖 AI 服务" },
        { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" },
        { id: "custom-ai", name: "Existing Custom AI", behavior: "domain", path: "geosite/existing.mrs", target: "📹 油管视频" },
      ],
      builtinRuleEdits: { "module:youtube:youtube": { enabled: false } },
    });

    actions.moveModuleRule("ai", "youtube", { kind: "module", id: "youtube" });

    expect(getState().builtinRuleEdits).toEqual({});
    expect(getState().customRuleSets).toEqual([
      { id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" },
      { id: "custom-ai", name: "Existing Custom AI", behavior: "domain", path: "geosite/existing.mrs", target: "📹 油管视频" },
    ]);

    actions.moveModuleRule("ai", "custom-ai", { kind: "module", id: "youtube" });

    expect(getState().customRuleSets).toEqual([
      { id: "custom-ai", name: "Existing Custom AI", behavior: "domain", path: "geosite/existing.mrs", target: "📹 油管视频" },
    ]);
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
        },
      ],
      customRuleSets: [],
      builtinRuleEdits: {},
    });

    actions.moveModuleRule("private", "private-ip", { kind: "custom", id: "custom-1" });

    expect(getState().customRuleSets).toEqual([]);
    expect(getState().builtinRuleEdits).toEqual({
      "module:private:private-ip": { target: { kind: "custom", id: "custom-1" } },
    });
  });

  it("renames non-core module groups and rewrites custom rule targets", () => {
    const { actions, getState } = createHarness({
      proxyGroupNameOverrides: {},
      customRules: [
        { id: "rule-1", type: "DOMAIN", value: "example.com", target: "🤖 AI 服务" },
        { id: "rule-2", type: "DOMAIN", value: "example.net", target: "🚀 节点选择" },
      ],
      customRuleSets: [
        { id: "rs-1", name: "RS", behavior: "domain", path: "geosite/rs.mrs", target: "🤖 AI 服务" },
        { id: "rs-2", name: "Other", behavior: "domain", path: "geosite/other.mrs", target: "🚀 节点选择" },
      ],
      builtinRuleEdits: {
        "module:ai:openai": { target: "🤖 AI 服务" },
      },
    });

    actions.setProxyGroupNameOverride("select", "Main");
    actions.setProxyGroupNameOverride("", "Ignored");
    expect(getState().proxyGroupNameOverrides).toEqual({});

    actions.setProxyGroupNameOverride("ai", "Labs");
    expect(getState().proxyGroupNameOverrides).toEqual({ ai: "Labs" });
    expect(getState().customRules[0].target).toBe("🤖 Labs");
    expect(getState().customRules[1].target).toBe("🚀 节点选择");
    expect(getState().customRuleSets[0].target).toBe("🤖 Labs");
    expect(getState().customRuleSets[1].target).toBe("🚀 节点选择");
    expect(getState().builtinRuleEdits["module:ai:openai"].target).toBe("🤖 Labs");

    actions.setProxyGroupNameOverride("ai", "");
    expect(getState().proxyGroupNameOverrides).toEqual({ ai: "" });
    expect(getState().customRules[0].target).toBe("🤖 AI 服务");
    expect(getState().customRuleSets[0].target).toBe("🤖 AI 服务");
    expect(getState().customRuleSets[1].target).toBe("🚀 节点选择");

    actions.setProxyGroupNameOverride("ai", "Labs");
    actions.clearProxyGroupNameOverride("ai");
    actions.clearProxyGroupNameOverride("");
    actions.clearProxyGroupNameOverride("select");
    expect(getState().proxyGroupNameOverrides).toEqual({});
    expect(getState().customRules[0].target).toBe("🤖 AI 服务");
    expect(getState().customRuleSets[0].target).toBe("🤖 AI 服务");
    expect(getState().customRuleSets[1].target).toBe("🚀 节点选择");
    expect(getState().builtinRuleEdits["module:ai:openai"].target).toBe("🤖 AI 服务");
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
