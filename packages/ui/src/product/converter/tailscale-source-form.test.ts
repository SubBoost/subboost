import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTailscaleSourceDocument, type TailscaleSourceDocument } from "@subboost/core/subscription/tailscale-yaml-source";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  textareas: [] as any[],
  chips: [] as any[],
}));

vi.mock("lucide-react", () => ({
  CircleHelp: () => null,
  Eye: () => null,
  EyeOff: () => null,
  FileCode: () => null,
  HelpCircle: () => null,
  Link2: () => null,
  Server: () => null,
  X: () => null,
}));
vi.mock("@radix-ui/react-popover", () => ({
  Anchor: (props: any) => props.children,
  Arrow: () => null,
  Close: (props: any) => props.children,
  Content: (props: any) => props.children,
  Portal: (props: any) => props.children,
  Root: (props: any) => props.children,
  Trigger: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", null, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", { value: props.value, type: props.type, readOnly: true });
  },
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.textareas.push(props);
    return React.createElement("textarea", { value: props.value, readOnly: true });
  },
}));
vi.mock("@subboost/ui/components/ui/choice-group", () => ({
  ChoiceGroup: (props: any) => React.createElement("div", { "aria-label": props.label }, props.children),
  ChoiceChip: (props: any) => {
    mocks.chips.push(props);
    return React.createElement("span", { "data-selected": String(props.selected) }, props.label);
  },
}));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => React.createElement("div", null, props.children),
  DialogContent: (props: any) => React.createElement("section", null, props.children),
  DialogHeader: (props: any) => React.createElement("header", null, props.children),
  DialogTitle: (props: any) => React.createElement("h2", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({ Switch: () => null }));

import { TailscaleSourceForm } from "./tailscale-source-form";
import { SourceEditorDialog } from "./source-editor-dialog";

function documentOf(content: string): TailscaleSourceDocument {
  const result = parseTailscaleSourceDocument(content);
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

function reset() {
  mocks.buttons = [];
  mocks.inputs = [];
  mocks.textareas = [];
  mocks.chips = [];
}

function button(label: string) {
  const found = mocks.buttons.find((props) => props.children === label);
  if (!found) throw new Error(`missing button ${label}`);
  return found;
}

function renderForm(content: string, extra: Partial<React.ComponentProps<typeof TailscaleSourceForm>> = {}) {
  reset();
  const handlers = { onApply: vi.fn(), onCancel: vi.fn(), onSwitchToRaw: vi.fn() };
  const html = renderToStaticMarkup(React.createElement(TailscaleSourceForm, {
    document: documentOf(content),
    knownStateDirs: [],
    applyLabel: "应用",
    ...handlers,
    ...extra,
  }));
  return { html, handlers };
}

describe("TailscaleSourceForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups login, routing and advanced fields and masks the auth key", () => {
    const { html } = renderForm("- {name: ts, type: tailscale, auth-key: tskey-auth-placeholder, accept-routes: false}\n");
    expect(html).toContain("登录");
    expect(html).toContain("路由偏好");
    expect(html).toContain("高级设置");
    expect(html).toContain("不会把本设备发布为出口节点");
    expect(html).toContain("公网 URL 测速中可能显示失败");
    expect(html).toContain("不一定会重置客户端已保存的运行时偏好");
    expect(mocks.inputs.find((props) => props.value === "tskey-auth-placeholder")?.type).toBe("password");
    const selected = mocks.chips.filter((chip) => chip.selected).map((chip) => chip.label);
    // Render order: accept-routes, exit-node-allow-lan-access, ephemeral, udp.
    expect(selected).toEqual(["禁用", "默认", "默认", "默认"]);
  });

  it("applies an unchanged form with the original bytes", () => {
    const content = "# keep me\n- name: ts  # trailing\n  type: tailscale\n";
    const { handlers } = renderForm(content);
    button("应用").onClick();
    expect(handlers.onApply).toHaveBeenCalledWith(content);
  });

  it("does not apply an invalid draft", () => {
    const { handlers } = renderForm("- {name: '', type: tailscale}\n");
    button("应用").onClick();
    expect(handlers.onApply).not.toHaveBeenCalled();
  });

  it("switches to raw without writing when nothing changed", () => {
    const { handlers } = renderForm("- {name: ts, type: tailscale}\n");
    button("切换到 YAML").onClick();
    expect(handlers.onSwitchToRaw).toHaveBeenCalledWith(null);
    button("取消").onClick();
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("warns about a duplicate known state directory without blocking", () => {
    const { html, handlers } = renderForm("- {name: ts, type: tailscale}\n", { knownStateDirs: ["./tailscale"] });
    expect(html).toContain("可能共享登录状态");
    button("应用").onClick();
    expect(handlers.onApply).toHaveBeenCalledTimes(1);
  });
});

describe("SourceEditorDialog YAML modes", () => {
  const props = (source: any, onApplyContent: any) => ({
    source,
    previewName: "Node",
    onClose: vi.fn(),
    onUpdateContent: vi.fn(),
    onUpdateMeta: vi.fn(),
    onApplyContent,
    tailscaleStateDirs: [],
  });

  it("opens compatible YAML in the Tailscale form", () => {
    reset();
    const html = renderToStaticMarkup(React.createElement(SourceEditorDialog,
      props({ id: "y", type: "yaml", content: "- {name: ts, type: tailscale}\n" }, vi.fn())));
    expect(html).toContain("路由偏好");
    expect(mocks.textareas).toHaveLength(0);
  });

  it("keeps unsupported YAML and editors without an apply handler in raw mode", () => {
    for (const [content, apply] of [
      ["proxies:\n  - {name: a, type: tailscale}\n  - {name: b, type: tailscale}\n", vi.fn()],
      ["- {name: ts, type: tailscale}\n", undefined],
    ] as const) {
      reset();
      const html = renderToStaticMarkup(React.createElement(SourceEditorDialog, props({ id: "y", type: "yaml", content }, apply)));
      expect(html).not.toContain("路由偏好");
      expect(mocks.textareas[0].value).toBe(content);
    }
  });
});
