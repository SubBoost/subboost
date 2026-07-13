import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {
    buttons: [] as any[],
    inputs: [] as any[],
    selects: [] as any[],
    selectItems: [] as any[],
  },
  store: {} as Record<string, any>,
  confirmDialog: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  effects: [] as Array<React.EffectCallback>,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
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
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const resolvedInitial = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : resolvedInitial;
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
  Plus: () => null,
  Trash2: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (props: any) => props.children ?? null }));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return props.children ?? null;
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return props.value ?? null;
  },
}));
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => {
    mocks.captures.selects.push(props);
    return props.children ?? null;
  },
  SelectTrigger: (props: any) => props.children ?? null,
  SelectValue: (props: any) => props.placeholder ?? null,
  SelectContent: (props: any) => props.children ?? null,
  SelectItem: (props: any) => {
    mocks.captures.selectItems.push(props);
    return props.children ?? null;
  },
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: (selector?: (state: any) => unknown) => (selector ? selector(mocks.store) : mocks.store),
}));
vi.mock("./provider-group-plan", () => ({
  buildProviderGroupInfo: () => ({ names: ["✈️ 机场A"], nameByKey: {}, keys: [] }),
}));

import { GroupListenerPortBadge, ProxyGroupsGroupListeners } from "./proxy-groups-group-listeners";

function baseStore(overrides: Record<string, unknown> = {}) {
  return {
    groupListeners: [] as Array<{ id: string; target: string; port: number }>,
    addGroupListener: vi.fn(),
    updateGroupListener: vi.fn(),
    removeGroupListener: vi.fn(),
    enabledProxyGroups: [] as string[],
    hiddenProxyGroups: [] as string[],
    customProxyGroups: [{ id: "c1", name: "🎯 自定义组", emoji: "🎯", groupType: "select" }],
    proxyGroupNameOverrides: {},
    dialerProxyGroups: [
      { id: "d1", name: "美国中转", relayNodes: [], targetNodes: [], type: "select" },
      { id: "d2", name: "停用中转", enabled: false, relayNodes: [], targetNodes: [], type: "select" },
    ],
    sources: [],
    nodes: [],
    testUrl: "https://test.example.com",
    testInterval: 300,
    listenerPorts: {} as Record<string, number>,
    mixedPort: 7890,
    ruleProviderBaseUrl: "https://rules.example.com",
    customRuleSets: [],
    proxyGroupAdvanced: {},
    builtinRuleEdits: {},
    proxyGroupOrder: [] as string[],
    ...overrides,
  };
}

function resetCaptures() {
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.selects = [];
  mocks.captures.selectItems = [];
}

function findAddButton() {
  return mocks.captures.buttons.find((props) => String(props.className ?? "").includes("border-dashed"));
}

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ProxyGroupsGroupListeners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCaptures();
    mocks.store = baseStore();
    stateMock.enabled = false;
    stateMock.effects = [];
    stateMock.callIndex = 0;
    stateMock.overrides = {};
    stateMock.setters = [];
    delete (globalThis as any).window;
  });

  it("renders a collapsed optional card when no bindings exist", () => {
    const markup = renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    expect(markup).toContain("分组监听管理");
    expect(markup).toContain("可选");
    expect(markup).not.toContain("暂无分组监听");
  });

  it("renders rows, target options and stale-target placeholders when bindings exist", () => {
    mocks.store = baseStore({
      groupListeners: [
        { id: "g1", target: "美国中转", port: 7891 },
        { id: "g2", target: "已删除组", port: 7892 },
      ],
    });

    const markup = renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    expect(markup).toContain("2 条");
    expect(markup).toContain("（已不存在）");

    const optionValues = mocks.captures.selectItems.map((props) => props.value);
    expect(optionValues).toContain("🎯 自定义组");
    expect(optionValues).toContain("美国中转");
    expect(optionValues).toContain("✈️ 机场A");
    expect(optionValues).not.toContain("停用中转");

    // 一组一端口：g1 已绑定的「美国中转」在 g2 的下拉中被禁用
    const usOptions = mocks.captures.selectItems.filter((props) => props.value === "美国中转");
    expect(usOptions.some((props) => props.disabled === true)).toBe(true);
    expect(usOptions.some((props) => !props.disabled)).toBe(true);

    const portValues = mocks.captures.inputs.map((props) => props.value);
    expect(portValues).toContain("7891");
    expect(portValues).toContain("7892");
  });

  it("orders dropdown targets like the generated YAML group sequence", () => {
    mocks.store = baseStore({
      groupListeners: [{ id: "g1", target: "美国中转", port: 7891 }],
    });

    renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    // 模块组未启用时基础序只有自定义组；机场组+中转组插在其后（对齐生成器/可视化预览的插位逻辑）
    expect(mocks.captures.selectItems.map((props) => props.value)).toEqual([
      "🎯 自定义组",
      "✈️ 机场A",
      "美国中转",
    ]);
  });

  it("applies proxyGroupOrder drag order to dropdown targets", () => {
    mocks.store = baseStore({
      groupListeners: [{ id: "g1", target: "美国中转", port: 7891 }],
      proxyGroupOrder: ["dialer:d1"],
    });

    renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    expect(mocks.captures.selectItems.map((props) => props.value)).toEqual([
      "美国中转",
      "🎯 自定义组",
      "✈️ 机场A",
    ]);
  });

  it("flags conflicts against mixed-port, node listener ports and sibling rows", () => {
    mocks.store = baseStore({
      listenerPorts: { "Node A": 41000 },
      groupListeners: [
        { id: "g1", target: "美国中转", port: 7890 },
        { id: "g2", target: "✈️ 机场A", port: 41000 },
        { id: "g3", target: "🎯 自定义组", port: 7893 },
        { id: "g4", target: "已删除组", port: 7893 },
      ],
    });

    const markup = renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    expect(markup).toContain("与 mixed-port（7890）冲突");
    expect(markup).toContain("与节点监听端口冲突");
    expect(markup).toContain("与「🎯 自定义组」冲突");
  });

  it("commits valid port edits and records format errors for invalid input", () => {
    mocks.store = baseStore({
      groupListeners: [{ id: "g1", target: "美国中转", port: 7891 }],
    });
    stateMock.enabled = true;
    stateMock.overrides = { 0: true };

    renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    const portInput = mocks.captures.inputs[0];
    expect(portInput).toBeTruthy();

    portInput.onChange({ target: { value: "abc" } });
    expect(mocks.store.updateGroupListener).not.toHaveBeenCalled();
    expect(stateMock.setters[2]).toHaveBeenCalled();
    expect((stateMock.setters[2] as any).lastValue).toMatchObject({ g1: "端口需为 1-65535 的整数" });

    portInput.onChange({ target: { value: "8080" } });
    expect(mocks.store.updateGroupListener).toHaveBeenCalledWith("g1", { port: 8080 });
  });

  it("updates targets and removes bindings from row controls", () => {
    mocks.store = baseStore({
      groupListeners: [{ id: "g1", target: "美国中转", port: 7891 }],
    });
    stateMock.enabled = true;
    stateMock.overrides = { 0: true };

    renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    mocks.captures.selects[0].onValueChange("🎯 自定义组");
    expect(mocks.store.updateGroupListener).toHaveBeenCalledWith("g1", { target: "🎯 自定义组" });

    const removeButton = mocks.captures.buttons.find((props) => props.title === "删除");
    removeButton.onClick();
    expect(mocks.store.removeGroupListener).toHaveBeenCalledWith("g1");
  });

  it("requires one-time public exposure confirmation before the first add", async () => {
    stateMock.enabled = true;
    stateMock.overrides = { 0: true };
    renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    const addButton = findAddButton();
    expect(addButton).toBeTruthy();

    mocks.confirmDialog.mockResolvedValueOnce(false);
    addButton.onClick();
    await flushAsync();
    expect(mocks.confirmDialog).toHaveBeenCalledTimes(1);
    expect(mocks.store.addGroupListener).not.toHaveBeenCalled();

    mocks.confirmDialog.mockResolvedValueOnce(true);
    addButton.onClick();
    await flushAsync();
    expect(mocks.store.addGroupListener).toHaveBeenCalledTimes(1);
  });

  it("skips the warning when it was accepted before (shared storage key)", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => (key === "subboost.listenerPortWarningAccepted" ? "1" : null),
          setItem: vi.fn(),
        },
      },
    });
    stateMock.enabled = true;
    stateMock.overrides = { 0: true };
    renderToStaticMarkup(React.createElement(ProxyGroupsGroupListeners));

    findAddButton().onClick();
    await flushAsync();
    expect(mocks.confirmDialog).not.toHaveBeenCalled();
    expect(mocks.store.addGroupListener).toHaveBeenCalledTimes(1);
  });
});

describe("GroupListenerPortBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCaptures();
    stateMock.enabled = false;
    mocks.store = baseStore({
      groupListeners: [{ id: "g1", target: "美国中转", port: 7891 }],
    });
  });

  it("shows the bound port for the named group", () => {
    const markup = renderToStaticMarkup(React.createElement(GroupListenerPortBadge, { name: "美国中转" }));
    expect(markup).toContain(":7891");
  });

  it("renders nothing for groups without a binding", () => {
    const markup = renderToStaticMarkup(React.createElement(GroupListenerPortBadge, { name: "别的组" }));
    expect(markup).toBe("");
  });
});
