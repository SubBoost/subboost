import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  dialogs: [] as any[],
  inputs: [] as any[],
  switches: [] as any[],
  textareas: [] as any[],
}));

vi.mock("@radix-ui/react-popover", () => ({
  Anchor: (props: any) => React.createElement("span", null, props.children),
  Arrow: () => React.createElement("span", null, "arrow"),
  Content: ({ children, sideOffset: _sideOffset, ...props }: any) => React.createElement("div", props, children),
  Close: (props: any) => React.createElement("button", null, props.children),
  Portal: (props: any) => React.createElement("div", null, props.children),
  Root: (props: any) => React.createElement("div", null, props.children),
  Trigger: (props: any) => React.createElement("div", null, props.children),
}));
vi.mock("lucide-react", () => ({
  CircleHelp: () => React.createElement("span", null, "circle-help-icon"),
  FileCode: () => React.createElement("span", null, "file-code-icon"),
  HelpCircle: () => React.createElement("span", null, "help-icon"),
  Link2: () => React.createElement("span", null, "link-icon"),
  Server: () => React.createElement("span", null, "server-icon"),
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    mocks.dialogs.push(props);
    return React.createElement("div", null, props.children);
  },
  DialogContent: (props: any) => React.createElement("section", props, props.children),
  DialogHeader: (props: any) => React.createElement("header", props, props.children),
  DialogTitle: (props: any) => React.createElement("h2", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.switches.push(props);
    return React.createElement("input", { type: "checkbox", checked: props.checked, onChange: props.onCheckedChange });
  },
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.textareas.push(props);
    return React.createElement("textarea", props);
  },
}));
vi.mock("@subboost/core/node-name-template", () => ({
  DEFAULT_NODE_NAME_TEMPLATE: "{tag}-{name}",
}));
vi.mock("../constants", () => ({
  sourceTypeInfo: {
    url: { label: "订阅链接", placeholder: "https://example.com/sub" },
    yaml: { label: "YAML 配置", placeholder: "proxies:" },
    nodes: { label: "节点链接", placeholder: "ss://node" },
  },
}));

import { InputSourceEditorDialog } from "./input-source-editor-dialog";

const urlSource = {
  id: "source-url",
  type: "url",
  content: "https://example.com/sub",
  tag: "A",
  nameTemplate: "{tag}-{name}",
  useProxyProviders: false,
  userinfoUrl: "https://example.com/userinfo",
  userinfoUserAgent: "Clash.Meta",
};

function renderDialog(props: Partial<React.ComponentProps<typeof InputSourceEditorDialog>> = {}) {
  mocks.buttons = [];
  mocks.dialogs = [];
  mocks.inputs = [];
  mocks.switches = [];
  mocks.textareas = [];
  const handlers = {
    source: urlSource as any,
    previewName: "A-Node",
    onClose: vi.fn(),
    onUpdateContent: vi.fn(),
    onUpdateMeta: vi.fn(),
    ...props,
  } as React.ComponentProps<typeof InputSourceEditorDialog>;
  const html = renderToStaticMarkup(React.createElement(InputSourceEditorDialog, handlers));
  return { html, handlers };
}

describe("InputSourceEditorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders closed state and forwards dialog close", () => {
    const { html, handlers } = renderDialog({ source: null });

    expect(html).toContain("高级编辑");
    expect(html).not.toContain("标签（tag）");

    mocks.dialogs[0].onOpenChange(true);
    mocks.dialogs[0].onOpenChange(false);
    mocks.buttons[0].onClick();

    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });

  it("edits URL source metadata and proxy-provider options", () => {
    const { html, handlers } = renderDialog();

    expect(html).toContain("高级编辑：订阅链接");
    expect(html).toContain("proxy-providers模式");
    expect(html).toContain("proxy-providers 模式");
    expect(html).toContain("subscription-userinfo");

    mocks.inputs[0].onChange({ target: { value: "B" } });
    mocks.inputs[1].onChange({ target: { value: "{name}" } });
    expect(mocks.inputs[2]).toEqual(expect.objectContaining({ value: "A-Node", readOnly: true }));
    mocks.inputs[3].onChange({ target: { value: "https://next.example/sub" } });
    mocks.inputs[4].onChange({ target: { value: "https://next.example/userinfo" } });
    mocks.inputs[5].onChange({ target: { value: "Meta" } });
    mocks.switches[0].onCheckedChange(true);

    expect(handlers.onUpdateMeta).toHaveBeenCalledWith("source-url", { tag: "B" });
    expect(handlers.onUpdateMeta).toHaveBeenCalledWith("source-url", { nameTemplate: "{name}" });
    expect(handlers.onUpdateContent).toHaveBeenCalledWith("source-url", "https://next.example/sub");
    expect(handlers.onUpdateMeta).toHaveBeenCalledWith("source-url", { userinfoUrl: "https://next.example/userinfo" });
    expect(handlers.onUpdateMeta).toHaveBeenCalledWith("source-url", { userinfoUserAgent: "Meta" });
    expect(handlers.onUpdateMeta).toHaveBeenCalledWith("source-url", { useProxyProviders: true });
  });

  it("edits yaml and node text sources with a textarea", () => {
    const yaml = renderDialog({
      source: { id: "source-yaml", type: "yaml", content: "proxies: []" } as any,
      previewName: "Node",
    });

    expect(yaml.html).toContain("高级编辑：YAML 配置");
    mocks.textareas[0].onChange({ target: { value: "proxy-groups: []" } });
    expect(yaml.handlers.onUpdateContent).toHaveBeenCalledWith("source-yaml", "proxy-groups: []");

    const nodes = renderDialog({
      source: { id: "source-nodes", type: "nodes", content: "ss://node" } as any,
      previewName: "Node",
    });
    expect(nodes.html).toContain("高级编辑：节点链接");
    mocks.textareas[0].onChange({ target: { value: "ss://next" } });
    expect(nodes.handlers.onUpdateContent).toHaveBeenCalledWith("source-nodes", "ss://next");
  });
});
