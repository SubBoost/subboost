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

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
    if (typeof type === "string") {
      (mocks.captures.intrinsics ??= []).push({ type, props: props ?? {}, key });
    }
  };
  return {
    ...actual,
    jsx: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
      capture(type, props, key);
      return actual.jsx(type as any, props, key as any);
    },
    jsxs: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
      capture(type, props, key);
      return actual.jsxs(type as any, props, key as any);
    },
  };
});

vi.mock("lucide-react", () => ({
  Check: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Link: () => null,
  Pencil: () => null,
  Plus: () => null,
  Search: () => null,
  Shuffle: () => null,
  SlidersHorizontal: () => null,
  Trash2: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (props: any) => props.children }));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/icon-button", () => ({
  IconButton: (props: any) => {
    mocks.captures.iconButtons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => {
    mocks.captures.dropdownRoots.push(props);
    return props.children;
  },
  DropdownMenuTrigger: (props: any) => props.children,
  DropdownMenuContent: (props: any) => {
    mocks.captures.dropdownContents.push(props);
    return props.children;
  },
  DropdownMenuItem: (props: any) => {
    mocks.captures.menuItems.push(props);
    return props.children;
  },
  DropdownMenuSub: (props: any) => props.children,
  DropdownMenuSubContent: (props: any) => props.children,
  DropdownMenuSubTrigger: (props: any) => {
    mocks.captures.menuItems.push(props);
    return props.children;
  },
  DropdownMenuLabel: (props: any) => props.children,
  DropdownMenuSeparator: () => null,
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "auto", name: "Auto" },
    { id: "fallback", name: "Fallback" },
  ],
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
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));
vi.mock("@subboost/ui/store/config-store", () => ({
  PRESET_RELAY_NAMES: ["香港中转", "日本中转"],
  useConfigStore: () => mocks.store,
}));
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => mocks.interactions }));
vi.mock("../section-header", () => ({
  SectionHeader: (props: any) => {
    mocks.captures.header = props;
    return null;
  },
}));

import { DialerProxyGroupsSection } from "./dialer-proxy-groups-section";

const nodes = [
  { name: "Alpha", type: "ss" },
  { name: "Beta", type: "vless" },
  { name: "Gamma", type: "trojan" },
];

const groupA = {
  id: "g-a",
  name: "Group A",
  enabled: true,
  relayNodes: ["Alpha"],
  targetNodes: ["Beta"],
  type: "select",
};

const groupB = {
  id: "g-b",
  name: "Group B",
  enabled: false,
  relayNodes: ["Beta", "DIRECT"],
  targetNodes: ["Beta", "Alpha"],
  type: "select",
};

function renderSection(overrides: Record<number, unknown> = {}, props = { isExpanded: true, onToggle: vi.fn() }) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.iconButtons = [];
  mocks.captures.switches = [];
  mocks.captures.menuItems = [];
  mocks.captures.dropdownContents = [];
  mocks.captures.dropdownRoots = [];
  mocks.captures.intrinsics = [];
  try {
    const html = renderToStaticMarkup(React.createElement(DialerProxyGroupsSection, props));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function textOf(children: unknown): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (React.isValidElement(children)) return textOf((children.props as { children?: unknown }).children);
  return "";
}

function findIntrinsic(type: string, predicate: (props: any) => boolean) {
  const found = mocks.captures.intrinsics.find((item: any) => item.type === type && predicate(item.props));
  expect(found).toBeTruthy();
  return found.props;
}

function findIntrinsics(type: string, predicate: (props: any) => boolean) {
  return mocks.captures.intrinsics
    .filter((item: any) => item.type === type && predicate(item.props))
    .map((item: any) => item.props);
}

describe("DialerProxyGroupsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [], dropdownContents: [], dropdownRoots: [], iconButtons: [], inputs: [], menuItems: [], switches: [], intrinsics: [] };
    mocks.store = {
      nodes,
      dialerProxyGroups: [groupA, groupB],
      customProxyGroups: [{ name: "Custom" }],
      proxyGroupNameOverrides: { auto: "Auto Override" },
      addDialerProxyGroup: vi.fn(),
      removeDialerProxyGroup: vi.fn(),
      updateDialerProxyGroup: vi.fn(),
      addNodeToDialerGroup: vi.fn(),
      removeNodeFromDialerGroup: vi.fn(),
    };
  });

  it("renders collapsed, empty, and expanded group summaries", () => {
    renderSection({}, { isExpanded: false, onToggle: vi.fn() });
    expect(mocks.captures.header).toEqual(expect.objectContaining({ title: "中转代理组", isExpanded: false }));
    expect(mocks.captures.buttons).toEqual([]);

    mocks.store.nodes = [];
    mocks.store.dialerProxyGroups = [];
    renderSection();
    expect(mocks.captures.header).toEqual(expect.objectContaining({ title: "中转代理组", isExpanded: true }));
    expect(mocks.captures.buttons.find((props: any) => String(props.className).includes("border-dashed"))).toBeTruthy();

    mocks.store.nodes = nodes;
    mocks.store.dialerProxyGroups = [groupA, groupB];
    renderSection({ 0: new Set(["g-a"]) });
    expect(mocks.captures.switches).toHaveLength(2);
    expect(mocks.captures.switches[0]).toEqual(expect.objectContaining({ checked: true }));
    expect(mocks.captures.switches[1]).toEqual(expect.objectContaining({ checked: false }));
  });

  it("adds custom groups, rejects duplicates, and records interactions", () => {
    const { setters } = renderSection({ 1: true, 2: { emoji: "🧩", name: "New Dialer" } });

    const customNameInput = mocks.captures.inputs.find((props: any) => props.placeholder === "自定义名称");
    customNameInput.onChange({ target: { value: "Typed" } });
    expect(setters[2]).toHaveBeenCalledWith({ emoji: "🧩", name: "Typed" });
    customNameInput.onKeyDown({ key: "Enter" });
    expect(mocks.store.addDialerProxyGroup).toHaveBeenCalledWith({
      name: "🧩 New Dialer",
      enabled: true,
      relayNodes: [],
      targetNodes: [],
      type: "select",
    });
    expect(mocks.interactions.proxyGroupAdded).toHaveBeenCalledWith({ groupType: "dialer_select" });
    expect(setters[1]).toHaveBeenCalledWith(false);
    expect(setters[2]).toHaveBeenCalledWith({ emoji: "🔗", name: "" });

    renderSection({ 1: true, 2: { emoji: "", name: "Custom" } });
    const addButton = mocks.captures.buttons.at(-1);
    addButton.onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "代理组名称已存在，请换一个名称。", variant: "warning" }));

    renderSection({ 1: true, 2: { emoji: "🧩", name: "   " } });
    expect(mocks.captures.buttons.at(-1)).toEqual(expect.objectContaining({ disabled: true }));
    mocks.store.addDialerProxyGroup.mockClear();
    mocks.captures.buttons.at(-1).onClick();
    expect(mocks.store.addDialerProxyGroup).not.toHaveBeenCalled();
  });

  it("ignores malformed group names when checking custom name uniqueness", () => {
    mocks.store.customProxyGroups = [
      { name: "" },
      { name: 123 },
    ];
    mocks.store.dialerProxyGroups = [
      { ...groupA, name: " " },
      { ...groupB, name: 42 },
    ];

    renderSection({ 1: true, 2: { emoji: "", name: "Brand New" } });
    mocks.captures.buttons.at(-1).onClick();

    expect(mocks.store.addDialerProxyGroup).toHaveBeenCalledWith({
      name: "Brand New",
      enabled: true,
      relayNodes: [],
      targetNodes: [],
      type: "select",
    });
  });

  it("opens the add menu and creates preset dialer groups", () => {
    const { setters } = renderSection();

    mocks.captures.dropdownRoots.find((props: any) => typeof props.onOpenChange === "function").onOpenChange(true);
    expect((setters[1] as any).lastValue).toBe(true);

    renderSection({ 1: true });
    mocks.captures.menuItems.find((props: any) => textOf(props.children).includes("香港中转")).onSelect();
    expect(mocks.store.addDialerProxyGroup).toHaveBeenCalledWith({
      name: "香港中转",
      enabled: true,
      relayNodes: [],
      targetNodes: [],
      type: "select",
    });
    expect(mocks.interactions.proxyGroupAdded).toHaveBeenCalledWith({ groupType: "dialer_select" });
  });

  it("renames groups and protects duplicate names", () => {
    const { setters } = renderSection({ 0: new Set(["g-a"]), 3: "g-a", 4: { emoji: "🧩", name: "Renamed" } });

    const renameInput = mocks.captures.inputs.find((props: any) => props.placeholder === "中转组名称");
    renameInput.onChange({ target: { value: "Typed Rename" } });
    expect(setters[4]).toHaveBeenCalledWith({ emoji: "🧩", name: "Typed Rename" });
    renameInput.onKeyDown({ key: "Enter" });
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-a", { name: "🧩 Renamed" });
    expect(setters[3]).toHaveBeenCalledWith(null);
    expect(setters[4]).toHaveBeenCalledWith({ emoji: "🔗", name: "" });

    const cancelButton = mocks.captures.buttons.find((props: any) => props.title === "取消");
    cancelButton.onClick();
    expect(setters[3]).toHaveBeenCalledWith(null);

    renderSection({ 0: new Set(["g-a"]), 3: "g-a", 4: { emoji: "", name: "Custom" } });
    const saveButton = mocks.captures.buttons.find((props: any) => props.title === "保存");
    saveButton.onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "代理组名称已存在，请换一个名称。", variant: "warning" }));

    renderSection({ 0: new Set(["g-a"]), 3: "g-a", 4: { emoji: "🧩", name: "" } });
    mocks.captures.inputs.find((props: any) => props.placeholder === "中转组名称").onKeyDown({ key: "Escape" });
    expect(stateMock.setters[3]).toHaveBeenCalledWith(null);
  });

  it("toggles group expansion and fixes conflicts when enabling disabled groups", () => {
    const { setters } = renderSection({ 0: new Set(["g-a"]) });
    const editButton = mocks.captures.buttons.find((props: any) => props.title === "改名");
    editButton.onClick({ stopPropagation: vi.fn() });
    expect(setters[3]).toHaveBeenCalledWith("g-a");
    expect(setters[4]).toHaveBeenCalledWith({ emoji: "", name: "Group A" });

    mocks.captures.switches[0].onCheckedChange(false);
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-a", { enabled: false });
    mocks.captures.switches[0].onClick({ stopPropagation: vi.fn() });

    const groupTypeButton = mocks.captures.buttons.find((props: any) => props["aria-label"] === "修改 Group A 类型");
    expect(groupTypeButton).toEqual(expect.objectContaining({ title: "类型：手动选择" }));
    groupTypeButton.onClick({ stopPropagation: vi.fn() });
    const autoTypeItem = mocks.captures.menuItems.find((props: any) => textOf(props.children).includes("自动测速"));
    autoTypeItem.onSelect();
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-a", { type: "url-test", strategy: undefined });

    const fallbackTypeItem = mocks.captures.menuItems.find((props: any) => textOf(props.children).includes("故障切换"));
    fallbackTypeItem.onSelect();
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-a", { type: "fallback", strategy: undefined });

    const roundRobinTypeItem = mocks.captures.menuItems.find((props: any) => textOf(props.children).includes("轮询均摊"));
    roundRobinTypeItem.onSelect();
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-a", { type: "load-balance", strategy: "round-robin" });

    mocks.captures.switches[1].onCheckedChange(true);
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-b", {
      enabled: true,
      relayNodes: ["DIRECT"],
      targetNodes: [],
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "中转组已启用并自动修正冲突",
        description: "已移除 1 个冲突中转节点；已移除 2 个冲突落地节点",
        variant: "warning",
      })
    );

    mocks.captures.iconButtons.find((props: any) => props.label === "删除 Group A 中转组").onClick({ stopPropagation: vi.fn() });
    expect(mocks.store.removeDialerProxyGroup).toHaveBeenCalledWith("g-a");
  });

  it("enables disabled groups without conflicts and with relay-only cleanup", () => {
    mocks.store.dialerProxyGroups = [
      { ...groupA, relayNodes: ["Custom"], targetNodes: ["Alpha"] },
      { ...groupB, enabled: false, relayNodes: ["DIRECT", "Gamma"], targetNodes: ["Beta"] },
    ];
    renderSection();
    mocks.captures.switches[1].onCheckedChange(true);
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-b", {
      enabled: true,
      relayNodes: ["DIRECT", "Gamma"],
      targetNodes: ["Beta"],
    });
    expect(mocks.toast).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.store.dialerProxyGroups = [
      { ...groupA, relayNodes: [], targetNodes: ["Alpha"] },
      { ...groupB, enabled: false, relayNodes: ["Alpha", "DIRECT"], targetNodes: ["Gamma"] },
    ];
    renderSection();
    mocks.captures.switches[1].onCheckedChange(true);
    expect(mocks.store.updateDialerProxyGroup).toHaveBeenCalledWith("g-b", {
      enabled: true,
      relayNodes: ["DIRECT"],
      targetNodes: ["Gamma"],
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "中转组已启用并自动修正冲突",
        description: "已移除 1 个冲突中转节点",
        variant: "warning",
      })
    );
  });

  it("updates relay and target search drafts for expanded groups", () => {
    const { setters } = renderSection({
      0: new Set(["g-a"]),
      5: { "g-a": "direct" },
      6: { "g-a": "gamma" },
    });

    const relayInput = mocks.captures.inputs.find((props: any) => props.placeholder === "搜索中转节点...");
    const targetInput = mocks.captures.inputs.find((props: any) => props.placeholder === "搜索落地节点...");

    relayInput.onChange({ target: { value: "custom" } });
    targetInput.onChange({ target: { value: "beta" } });
    relayInput.onClick({ stopPropagation: vi.fn() });
    targetInput.onClick({ stopPropagation: vi.fn() });
    expect(setters[5]).toHaveBeenCalledWith(expect.any(Function));
    expect(setters[6]).toHaveBeenCalledWith(expect.any(Function));
    expect(relayInput.disabled).toBe(false);
    expect(targetInput.disabled).toBe(false);
  });

  it("toggles expansion and relay or target membership from native rows", () => {
    let result = renderSection();
    findIntrinsic("button", (props) => props["aria-label"] === "展开 Group A").onClick();
    expect((result.setters[0] as any).lastValue).toEqual(new Set(["g-a"]));

    result = renderSection({ 0: new Set(["g-a"]) });
    findIntrinsic("button", (props) => props["aria-label"] === "收起 Group A").onClick();
    expect((result.setters[0] as any).lastValue).toEqual(new Set());

    renderSection({ 0: new Set(["g-a"]) });
    findIntrinsic("button", (props) => textOf(props.children).includes("Alpha") && props["aria-pressed"] === true).onClick();
    expect(mocks.store.removeNodeFromDialerGroup).toHaveBeenCalledWith("g-a", "Alpha", true);

    findIntrinsic("button", (props) => textOf(props.children).includes("DIRECT（直连）")).onClick();
    expect(mocks.store.addNodeToDialerGroup).toHaveBeenCalledWith("g-a", "DIRECT", true);

    findIntrinsic("button", (props) => textOf(props.children).includes("Beta") && props["aria-pressed"] === true).onClick();
    expect(mocks.store.removeNodeFromDialerGroup).toHaveBeenCalledWith("g-a", "Beta", false);

    const gammaTargetRow = findIntrinsics(
      "button",
      (props) => textOf(props.children).includes("Gamma") && typeof props.onClick === "function"
    ).at(-1);
    expect(gammaTargetRow).toBeTruthy();
    gammaTargetRow!.onClick();
    expect(mocks.store.addNodeToDialerGroup).toHaveBeenCalledWith("g-a", "Gamma", false);

    mocks.store.dialerProxyGroups = [
      groupA,
      { ...groupB, enabled: true, targetNodes: ["Gamma"] },
    ];
    mocks.store.addNodeToDialerGroup.mockClear();
    renderSection({ 0: new Set(["g-a"]) });
    const blockedGammaTargetRow = findIntrinsics(
      "button",
      (props) => textOf(props.children).includes("Gamma") && typeof props.onClick === "function"
    ).at(-1);
    expect(blockedGammaTargetRow).toBeTruthy();
    blockedGammaTargetRow!.onClick();
    expect(mocks.store.addNodeToDialerGroup).not.toHaveBeenCalledWith("g-a", "Gamma", false);
  });
});
