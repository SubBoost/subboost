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

vi.mock("@subboost/ui/components/ui/form-field", () => ({
  FormField: (props: any) => React.createElement("div", null, props.children),
}));

vi.mock("@subboost/ui/components/ui/choice-group", () => ({
  ChoiceGroup: (props: any) => React.createElement("div", null, props.children),
  ChoiceChip: ({ label, selected, ...props }: any) => React.createElement("button", { ...props, "aria-pressed": selected }, label),
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

vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "select", name: "Select" },
    { id: "auto", name: "Auto" },
  ],
  generateProxyGroups: () => mocks.generatedProxyGroups,
}));

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
      (element) => element.type === "button" && typeof element.props["aria-pressed"] === "boolean",
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
});
