import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  confirmDialog: vi.fn(),
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  effects: [] as Array<React.EffectCallback>,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  refOverride: undefined as unknown,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: (...args: any[]) => unknown, deps?: React.DependencyList) => {
      if (stateMock.enabled) return callback;
      return actual.useCallback(callback, deps ?? []);
    },
    useMemo: (factory: () => unknown, deps?: React.DependencyList) => {
      if (stateMock.enabled) return factory();
      return actual.useMemo(factory, deps ?? []);
    },
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (stateMock.enabled) {
        stateMock.effects.push(effect);
        return undefined;
      }
      return actual.useEffect(effect, deps);
    },
    useRef: (initial: unknown) => {
      if (stateMock.enabled) {
        return { current: stateMock.refOverride === undefined ? initial : stateMock.refOverride };
      }
      return actual.useRef(initial);
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index) ? stateMock.overrides[index] : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
  Pencil: () => null,
  RotateCcw: () => null,
  Shuffle: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (props: any) => props.children }));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => props.children,
  DropdownMenuContent: (props: any) => props.children,
  DropdownMenuItem: (props: any) => {
    mocks.captures.dropdownItems.push(props);
    return null;
  },
  DropdownMenuLabel: (props: any) => props.children,
  DropdownMenuTrigger: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  CATEGORY_INFO: {
    core: { name: "核心", order: 1 },
    service: { name: "服务", order: 1.5 },
    custom: { name: "自定义", order: 2 },
  },
	  PROXY_GROUP_MODULES: [
	    { id: "auto", name: "Auto", category: "core", rules: [
	      { id: "auto-rule", name: "Auto Rule", behavior: "domain", path: "geosite/auto-rule.mrs" },
	      { id: "moved-rule", name: "Moved Rule", behavior: "domain", path: "geosite/moved-rule.mrs" },
	    ] },
	    { id: "fallback", name: "Fallback", category: "core", rules: [] },
	    { id: "cn", name: "CN", category: "service", rules: [
	      { id: "cn-ip", name: "CN IP", behavior: "ipcidr", path: "geoip/cn.mrs", noResolve: true },
	    ] },
	  ],
  generateProxyGroups: vi.fn(() => []),
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) => override || module.name,
  splitLeadingEmoji: (name: string) => {
    const match = name.trim().match(/^(\S+)\s+(.+)$/);
    if (!match || /[A-Za-z0-9\u4e00-\u9fff]/.test(match[1])) {
      return { hasEmojiPrefix: false, emoji: "", label: name.trim() };
    }
    return { hasEmojiPrefix: true, emoji: match[1], label: match[2] };
  },
}));
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.store }));
vi.mock("./proxy-group-rule-targets", () => ({
  buildManualRuleTargets: vi.fn(() => [{ name: "Auto" }]),
  listCustomRulesForTarget: (_rules: any[], target: string) =>
    target === "Auto Override" ? [{ rule: { id: "manual-1" }, index: 0 }] : [],
}));
vi.mock("./proxy-groups-custom-groups-panel", () => ({
  ProxyGroupsCustomGroupsPanel: () => {
    mocks.captures.customPanelRendered = true;
    return null;
  },
}));
vi.mock("./proxy-groups-custom-routing-rules", () => ({
  ProxyGroupsCustomRoutingRules: () => {
    mocks.captures.customRulesRendered = true;
    return null;
  },
}));
vi.mock("./proxy-groups-module-card", () => ({
  ProxyGroupsModuleCard: (props: any) => {
    mocks.captures.moduleCards.push(props);
    return null;
  },
}));
vi.mock("./group-advanced-settings-dialog", () => ({
  GroupAdvancedSettingsDialog: (props: any) => {
    mocks.captures.settingsDialogs.push(props);
    return null;
  },
}));

import { ProxyGroupsCategories } from "./proxy-groups-categories";
import { generateProxyGroups } from "@subboost/core/generator/proxy-groups";
import { getEffectiveModuleRuleItems, isModuleRuleMovedFrom } from "@subboost/core/generator/module-rules";

function renderCategories(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.effects = [];
  stateMock.setters = [];
  mocks.captures.inputs = [];
  mocks.captures.dropdownItems = [];
  mocks.captures.moduleCards = [];
  mocks.captures.settingsDialogs = [];
  mocks.captures.customPanelRendered = false;
  mocks.captures.customRulesRendered = false;
  try {
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsCategories));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function renderCategoryTree(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.effects = [];
  stateMock.setters = [];
  mocks.captures.inputs = [];
  mocks.captures.dropdownItems = [];
  mocks.captures.moduleCards = [];
  mocks.captures.settingsDialogs = [];
  mocks.captures.customPanelRendered = false;
  mocks.captures.customRulesRendered = false;
  try {
    return { tree: ProxyGroupsCategories(), setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<Record<string, any>>) => boolean,
  out: Array<React.ReactElement<Record<string, any>>> = [],
) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    const element = child as React.ReactElement<Record<string, any>>;
    if (predicate(element)) out.push(element);
    collectElements((element.props as { children?: React.ReactNode }).children, predicate, out);
  });
  return out;
}

describe("ProxyGroupsCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateMock.refOverride = undefined;
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.captures = { inputs: [], dropdownItems: [], moduleCards: [], settingsDialogs: [] };
    mocks.store = {
      ruleProviderBaseUrl: "https://rules.example/base/",
      nodes: [],
      testUrl: "https://probe.example/204",
      testInterval: 300,
      setRuleProviderBaseUrl: vi.fn(),
      cnIpNoResolve: false,
      setCnIpNoResolve: vi.fn(),
      experimentalCnUseCnRuleSet: false,
      setExperimentalCnUseCnRuleSet: vi.fn(),
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: ["fallback"],
      toggleProxyGroup: vi.fn(),
      hideProxyGroup: vi.fn(),
      restoreHiddenProxyGroup: vi.fn(),
      customRuleSets: [{ id: "extra-1", name: "Extra", behavior: "domain", path: "geosite/extra-1.mrs", target: "Auto Override" }],
      builtinRuleEdits: {},
      moduleRuleEditWarningAccepted: false,
      customRules: [{ id: "manual-1", target: "Auto Override" }],
      updateCustomRule: vi.fn(),
      removeCustomRule: vi.fn(),
      addModuleRules: vi.fn(),
      removeModuleRule: vi.fn(),
      moveModuleRule: vi.fn(),
      restoreModuleRule: vi.fn(),
      resetModuleRuleTarget: vi.fn(),
      updateCustomProxyGroup: vi.fn(),
      acceptModuleRuleEditWarning: vi.fn(),
      proxyGroupNameOverrides: { auto: "Auto Override" },
      setProxyGroupNameOverride: vi.fn(),
      clearProxyGroupNameOverride: vi.fn(),
      customProxyGroups: [{ id: "custom-1", name: "Custom" }],
      dialerProxyGroups: [{ name: "Dialer" }],
      proxyGroupAdvanced: {},
      proxyGroupAdvancedModeEnabled: false,
      setProxyGroupAdvancedModeEnabled: vi.fn(),
      updateProxyGroupAdvanced: vi.fn(),
      groupListeners: [],
      setGroupListener: vi.fn(),
      dnsYaml: "",
      mixedPort: 7890,
      listenerPorts: {},
    };
  });

  it("opens only the custom category by default when custom groups exist", () => {
    renderCategories();

    expect(mocks.captures.customPanelRendered).toBe(true);
    expect(mocks.captures.moduleCards).toHaveLength(0);

    mocks.store.customProxyGroups = [];
    renderCategories();
    expect(mocks.captures.customPanelRendered).toBe(false);
    expect(mocks.captures.moduleCards).toHaveLength(0);
  });

  it("applies the custom category default after custom groups appear later", () => {
    stateMock.refOverride = false;
    renderCategories({ 0: new Set() });
    stateMock.effects[0]();
    expect(stateMock.setters[0]).toHaveBeenCalledWith(expect.any(Function));
    expect((stateMock.setters[0] as any).lastValue.has("custom")).toBe(true);

    stateMock.refOverride = false;
    renderCategories({ 0: new Set(["custom"]) });
    stateMock.effects[0]();
    expect((stateMock.setters[0] as any).lastValue.has("custom")).toBe(true);
  });

  it("renders visible and hidden modules and forwards basic config changes", () => {
    renderCategories({ 0: new Set(["core"]) });

    expect(mocks.captures.inputs).toHaveLength(0);
    const html = renderCategories({ 0: new Set(["core"]) }).html;
    expect(html).toContain("https://rules.example/base/");
    expect(html).toContain("grid-cols-[minmax(0,1fr)_96px]");
    expect(html).not.toContain("md:grid-cols-[minmax(0,1fr)_96px]");
    expect(html).toContain("min-w-0 space-y-1");
    expect(html).toContain("text-xs text-amber-300");
    expect(html).toContain('aria-label="高级模式"');
    expect(mocks.store.setRuleProviderBaseUrl).not.toHaveBeenCalled();

    expect(mocks.captures.moduleCards).toHaveLength(1);
    expect(mocks.captures.moduleCards[0]).toEqual(
      expect.objectContaining({
        module: expect.objectContaining({ id: "auto" }),
        display: { full: "Auto Override" },
        isCore: true,
        isEnabled: true,
        manualRules: [{ rule: { id: "manual-1" }, index: 0 }],
      })
    );

    mocks.captures.dropdownItems[0].onClick();
    expect(mocks.store.restoreHiddenProxyGroup).toHaveBeenCalledWith("fallback");
    expect(stateMock.setters[0]).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.captures.customRulesRendered).toBe(true);
  });

  it("handles module card actions, confirmations, and rule movement", async () => {
    const { setters } = renderCategories({ 0: new Set(["core"]) });
    const card = mocks.captures.moduleCards[0];

    await card.onToggleEnabled();
    expect(mocks.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "继续取消" }));
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("auto");

    await card.onHide();
    expect(mocks.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "删除" }));
    expect(mocks.store.hideProxyGroup).toHaveBeenCalledWith("auto");
    expect(setters[3]).toHaveBeenCalledWith(expect.any(Function));

    card.onToggleRulesExpanded();
    expect(setters[3]).toHaveBeenCalledWith(expect.any(Function));
    card.onAddRules([{ id: "rule-a" }]);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("auto", [{ id: "rule-a" }]);
    card.onAddRulesToModule("fallback", [{ id: "rule-b" }]);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("fallback", [{ id: "rule-b" }]);
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("fallback");

    mocks.store.toggleProxyGroup.mockClear();
    card.onAddRulesToModule("auto", [{ id: "rule-c" }]);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("auto", [{ id: "rule-c" }]);
    expect(mocks.store.toggleProxyGroup).not.toHaveBeenCalled();

    card.onRemoveExtraRule("rule-a");
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith("auto", "rule-a");
    card.onMoveRule("rule-a", "top");
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("auto", "rule-a", "top");
    card.onMoveManualRule("manual-1", { kind: "module", id: "fallback", name: "Fallback" });
    expect(mocks.store.updateCustomRule).toHaveBeenCalledWith("manual-1", {
      target: { kind: "module", id: "fallback" },
    });
    card.onRestoreRule("rule-a");
    expect(mocks.store.restoreModuleRule).toHaveBeenCalledWith("auto", "rule-a");
    card.onResetRuleTarget("rule-a");
    expect(mocks.store.resetModuleRuleTarget).toHaveBeenCalledWith("auto", "rule-a");

    card.onChangeCnIpNoResolve(true);
    expect(mocks.store.setCnIpNoResolve).toHaveBeenCalledWith(true);
    card.onChangeExperimentalCnUseCnRuleSet(true);
    expect(mocks.store.setExperimentalCnUseCnRuleSet).toHaveBeenCalledWith(true);
  });

  it("renames modules and adds rules to custom groups with duplicate guards", () => {
    const { setters } = renderCategories({ 0: new Set(["core"]), 1: "auto", 2: "Custom" });
    const card = mocks.captures.moduleCards[0];

    card.onStartEditing();
    expect(setters[1]).toHaveBeenCalledWith("auto");
    expect(setters[2]).toHaveBeenCalledWith("Auto Override");

    card.onCommitEditing();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "代理组名称已存在，请换一个名称。", variant: "warning" }));

    card.onCancelEditing();
    expect(setters[1]).toHaveBeenCalledWith(null);

    renderCategories({ 0: new Set(["core"]), 1: "auto", 2: "" });
    mocks.captures.moduleCards[0].onCommitEditing();
    expect(mocks.store.clearProxyGroupNameOverride).toHaveBeenCalledWith("auto");

    renderCategories({ 0: new Set(["core"]), 1: "auto", 2: "Auto" });
    mocks.captures.moduleCards[0].onCommitEditing();
    expect(mocks.store.clearProxyGroupNameOverride).toHaveBeenCalledWith("auto");

    renderCategories({ 0: new Set(["core"]), 1: "auto", 2: "Unique" });
    mocks.captures.moduleCards[0].onCommitEditing();
    expect(mocks.store.setProxyGroupNameOverride).toHaveBeenCalledWith("auto", "Unique");

    const customRule = { id: "geo", name: "Geo", behavior: "domain", path: "geo.txt", noResolve: true };
    mocks.captures.moduleCards[0].onAddRuleToCustomGroup("custom-1", customRule);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [customRule]);

    mocks.store.customRuleSets = [{ id: "geo", name: "Geo", behavior: "domain", path: "geo.txt", target: "Custom" }];
    mocks.store.addModuleRules.mockClear();
    renderCategories({ 0: new Set(["core"]) });
    mocks.captures.moduleCards[0].onAddRuleToCustomGroup("custom-1", customRule);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [customRule]);

    mocks.store.customProxyGroups = [{ id: "custom-1", name: "Custom" }];
    renderCategories({ 0: new Set(["core"]) });
    mocks.captures.moduleCards[0].onAddRuleToCustomGroup("missing", customRule);
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();

    mocks.captures.moduleCards[0].onAddRuleToCustomGroup("custom-1", {
      id: "geo-no-resolve-off",
      name: "Geo Off",
      behavior: "domain",
      path: "/geo-off.txt",
      noResolve: false,
    });
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [
      {
        id: "geo-no-resolve-off",
        name: "Geo Off",
        behavior: "domain",
        path: "/geo-off.txt",
        noResolve: false,
      },
    ]);
  });

  it("forwards generated counts, moved preset rules, and advanced group changes", () => {
    mocks.store.nodes = [{ name: "US", type: "ss", server: "us.example.com", port: 8388, cipher: "aes-128-gcm", password: "secret" }];
    mocks.store.customRuleSets = [
      { id: "set-1", name: "Set 1", behavior: "domain", path: "geosite/set-1.mrs", target: "Auto Override", noResolve: true },
    ];
    mocks.store.builtinRuleEdits = {
      "module:auto:auto-rule": { enabled: false },
      "module:auto:moved-rule": { target: "Fallback" },
      bad: { target: "Fallback" },
    };
    mocks.store.proxyGroupAdvanced = { auto: { groupType: "select", strategy: "round-robin" } };
    vi.mocked(generateProxyGroups).mockReturnValueOnce([
      { name: "Auto Override", type: "select", proxies: ["US", "DIRECT"] },
    ] as never);

    renderCategories({ 0: new Set(["core"]) });
    const card = mocks.captures.moduleCards[0];

    // proxies 为 ["US", "DIRECT"]，只有 US 是真实节点，DIRECT 是兜底策略不计入节点数。
    expect(card.nodeCount).toBe(1);
    expect(card.extraRules).toEqual([
      { id: "set-1", name: "Set 1", behavior: "domain", path: "geosite/set-1.mrs", noResolve: true },
    ]);
    expect(card.hiddenPresetRuleIds.auto).toContain("auto-rule");
    expect(card.hiddenPresetRuleIds.auto).toContain("moved-rule");

    // 类型/监听改动统一走高级设置弹窗
    card.onOpenAdvancedSettings();
    expect(stateMock.setters[4]).toHaveBeenCalledWith("auto");

    renderCategories({ 0: new Set(["core"]), 4: "auto" });
    const settingsDialog = mocks.captures.settingsDialogs[0];
    expect(settingsDialog.groupName).toBe("Auto Override");
    settingsDialog.onSave({ groupType: "load-balance", strategy: "round-robin", listener: null });
    expect(mocks.store.updateProxyGroupAdvanced).toHaveBeenCalledWith("auto", {
      groupType: "load-balance",
      strategy: "round-robin",
    });
    expect(mocks.store.setGroupListener).toHaveBeenCalledWith({ kind: "module", id: "auto" }, null);

    settingsDialog.onSave({ groupType: "fallback", listener: { port: 7891, enabled: true, allowLan: false } });
    expect(mocks.store.updateProxyGroupAdvanced).toHaveBeenCalledWith("auto", {
      groupType: "fallback",
      strategy: undefined,
    });
    expect(mocks.store.setGroupListener).toHaveBeenCalledWith(
      { kind: "module", id: "auto" },
      { port: 7891, enabled: true, allowLan: false }
    );

    const advancedElement = card.renderAdvancedContent(React.createElement("div", null, "rules"), 2);
    expect(advancedElement.props.target).toEqual({ kind: "module", id: "auto", name: "Auto Override" });
    advancedElement.props.onChange({ sourceIds: ["source-a"] });
    expect(mocks.store.updateProxyGroupAdvanced).toHaveBeenCalledWith("auto", { sourceIds: ["source-a"] });
  });

  it.each(["module", "custom"])("distinguishes moved and removed rules targeting a %s group", (kind) => {
    mocks.store.hiddenProxyGroups = [];
    const targetId = kind === "module" ? "fallback" : "custom-1";
    mocks.store.customProxyGroups = [{ id: "custom-1", name: "Custom", groupType: "select" }];
    mocks.store.builtinRuleEdits = {
      "module:auto:moved-rule": { target: { kind, id: targetId } },
    };
    renderCategories({ 0: new Set(["core"]) });
    let card = mocks.captures.moduleCards[0];
    expect(isModuleRuleMovedFrom("auto", "moved-rule", card.ruleSetsByTarget)).toBe(true);
    expect(card.ruleSetsByTarget[targetId].map((rule: any) => rule.id)).toContain("moved-rule");
    if (kind === "module") {
      const targetCard = mocks.captures.moduleCards.find((item: any) => item.module.id === targetId);
      expect(getEffectiveModuleRuleItems(targetCard.module, card.ruleSetsByTarget, card.hiddenPresetRuleIds)
        .find((rule) => rule.id === "moved-rule")?.source).toBe("preset");
    }

    mocks.store.builtinRuleEdits["module:auto:moved-rule"].enabled = false;
    renderCategories({ 0: new Set(["core"]) });
    card = mocks.captures.moduleCards[0];
    expect(card.hiddenPresetRuleIds.auto).toContain("moved-rule");
    expect(card.ruleSetsByTarget[targetId] ?? []).toEqual([]);
    expect(isModuleRuleMovedFrom("auto", "moved-rule", card.ruleSetsByTarget)).toBe(false);

    mocks.store.builtinRuleEdits = {};
    renderCategories({ 0: new Set(["core"]) });
    card = mocks.captures.moduleCards[0];
    expect(getEffectiveModuleRuleItems(card.module, card.ruleSetsByTarget, card.hiddenPresetRuleIds)
      .map((rule) => rule.id)).toContain("moved-rule");
    expect(card.ruleSetsByTarget[targetId] ?? []).toEqual([]);
  });

  it.each([true, false])("projects moved CN IP no-resolve=%s into the target group", (noResolve) => {
    mocks.store.customRuleSets = [];
    mocks.store.cnIpNoResolve = noResolve;
    mocks.store.builtinRuleEdits = {
      "module:cn:cn-ip": { target: { kind: "module", id: "auto" } },
    };
    renderCategories({ 0: new Set(["core"]) });
    expect(mocks.captures.moduleCards[0].ruleSetsByTarget.auto).toEqual([
      expect.objectContaining({ id: "cn-ip", noResolve }),
    ]);
  });

  it.each([{ kind: "module", id: "auto" }, { kind: "custom", id: "missing" }])(
    "keeps the source active when the saved target resolves to its default: %j", (target) => {
      mocks.store.customRuleSets = [];
      mocks.store.builtinRuleEdits = { "module:auto:moved-rule": { target } };
      renderCategories({ 0: new Set(["core"]) });
      const card = mocks.captures.moduleCards[0];
      expect(card.hiddenPresetRuleIds.auto ?? []).toEqual([]);
      expect(isModuleRuleMovedFrom("auto", "moved-rule", card.ruleSetsByTarget)).toBe(false);
      expect(getEffectiveModuleRuleItems(card.module, card.ruleSetsByTarget, card.hiddenPresetRuleIds)
        .filter((rule) => rule.id === "moved-rule")).toHaveLength(1);
    },
  );

  it("builds proxy-group previews from effective nodes", () => {
    mocks.store.nodes = [
      {
        name: "TAG-Notice",
        _originName: "套餐到期提醒",
        type: "ss",
        server: "notice.example.com",
        port: 8388,
        cipher: "aes-128-gcm",
        password: "secret",
      },
      {
        name: "US",
        type: "ss",
        server: "us.example.com",
        port: 8388,
        cipher: "aes-128-gcm",
        password: "secret",
      },
    ];
    mocks.store.nodeNameFilter = {
      enabled: true,
      excludeRegexes: ["套餐到期"],
    };

    renderCategories({ 0: new Set(["core"]) });

    expect(vi.mocked(generateProxyGroups)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ name: "US" })],
      }),
    );
  });

  it("renders custom category and disabled non-core module branches", async () => {
    mocks.store.hiddenProxyGroups = [];
    mocks.store.enabledProxyGroups = [];
    mocks.store.dialerProxyGroups = [null, { name: "  " }];
    const { setters } = renderCategories({ 0: new Set(["custom", "core"]) });
    expect(mocks.captures.customPanelRendered).toBe(true);
    expect(mocks.captures.moduleCards).toHaveLength(2);

    const nonCoreCard = { ...mocks.captures.moduleCards[1], isCore: false };
    nonCoreCard.onToggleEnabled();
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("fallback");

    mocks.confirmDialog.mockResolvedValueOnce(false);
    await mocks.captures.moduleCards[0].onHide();
    expect(mocks.store.hideProxyGroup).not.toHaveBeenCalled();

    expect(setters[0]).toBeDefined();
  });

  it("handles unknown rule targets and generated groups without proxy arrays", () => {
    mocks.store.nodes = [{ name: "US", type: "ss", server: "us.example.com", port: 8388, cipher: "aes-128-gcm", password: "secret" }];
    mocks.store.customRuleSets = [
      { id: "unknown-target", name: "Unknown", behavior: "domain", path: "geosite/unknown.mrs", target: "Missing" },
    ];
    vi.mocked(generateProxyGroups).mockReturnValueOnce([
      { name: "Auto Override", type: "select", proxies: "bad" },
    ] as never);

    renderCategories({ 0: new Set(["core"]) });

    expect(mocks.captures.moduleCards[0].nodeCount).toBe(0);
    expect(mocks.captures.moduleCards[0].extraRules).toEqual([]);
  });

  it("toggles category expansion through the rendered category headers", () => {
    const { tree, setters } = renderCategoryTree({ 0: new Set(["core"]) });
    const categoryButtons = collectElements(
      tree,
      (element) => element.type === "button" && String(element.props.className || "").includes("w-full flex")
    );

    categoryButtons[0].props.onClick();
    expect(setters[0]).toHaveBeenCalledWith(expect.any(Function));
    expect((setters[0] as any).lastValue.has("core")).toBe(false);

    categoryButtons[2].props.onClick();
    expect((setters[0] as any).lastValue.has("custom")).toBe(true);
  });
});
