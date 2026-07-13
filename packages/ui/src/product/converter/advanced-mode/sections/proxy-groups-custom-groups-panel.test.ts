import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  interactions: {
    proxyGroupAdded: vi.fn(),
  },
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
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
  Check: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Pencil: () => null,
  Shuffle: () => null,
  SlidersHorizontal: () => null,
  Trash2: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    {
      id: "auto",
      name: "Auto",
      rules: [{ id: "builtin-a", name: "Builtin A", behavior: "domain", path: "geosite/builtin-a.mrs" }],
    },
    { id: "fallback", name: "Fallback", rules: [] },
  ],
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  normalizeGroupNameWithDefaultEmoji: (raw: string, emoji: string) => ({ emoji, full: raw.startsWith(emoji) ? raw : `${emoji} ${raw}` }),
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) => override || module.name,
  splitLeadingEmoji: (name: string) => {
    const match = name.trim().match(/^(\S+)\s+(.+)$/);
    if (!match || /[A-Za-z0-9\u4e00-\u9fff]/.test(match[1])) {
      return { hasEmojiPrefix: false, emoji: "", label: name.trim() };
    }
    return { hasEmojiPrefix: true, emoji: match[1], label: match[2] };
  },
}));
vi.mock("@subboost/core/rules/custom-routing-rule-sets", () => ({
  extractRuleSetPathFromUrl: (url: string) => url.replace(/^https?:\/\/rules\.example\//, ""),
}));
vi.mock("@subboost/core/types/config", () => ({ DEFAULT_LOAD_BALANCE_STRATEGY: "consistent-hashing" }));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return { useConfigStore };
});
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => mocks.interactions }));
vi.mock("./proxy-group-rule-targets", () => ({
  buildManualRuleTargets: vi.fn(() => [{ name: "Auto" }]),
  listCustomRulesForTarget: (_rules: any[], target: string) =>
    target === "🧩 Custom" ? [{ rule: { id: "manual-1" }, index: 0 }] : [],
}));
vi.mock("./proxy-group-rule-row", () => ({
  ProxyGroupManualRuleRow: (props: any) => {
    mocks.captures.manualRows.push(props);
    return null;
  },
  ProxyGroupRuleMoveMenu: (props: any) => {
    mocks.captures.moveMenus.push(props);
    return null;
  },
  ProxyGroupRuleSetRow: (props: any) => {
    mocks.captures.ruleRows.push(props);
    return props.actions;
  },
  isRuleSetMoveTarget: (value: unknown) => Boolean(value && typeof value === "object"),
}));
vi.mock("./proxy-group-type-menu", () => ({
  ProxyGroupTypeMenu: (props: any) => {
    mocks.captures.typeMenus.push(props);
    return props.trigger ?? null;
  },
  getLoadBalanceStrategyLabel: (value: string) => `strategy:${value}`,
  getProxyGroupTypeLabel: (value: string) => `type:${value}`,
}));

import { ProxyGroupsCustomGroupsPanel } from "./proxy-groups-custom-groups-panel";

const sourceRule = {
  id: "rule-a",
  name: "Rule A",
  behavior: "domain",
  path: "geosite/rule-a.mrs",
  target: "🧩 Custom",
  noResolve: true,
};

const customGroup = {
  id: "custom-1",
  name: "🧩 Custom",
  emoji: "🧩",
  groupType: "select",
};

const targetGroup = {
  id: "custom-2",
  name: "Target",
  emoji: "🧩",
  groupType: "select",
};

function renderPanel(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.typeMenus = [];
  mocks.captures.ruleRows = [];
  mocks.captures.manualRows = [];
  mocks.captures.moveMenus = [];
  try {
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsCustomGroupsPanel));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("ProxyGroupsCustomGroupsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [], inputs: [], typeMenus: [], ruleRows: [], manualRows: [], moveMenus: [] };
    mocks.store = {
      ruleProviderBaseUrl: "https://rules.example/",
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: [],
      proxyGroupNameOverrides: { auto: "Auto" },
      customRules: [{ id: "manual-1", target: "🧩 Custom" }],
      customProxyGroups: [customGroup, targetGroup],
      customRuleSets: [sourceRule],
      builtinRuleEdits: {},
      dialerProxyGroups: [{ name: "Dialer" }],
      addCustomProxyGroup: vi.fn(),
      removeCustomProxyGroup: vi.fn(),
      updateCustomProxyGroup: vi.fn(),
      moveModuleRule: vi.fn(),
      removeModuleRule: vi.fn(),
      updateCustomRule: vi.fn(),
      removeCustomRule: vi.fn(),
      toggleProxyGroup: vi.fn(),
      addModuleRules: vi.fn(),
    };
  });

  it("adds manual groups with a random reset emoji and rejects duplicates", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { setters } = renderPanel({ 1: { emoji: "🧩", name: "New" }, 2: "Useful group" });

    const nameInput = mocks.captures.inputs.find((props: any) => props.placeholder === "自定义分组名称");
    nameInput.onChange({ target: { value: "Typed" } });
    expect(setters[1]).toHaveBeenCalledWith({ emoji: "🧩", name: "Typed" });
    const descriptionInput = mocks.captures.inputs.find((props: any) => props.placeholder === "描述文本（默认: 自定义代理组）");
    descriptionInput.onChange({ target: { value: "Next description" } });
    expect(setters[2]).toHaveBeenCalledWith("Next description");

    expect(mocks.captures.typeMenus.every((props: any) => props.trigger)).toBe(true);

    mocks.captures.buttons.find((props: any) => props.title === "新增").onClick();
    expect(mocks.store.addCustomProxyGroup).toHaveBeenCalledWith({
      name: "🧩 New",
      emoji: "🧩",
      description: "Useful group",
      groupType: "select",
    });
    expect(mocks.interactions.proxyGroupAdded).toHaveBeenCalledWith({ groupType: "select" });
    expect(setters[1]).toHaveBeenCalledWith({ emoji: "🚀", name: "" });
    expect(setters[2]).toHaveBeenCalledWith("");

    renderPanel({ 1: { emoji: "🧩", name: "Custom" } });
    mocks.captures.buttons.find((props: any) => props.title === "新增").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "代理组名称已存在，请换一个名称。", variant: "warning" }));
  });

  it("ignores blank new group names and always adds as manual select", () => {
    renderPanel({ 1: { emoji: "🧩", name: "   " } });
    mocks.captures.buttons.find((props: any) => props.title === "新增").onClick();
    expect(mocks.store.addCustomProxyGroup).not.toHaveBeenCalled();

    renderPanel({ 1: { emoji: "🧩", name: "Balanced" }, 2: "  LB group  " });
    mocks.captures.buttons.find((props: any) => props.title === "新增").onClick();
    expect(mocks.store.addCustomProxyGroup).toHaveBeenCalledWith({
      name: "🧩 Balanced",
      emoji: "🧩",
      description: "LB group",
      groupType: "select",
    });
  });

  it("renames, removes, and changes existing group type", () => {
    const { setters } = renderPanel({ 0: new Set(["custom-1"]), 3: "custom-1", 4: "🧩 Renamed", 5: "" });

    const renameInput = mocks.captures.inputs.find((props: any) => props.autoFocus);
    renameInput.onChange({ target: { value: "Typed Rename" } });
    expect(setters[4]).toHaveBeenCalledWith("🧩 Typed Rename");
    renameInput.onKeyDown({ key: "Enter" });
    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", {
      name: "🧩 Renamed",
      emoji: "🧩",
      description: "",
    });
    renameInput.onKeyDown({ key: "Escape" });
    expect(setters[3]).toHaveBeenCalledWith(null);

    renderPanel({ 0: new Set(["custom-1"]) });
    mocks.captures.typeMenus[0].onChange({ groupType: "load-balance", strategy: "round-robin" });
    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", {
      groupType: "load-balance",
      strategy: "round-robin",
    });

    mocks.captures.buttons.find((props: any) => props.title === "删除").onClick({ stopPropagation: vi.fn() });
    expect(mocks.store.removeCustomProxyGroup).toHaveBeenCalledWith("custom-1");
  });

  it("moves custom rule sets to custom groups or modules", () => {
    renderPanel({ 0: new Set(["custom-1"]) });
    expect(mocks.captures.moveMenus[0].kinds).toEqual(["module", "custom"]);

    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "custom-2", name: "Target" });
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("custom-1", "rule-a", {
      kind: "custom",
      id: "custom-2",
      name: "Target",
    });

    mocks.store.moveModuleRule.mockClear();
    mocks.store.customRuleSets = [sourceRule, { ...sourceRule, target: "Target" }];
    renderPanel({ 0: new Set(["custom-1"]) });
    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "custom-2", name: "Target" });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "规则集已存在", variant: "warning" }));
    expect(mocks.store.moveModuleRule).not.toHaveBeenCalled();

    mocks.store.customProxyGroups = [customGroup, targetGroup];
    mocks.store.customRuleSets = [sourceRule];
    mocks.store.enabledProxyGroups = [];
    renderPanel({ 0: new Set(["custom-1"]) });
    mocks.captures.moveMenus[0].onMove({ kind: "module", id: "fallback", name: "Fallback" });
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("custom-1", "rule-a", {
      kind: "module",
      id: "fallback",
      name: "Fallback",
    });

  });

  it("shows builtin rules moved into a custom group and wires their actions", () => {
    mocks.store.builtinRuleEdits = {
      "module:auto:builtin-a": { target: { kind: "custom", id: "custom-1" } },
    };

    renderPanel({ 0: new Set(["custom-1"]) });

    expect(mocks.captures.ruleRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Builtin A", source: "preset", state: "moved" }),
      ]),
    );
    const builtinMove = mocks.captures.moveMenus.find((menu: any) => menu.ariaLabel === "移动 Builtin A 规则集");
    builtinMove.onMove({ kind: "module", id: "fallback", name: "Fallback" });
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("auto", "builtin-a", {
      kind: "module",
      id: "fallback",
      name: "Fallback",
    });

    mocks.captures.buttons.find((button: any) => button["aria-label"] === "删除 Builtin A 规则集").onClick();
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith("custom-1", "builtin-a");
  });

  it("updates manual rules, deletes rule rows, and renders empty state", () => {
    renderPanel({ 0: new Set(["custom-1"]) });

    mocks.captures.manualRows[0].onMove(
      { rule: { id: "manual-1" }, index: 0 },
      { kind: "module", id: "auto", name: "Auto" },
    );
    expect(mocks.store.updateCustomRule).toHaveBeenCalledWith("manual-1", {
      target: { kind: "module", id: "auto" },
    });
    mocks.captures.manualRows[0].onRemove({ index: 0 });
    expect(mocks.store.removeCustomRule).toHaveBeenCalledWith(0);

    mocks.captures.buttons.find((props: any) => props["aria-label"] === "删除 Rule A 规则集").onClick();
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith("custom-1", "rule-a");

    mocks.store.customProxyGroups = [];
    renderPanel();
    expect(mocks.captures.ruleRows).toEqual([]);
  });

  it("covers custom group edit controls and duplicate rename guard", () => {
    mocks.store.customProxyGroups = [customGroup, { ...targetGroup, name: "🧩 Target" }];
    const { setters } = renderPanel({ 0: new Set(["custom-1"]), 3: "custom-1", 4: "🧩 Target", 5: "" });

    const renameInput = mocks.captures.inputs.find((props: any) => props.autoFocus);
    renameInput.onKeyDown({ key: "Enter" });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "代理组名称已存在，请换一个名称。", variant: "warning" })
    );
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();

    mocks.captures.buttons.find((props: any) => props.title === "保存").onClick();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();

    mocks.captures.buttons.find((props: any) => props.title === "取消").onClick();
    expect(setters[3]).toHaveBeenCalledWith(null);
    expect(setters[4]).toHaveBeenCalledWith("");
    expect(setters[5]).toHaveBeenCalledWith("");

    renderPanel({ 0: new Set(["custom-1"]) });
    const renameButton = mocks.captures.buttons.find((props: any) => props.title === "改名");
    const stopRenameClick = vi.fn();
    renameButton.onClick({ stopPropagation: stopRenameClick });
    expect(stopRenameClick).toHaveBeenCalled();
    expect(stateMock.setters[3]).toHaveBeenCalledWith("custom-1");
    expect(stateMock.setters[4]).toHaveBeenCalledWith("🧩 Custom");
    expect(stateMock.setters[5]).toHaveBeenCalledWith("");

    mocks.captures.typeMenus[0].onChange({ groupType: "select" });
    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", {
      groupType: "select",
      strategy: undefined,
    });
  });

  it("ignores blank custom group rename commits", () => {
    renderPanel({ 0: new Set(["custom-1"]), 3: "custom-1", 4: "   ", 5: "desc" });

    const renameInput = mocks.captures.inputs.find((props: any) => props.autoFocus);
    renameInput.onKeyDown({ key: "Enter" });

    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("handles custom rule-set move no-op and missing-target paths", () => {
    renderPanel({ 0: new Set(["custom-1"]) });
    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "custom-1", name: "🧩 Custom" });
    expect(mocks.store.moveModuleRule).not.toHaveBeenCalled();

    mocks.store.customProxyGroups = [];
    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "custom-2", name: "Target" });
    expect(mocks.store.moveModuleRule).not.toHaveBeenCalled();

    mocks.store.customProxyGroups = [customGroup, targetGroup];
    mocks.store.customRuleSets = [];
    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "custom-2", name: "Target" });
    expect(mocks.store.moveModuleRule).not.toHaveBeenCalled();

    mocks.store.customProxyGroups = [customGroup, targetGroup];
    mocks.store.customRuleSets = [sourceRule];
    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "missing", name: "Missing" });
    expect(mocks.store.moveModuleRule).not.toHaveBeenCalled();

    mocks.store.moveModuleRule.mockClear();
    mocks.store.enabledProxyGroups = ["fallback"];
    mocks.store.customProxyGroups = [customGroup, targetGroup];
    mocks.store.customRuleSets = [{ ...sourceRule, noResolve: false }];
    renderPanel({ 0: new Set(["custom-1"]) });
    mocks.captures.moveMenus[0].onMove({ kind: "module", id: "fallback", name: "Fallback" });
    expect(mocks.store.toggleProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("custom-1", "rule-a", {
      kind: "module",
      id: "fallback",
      name: "Fallback",
    });
  });

  it("renders load-balance labels, empty expanded groups, and ignores non-rule-set move values", () => {
    mocks.store.customProxyGroups = [
      {
        ...customGroup,
        groupType: "load-balance",
        strategy: undefined,
      },
      targetGroup,
    ];
    mocks.store.customRuleSets = [];
    const result = renderPanel({ 0: new Set(["custom-1", "custom-2"]) });
    expect(result.html).toContain("还没有规则集");

    expect(mocks.captures.moveMenus[0]).toBeUndefined();

    mocks.store.dialerProxyGroups = [null, { name: " " }];
    renderPanel({ 1: { emoji: "🧩", name: "Unique" } });
    mocks.captures.buttons.find((props: any) => props.title === "新增").onClick();
    expect(mocks.store.addCustomProxyGroup).toHaveBeenCalledWith({
      name: "🧩 Unique",
      emoji: "🧩",
      description: "",
      groupType: "select",
    });
  });
});
