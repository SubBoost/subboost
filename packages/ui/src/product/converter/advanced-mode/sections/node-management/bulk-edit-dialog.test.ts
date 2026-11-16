import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any[]>,
  interactions: {
    listenerPortConfigured: vi.fn(),
  },
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  enabled: false,
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

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    mocks.captures.dialog = props;
    return props.children;
  },
  DialogContent: (props: any) => props.children,
  DialogBody: (props: any) => props.children,
  DialogHeader: (props: any) => props.children,
  DialogTitle: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return React.createElement("input", {
      onChange: props.onChange,
      placeholder: props.placeholder,
      value: props.value,
    });
  },
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return React.createElement("input", {
      checked: props.checked,
      onChange: props.onCheckedChange,
      type: "checkbox",
    });
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/node-name-template", () => ({
  formatNodeNameFromTemplate: ({ originName, tag }: { originName: string; tag: string }) => `[${tag}] ${originName}`,
}));
vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));

import { NodeManagementBulkEditDialog } from "./bulk-edit-dialog";

const nodes: ParsedNode[] = [
  { name: "[HK] Alpha  One", type: "ss", server: "alpha.test", port: 443, cipher: "aes-128-gcm", password: "secret" },
  {
    name: "Beta  Two",
    type: "vless",
    server: "beta.test",
    port: 8443,
    uuid: "00000000-0000-4000-8000-000000000001",
  },
  { name: "[JP] Locked", type: "trojan", server: "locked.test", port: 443, password: "secret" },
];

function resolveNodeNameParts(node: { name: string }) {
  if (node.name.startsWith("[HK] ")) {
    return {
      tags: ["HK"],
      tag: "HK",
      template: "[{tag}] {name}",
      baseName: node.name.slice("[HK] ".length),
      canEditBase: true,
    };
  }
  if (node.name.startsWith("[JP] ")) {
    return {
      tags: ["JP"],
      tag: "JP",
      template: "literal",
      baseName: node.name,
      canEditBase: false,
    };
  }
  return {
    tags: [],
    tag: "",
    template: undefined,
    baseName: node.name,
    canEditBase: true,
  };
}

function renderDialog(
  overrides: Record<number, unknown> = {},
  propOverrides: Partial<React.ComponentProps<typeof NodeManagementBulkEditDialog>> = {},
) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures = { buttons: [], inputs: [], switches: [] };
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    nodes,
    resolveNodeNameParts,
    bulkRenameNodes: vi.fn(),
    listenerPortEnabled: true,
    listenerPorts: {},
    bulkSetListenerPorts: vi.fn(),
    onClearListenerPortUiState: vi.fn(),
    ...propOverrides,
  };
  try {
    const html = renderToStaticMarkup(React.createElement(NodeManagementBulkEditDialog, props));
    return { html, props, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function buttonByText(text: string) {
  return mocks.captures.buttons.find((props) => props.children === text);
}

describe("NodeManagementBulkEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [], inputs: [], switches: [] };
  });

  it("previews default normalization and commits bulk renames", () => {
    const { html, props, setters } = renderDialog();

    expect(html).toContain("将修改 2");
    expect(html).toContain("[HK] Alpha One");
    expect(html).toContain("Beta Two");

    mocks.captures.inputs[0].onChange({ target: { value: "HK" } });
    mocks.captures.inputs[1].onChange({ target: { value: "Expired" } });
    mocks.captures.inputs[2].onChange({ target: { value: "\\s+" } });
    mocks.captures.inputs[3].onChange({ target: { value: "-" } });
    mocks.captures.switches[0].onCheckedChange(false);
    mocks.captures.switches[1].onCheckedChange(false);

    expect(setters[0]).toHaveBeenCalledWith("HK");
    expect(setters[1]).toHaveBeenCalledWith("Expired");
    expect(setters[2]).toHaveBeenCalledWith("\\s+");
    expect(setters[3]).toHaveBeenCalledWith("-");
    expect(setters[4]).toHaveBeenCalledWith(false);
    expect(setters[5]).toHaveBeenCalledWith(false);

    buttonByText("完成").onClick();
    expect(props.bulkRenameNodes).toHaveBeenCalledWith([
      { oldName: "[HK] Alpha  One", newName: "[HK] Alpha One" },
      { oldName: "Beta  Two", newName: "Beta Two" },
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已批量重命名 2 个节点", variant: "success" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);

    buttonByText("取消").onClick();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows regex errors, skipped nodes, empty names, and no-match previews", () => {
    const invalidRegexResult = renderDialog({ 0: "[", 2: "(" });
    expect(invalidRegexResult.html).toContain("无效正则");
    buttonByText("完成").onClick();
    expect(invalidRegexResult.props.bulkRenameNodes).not.toHaveBeenCalled();

    const skippedNodesResult = renderDialog({ 0: "Locked", 2: "Locked", 3: "Open" });
    expect(skippedNodesResult.html).toContain("跳过：当前节点命名模板无法解析");

    const emptyNameResult = renderDialog({ 0: "Beta", 2: ".*", 3: "" });
    expect(emptyNameResult.html).toContain("跳过：新名称为空");

    const noMatchResult = renderDialog({ 0: "Missing" });
    expect(noMatchResult.html).toContain("暂无匹配节点");
  });

  it("auto-fills listener ports and clears listener-port UI state", () => {
    const { props } = renderDialog({ 0: "Alpha|Beta", 6: "42000" });

    buttonByText("自动填充监听端口").onClick();

    expect(props.bulkSetListenerPorts).toHaveBeenCalledWith({
      "[HK] Alpha  One": 42000,
      "Beta  Two": 42001,
    });
    expect(mocks.interactions.listenerPortConfigured).toHaveBeenCalledWith({ mode: "advanced" });
    expect(props.onClearListenerPortUiState).toHaveBeenCalledWith(["[HK] Alpha  One", "Beta  Two"]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已自动填充监听端口 2 个节点", variant: "success" }));
  });

  it("validates listener-port input and conflicts", () => {
    renderDialog({ 0: "Alpha", 6: "70000" });
    buttonByText("自动填充监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "起始监听端口需为 1-65535 的整数", variant: "warning" }));

    renderDialog({ 0: "Alpha", 6: "" });
    buttonByText("自动填充监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "起始监听端口需为 1-65535 的整数", variant: "warning" }));

    renderDialog({ 0: "Alpha", 6: "abc" });
    buttonByText("自动填充监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "起始监听端口需为 1-65535 的整数", variant: "warning" }));

    renderDialog({ 0: "Alpha|Beta", 6: "65535" });
    buttonByText("自动填充监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "监听端口超出范围", variant: "warning" }));

    const conflictResult = renderDialog(
      { 0: "Alpha|Beta", 6: "42000" },
      { listenerPorts: { Other: 42001 } },
    );
    buttonByText("自动填充监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "监听端口冲突：42001", variant: "destructive" }));
    expect(conflictResult.props.bulkSetListenerPorts).not.toHaveBeenCalled();

    renderDialog({ 0: "Missing", 6: "42000" });
    buttonByText("自动填充监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "暂无匹配节点", variant: "warning" }));
  });

  it("bulk-removes listener ports and hides listener controls when disabled", () => {
    const enabledResult = renderDialog({ 0: "Alpha|Beta" });
    buttonByText("批量删除监听端口").onClick();
    expect(enabledResult.props.bulkSetListenerPorts).toHaveBeenCalledWith({
      "[HK] Alpha  One": null,
      "Beta  Two": null,
    });
    expect(enabledResult.props.onClearListenerPortUiState).toHaveBeenCalledWith(["[HK] Alpha  One", "Beta  Two"]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已批量删除监听端口 2 个节点", variant: "success" }));

    const disabledResult = renderDialog({}, { listenerPortEnabled: false });
    expect(disabledResult.html).not.toContain("监听端口批量操作");
  });

  it("handles no-op previews, empty node names, disabled actions, and listener-port reservations", () => {
    const noOpResult = renderDialog(
      { 0: "Alpha", 4: false, 5: false, 6: "43000" },
      { nodes: [{ name: "" } as any, nodes[0], nodes[1]], listenerPorts: { "[HK] Alpha  One": 42000, Other: "bad" as any } },
    );
    expect(noOpResult.html).toContain("无变更");
    buttonByText("完成").onClick();
    expect(noOpResult.props.bulkRenameNodes).not.toHaveBeenCalled();
    expect(noOpResult.props.onOpenChange).toHaveBeenCalledWith(false);

    buttonByText("自动填充监听端口").onClick();
    expect(noOpResult.props.bulkSetListenerPorts).toHaveBeenCalledWith({ "[HK] Alpha  One": 43000 });

    const invalidRegexResult = renderDialog({ 0: "[", 6: "42000" });
    buttonByText("自动填充监听端口").onClick();
    buttonByText("批量删除监听端口").onClick();
    buttonByText("完成").onClick();
    expect(invalidRegexResult.props.bulkSetListenerPorts).not.toHaveBeenCalled();
    expect(invalidRegexResult.props.bulkRenameNodes).not.toHaveBeenCalled();

    renderDialog({ 0: "Missing" });
    buttonByText("批量删除监听端口").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "暂无匹配节点", variant: "warning" }));
  });
});
