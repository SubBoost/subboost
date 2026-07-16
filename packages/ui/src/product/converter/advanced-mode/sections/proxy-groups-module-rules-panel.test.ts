import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any[]>,
  confirmDialog: vi.fn(),
  effectiveRules: [] as any[],
  excludedRuleIds: new Set<string>(),
  isMoved: vi.fn(),
  rulesApi: {
    loadCnCandidateRules: vi.fn(),
  },
}));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  effects: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      if (!stateMock.enabled) return actual.useEffect(effect);
      const cleanup = effect();
      if (typeof cleanup === "function") stateMock.effects.push(cleanup);
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
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

vi.mock("@radix-ui/react-popover", () => ({
  Root: (props: any) => React.createElement(React.Fragment, null, props.children),
  Trigger: (props: any) => React.createElement(React.Fragment, null, props.children),
  Portal: (props: any) => React.createElement(React.Fragment, null, props.children),
  Content: ({ children, sideOffset: _sideOffset, ...props }: any) => React.createElement("div", props, children),
  Arrow: () => null,
}));
vi.mock("lucide-react", () => ({
  HelpCircle: () => null,
  Plus: () => null,
  RotateCcw: () => null,
  Trash2: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return React.createElement("button", { type: "button", "aria-pressed": props.checked });
  },
}));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "cn", name: "CN", rules: [] },
    { id: "auto", name: "Auto", rules: [] },
    { id: "hidden", name: "Hidden", rules: [] },
  ],
}));
vi.mock("@subboost/core/generator/module-rules", () => ({
  getEffectiveModuleRuleItems: () => mocks.effectiveRules,
  getExcludedModuleRuleIds: () => mocks.excludedRuleIds,
  isModuleRuleMovedFrom: mocks.isMoved,
}));
vi.mock("@subboost/core/generator/rules", () => ({
  EXPERIMENTAL_CN_RULE: {
    id: "experimental-cn",
    name: "中国业务实验规则",
    behavior: "domain",
    path: "rule-set/experimental-cn.mrs",
  },
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { id: string; name: string }, override?: string) => override || module.name,
}));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ") }));
vi.mock("@subboost/ui/product/api-adapter", () => ({ useProductApiAdapter: () => ({ rules: mocks.rulesApi }) }));
vi.mock("./proxy-group-rule-row", () => ({
  ProxyGroupManualRuleRow: (props: any) => {
    mocks.captures.manualRows.push(props);
    return React.createElement("div", null, `manual:${props.item.rule.id}`);
  },
  ProxyGroupRuleMoveMenu: (props: any) => {
    mocks.captures.moveMenus.push(props);
    return React.createElement("button", { type: "button", title: props.title }, props.title);
  },
  ProxyGroupRuleSetRow: (props: any) => {
    mocks.captures.ruleRows.push(props);
    return React.createElement("div", null, props.name, props.actions);
  },
  isRuleSetMoveTarget: (value: any) => Boolean(value && (value.kind === "module" || value.kind === "custom")),
}));
vi.mock("./proxy-groups-module-rules-help", () => ({
  CnIpNoResolveHelpButton: () => null,
  ExperimentalCnRuleHelpButton: () => null,
}));

import { ProxyGroupsModuleRulesPanel } from "./proxy-groups-module-rules-panel";

const cnModule = {
  id: "cn",
  name: "CN",
  rules: [
    { id: "cn-ip", name: "CN IP", behavior: "ipcidr", path: "rule-set/cn-ip.mrs", noResolve: true },
    { id: "removed-rule", name: "Removed", behavior: "domain", path: "rule-set/removed.mrs" },
  ],
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    module: cnModule,
    enabledProxyGroups: ["cn", "auto"],
    hiddenProxyGroups: ["hidden"],
    ruleSetsByTarget: {},
    hiddenPresetRuleIds: {},
    customProxyGroups: [{ id: "custom-1", name: "Custom Group", rules: [] }],
    manualRules: [],
    manualRuleTargets: [{ name: "Auto" }],
    proxyGroupNameOverrides: { cn: "国内服务", auto: "自动选择" },
    moduleRuleEditWarningAccepted: false,
    acceptModuleRuleEditWarning: vi.fn(),
    onAddRules: vi.fn(),
    onAddRulesToModule: vi.fn(),
    onAddRuleToCustomGroup: vi.fn(),
    onRemoveRule: vi.fn(),
    onMoveRule: vi.fn(),
    onMoveManualRule: vi.fn(),
    onRemoveManualRule: vi.fn(),
    onRestoreRule: vi.fn(),
    onResetRuleTarget: vi.fn(),
    cnIpNoResolve: true,
    onChangeCnIpNoResolve: vi.fn(),
    experimentalCnUseCnRuleSet: true,
    onChangeExperimentalCnUseCnRuleSet: vi.fn(),
    ...overrides,
  } as any;
}

function renderPanel(props = baseProps(), overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  stateMock.effects = [];
  mocks.captures = { buttons: [], manualRows: [], moveMenus: [], ruleRows: [], switches: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsModuleRulesPanel, props));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ProxyGroupsModuleRulesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effectiveRules = [
      { id: "cn-ip", name: "CN IP", behavior: "ipcidr", path: "rule-set/cn-ip.mrs", source: "preset", noResolve: true },
      { id: "custom-active", name: "Custom Active", behavior: "domain", path: "rule-set/custom.mrs", source: "custom" },
    ];
    mocks.excludedRuleIds = new Set(["removed-rule"]);
    mocks.isMoved.mockReturnValue(true);
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.rulesApi.loadCnCandidateRules = vi.fn();
    mocks.rulesApi.loadCnCandidateRules.mockResolvedValue([
      { id: "candidate-1", name: " Candidate ", behavior: "domain", path: "rule-set/candidate.mrs", parentRuleId: "parent" },
      { id: "bad", behavior: "ipcidr", path: "bad.mrs" },
    ]);
  });

  it("renders active, removed, manual, and experimental rules and wires rule actions", async () => {
    const props = baseProps({
      manualRules: [{ index: 0, rule: { id: "manual-1", type: "DOMAIN", value: "example.com", target: "国内服务" } }],
    });
    const { setters } = renderPanel(props);
    await flushAsyncWork();

    expect(mocks.captures.ruleRows.map((row) => row.name)).toEqual(["CN IP", "Custom Active", "Removed"]);
    expect(mocks.captures.ruleRows[0].noResolve).toBe(true);
    expect(mocks.captures.ruleRows[2].state).toBe("moved");
    expect(mocks.captures.manualRows[0].currentTargetName).toBe("国内服务");
    expect((setters[0] as any).lastValue).toEqual([
      { id: "candidate-1", name: "Candidate", behavior: "domain", path: "rule-set/candidate.mrs", parentRuleId: "parent", parentModuleId: undefined },
    ]);

    mocks.captures.switches[0].onCheckedChange(false);
    expect(props.onChangeCnIpNoResolve).toHaveBeenCalledWith(false);

    await mocks.captures.buttons.find((button) => button.title === "删除规则集").onClick();
    expect(mocks.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: "确认修改预设规则集？" }));
    expect(props.acceptModuleRuleEditWarning).toHaveBeenCalled();
    expect(props.onRemoveRule).toHaveBeenCalledWith("cn-ip");

    mocks.captures.moveMenus[0].onMove({ kind: "custom", id: "custom-1" });
    await flushAsyncWork();
    expect(props.onMoveRule).toHaveBeenCalledWith("cn-ip", { kind: "custom", id: "custom-1" });

    mocks.captures.buttons.find((button) => button["aria-label"] === "恢复默认目标 Removed 规则集").onClick();
    expect(props.onResetRuleTarget).toHaveBeenCalledWith("removed-rule");

    const manualTarget = { kind: "module", id: "auto", name: "自动选择" };
    mocks.captures.manualRows[0].onMove(mocks.captures.manualRows[0].item, manualTarget);
    expect(props.onMoveManualRule).toHaveBeenCalledWith("manual-1", manualTarget);
    mocks.captures.manualRows[0].onRemove({ index: 0 });
    expect(props.onRemoveManualRule).toHaveBeenCalledWith(0);
  });

  it("moves, removes, restores, and adds CN experimental and candidate rule sets", () => {
    const props = baseProps();
    renderPanel(props, {
      0: [{ id: "candidate-1", name: "Candidate", behavior: "domain", path: "rule-set/candidate.mrs", parentRuleId: "parent" }],
    });

    const experimentalMoveMenu = mocks.captures.moveMenus.find((menu) => menu.ariaLabel === "移动 中国业务实验规则 规则集");
    experimentalMoveMenu.onMove({ kind: "module", id: "auto" });
    expect(props.onAddRulesToModule).toHaveBeenCalledWith("auto", [
      { id: "experimental-cn", name: "中国业务实验规则", behavior: "domain", path: "rule-set/experimental-cn.mrs" },
    ]);
    expect(props.onChangeExperimentalCnUseCnRuleSet).toHaveBeenCalledWith(false);

    mocks.captures.buttons.find((button) => button["aria-label"] === "删除 中国业务实验规则 规则集").onClick();
    expect(props.onChangeExperimentalCnUseCnRuleSet).toHaveBeenCalledWith(false);

    mocks.captures.buttons.find((button) => button["aria-label"] === "启用 Candidate 规则集").onClick();
    expect(props.onAddRules).toHaveBeenCalledWith([
      { id: "candidate-1", name: "Candidate", behavior: "domain", path: "rule-set/candidate.mrs" },
    ]);

    const disabledProps = baseProps({ experimentalCnUseCnRuleSet: false });
    const disabledResult = renderPanel(disabledProps);
    expect(disabledResult.html).toContain("已移除");
    mocks.captures.buttons.find((button) => button["aria-label"] === "恢复 中国业务实验规则 规则集").onClick();
    expect(disabledProps.onChangeExperimentalCnUseCnRuleSet).toHaveBeenCalledWith(true);
  });

  it("renders an empty non-CN module and skips preset confirmation after it was accepted", async () => {
    mocks.effectiveRules = [];
    mocks.excludedRuleIds = new Set();
    const autoModule = { id: "auto", name: "Auto", rules: [] };
    const emptyProps = baseProps({
      module: autoModule,
      manualRules: [],
      moduleRuleEditWarningAccepted: true,
      experimentalCnUseCnRuleSet: false,
    });
    const { html } = renderPanel(emptyProps);

    expect(html).toContain("当前没有生效的规则集");
    expect((stateMock.setters[0] as any).lastValue).toEqual([]);
    expect(mocks.rulesApi.loadCnCandidateRules).not.toHaveBeenCalled();

    mocks.effectiveRules = [{ id: "auto-rule", name: "Auto Rule", behavior: "domain", path: "rule-set/auto.mrs", source: "preset" }];
    renderPanel(emptyProps);
    await mocks.captures.buttons.find((button) => button.title === "删除规则集").onClick();
    expect(mocks.confirmDialog).not.toHaveBeenCalled();
    expect(emptyProps.onRemoveRule).toHaveBeenCalledWith("auto-rule");
  });

  it("normalizes exclusion keys and cleans up candidate rule loading paths", async () => {
    const props = baseProps({
      hiddenPresetRuleIds: { cn: [" removed-rule ", " "], auto: ["auto-rule"] },
    });
    renderPanel(props);
    await flushAsyncWork();
    expect(mocks.rulesApi.loadCnCandidateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedRuleKeys: ["auto:auto-rule", "cn:removed-rule"],
      })
    );
    stateMock.effects[0]();

    mocks.rulesApi.loadCnCandidateRules.mockRejectedValueOnce(new Error("offline"));
    renderPanel(baseProps());
    await flushAsyncWork();
    expect((stateMock.setters[0] as any).lastValue).toEqual([]);

    mocks.rulesApi.loadCnCandidateRules = undefined as any;
    renderPanel(baseProps());
    expect((stateMock.setters[0] as any).lastValue).toEqual([]);
    stateMock.effects[0]();
  });

  it("normalizes odd candidate payloads and ignores stale candidate loads", async () => {
    mocks.rulesApi.loadCnCandidateRules.mockResolvedValueOnce([
      null,
      "bad",
      { id: "missing-path", behavior: "domain" },
      { id: "wrong-behavior", behavior: "ipcidr", path: "bad.mrs" },
      { id: "fallback-name", name: "   ", behavior: "domain", path: "rule-set/fallback.mrs", parentRuleId: 123 },
      { id: "parent-module", name: "Parent Module", behavior: "domain", path: "rule-set/parent.mrs", parentModuleId: "cn" },
    ]);
    renderPanel(baseProps({ enabledProxyGroups: [" ", ""], hiddenPresetRuleIds: undefined }));
    await flushAsyncWork();
    expect((stateMock.setters[0] as any).lastValue).toEqual([
      { id: "fallback-name", name: "fallback-name", behavior: "domain", path: "rule-set/fallback.mrs", parentRuleId: undefined, parentModuleId: undefined },
      { id: "parent-module", name: "Parent Module", behavior: "domain", path: "rule-set/parent.mrs", parentRuleId: undefined, parentModuleId: "cn" },
    ]);
    expect(mocks.rulesApi.loadCnCandidateRules).toHaveBeenCalledWith(expect.objectContaining({ moduleIds: [], excludedRuleKeys: [] }));

    mocks.rulesApi.loadCnCandidateRules.mockResolvedValueOnce(undefined);
    renderPanel(baseProps());
    await flushAsyncWork();
    expect((stateMock.setters[0] as any).lastValue).toEqual([]);

    let resolveLoad: (items: any[]) => void = () => undefined;
    mocks.rulesApi.loadCnCandidateRules.mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve; }));
    renderPanel(baseProps());
    stateMock.effects[0]();
    resolveLoad([{ id: "late", name: "Late", behavior: "domain", path: "rule-set/late.mrs" }]);
    await flushAsyncWork();
    expect(stateMock.setters[0]).not.toHaveBeenCalled();

    let rejectLoad: (error: Error) => void = () => undefined;
    mocks.rulesApi.loadCnCandidateRules.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectLoad = reject; }));
    renderPanel(baseProps());
    stateMock.effects[0]();
    rejectLoad(new Error("late failure"));
    await flushAsyncWork();
    expect(stateMock.setters[0]).not.toHaveBeenCalled();
  });

  it("keeps preset edits cancellable while allowing custom rule actions", async () => {
    mocks.effectiveRules = [
      { id: "preset-active", name: "Preset Active", behavior: "domain", path: "rule-set/preset.mrs", source: "preset" },
    ];
    mocks.confirmDialog.mockResolvedValueOnce(false);
    const cancelProps = baseProps();
    renderPanel(cancelProps);

    await mocks.captures.buttons.find((button) => button.title === "删除规则集").onClick();
    expect(cancelProps.acceptModuleRuleEditWarning).not.toHaveBeenCalled();
    expect(cancelProps.onRemoveRule).not.toHaveBeenCalled();

    mocks.confirmDialog.mockResolvedValueOnce(false);
    mocks.captures.moveMenus.find((menu) => menu.ariaLabel === "移动 Preset Active 规则集").onMove({ kind: "module", id: "auto" });
    await flushAsyncWork();
    expect(cancelProps.onMoveRule).not.toHaveBeenCalled();
    mocks.confirmDialog.mockClear();

    mocks.effectiveRules = [
      { id: "custom-active", name: "Custom Active", behavior: "domain", path: "rule-set/custom.mrs", source: "custom" },
    ];
    const customProps = baseProps();
    renderPanel(customProps);

    mocks.captures.moveMenus.find((menu) => menu.ariaLabel === "移动 Custom Active 规则集").onMove({ kind: "bad" });
    expect(customProps.onMoveRule).not.toHaveBeenCalled();
    mocks.captures.moveMenus.find((menu) => menu.ariaLabel === "移动 Custom Active 规则集").onMove({ kind: "custom", id: "custom-1" });
    await flushAsyncWork();
    expect(mocks.confirmDialog).not.toHaveBeenCalled();
    expect(customProps.onMoveRule).toHaveBeenCalledWith("custom-active", { kind: "custom", id: "custom-1" });

    mocks.captures.buttons.find((button) => button.title === "删除规则集").onClick();
    expect(customProps.onRemoveRule).toHaveBeenCalledWith("custom-active");
  });

  it("renders removed inactive rules and moves the experimental CN rule to custom groups", () => {
    mocks.effectiveRules = [];
    mocks.excludedRuleIds = new Set(["cn-ip"]);
    mocks.isMoved.mockReturnValue(false);
    const props = baseProps({
      cnIpNoResolve: false,
      hiddenPresetRuleIds: { cn: ["cn-ip"] },
    });
    renderPanel(props);

    expect(mocks.captures.ruleRows[0]).toEqual(expect.objectContaining({ name: "CN IP", state: "removed", noResolve: false }));
    expect(mocks.captures.buttons.find((button) => button["aria-label"] === "恢复 CN IP 规则集")).toBeTruthy();

    const experimentalMoveMenu = mocks.captures.moveMenus.find((menu) => menu.ariaLabel === "移动 中国业务实验规则 规则集");
    experimentalMoveMenu.onMove({ kind: "bad" });
    expect(props.onAddRuleToCustomGroup).not.toHaveBeenCalled();
    experimentalMoveMenu.onMove({ kind: "custom", id: "custom-1" });
    expect(props.onAddRuleToCustomGroup).toHaveBeenCalledWith("custom-1", {
      id: "experimental-cn",
      name: "中国业务实验规则",
      behavior: "domain",
      path: "rule-set/experimental-cn.mrs",
    });
    expect(props.onChangeExperimentalCnUseCnRuleSet).toHaveBeenCalledWith(false);
  });
});
