import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stateMock = vi.hoisted(() => {
  const state = {
    value: {} as Record<string, string>,
    setter: vi.fn((next: React.SetStateAction<Record<string, string>>) => {
      state.value = typeof next === "function" ? next(state.value) : next;
      return state.value;
    }),
  };
  return state;
});

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, any>,
  entries: [] as Array<Record<string, any>>,
  confirmDialog: vi.fn(),
  buildGeneratedRuleEntries: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useMemo: (factory: () => unknown) => factory(),
    useState: () => [stateMock.value, stateMock.setter],
  };
});
vi.mock("lucide-react", () => ({
  ArrowDown: () => null,
  ArrowUp: () => null,
  ListOrdered: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => React.createElement("input", props),
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => React.createElement("button", props),
}));
vi.mock("@subboost/core/generator/rules", () => ({
  buildGeneratedRuleEntries: mocks.buildGeneratedRuleEntries,
  hasFullRuleOrderKeys: (ruleOrder: string[] | undefined) =>
    Array.isArray(ruleOrder) && ruleOrder.some((key) => key.startsWith("module:") || key.startsWith("special:")),
}));
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.store }));
vi.mock("../section-header", () => ({
  SectionHeader: (props: any) => React.createElement("header", props, props.title, props.badge),
}));

import { RulesManagementSection } from "./rules-management-section";

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

function collectText(node: React.ReactNode, out: string[] = []) {
  React.Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      out.push(String(child));
      return;
    }
    if (React.isValidElement(child)) {
      collectText((child.props as { children?: React.ReactNode }).children, out);
    }
  });
  return out.join("");
}

function renderSection(overrides: Record<string, unknown> = {}) {
  mocks.store = {
    enabledProxyGroups: ["core"],
    customRules: [{ id: "custom" }],
    customProxyGroups: [],
    customRuleSets: [],
    builtinRuleEdits: {},
    proxyGroupNameOverrides: {},
    cnIpNoResolve: true,
    experimentalCnUseCnRuleSet: true,
    ruleOrder: ["custom:one"],
    setRuleOrder: vi.fn(),
    ...overrides,
  };
  stateMock.setter.mockClear();
  return RulesManagementSection({ isExpanded: true, onToggle: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  stateMock.value = {};
  mocks.entries = [
    {
      key: "module:geo",
      editable: false,
      summary: "系统 GEO",
      sourceLabel: "系统规则",
      target: "DIRECT",
      noResolve: true,
      text: "GEOIP,CN,DIRECT,no-resolve",
    },
    {
      key: "custom:one",
      editable: true,
      summary: "自定义规则",
      sourceLabel: "用户规则",
      target: "节点选择",
      noResolve: false,
      text: "DOMAIN-SUFFIX,example.com,节点选择",
    },
    {
      key: "special:match",
      editable: false,
      summary: "兜底规则",
      sourceLabel: "系统规则",
      target: "MATCH",
      noResolve: false,
      text: "MATCH,DIRECT",
    },
  ];
  mocks.buildGeneratedRuleEntries.mockImplementation(() => mocks.entries);
});

describe("RulesManagementSection", () => {
  it("renders rule counts, generated entries, source labels, and disabled controls", () => {
    const tree = renderSection();
    const text = collectText(tree);
    const header = collectElements(tree, (element) => element.props.title === "规则管理")[0];
    const switchElement = collectElements(tree, (element) => Boolean((element.props as any).onCheckedChange))[0];
    const orderInputs = collectElements(tree, (element) => (element.props as any).title === "最终规则行号（1=最前）");

    expect(header.props.title).toBe("规则管理");
    expect(collectText(header.props.badge)).toContain("可调 1 / 全部 3");
    expect(text).toContain("默认只能调整自定义规则顺序。");
    expect(text).toContain("系统 GEO");
    expect(text).toContain("自定义规则");
    expect(text).toContain("no-resolve");
    expect(switchElement.props.disabled).toBe(false);
    expect(orderInputs.map((input) => input.props.disabled)).toEqual([true, false, true]);
    expect(mocks.buildGeneratedRuleEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        enabledModules: ["core"],
        cnIpNoResolve: true,
        ruleOrder: ["custom:one"],
      })
    );
  });

  it("keeps visible rule tags out of details and keeps order controls row-based", () => {
    mocks.entries = [
      {
        key: "custom-rule:ip",
        editable: true,
        summary: "35.212.230.0/24",
        sourceLabel: "自定义规则",
        target: "🚀 节点选择",
        noResolve: false,
        text: "IP-CIDR,35.212.230.0/24,🚀 节点选择",
      },
      {
        key: "special:match",
        editable: false,
        summary: "兜底规则",
        sourceLabel: "系统规则",
        target: "MATCH",
        noResolve: false,
        text: "MATCH,DIRECT",
      },
    ];

    const defaultTree = renderSection();
    const allRulesTree = renderSection({ ruleOrder: ["custom-rule:ip", "special:match"] });
    const detail = collectElements(
      defaultTree,
      (element) =>
        typeof element.props.className === "string" &&
        element.props.className.includes("rule-management-entry-detail"),
    )[0];
    const titleLine = collectElements(
      defaultTree,
      (element) =>
        typeof element.props.className === "string" &&
        element.props.className.includes("flex flex-wrap items-center gap-1.5"),
    )[0];
    const entryRow = collectElements(
      defaultTree,
      (element) =>
        typeof element.props.className === "string" &&
        element.props.className.includes("border-white/10 bg-white/5 px-3 py-1.5"),
    )[0];
    const row = collectElements(
      defaultTree,
      (element) =>
        typeof element.props.className === "string" &&
        element.props.className.includes("grid-cols-[minmax(0,1fr)_auto]"),
    )[0];
    const modeRows = [defaultTree, allRulesTree].map(
      (tree) =>
        collectElements(
          tree,
          (element) =>
            typeof element.props.className === "string" &&
            element.props.className.includes("flex min-w-0 flex-wrap"),
        )[0],
    );
    const orderControls = collectElements(
      defaultTree,
      (element) =>
        typeof element.props.className === "string" &&
        element.props.className.includes("min-w-[8.75rem]"),
    )[0];

    expect(collectText(titleLine)).toContain("35.212.230.0/24");
    expect(collectText(titleLine)).toContain("自定义规则");
    expect(collectText(titleLine)).toContain("🚀 节点选择");
    expect(collectText(titleLine)).not.toContain("IP-CIDR 35.212.230.0/24");
    expect(collectText(detail)).toBe("IP-CIDR,35.212.230.0/24");
    expect(collectText(detail)).not.toContain("🚀 节点选择");
    expect(collectText(detail)).not.toContain("no-resolve");
    expect(detail.props.title).toBe("IP-CIDR,35.212.230.0/24,🚀 节点选择");
    expect(entryRow.props.className).toContain("border-white/10");
    expect(entryRow.props.className).toContain("bg-white/5");
    expect(row.props.className).not.toContain("sm:grid");
    expect(orderControls.props.className).toContain("shrink-0");
    expect(modeRows.map((element) => element.props.className)).toEqual([
      expect.not.stringContaining("sm:flex-row"),
      expect.not.stringContaining("sm:flex-row"),
    ]);
  });

  it("uses fixed source tags for manual rules and searched rule sets", () => {
    mocks.entries = [
      {
        key: "custom-rule:manual",
        editable: true,
        summary: "example.com",
        sourceLabel: "自定义规则",
        target: "📚 教育学术",
        noResolve: false,
        text: "DOMAIN,example.com,📚 教育学术",
      },
      {
        key: "custom-rule-set:google",
        editable: true,
        summary: "Google",
        sourceLabel: "自定义规则集",
        target: "💬 自定义1",
        noResolve: false,
        text: "RULE-SET,google,💬 自定义1",
      },
      {
        key: "module:education:scholar",
        editable: false,
        summary: "Scholar",
        sourceLabel: "📚 教育学术",
        target: "💬 自定义1",
        noResolve: false,
        text: "RULE-SET,scholar,💬 自定义1",
      },
      {
        key: "special:match",
        editable: false,
        summary: "兜底规则",
        sourceLabel: "系统规则",
        target: "MATCH",
        noResolve: false,
        text: "MATCH,DIRECT",
      },
    ];

    const text = collectText(renderSection());

    expect(text).toContain("自定义规则");
    expect(text).toContain("自定义规则集");
    expect(text).toContain("📚 教育学术");
    expect(text).toContain("💬 自定义1");
    expect(text).not.toContain("自定义分组 ·");
  });

  it("confirms before enabling all-rules order mode and disables without confirmation", async () => {
    const switchElement = collectElements(renderSection(), (element) => Boolean((element.props as any).onCheckedChange))[0];

    mocks.confirmDialog.mockResolvedValueOnce(false);
    await switchElement.props.onCheckedChange(true);
    expect(mocks.store.setRuleOrder).not.toHaveBeenCalled();

    mocks.confirmDialog.mockResolvedValueOnce(true);
    await switchElement.props.onCheckedChange(true);
    expect(mocks.confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "开启“调整所有规则顺序”？",
        cancelText: "保持默认",
        confirmText: "继续开启",
        variant: "warning",
      })
    );
    expect(mocks.store.setRuleOrder).toHaveBeenCalledWith(["module:geo", "custom:one"]);

    const enabledSwitch = collectElements(
      renderSection({ ruleOrder: ["module:geo", "custom:one"] }),
      (element) => Boolean((element.props as any).onCheckedChange)
    )[0];
    await enabledSwitch.props.onCheckedChange(false);
    expect(mocks.store.setRuleOrder).toHaveBeenCalledWith(["custom:one"]);
  });

  it("moves editable rules by buttons, absolute order input, blur, and escape cleanup", () => {
    stateMock.value = { "custom:one": "1" };
    const tree = renderSection({ ruleOrder: ["module:geo", "custom:one"] });
    const orderInputs = collectElements(tree, (element) => (element.props as any).title === "最终规则行号（1=最前）");
    const upButtons = collectElements(tree, (element) => element.type === "button" && element.props.title === "上移");
    const downButtons = collectElements(tree, (element) => element.type === "button" && element.props.title === "下移");

    orderInputs[1].props.onChange({ target: { value: "2" } });
    expect(stateMock.value["custom:one"]).toBe("2");

    stateMock.value = { "custom:one": "1" };
    orderInputs[1].props.onKeyDown({ key: "Enter" });
    expect(mocks.store.setRuleOrder).toHaveBeenCalledWith(["custom:one", "module:geo"]);
    expect(stateMock.value).toEqual({});

    stateMock.value = { "custom:one": "1" };
    orderInputs[1].props.onBlur();
    expect(mocks.store.setRuleOrder).toHaveBeenCalledWith(["custom:one", "module:geo"]);

    stateMock.value = { "custom:one": "1" };
    orderInputs[1].props.onKeyDown({ key: "Escape" });
    expect(stateMock.value).toEqual({});

    upButtons[1].props.onClick();
    downButtons[0].props.onClick();
    expect(mocks.store.setRuleOrder).toHaveBeenCalledWith(["custom:one", "module:geo"]);
  });

  it("does not turn legacy custom-only ordering into full ordering after a custom move", () => {
    const tree = renderSection({ ruleOrder: ["custom:one"] });
    const orderInputs = collectElements(tree, (element) => (element.props as any).title === "最终规则行号（1=最前）");
    const upButtons = collectElements(tree, (element) => element.type === "button" && element.props.title === "上移");
    const downButtons = collectElements(tree, (element) => element.type === "button" && element.props.title === "下移");

    stateMock.value = { "custom:one": "1" };
    orderInputs[1].props.onKeyDown({ key: "Enter" });
    upButtons[1].props.onClick();
    downButtons[1].props.onClick();

    expect(upButtons[1].props.disabled).toBe(true);
    expect(downButtons[1].props.disabled).toBe(true);
    expect(mocks.store.setRuleOrder).not.toHaveBeenCalled();
  });

  it("uses full non-MATCH ordering for a new empty rule-order state", () => {
    const tree = renderSection({ ruleOrder: [] });
    const header = collectElements(tree, (element) => element.props.title === "规则管理")[0];
    expect(collectText(tree)).toContain("已开启全规则排序");
    expect(collectText(header.props.badge)).toContain("可调 2 / 全部 3");
  });

  it("keeps collapsed sections lightweight", () => {
    mocks.store = {
      enabledProxyGroups: [],
      customRules: [],
      customProxyGroups: [],
      customRuleSets: [],
      builtinRuleEdits: {},
      proxyGroupNameOverrides: {},
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: false,
      ruleOrder: [],
      setRuleOrder: vi.fn(),
    };
    const tree = RulesManagementSection({ isExpanded: false, onToggle: vi.fn() });
    const header = collectElements(tree, (element) => element.props.title === "规则管理")[0];

    expect(header.props.title).toBe("规则管理");
    expect(collectText(tree)).not.toContain("默认只能调整自定义规则顺序。");
  });
});
