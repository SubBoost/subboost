import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  Check: () => React.createElement("span", null, "Check"),
  ChevronDown: () => React.createElement("span", null, "ChevronDown"),
  ChevronUp: () => React.createElement("span", null, "ChevronUp"),
  Pencil: () => React.createElement("span", null, "Pencil"),
  RotateCcw: () => React.createElement("span", null, "RotateCcw"),
  Trash2: () => React.createElement("span", null, "Trash2"),
  X: () => React.createElement("span", null, "X"),
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => React.createElement("input", props),
}));
vi.mock("@subboost/ui/components/ui/protocol-badge", () => ({
  ProtocolBadge: (props: any) => React.createElement("span", null, `protocol:${props.type}`),
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/node-name-template", () => ({
  formatNodeNameFromTemplate: ({ originName, tag }: { originName: string; tag: string }) => `[${tag}] ${originName}`,
}));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));

import { NodeManagementNodeList } from "./node-list";

const alpha = {
  name: "[HK] Alpha",
  type: "ss",
  server: "alpha.test",
  port: 443,
  cipher: "aes-128-gcm",
  password: "secret",
  _originName: "Original Alpha",
} as ParsedNode;

const beta = {
  name: "[LOCK] Beta",
  type: "vless",
  server: "beta.test",
  port: 8443,
  uuid: "00000000-0000-4000-8000-000000000000",
  _originName: "Beta",
} as ParsedNode;

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

function collectInputs(node: React.ReactNode) {
  return collectElements(node, (element) => {
    const props = element.props as Record<string, unknown>;
    return typeof element.type !== "string" && "value" in props && typeof props.onChange === "function";
  });
}

function callSetter<T>(initial: T) {
  return vi.fn((next: React.SetStateAction<T>) => (typeof next === "function" ? (next as (prev: T) => T)(initial) : next));
}

function makeProps(overrides: Partial<React.ComponentProps<typeof NodeManagementNodeList>> = {}) {
  return {
    nodes: [alpha, beta],
    deletedMarkedNodes: [{ originName: "Deleted", name: "[HK] Deleted" }],
    visibleNodes: [alpha, beta],
    visibleDeletedMarkedNodes: [{ originName: "Deleted", name: "[HK] Deleted" }],
    nodeSearchKeyword: "",
    resolveNodeNameParts: vi.fn((node: ParsedNode) =>
      node.name === alpha.name
        ? { baseName: "Alpha", tag: "HK", template: "[{tag}] {name}", canEditBase: true }
        : { baseName: "Beta", tag: "LOCK", template: "[{tag}]", canEditBase: false }
    ),
    editingNodeName: null,
    setEditingNodeName: vi.fn(),
    editNodeValue: "Alpha",
    setEditNodeValue: vi.fn(),
    renameNode: vi.fn(),
    restoreNodeName: vi.fn(),
    listenerPortDrafts: { [alpha.name]: "7001" },
    setListenerPortDrafts: callSetter<Record<string, string>>({ [alpha.name]: "7001" }),
    listenerPorts: { [alpha.name]: 7891, [beta.name]: 7892 },
    listenerPortErrors: { [alpha.name]: "端口冲突" },
    setListenerPortErrors: callSetter<Record<string, string>>({ [alpha.name]: "端口冲突" }),
    commitListenerPort: vi.fn(),
    orderDrafts: { [alpha.name]: "2" },
    setOrderDrafts: callSetter<Record<string, string>>({ [alpha.name]: "2" }),
    nodeIndexByName: new Map([
      [alpha.name, 0],
      [beta.name, 1],
    ]),
    setNodeOrder: vi.fn(),
    moveNode: vi.fn(),
    isListenerPortVisible: true,
    removeNode: vi.fn(),
    restoreDeletedNode: vi.fn(),
    ...overrides,
  };
}

function renderTree(props: React.ComponentProps<typeof NodeManagementNodeList>) {
  return NodeManagementNodeList(props);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NodeManagementNodeList", () => {
  it("renders empty and search-empty states", () => {
    expect(
      renderToStaticMarkup(
        React.createElement(NodeManagementNodeList, {
          ...makeProps({
            nodes: [],
            deletedMarkedNodes: [],
            visibleNodes: [],
            visibleDeletedMarkedNodes: [],
          }),
        })
      )
    ).toContain("请先在上方导入节点");

    expect(
      renderToStaticMarkup(
        React.createElement(NodeManagementNodeList, {
          ...makeProps({
            visibleNodes: [],
            visibleDeletedMarkedNodes: [],
            nodeSearchKeyword: "hk",
          }),
        })
      )
    ).toContain("未找到匹配节点");
  });

  it("renders active, renamed, listener-port, order, and deleted-node rows", () => {
    const html = renderToStaticMarkup(React.createElement(NodeManagementNodeList, makeProps()));

    expect(html).toContain("protocol:ss");
    expect(html).toContain("Alpha");
    expect(html).toContain("监听端口:");
    expect(html).toContain("顺序:");
    expect(html).toContain("已删除节点");
    expect(html).toContain("源名: Deleted");
  });

  it("handles list actions for rename, listener ports, ordering, delete, and restore", () => {
    const props = makeProps();
    const tree = renderTree(props);
    const buttons = collectElements(tree, (element) => typeof element.props.label === "string");
    const inputs = collectInputs(tree);

    buttons.find((button) => button.props.label === "恢复原名: Original Alpha")?.props.onClick();
    expect(props.restoreNodeName).toHaveBeenCalledWith(alpha.name);

    const renameButtons = buttons.filter((button) => button.props.label === "重命名节点");
    renameButtons[0].props.onClick();
    expect(props.setEditingNodeName).toHaveBeenCalledWith(alpha.name);
    expect(props.setEditNodeValue).toHaveBeenCalledWith("Alpha");

    renameButtons[1].props.onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "无法重命名该节点" }));

    const listenerInput = inputs[0];
    listenerInput.props.onChange({ target: { value: "7002" } });
    listenerInput.props.onKeyDown({ key: "Enter" });
    listenerInput.props.onKeyDown({ key: "Escape" });
    listenerInput.props.onBlur();
    expect(props.commitListenerPort).toHaveBeenCalledWith(alpha.name);
    expect(props.setListenerPortDrafts).toHaveBeenCalled();
    expect(props.setListenerPortErrors).toHaveBeenCalled();

    const orderInput = inputs[1];
    orderInput.props.onChange({ target: { value: "2" } });
    orderInput.props.onKeyDown({ key: "Enter" });
    orderInput.props.onKeyDown({ key: "Escape" });
    orderInput.props.onBlur();
    expect(props.setNodeOrder).toHaveBeenCalledWith(alpha.name, 2);
    expect(props.setOrderDrafts).toHaveBeenCalled();

    buttons.find((button) => button.props.label === "上移节点")?.props.onClick();
    buttons.find((button) => button.props.label === "下移节点")?.props.onClick();
    expect(props.moveNode).toHaveBeenCalledWith(alpha.name, "up");
    expect(props.moveNode).toHaveBeenCalledWith(alpha.name, "down");

    buttons.find((button) => button.props.label === "删除节点")?.props.onClick();
    expect(props.removeNode).toHaveBeenCalledWith(alpha.name);

    buttons.find((button) => button.props.label === "恢复节点 Deleted")?.props.onClick();
    expect(props.restoreDeletedNode).toHaveBeenCalledWith("Deleted");
  });

  it("commits and cancels rename while editing a node", () => {
    const props = makeProps({ editingNodeName: alpha.name, editNodeValue: " Gamma " });
    const tree = renderTree(props);
    const buttons = collectElements(tree, (element) => typeof element.props.label === "string");
    const input = collectInputs(tree).find((element) => element.props.autoFocus);
    expect(input).toBeDefined();

    input!.props.onChange({ target: { value: "Gamma" } });
    expect(props.setEditNodeValue).toHaveBeenCalledWith("Gamma");

    input!.props.onKeyDown({ key: "Enter" });
    expect(props.renameNode).toHaveBeenCalledWith(alpha.name, "[HK] Gamma");
    expect(props.setEditingNodeName).toHaveBeenCalledWith(null);

    input!.props.onKeyDown({ key: "Escape" });
    expect(props.setEditingNodeName).toHaveBeenCalledWith(null);

    buttons.find((button) => button.props.label === "保存节点名称")?.props.onClick();
    expect(props.renameNode).toHaveBeenCalledWith(alpha.name, "[HK] Gamma");

    buttons.find((button) => button.props.label === "取消重命名")?.props.onClick();
    expect(props.setEditingNodeName).toHaveBeenCalledWith(null);
  });

  it("warns instead of committing rename when the template hides the base name", () => {
    const props = makeProps({ editingNodeName: beta.name, editNodeValue: "New Beta" });
    const input = collectInputs(renderTree(props)).find((element) => element.props.autoFocus);
    expect(input).toBeDefined();

    input!.props.onKeyDown({ key: "Enter" });

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "无法重命名该节点" }));
    expect(props.renameNode).not.toHaveBeenCalled();
  });
});
