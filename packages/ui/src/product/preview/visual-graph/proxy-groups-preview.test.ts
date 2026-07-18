import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({
  ArrowRight: () => null,
  Box: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Globe: () => null,
  Network: () => null,
  RefreshCcw: () => null,
  Server: () => null,
  Shield: () => null,
  Zap: () => null,
}));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));

import { ProxyGroupsPreview, type VisualDisplayGroup } from "./proxy-groups-preview";

const groups: VisualDisplayGroup[] = [
  {
    id: "module:select",
    name: "🚀 节点选择",
    emoji: "🚀",
    groupType: "select",
    category: "core",
    rules: [{ id: "r1", name: "Rule One", behavior: "domain" }],
  },
  {
    id: "module:auto",
    name: "⚡ 自动选择",
    emoji: "⚡",
    groupType: "url-test",
    category: "service",
    rules: [],
  },
  {
    id: "dialer:relay",
    name: "🔁 中转组",
    emoji: "🔁",
    groupType: "load-balance",
    strategy: "consistent-hashing",
    category: "dialer",
    rules: [],
    dialer: { relayNodes: ["Relay"], targetNodes: ["Target"], type: "select" },
  },
  {
    id: "custom:reject",
    name: "🧩 拦截",
    emoji: "🧩",
    groupType: "reject-first",
    category: "custom",
    rules: [{ id: "r2", name: "Rule Two", behavior: "ipcidr" }],
  },
  {
    id: "custom:direct",
    name: "🧩 直连",
    emoji: "🧩",
    groupType: "direct-first",
    category: "other",
    rules: [],
  },
  {
    id: "custom:fallback",
    name: "🧩 故障",
    emoji: "🧩",
    groupType: "fallback",
    category: "unknown",
    rules: [],
  },
];

function renderPreview(overrides: Partial<React.ComponentProps<typeof ProxyGroupsPreview>> = {}) {
  return renderToStaticMarkup(
    React.createElement(ProxyGroupsPreview, {
      displayGroups: groups,
      expandedGroups: new Set(["module:select", "custom:reject"]),
      draggingGroupId: "module:auto",
      dragOverGroup: { id: "custom:reject", position: "after" },
      defaultProxyByGroupName: new Map([
        ["🚀 节点选择", "DIRECT"],
        ["⚡ 自动选择", "REJECT"],
        ["🧩 直连", "🇭🇰 Hong Kong"],
      ]),
      preferVerticalDialerLayout: false,
      onToggleExpand: vi.fn(),
      onSetDraggingGroupId: vi.fn(),
      onSetDragOverGroup: vi.fn(),
      onSetProxyGroupOrder: vi.fn(),
      ...overrides,
    })
  );
}

function makeProps(overrides: Partial<React.ComponentProps<typeof ProxyGroupsPreview>> = {}) {
  return {
    displayGroups: groups,
    expandedGroups: new Set(["module:select", "custom:reject"]),
    draggingGroupId: "module:auto",
    dragOverGroup: { id: "custom:reject", position: "after" as const },
    defaultProxyByGroupName: new Map([
      ["🚀 节点选择", "DIRECT"],
      ["⚡ 自动选择", "REJECT"],
      ["🧩 直连", "🇭🇰 Hong Kong"],
    ]),
    preferVerticalDialerLayout: false,
    onToggleExpand: vi.fn(),
    onSetDraggingGroupId: vi.fn(),
    onSetDragOverGroup: vi.fn(),
    onSetProxyGroupOrder: vi.fn(),
    ...overrides,
  };
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

function renderTree(props: React.ComponentProps<typeof ProxyGroupsPreview>) {
  return ProxyGroupsPreview(props);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ProxyGroupsPreview", () => {
  it("renders group labels, defaults, rules, drag markers, and horizontal dialer layout", () => {
    const html = renderPreview();

    expect(html).toContain("节点选择");
    expect(html).toContain("默认：直连");
    expect(html).toContain("默认：拒绝");
    expect(html).toContain("默认：Hong Kong");
    expect(html).toContain("Rule One");
    expect(html).toContain("Rule Two");
    expect(html).toContain("中转节点: 1");
    expect(html).toContain("落地节点: 1");
    expect(html).toContain("稳定分配");
  });

  it("renders vertical dialer and empty relay/target states", () => {
    const html = renderPreview({
      displayGroups: [
        {
          ...groups[2],
          dialer: { relayNodes: [], targetNodes: [], type: "url-test" },
        },
      ],
      expandedGroups: new Set(),
      draggingGroupId: null,
      dragOverGroup: { id: "dialer:relay", position: "before" },
      preferVerticalDialerLayout: true,
    });

    expect(html).toContain("未配置中转节点");
    expect(html).toContain("未选择落地节点");
    expect(html).toContain("flex-col");
  });

  it("renders remaining group categories and strategy labels", () => {
    const categoryGroups: VisualDisplayGroup[] = [
      { id: "social", name: "💬 社交", emoji: "💬", groupType: "load-balance", strategy: "round-robin", category: "social", rules: [] },
      { id: "media", name: "🎬 媒体", emoji: "🎬", groupType: "load-balance", strategy: "sticky-sessions", category: "media", rules: [] },
      { id: "game", name: "🎮 游戏", emoji: "🎮", groupType: "load-balance", strategy: "unknown-strategy", category: "game", rules: [] },
      { id: "tech", name: "💻 技术", emoji: "💻", groupType: "mystery", category: "tech", rules: [] },
      { id: "finance", name: "💰 金融", emoji: "💰", groupType: "select", category: "finance", rules: [] },
    ];

    const html = renderPreview({
      displayGroups: categoryGroups,
      expandedGroups: new Set(),
      draggingGroupId: null,
      dragOverGroup: null,
      defaultProxyByGroupName: new Map(),
    });

    expect(html).toContain("轮询均摊");
    expect(html).toContain("会话保持");
    expect(html).toContain("unknown-strategy");
    expect(html).toContain("mystery");
    expect(html).toContain("border-purple-500/50");
    expect(html).toContain("border-pink-500/50");
    expect(html).toContain("border-orange-500/50");
    expect(html).toContain("border-cyan-500/50");
    expect(html).toContain("border-yellow-500/50");
  });

  it("handles expand, drag-over, drop, drag-leave, and drag handle events", () => {
    vi.useFakeTimers();
    const props = makeProps({ dragOverGroup: null });
    const tree = renderTree(props);
    const groupRows = collectElements(tree, (element) => element.props.role === "group" && typeof element.props.onDragOver === "function");
    const disclosureButtons = collectElements(tree, (element) => element.type === "button" && "aria-expanded" in element.props);

    disclosureButtons[0].props.onClick();
    expect(props.onToggleExpand).toHaveBeenCalledWith("module:select");

    const rejectRow = groupRows[3];
    const dragEvent = {
      clientY: 25,
      currentTarget: { getBoundingClientRect: () => ({ top: 10, height: 20 }) },
      dataTransfer: { getData: vi.fn(() => "module:auto"), dropEffect: "" },
      preventDefault: vi.fn(),
    };
    rejectRow.props.onDragOver(dragEvent);
    expect(dragEvent.preventDefault).toHaveBeenCalled();
    expect(dragEvent.dataTransfer.dropEffect).toBe("move");
    expect(props.onSetDragOverGroup).toHaveBeenCalledWith({ id: "custom:reject", position: "after" });

    rejectRow.props.onDrop(dragEvent);
    expect(props.onSetProxyGroupOrder).toHaveBeenCalledWith([
      "module:select",
      "dialer:relay",
      "custom:reject",
      "module:auto",
      "custom:direct",
      "custom:fallback",
    ]);
    expect(props.onSetDragOverGroup).toHaveBeenLastCalledWith(null);
    expect(props.onSetDraggingGroupId).toHaveBeenLastCalledWith(null);

    const dragLeaveProps = makeProps({ dragOverGroup: { id: "custom:reject", position: "before" } });
    const dragLeaveRows = collectElements(renderTree(dragLeaveProps), (element) => element.props.role === "group" && typeof element.props.onDragOver === "function");
    dragLeaveRows[3].props.onDragLeave();
    expect(dragLeaveProps.onSetDragOverGroup).toHaveBeenCalledWith(null);

    const remove = vi.fn();
    const clone = { style: {}, remove };
    const card = {
      cloneNode: vi.fn(() => clone),
      getBoundingClientRect: () => ({ width: 320 }),
    };
    vi.stubGlobal("document", { body: { appendChild: vi.fn() } });
    const handles = collectElements(tree, (element) => element.type === "button" && element.props.title === "拖动排序（也可用方向键）");
    const stopPropagation = vi.fn();
    handles[0].props.onDragStart({
      currentTarget: { closest: vi.fn(() => card) },
      dataTransfer: {
        effectAllowed: "",
        setData: vi.fn(),
        setDragImage: vi.fn(() => {
          throw new Error("unsupported");
        }),
      },
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(props.onSetDraggingGroupId).toHaveBeenCalledWith("module:select");
    vi.runAllTimers();
    expect(remove).toHaveBeenCalled();

    handles[0].props.onKeyDown({ key: "ArrowDown", preventDefault: vi.fn() });
    handles[0].props.onDragEnd();
    expect(props.onSetDragOverGroup).toHaveBeenLastCalledWith(null);
    expect(props.onSetDraggingGroupId).toHaveBeenLastCalledWith(null);
  });

  it("ignores and handles remaining drag edge cases", () => {
    const props = makeProps({
      displayGroups: [groups[0]],
      draggingGroupId: null,
      dragOverGroup: null,
    });
    const groupRows = collectElements(renderTree(props), (element) => element.props.role === "group" && typeof element.props.onDragOver === "function");
    const event = {
      clientY: 0,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 20 }) },
      dataTransfer: { getData: vi.fn(() => ""), dropEffect: "" },
      preventDefault: vi.fn(),
    };

    groupRows[0].props.onDragOver(event);
    groupRows[0].props.onDrop(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(props.onSetProxyGroupOrder).not.toHaveBeenCalled();
    expect(props.onSetDragOverGroup).not.toHaveBeenCalled();

    const sameActiveProps = makeProps({ draggingGroupId: "module:select", dragOverGroup: { id: "module:select", position: "before" } });
    const sameActiveRows = collectElements(renderTree(sameActiveProps), (element) => element.props.role === "group" && typeof element.props.onDragOver === "function");
    sameActiveRows[0].props.onDragOver({
      clientY: 0,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 20 }) },
      dataTransfer: { getData: vi.fn(() => "module:select"), dropEffect: "" },
      preventDefault: vi.fn(),
    });
    sameActiveRows[0].props.onDrop({
      clientY: 0,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 20 }) },
      dataTransfer: { getData: vi.fn(() => "module:select"), dropEffect: "" },
      preventDefault: vi.fn(),
    });
    expect(sameActiveProps.onSetProxyGroupOrder).not.toHaveBeenCalled();

    const unchangedDragOverProps = makeProps({
      draggingGroupId: "module:auto",
      dragOverGroup: { id: "custom:reject", position: "after" },
    });
    const unchangedRows = collectElements(renderTree(unchangedDragOverProps), (element) => element.props.role === "group" && typeof element.props.onDragOver === "function");
    unchangedRows[3].props.onDragOver({
      clientY: 25,
      currentTarget: { getBoundingClientRect: () => ({ top: 10, height: 20 }) },
      dataTransfer: { getData: vi.fn(() => "module:auto"), dropEffect: "" },
      preventDefault: vi.fn(),
    });
    expect(unchangedDragOverProps.onSetDragOverGroup).not.toHaveBeenCalled();

    vi.useFakeTimers();
    const dragStartProps = makeProps();
    const dragStartTree = renderTree(dragStartProps);
    const handles = collectElements(dragStartTree, (element) => element.type === "button" && element.props.title === "拖动排序（也可用方向键）");
    handles[0].props.onDragStart({
      currentTarget: { closest: vi.fn(() => null) },
      dataTransfer: {
        effectAllowed: "",
        setData: vi.fn(),
        setDragImage: vi.fn(),
      },
      stopPropagation: vi.fn(),
    });
    expect(dragStartProps.onSetDraggingGroupId).toHaveBeenCalledWith("module:select");

    const remove = vi.fn();
    const clone = { style: {}, remove };
    const card = {
      cloneNode: vi.fn(() => clone),
      getBoundingClientRect: () => ({ width: 200 }),
    };
    vi.stubGlobal("document", { body: { appendChild: vi.fn() } });
    handles[0].props.onDragStart({
      currentTarget: { closest: vi.fn(() => card) },
      dataTransfer: {
        effectAllowed: "",
        setData: vi.fn(),
        setDragImage: vi.fn(),
      },
      stopPropagation: vi.fn(),
    });
    vi.runAllTimers();
    expect(remove).toHaveBeenCalled();
  });

  it("reorders from dataTransfer fallback and keeps collapsed rule groups closed", () => {
    const props = makeProps({
      expandedGroups: new Set(),
      draggingGroupId: null,
      dragOverGroup: null,
    });
    const groupRows = collectElements(renderTree(props), (element) => element.props.role === "group" && typeof element.props.onDragOver === "function");
    const beforeEvent = {
      clientY: 5,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 20 }) },
      dataTransfer: { getData: vi.fn(() => "module:auto"), dropEffect: "" },
      preventDefault: vi.fn(),
    };

    groupRows[3].props.onDragOver(beforeEvent);
    expect(beforeEvent.preventDefault).toHaveBeenCalled();
    expect(props.onSetDragOverGroup).toHaveBeenCalledWith({ id: "custom:reject", position: "before" });

    groupRows[3].props.onDrop(beforeEvent);
    expect(props.onSetProxyGroupOrder).toHaveBeenCalledWith([
      "module:select",
      "dialer:relay",
      "module:auto",
      "custom:reject",
      "custom:direct",
      "custom:fallback",
    ]);

    groupRows[0].props.onDragLeave();
    expect(props.onSetDragOverGroup).not.toHaveBeenCalledWith({ id: "module:select", position: expect.any(String) });

    const singleProps = makeProps({
      displayGroups: [groups[0]],
      draggingGroupId: null,
      dragOverGroup: null,
    });
    const singleHandles = collectElements(renderTree(singleProps), (element) => element.type === "button" && element.props.title === "拖动排序（也可用方向键）");
    singleHandles[0].props.onDragStart({
      currentTarget: { closest: vi.fn() },
      dataTransfer: {
        effectAllowed: "",
        setData: vi.fn(),
        setDragImage: vi.fn(),
      },
      stopPropagation: vi.fn(),
    });
    expect(singleProps.onSetDraggingGroupId).not.toHaveBeenCalled();

    const collapsedHtml = renderPreview({
      expandedGroups: new Set(),
      draggingGroupId: null,
      dragOverGroup: null,
    });
    expect(collapsedHtml).not.toContain("Rule One");
  });
});
