import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNodeSourceId } from "@subboost/core/subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";

const mocks = vi.hoisted(() => ({
  draggingKey: null as string | null,
  generatedProxyGroups: [] as Array<{ name: string; proxies: string[] }>,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  store: {} as Record<string, any>,
  toast: vi.fn(),
  confirmDialog: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => {
      const value = initial === null ? mocks.draggingKey : initial;
      const setter = vi.fn();
      mocks.stateSetters.push(setter);
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({
  Plus: () => React.createElement("span", null, "plus-icon"),
  RotateCcw: () => React.createElement("span", null, "restore-icon"),
  X: () => React.createElement("span", null, "x-icon"),
}));

vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({
  confirmDialog: mocks.confirmDialog,
}));

vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => React.createElement("button", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => React.createElement("input", props),
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({
  toast: mocks.toast,
}));

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

vi.mock("@subboost/core/generator/proxy-groups", async (importActual) => {
  const actual = await importActual<typeof import("@subboost/core/generator/proxy-groups")>();
  return {
    PROXY_GROUP_MODULES: [
      { id: "select", name: "Select" },
      { id: "auto", name: "Auto" },
    ],
    generateProxyGroups: () => mocks.generatedProxyGroups,
    // 机场组名去重用真实实现（buildProviderGroupInfo 依赖），保持组名与生成端一致
    buildProviderProxyGroups: actual.buildProviderProxyGroups,
  };
});

vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { id: string; name: string }, override?: string) => override || module.name,
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => mocks.store,
}));

import { ProxyGroupAdvancedPanel } from "./proxy-group-advanced-panel";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

type TestElement = React.ReactElement<Record<string, any>>;

function flattenElements(value: React.ReactNode): TestElement[] {
  const out: TestElement[] = [];
  const visit = (item: React.ReactNode): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!React.isValidElement(item)) return;
    if (typeof item.type === "function") {
      visit((item.type as (props: unknown) => React.ReactNode)(item.props));
      return;
    }
    out.push(item as TestElement);
    visit((item.props as { children?: React.ReactNode }).children);
  };
  visit(value);
  return out;
}

describe("ProxyGroupAdvancedPanel interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.draggingKey = "node:US Source";
    mocks.generatedProxyGroups = [
      { name: "Media", proxies: ["DIRECT", "US Source", "Japan Source"] },
      { name: "Select", proxies: ["US Source"] },
      { name: "Auto", proxies: ["US Source"] },
      { name: "Other", proxies: ["US Source"] },
    ];
    mocks.stateSetters = [];
    mocks.store = {
      nodes: [
        withNodeSourceId(node("US Source"), "source-a"),
        withNodeSourceId(node("Japan Source"), "source-b"),
        node("Extra Node"),
      ],
      sources: [
        { id: "source-a", type: "url", tag: " Primary " },
        { id: "source-b", type: "yaml", lastParsedTag: " YAML Feed " },
      ],
      enabledProxyGroups: ["select", "auto"],
      customProxyGroups: [
        { id: "media", name: "Media", emoji: "", groupType: "select" },
        { id: "other", name: "Other", emoji: "", groupType: "select" },
      ],
      customRuleSets: [],
      proxyGroupAdvanced: {},
      builtinRuleEdits: {},
      proxyGroupNameOverrides: { auto: "Auto" },
      testUrl: "https://probe.example/204",
      testInterval: 300,
      ruleProviderBaseUrl: "https://rules.example",
    };
  });

  it("orders excluded members like the generated YAML member sequence", () => {
    mocks.store.sources = [
      ...mocks.store.sources,
      {
        id: "source-p",
        type: "url",
        content: "https://provider.example/sub",
        useProxyProviders: true,
        providerMode: "grouped",
        providerGroupName: "✈️ AirportA",
      },
    ];

    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange: vi.fn(),
      rulesCount: 0,
      rulesContent: null,
    });
    const excludedChips = flattenElements(tree).filter(
      (element) => element.type === "button" && String(element.props.className || "").includes("hover:border-emerald"),
    );

    // 未启用成员顺序对齐生成器默认成员序：节点选择 → 自动选择 → 机场组 → DIRECT/REJECT → 自定义组 → 节点
    expect(excludedChips.map((element) => element.props.title)).toEqual([
      "Select",
      "Auto",
      "✈️ AirportA",
      "REJECT",
      "Other",
      "Extra Node",
    ]);
  });

  it("fires native source, region, member, and drag callbacks", () => {
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {
        sourceIds: ["source-a"],
        regions: ["us"],
        includeRegex: "Source",
        excludeRegex: "Japan",
        excludedMembers: [{ kind: "reject" }],
      },
      onChange,
      rulesCount: 1,
      rulesContent: React.createElement("div", null, "rules"),
    });
    const elements = flattenElements(tree);
    const sourceCheckboxes = elements.filter((element) => element.type === "input" && element.props.type === "checkbox");
    const textInputs = elements.filter((element) => element.type === "input" && element.props.type !== "checkbox");
    const regionButtons = elements.filter(
      (element) => element.type === "button" && String(element.props.className || "").includes("rounded border px-2"),
    );
    const includedRows = elements.filter((element) => element.props.draggable);
    const excludeButton = elements.find((element) => element.type === "button" && element.props.title === "排除");
    const enableButton = elements.find((element) => element.type === "button" && element.props.title === "REJECT");

    sourceCheckboxes[1].props.onChange();
    regionButtons[1].props.onClick();
    textInputs[0].props.onChange({ target: { value: "IEPL" } });
    textInputs[1].props.onChange({ target: { value: "Test" } });
    includedRows[0].props.onDragStart();
    includedRows.at(-1)?.props.onDragOver({ preventDefault: vi.fn() });
    includedRows.at(-1)?.props.onDrop();
    includedRows.at(-1)?.props.onDragEnd();
    excludeButton?.props.onClick();
    enableButton?.props.onClick();

    expect(onChange).toHaveBeenCalledWith({ sourceIds: ["source-a", "source-b"] });
    expect(onChange).toHaveBeenCalledWith({ regions: ["us", "hk"] });
    expect(onChange).toHaveBeenCalledWith({ includeRegex: "IEPL" });
    expect(onChange).toHaveBeenCalledWith({ excludeRegex: "Test" });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ memberOrder: expect.any(Array) }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedMembers: expect.arrayContaining([expect.objectContaining({ kind: "direct" })]),
      }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        extraMembers: expect.arrayContaining([expect.objectContaining({ kind: "reject" })]),
      }),
    );
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith("direct:DIRECT");
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith(null);
  });

  it("ignores member drops without a real move target", () => {
    const onChange = vi.fn();
    mocks.draggingKey = null;
    let tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    let includedRows = flattenElements(tree).filter((element) => element.props.draggable);

    includedRows[0].props.onDrop();
    expect(onChange).not.toHaveBeenCalled();
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith(null);

    vi.clearAllMocks();
    mocks.stateSetters = [];
    mocks.draggingKey = "direct:DIRECT";
    tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    includedRows = flattenElements(tree).filter((element) => element.props.draggable);

    includedRows[0].props.onDrop();
    expect(onChange).not.toHaveBeenCalled();
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith(null);
  });

  it("adds and removes all nodes without changing proxy group members", () => {
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: { excludedMembers: [{ kind: "reject" }] },
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const elements = flattenElements(tree);
    const addAll = elements.find(
      (element) => element.type === "button" && element.props.title === "添加全部节点",
    );
    const removeAll = elements.find(
      (element) => element.type === "button" && element.props.title === "移除全部节点",
    );

    addAll?.props.onClick();
    removeAll?.props.onClick();

    expect(onChange).toHaveBeenCalledWith({
      extraMembers: [{ kind: "node", name: "Extra Node" }],
      excludedMembers: [{ kind: "reject" }],
      memberOrder: [
        { kind: "direct" },
        { kind: "node", name: "Extra Node" },
        { kind: "node", name: "US Source" },
        { kind: "node", name: "Japan Source" },
      ],
    });
    expect(onChange).toHaveBeenCalledWith({
      extraMembers: [],
      excludedMembers: [
        { kind: "reject" },
        { kind: "node", name: "US Source" },
        { kind: "node", name: "Japan Source" },
        { kind: "node", name: "Extra Node" },
      ],
      memberOrder: [],
    });
  });

  it("adds all safe proxy groups and skips groups that would create a cycle", () => {
    mocks.generatedProxyGroups = [
      { name: "Media", proxies: ["DIRECT", "US Source"] },
      { name: "Select", proxies: ["US Source"] },
      { name: "Auto", proxies: ["US Source"] },
      { name: "Other", proxies: ["Media"] },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const addAll = flattenElements(tree).find(
      (element) => element.type === "button" && element.props.title === "添加全部代理组",
    );

    addAll?.props.onClick();

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        extraMembers: [
          { kind: "module", id: "select" },
          { kind: "module", id: "auto" },
        ],
      }),
    );
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "已跳过 1 个会形成循环的代理组",
      variant: "warning",
    });
  });

  it("removes all proxy groups while leaving nodes and fixed policies alone", () => {
    mocks.generatedProxyGroups = [
      { name: "Media", proxies: ["DIRECT", "Auto", "Other", "US Source"] },
      { name: "Select", proxies: ["US Source"] },
      { name: "Auto", proxies: ["US Source"] },
      { name: "Other", proxies: ["US Source"] },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {
        extraMembers: [
          { kind: "custom", id: "other" },
          { kind: "node", name: "US Source" },
        ],
        memberOrder: [
          { kind: "direct" },
          { kind: "module", id: "auto" },
          { kind: "custom", id: "other" },
          { kind: "node", name: "US Source" },
        ],
      },
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const removeAll = flattenElements(tree).find(
      (element) => element.type === "button" && element.props.title === "移除全部代理组",
    );

    removeAll?.props.onClick();

    expect(onChange).toHaveBeenCalledWith({
      extraMembers: [{ kind: "node", name: "US Source" }],
      excludedMembers: [
        { kind: "module", id: "select" },
        { kind: "module", id: "auto" },
        { kind: "custom", id: "other" },
      ],
      memberOrder: [
        { kind: "direct" },
        { kind: "node", name: "US Source" },
      ],
    });
  });

  it("restores only member overrides after confirmation", async () => {
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {
        sourceIds: ["source-a"],
        includeRegex: "Source",
        extraMembers: [{ kind: "node", name: "Extra Node" }],
        excludedMembers: [{ kind: "reject" }],
        memberOrder: [{ kind: "direct" }, { kind: "node", name: "Extra Node" }],
      },
      onChange,
      rulesCount: 1,
      rulesContent: null,
    });
    const restore = flattenElements(tree).find(
      (element) => element.type === "button" && element.props.title === "恢复默认成员",
    );

    mocks.confirmDialog.mockResolvedValueOnce(false);
    await restore?.props.onClick();
    expect(onChange).not.toHaveBeenCalled();

    mocks.confirmDialog.mockResolvedValueOnce(true);
    await restore?.props.onClick();

    expect(mocks.confirmDialog).toHaveBeenLastCalledWith({
      title: "恢复默认成员？",
      description: "将清除当前代理组的手动添加、排除和排序。导入源、地区、正则筛选及分流规则不会改变。",
      confirmText: "恢复",
      variant: "warning",
    });
    expect(onChange).toHaveBeenCalledWith({
      extraMembers: [],
      excludedMembers: [],
      memberOrder: [],
    });
  });

  it("renders only inline provider chips (grouped airport group is a default member, not a chip)", () => {
    mocks.store.sources = [
      {
        id: "gp",
        type: "url",
        useProxyProviders: true,
        providerMode: "grouped",
        providerKey: "lxy",
        providerGroupName: "✈️ 香港机场",
      },
      { id: "bare", type: "url", useProxyProviders: true, providerMode: "bare" },
      // inline 源不产胶囊
      { id: "inl", type: "url", useProxyProviders: true, providerMode: "inline" },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const chipButtons = flattenElements(tree).filter(
      (element) => element.type === "button" && String(element.props.title || "").match(/内联|机场/),
    );
    // grouped 与 bare 各产 1 个内联胶囊；机场组名不再是胶囊（已作为默认成员进已启用列表）
    expect(chipButtons.map((element) => element.props.title)).toEqual(["内联 lxy", "内联 url_bare"]);

    chipButtons[0].props.onClick();
    expect(onChange).toHaveBeenCalledWith({ extraMembers: [{ kind: "provider-inline", key: "lxy" }] });

    chipButtons[1].props.onClick();
    expect(onChange).toHaveBeenCalledWith({ extraMembers: [{ kind: "provider-inline", key: "url_bare" }] });
  });

  it("removes an already-selected provider member on toggle", () => {
    mocks.store.sources = [
      { id: "bare", type: "url", useProxyProviders: true, providerMode: "bare", providerKey: "abc" },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: { extraMembers: [{ kind: "provider-inline", key: "abc" }] },
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const chip = flattenElements(tree).find(
      (element) => element.type === "button" && element.props.title === "内联 abc",
    );
    // 已选态高亮
    expect(String(chip?.props.className)).toContain("bg-indigo-500/20");
    chip?.props.onClick();
    expect(onChange).toHaveBeenCalledWith({ extraMembers: [] });
  });

  it("shows selected provider members at the end of the included list", () => {
    mocks.store.sources = [
      {
        id: "gp",
        type: "url",
        useProxyProviders: true,
        providerMode: "grouped",
        providerKey: "lxy",
        providerGroupName: "✈️ 香港机场",
      },
    ];
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {
        extraMembers: [
          { kind: "provider-inline", key: "lxy" },
          { kind: "provider-group", key: "lxy" },
        ],
      },
      onChange: vi.fn(),
      rulesCount: 0,
      rulesContent: null,
    });
    // 已启用列表里 provider 行标签为「Provider」「机场组」，且 label 正确
    const kindLabels = flattenElements(tree)
      .filter((el) => el.type === "div" && /^(Provider|机场组|节点|内置组|自定义组)$/.test(String(el.props.children)))
      .map((el) => String(el.props.children));
    // 普通节点在前，provider 两项在末尾
    expect(kindLabels.slice(-2)).toEqual(["Provider", "机场组"]);
    expect(kindLabels).toContain("节点");

    // provider 行不可拖拽
    const providerRow = flattenElements(tree).find(
      (el) => el.type === "div" && el.props.draggable === false && /内联 lxy|香港机场/.test(JSON.stringify(el.props)),
    );
    expect(providerRow).toBeTruthy();
  });

  it("removes a provider member via the included-list X, equivalent to chip toggle", () => {
    mocks.store.sources = [
      { id: "bare", type: "url", useProxyProviders: true, providerMode: "bare", providerKey: "abc" },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: { extraMembers: [{ kind: "provider-inline", key: "abc" }] },
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    // 已启用列表里 provider 行的「排除」按钮（provider 行固定在列表末尾，取最后一个）
    const excludeBtns = flattenElements(tree).filter(
      (el) => el.type === "button" && el.props.title === "排除",
    );
    const excludeBtn = excludeBtns[excludeBtns.length - 1];
    excludeBtn?.props.onClick();
    // 只写 extraMembers（删掉该项），不写 excludedMembers/memberOrder
    expect(onChange).toHaveBeenCalledWith({ extraMembers: [] });
    const payload = onChange.mock.calls[0][0];
    expect(payload).not.toHaveProperty("excludedMembers");
    expect(payload).not.toHaveProperty("memberOrder");
  });

  it("remove-all-nodes also removes provider-inline members", () => {
    mocks.store.sources = [
      { id: "bare", type: "url", useProxyProviders: true, providerMode: "bare", providerKey: "abc" },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: { extraMembers: [{ kind: "provider-inline", key: "abc" }] },
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const removeAll = flattenElements(tree).find(
      (el) => el.type === "button" && el.props.title === "移除全部节点",
    );
    removeAll?.props.onClick();
    const payload = onChange.mock.calls[0][0];
    expect(payload.extraMembers).not.toContainEqual({ kind: "provider-inline", key: "abc" });
    // provider 不写入 excludedMembers
    expect(payload.excludedMembers ?? []).not.toContainEqual({ kind: "provider-inline", key: "abc" });
  });

  it("remove-all-proxy-groups removes the airport group and writes it to excludedMembers", () => {
    // 带 content URL 的 grouped 源 → 机场组被解析为非孤儿的普通成员
    mocks.store.sources = [
      {
        id: "gp",
        type: "url",
        content: "https://example.com/hk",
        useProxyProviders: true,
        providerMode: "grouped",
        providerKey: "lxy",
        providerGroupName: "✈️ 香港机场",
      },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    const removeAll = flattenElements(tree).find(
      (el) => el.type === "button" && el.props.title === "移除全部代理组",
    );
    removeAll?.props.onClick();
    const payload = onChange.mock.calls[0][0];
    // 机场组是普通默认成员：移除全部代理组时写入 excludedMembers 才能压过默认注入
    expect(payload.excludedMembers ?? []).toContainEqual({ kind: "provider-group", key: "lxy" });
  });

  it("enables remove-all-nodes when only provider-inline members are included", () => {
    // 目标组 proxies 不含真实节点，普通已启用节点为 0
    mocks.generatedProxyGroups = [{ name: "Media", proxies: ["DIRECT"] }];
    mocks.store.sources = [
      { id: "bare", type: "url", useProxyProviders: true, providerMode: "bare", providerKey: "abc" },
    ];
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: { extraMembers: [{ kind: "provider-inline", key: "abc" }] },
      onChange: vi.fn(),
      rulesCount: 0,
      rulesContent: null,
    });
    const removeAll = flattenElements(tree).find(
      (el) => el.type === "button" && el.props.title === "移除全部节点",
    );
    expect(removeAll?.props.disabled).toBe(false);
  });

  it("renders orphan provider members with fallback label", () => {
    // extraMembers 里有 sources 中不存在的 provider key → 用兜底 label 显示
    mocks.store.sources = [];
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: { extraMembers: [{ kind: "provider-inline", key: "ghost" }] },
      onChange: vi.fn(),
      rulesCount: 0,
      rulesContent: null,
    });
    const labelDiv = flattenElements(tree).find(
      (el) => el.type === "div" && String(el.props.children) === "内联 ghost",
    );
    expect(labelDiv).toBeTruthy();
  });

  it("shows the airport group as a default draggable member and X writes excludedMembers", () => {
    // 带 content URL 的 grouped 源，且目标组 proxies 含机场组名（模拟生成器默认注入）
    mocks.generatedProxyGroups = [
      { name: "Media", proxies: ["DIRECT", "✈️ 香港机场", "US Source"] },
    ];
    mocks.store.sources = [
      {
        id: "gp",
        type: "url",
        content: "https://example.com/hk",
        useProxyProviders: true,
        providerMode: "grouped",
        providerKey: "lxy",
        providerGroupName: "✈️ 香港机场",
      },
    ];
    const onChange = vi.fn();
    const tree = ProxyGroupAdvancedPanel({
      target: { kind: "custom", id: "media", name: "Media" },
      advanced: {},
      onChange,
      rulesCount: 0,
      rulesContent: null,
    });
    // 机场组作为默认成员出现在已启用列表，且可拖拽（非合成成员）
    const airportRow = flattenElements(tree).find(
      (el) =>
        el.type === "div" &&
        el.props.draggable === true &&
        /✈️ 香港机场/.test(JSON.stringify(el.props.children ?? "")),
    );
    expect(airportRow).toBeTruthy();

    // 列表 X 排除机场组 → 写 excludedMembers（普通成员路径）
    const excludeBtns = flattenElements(tree).filter(
      (el) => el.type === "button" && el.props.title === "排除",
    );
    // 找到机场组那一行的排除按钮：遍历所有 X，点击后断言 payload 含 provider-group
    let wrote = false;
    for (const btn of excludeBtns) {
      onChange.mockClear();
      btn.props.onClick();
      const payload = onChange.mock.calls[0]?.[0];
      if ((payload?.excludedMembers ?? []).some((m: { kind: string }) => m.kind === "provider-group")) {
        wrote = true;
        break;
      }
    }
    expect(wrote).toBe(true);
  });
});
