import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTailscaleSourceDocument, type TailscaleSourceDocument } from "@subboost/core/subscription/tailscale-yaml-source";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  textareas: [] as any[],
  chips: [] as any[],
  dialogs: [] as any[],
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

vi.mock("lucide-react", () => ({
  CircleHelp: () => null,
  Eye: () => null,
  EyeOff: () => null,
  FileCode: () => null,
  HelpCircle: () => null,
  Link2: () => null,
  Menu: () => null,
  Network: () => null,
  Plus: () => null,
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
vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuContent: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuItem: (props: any) => {
    mocks.buttons.push({ children: "menu-item", onClick: props.onSelect });
    return React.createElement("div", null, props.children);
  },
  DropdownMenuTrigger: (props: any) => React.createElement("div", null, props.children),
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
  Dialog: (props: any) => {
    mocks.dialogs.push(props);
    return React.createElement("div", null, props.children);
  },
  DialogContent: (props: any) => React.createElement("section", null, props.children),
  DialogHeader: (props: any) => React.createElement("header", null, props.children),
  DialogTitle: (props: any) => React.createElement("h2", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({ Switch: () => null }));

import { TailscaleSourceForm } from "./tailscale-source-form";
import { SourceEditorDialog } from "./source-editor-dialog";
import { TailscaleDraftDialog } from "./tailscale-draft-dialog";
import { AddSourceMenu } from "./source-controls";

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
  mocks.dialogs = [];
}

function button(label: string) {
  const found = mocks.buttons.find((props) => props.children === label);
  if (!found) throw new Error(`missing button ${label}`);
  return found;
}

function renderForm(
  content: string,
  extra: Partial<React.ComponentProps<typeof TailscaleSourceForm>> = {},
  stateOverrides: Record<number, unknown> = {}
) {
  reset();
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = stateOverrides;
  stateMock.setters = [];
  const handlers = { onApply: vi.fn(), onCancel: vi.fn(), onSwitchToRaw: vi.fn() };
  try {
    const html = renderToStaticMarkup(React.createElement(TailscaleSourceForm, {
      document: documentOf(content),
      knownStateDirs: [],
      applyLabel: "应用",
      ...handlers,
      ...extra,
    }));
    return { html, handlers, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
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

  it("updates fields, clears field errors, and handles dirty raw switching and serialization errors", () => {
    const doc = documentOf("- {name: ts, type: tailscale}\n");
    const dirtyValues = { ...doc.initial, name: "office", hostname: "dev", authKey: "k", controlUrl: "https://hs.example.com", exitNode: "100.64.0.1", stateDir: "tailscale/dev" };
    const { html, handlers, setters } = renderForm(
      "- {name: ts, type: tailscale}\n",
      {},
      { 0: dirtyValues, 1: { name: "请输入节点名称" }, 2: "生成失败", 3: true }
    );
    expect(html).toContain("表单有未应用的修改");
    expect(html).toContain("生成失败");

    for (const input of mocks.inputs) {
      input.onChange?.({ target: { value: "next-val" } });
    }
    for (const chip of mocks.chips) {
      chip.onClick?.();
    }
    expect(setters[0]).toHaveBeenCalled();
    expect(setters[1]).toHaveBeenCalled();
    expect(setters[2]).toHaveBeenCalledWith(null);

    button("切换到 YAML").onClick();
    expect(setters[3]).toHaveBeenCalledWith(true);

    button("应用并切换").onClick();
    expect(handlers.onSwitchToRaw).toHaveBeenCalledWith(expect.stringContaining("office"));

    button("放弃修改并切换").onClick();
    expect(handlers.onSwitchToRaw).toHaveBeenCalledWith(null);

    button("继续编辑").onClick();
    expect(setters[3]).toHaveBeenCalledWith(false);

    //Without onSwitchToRaw, the switch button is omitted; calling handleSwitchToRaw is a no-op; invalid dirty values do not switch.
    const invalidDirty = renderForm(
      "- {name: ts, type: tailscale}\n",
      { onSwitchToRaw: undefined },
      { 0: { ...doc.initial, controlUrl: "not-a-url" }, 3: true }
    );
    expect(mocks.buttons.some((b) => b.children === "切换到 YAML")).toBe(false);
    button("应用并切换").onClick();
    expect(invalidDirty.handlers.onApply).not.toHaveBeenCalled();

    // Update a field that does not currently have an error so the no-error branch of setErrors runs.
    const cleanFieldUpdate = renderForm("- {name: ts, type: tailscale}\n", {}, { 1: { controlUrl: "err" } });
    mocks.inputs[0].onChange?.({ target: { value: "valid-name" } });
    expect((cleanFieldUpdate.setters[1] as any).lastValue).toEqual({ controlUrl: "err" });

    // Serialization exception surfaces in applyError.
    const brokenDoc: TailscaleSourceDocument = { content: "proxies: [\n", initial: doc.initial };
    reset();
    stateMock.enabled = true;
    stateMock.callIndex = 0;
    stateMock.overrides = { 0: dirtyValues };
    stateMock.setters = [];
    try {
      renderToStaticMarkup(React.createElement(TailscaleSourceForm, {
        document: brokenDoc,
        knownStateDirs: [],
        applyLabel: "应用",
        onApply: vi.fn(),
        onCancel: vi.fn(),
      }));
      button("应用").onClick();
      expect(stateMock.setters[2]).toHaveBeenCalledWith(expect.any(String));
    } finally {
      stateMock.enabled = false;
    }
  });
});

describe("AddSourceMenu Tailscale item", () => {
  it("renders the Tailscale item in full and compact modes when onAddTailscale is provided", () => {
    const onAdd = vi.fn();
    const onAddTailscale = vi.fn();
    reset();
    const full = renderToStaticMarkup(React.createElement(AddSourceMenu, {
      open: true,
      onOpenChange: vi.fn(),
      onAdd,
      onAddTailscale,
    }));
    expect(full).toContain("Tailscale 节点");
    expect(full).toContain("用表单添加 Tailscale / Headscale 出站");
    mocks.buttons.at(-1)?.onClick();
    expect(onAddTailscale).toHaveBeenCalledTimes(1);

    reset();
    const compact = renderToStaticMarkup(React.createElement(AddSourceMenu, {
      open: true,
      onOpenChange: vi.fn(),
      onAdd,
      onAddTailscale,
      compact: true,
    }));
    expect(compact).toContain("Tailscale 节点");
    expect(compact).not.toContain("用表单添加 Tailscale / Headscale 出站");

    reset();
    const withoutTailscale = renderToStaticMarkup(React.createElement(AddSourceMenu, {
      open: true,
      onOpenChange: vi.fn(),
      onAdd,
    }));
    expect(withoutTailscale).not.toContain("Tailscale 节点");
  });

  it("renders the draft dialog when a draft is present and cancels when closed", () => {
    reset();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const draft = documentOf("- {name: ts, type: tailscale}\n");
    const html = renderToStaticMarkup(React.createElement(TailscaleDraftDialog, {
      draft,
      knownStateDirs: [],
      onApply,
      onCancel,
    }));
    expect(html).toContain("添加 Tailscale 节点");
    expect(html).toContain("添加并导入");
    mocks.dialogs[0].onOpenChange(true);
    expect(onCancel).not.toHaveBeenCalled();
    mocks.dialogs[0].onOpenChange(false);
    expect(onCancel).toHaveBeenCalledTimes(1);

    reset();
    const emptyHtml = renderToStaticMarkup(React.createElement(TailscaleDraftDialog, {
      draft: null,
      knownStateDirs: [],
      onApply,
      onCancel,
    }));
    expect(emptyHtml).not.toContain("添加并导入");
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

  it("opens compatible YAML in the Tailscale form and switches between form and raw modes", () => {
    reset();
    const onUpdateContent = vi.fn();
    const html = renderToStaticMarkup(React.createElement(SourceEditorDialog, {
      ...props({ id: "y", type: "yaml", content: "- {name: ts, type: tailscale}\n" }, vi.fn()),
      onUpdateContent,
    }));
    expect(html).toContain("路由偏好");
    expect(mocks.textareas).toHaveLength(0);

    // Switch to raw without changes, then with changes.
    button("切换到 YAML").onClick();
    expect(onUpdateContent).not.toHaveBeenCalled();

    // Render in raw mode when form is available, and switch back to form mode.
    reset();
    stateMock.enabled = true;
    stateMock.callIndex = 0;
    stateMock.overrides = { 0: "raw" };
    stateMock.setters = [];
    try {
      const rawHtml = renderToStaticMarkup(React.createElement(SourceEditorDialog, {
        ...props({ id: "y", type: "yaml", content: "- {name: ts, type: tailscale}\n" }, vi.fn()),
        onUpdateContent,
      }));
      expect(rawHtml).toContain("切换到 Tailscale 表单");
      button("切换到 Tailscale 表单").onClick();
      expect(stateMock.setters[0]).toHaveBeenCalledWith("form");
    } finally {
      stateMock.enabled = false;
    }

    // Switching to raw with applied content updates the source content before entering raw mode.
    const doc = documentOf("- {name: ts, type: tailscale}\n");
    reset();
    stateMock.enabled = true;
    stateMock.callIndex = 0;
    stateMock.overrides = { 0: "form", 1: { ...doc.initial, name: "renamed" }, 4: true };
    stateMock.setters = [];
    try {
      renderToStaticMarkup(React.createElement(SourceEditorDialog, {
        ...props({ id: "y", type: "yaml", content: "- {name: ts, type: tailscale}\n" }, vi.fn()),
        onUpdateContent,
      }));
      button("应用并切换").onClick();
      expect(onUpdateContent).toHaveBeenCalledWith("y", expect.stringContaining("renamed"));
      expect(stateMock.setters[0]).toHaveBeenCalledWith("raw");
    } finally {
      stateMock.enabled = false;
    }
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
