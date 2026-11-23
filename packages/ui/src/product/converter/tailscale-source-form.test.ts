import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTailscaleFormValues, type TailscaleFormValues } from "@subboost/core/subscription/tailscale-yaml-source";
import { readYamlSource } from "@subboost/core/subscription/yaml-source-nodes";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  textareas: [] as any[],
  chips: [] as any[],
  dialogs: [] as any[],
  dialogContents: [] as any[],
  tabs: [] as any[],
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
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
    // Server rendering never attaches imperative handles; attach them eagerly for these tests.
    useImperativeHandle: (ref: any, create: () => unknown, deps?: React.DependencyList) => {
      if (!stateMock.enabled) return actual.useImperativeHandle(ref, create as any, deps);
      if (typeof ref === "function") ref(create());
      else if (ref) ref.current = create();
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
  DialogContent: (props: any) => {
    mocks.dialogContents.push(props);
    return React.createElement("section", null, props.children);
  },
  DialogBody: (props: any) => React.createElement("div", null, props.children),
  DialogHeader: (props: any) => React.createElement("header", null, props.children),
  DialogTitle: (props: any) => React.createElement("h2", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({ Switch: () => null }));
// Content follows the latest Tabs value, as Radix unmounts inactive pages.
vi.mock("@subboost/ui/components/ui/tabs", () => ({
  Tabs: (props: any) => {
    mocks.tabs.push(props);
    return React.createElement("div", null, props.children);
  },
  TabsList: (props: any) => React.createElement("div", null, props.children),
  TabsTrigger: (props: any) => React.createElement("button", null, props.children),
  TabsContent: (props: any) =>
    props.value === mocks.tabs[mocks.tabs.length - 1]?.value ? React.createElement("div", null, props.children) : null,
}));


import { TailscaleSourceForm } from "./tailscale-source-form";
import { SourceEditorDialog } from "./source-editor-dialog";
import { AddSourceMenu } from "./source-controls";

function valuesOf(content: string, index = 0): TailscaleFormValues {
  const read = readYamlSource(content);
  if (!read.ok) throw new Error(read.reason);
  const result = readTailscaleFormValues(read.document.entries[index].node);
  if (!result.ok) throw new Error(result.reason);
  return result.values;
}

function reset() {
  mocks.buttons = [];
  mocks.inputs = [];
  mocks.textareas = [];
  mocks.chips = [];
  mocks.dialogs = [];
  mocks.dialogContents = [];
  mocks.tabs = [];
}

function button(label: string) {
  const found = mocks.buttons.find((props) => props.children === label);
  if (!found) throw new Error(`missing button ${label}`);
  return found;
}

function withState<T>(overrides: Record<number, unknown>, render: () => T): T {
  reset();
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  try {
    return render();
  } finally {
    stateMock.enabled = false;
  }
}

const TS = "- {name: ts, type: tailscale}\n";

function renderForm(
  initial: TailscaleFormValues,
  extra: Partial<React.ComponentProps<typeof TailscaleSourceForm>> = {},
  stateOverrides: Record<number, unknown> = {}
) {
  const handlers = { onApply: vi.fn(), toContent: vi.fn((values: TailscaleFormValues) => `content:${values.name}`) };
  const html = withState(stateOverrides, () => renderToStaticMarkup(React.createElement(TailscaleSourceForm, {
    initial,
    knownStateDirs: [],
    applyLabel: "应用",
    secondaryAction: React.createElement("button", null, "完成"),
    ...handlers,
    ...extra,
  })));
  return { html, handlers, setters: stateMock.setters };
}

describe("TailscaleSourceForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups login, routing and advanced fields and masks the auth key", () => {
    const { html } = renderForm(valuesOf("- {name: ts, type: tailscale, auth-key: tskey-auth-placeholder, accept-routes: false}\n"));
    expect(html).toContain("登录");
    expect(html).toContain("路由偏好");
    expect(html).toContain("高级设置");
    expect(html).toContain("<button>完成</button>");
    expect(html).toContain("认证密钥 auth-key（可选）");
    expect(html).toContain("持有订阅链接或配置文件的人都能读取");
    // Routing caveats live in the heading's help popover.
    expect(mocks.buttons.some((props) => props["aria-label"] === "路由偏好说明")).toBe(true);
    expect(html).toContain("不会把本设备发布为出口节点");
    // Choice-group headings are not labels: they have no single control to point at.
    expect(html).toMatch(/<p[^>]*>接受子网路由 accept-routes<\/p>/);
    expect(mocks.inputs.find((props) => props.value === "tskey-auth-placeholder")?.type).toBe("password");
    const selected = mocks.chips.filter((chip) => chip.selected).map((chip) => chip.label);
    // Render order: accept-routes, exit-node-allow-lan-access, ephemeral, udp.
    expect(selected).toEqual(["禁用", "默认", "默认", "默认"]);
  });

  it("applies valid values through toContent and keeps invalid ones out", () => {
    const valid = renderForm(valuesOf(TS));
    button("应用").onClick();
    expect(valid.handlers.toContent).toHaveBeenCalledWith(expect.objectContaining({ name: "ts" }));
    expect(valid.handlers.onApply).toHaveBeenCalledWith("content:ts");

    const invalid = renderForm(valuesOf("- {name: '', type: tailscale}\n"));
    button("应用").onClick();
    expect(invalid.handlers.toContent).not.toHaveBeenCalled();
    expect(invalid.handlers.onApply).not.toHaveBeenCalled();
  });

  it("shows why the YAML could not be written", () => {
    const { handlers, setters } = renderForm(valuesOf(TS), {
      toContent: () => {
        throw new Error("本 YAML 中已有同名节点");
      },
    });
    button("应用").onClick();
    expect(handlers.onApply).not.toHaveBeenCalled();
    expect(setters[2]).toHaveBeenCalledWith("本 YAML 中已有同名节点");
  });

  it("explains a write failure that carries no message", () => {
    const { setters } = renderForm(valuesOf(TS), {
      toContent: () => {
        throw "boom";
      },
    });
    button("应用").onClick();
    expect(setters[2]).toHaveBeenCalledWith("无法生成 Tailscale YAML");
  });

  it("warns about a duplicate known state directory without blocking", () => {
    const { html, handlers } = renderForm(valuesOf(TS), { knownStateDirs: ["./tailscale"] });
    expect(html).toContain("可能共享登录状态");
    button("应用").onClick();
    expect(handlers.onApply).toHaveBeenCalledTimes(1);
  });

  describe("leaving with unapplied edits", () => {
    const edited = () => ({ 0: { ...valuesOf(TS), name: "office" } });

    it("asks before a leave request drops edits", () => {
      const ref = { current: null as any };
      const { setters } = renderForm(valuesOf(TS), { ref }, edited());
      const leave = { apply: vi.fn(), discard: vi.fn() };
      ref.current.requestClose(leave);
      expect(setters[3]).toHaveBeenCalledWith(true);
      expect(leave.discard).not.toHaveBeenCalled();
    });

    it("leaves at once when nothing changed", () => {
      const ref = { current: null as any };
      const clean = renderForm(valuesOf(TS), { ref });
      const leave = { apply: vi.fn(), discard: vi.fn() };
      ref.current.requestClose(leave);
      expect(leave.discard).toHaveBeenCalledTimes(1);
      expect(clean.setters[3]).not.toHaveBeenCalled();
    });

    it("applies, discards or keeps editing through the requested exit", () => {
      const ref = { current: null as any };
      const { html, handlers, setters } = renderForm(valuesOf(TS), { ref }, { ...edited(), 3: true });
      expect(html).toContain("表单有未应用的修改");
      const leave = { apply: vi.fn(), discard: vi.fn() };
      ref.current.requestClose(leave);

      button("应用修改").onClick();
      expect(leave.apply).toHaveBeenCalledWith("content:office");
      expect(handlers.onApply).not.toHaveBeenCalled();

      button("放弃修改").onClick();
      expect(leave.discard).toHaveBeenCalledTimes(1);

      button("继续编辑").onClick();
      expect(setters[3]).toHaveBeenCalledWith(false);
    });

    it("keeps the confirmation when the pending edits are invalid", () => {
      const ref = { current: null as any };
      renderForm(valuesOf(TS), { ref }, { 0: { ...valuesOf(TS), name: " " }, 3: true });
      const leave = { apply: vi.fn(), discard: vi.fn() };
      ref.current.requestClose(leave);
      button("应用修改").onClick();
      expect(leave.apply).not.toHaveBeenCalled();
    });
  });

  it("updates fields and clears only the errors of edited fields", () => {
    const { setters } = renderForm(valuesOf(TS), {}, { 1: { name: "请输入节点名称" }, 2: "生成失败" });
    for (const input of mocks.inputs) input.onChange?.({ target: { value: "next-val" } });
    for (const chip of mocks.chips) chip.onClick?.();
    expect(setters[0]).toHaveBeenCalled();
    expect(setters[2]).toHaveBeenCalledWith(null);

    const other = renderForm(valuesOf(TS), {}, { 1: { controlUrl: "err" } });
    mocks.inputs[0].onChange?.({ target: { value: "valid-name" } });
    expect((other.setters[1] as any).lastValue).toEqual({ controlUrl: "err" });
  });
});

describe("AddSourceMenu", () => {
  it("keeps Tailscale under the YAML source description rather than as its own source type", () => {
    reset();
    const html = renderToStaticMarkup(React.createElement(AddSourceMenu, { open: true, onOpenChange: vi.fn(), onAdd: vi.fn() }));
    expect(mocks.buttons.filter((item) => item.children === "menu-item")).toHaveLength(3);
    expect(html).toContain("订阅链接");
    expect(html).toContain("YAML 配置");
    expect(html).toContain("支持通过「高级编辑」表单配置 Tailscale 节点");
    expect(html).toContain("节点链接");
  });
});

describe("SourceEditorDialog", () => {
  // The label above the content editor, distinct from the dialog title.
  const CONTENT_LABEL = '<p class="text-xs text-fg-60">YAML 配置</p>';
  const MIXED = "# home\nproxies:\n  - {name: hk, type: ss, server: 203.0.113.1, port: 443, cipher: aes-128-gcm, password: p}\n  - name: ts\n    type: tailscale\n";
  const yamlSource = (content: string) => ({ id: "y", type: "yaml", content });
  const DRAFT = { ...valuesOf(TS), name: "office", stateDir: "tailscale/a" };
  // State order: page, selection, draft, then the form's values, errors, applyError, confirming.
  const onPage = (selection: "new" | number, extra: Record<number, unknown> = {}) => ({ 0: "tailscale", 1: selection, 2: DRAFT, ...extra });
  const edited = () => ({ ...valuesOf(MIXED, 1), hostname: "laptop" });

  function renderEditor(source: any, overrides: Record<number, unknown> = {}) {
    const props = {
      source,
      previewName: "Node",
      onClose: vi.fn(),
      onUpdateContent: vi.fn(),
      onUpdateMeta: vi.fn(),
      onApplyContent: vi.fn(),
      tailscaleStateDirs: [],
    };
    const html = withState(overrides, () => renderToStaticMarkup(React.createElement(SourceEditorDialog, props)));
    return { html, props, setters: stateMock.setters, tabs: mocks.tabs[0] };
  }

  const chip = (text: string) => {
    const found = mocks.chips.find((props) => renderToStaticMarkup(React.createElement(React.Fragment, null, props.label)).includes(text));
    if (!found) throw new Error(`missing chip ${text}`);
    return found;
  };

  it("opens on the YAML page, with Tailscale on its own page", () => {
    const { html, tabs } = renderEditor(yamlSource(MIXED));
    expect(tabs.value).toBe("yaml");
    expect(html).toContain(CONTENT_LABEL);
    expect(mocks.textareas[0]?.placeholder).toContain("Tailscale 页签");
    expect(mocks.textareas[0]?.placeholder).not.toContain("高级编辑");
    expect(html).toContain("标签（tag）");
    expect(html).toContain(">Tailscale</button>");
    expect(html).not.toContain("Tailscale / Headscale");
    expect(mocks.buttons.some((props) => props.children === "完成")).toBe(true);
    // Text editors take a fixed share of the screen; the text area absorbs the rest.
    expect(mocks.dialogContents[0].className).toContain("h-[85dvh]");
  });

  it("opens directly on the Tailscale page for editable Tailscale-only YAML and falls back when unreadable", () => {
    for (const content of [
      TS,
      "name: ts\ntype: tailscale\n",
      'name: ts\ntype: "tail\\x73cale"\n',
      "proxies:\n  - {name: ts, type: tailscale}\n  - {name: backup, type: tailscale}\n",
    ]) {
      const { html, tabs } = renderEditor(yamlSource(content));
      expect(tabs.value).toBe("tailscale");
      expect(html).toContain("写入这份 YAML 的 proxies 列表");
      expect(chip("ts").selected).toBe(true);
      expect(mocks.buttons.some((props) => props.children === "应用到 YAML")).toBe(true);
    }

    for (const content of [
      "proxies: [{name: ts, type: tailscale}]\n",
      "type: tailscale\nhostname: office\n",
      "name: ts\ntype: tailscale\ncontrol-url: ftp://invalid.example\n",
      "proxies:\n  - name: ts\n    type: tailscale\n    hostname: office\n  - name: ts\n    type: tailscale\n    hostname: home\n",
      "proxies:\n  - name: ts\n    type: tailscale\n    note: |\n      hello\n      # body\n",
      "port: 7890\nport: 7891\nproxies:\n  - name: ts\n    type: tailscale\n",
      "proxies:\n  - name: ts\n    type: tailscale\n    extra:\n      a: 1\n      a: 2\n",
      "proxies:\n  - {name: odd, type: tailscale, hostname: [a]}\n",
      "proxies:\n  - name: editable\n    type: tailscale\n    state-dir: tailscale/editable\n  - name: unsupported\n    type: tailscale\n    hostname: [a]\n",
    ]) {
      const { tabs } = renderEditor(yamlSource(content));
      expect(tabs.value).toBe("yaml");
    }
  });

  it("uses current YAML to choose the initial page and skips detection for large YAML", () => {
    const parsedTailscale = { ...yamlSource(TS), parsed: true, lastParsedContent: TS };
    expect(renderEditor(parsedTailscale).tabs.value).toBe("tailscale");
    expect(renderEditor({ ...parsedTailscale, content: MIXED }).tabs.value).toBe("yaml");

    const largeSsYaml = `proxies:\n${"  - {name: hk, type: ss, server: 203.0.113.1, port: 443, cipher: aes-128-gcm, password: p}\n".repeat(800)}`;
    expect(largeSsYaml.length).toBeGreaterThan(64 * 1024);
    expect(renderEditor(yamlSource(largeSsYaml)).tabs.value).toBe("yaml");
    expect(renderEditor(yamlSource(`${largeSsYaml}# tailscale\n`)).tabs.value).toBe("yaml");
  });

  it("keeps a commented node in YAML and explains why the form cannot edit it", () => {
    const source = yamlSource("proxies:\n  - name: ts\n    type: tailscale\n    state-dir: tailscale/ts # Keep this\n");
    expect(renderEditor(source).tabs.value).toBe("yaml");
    const { html } = renderEditor(source, onPage(0));
    expect(html).toContain("此节点的 YAML 注释无法通过表单保留");
    expect(html).not.toContain("应用到 YAML");
  });

  it("starts the Tailscale page on a new node with a free name", () => {
    const { tabs, setters } = renderEditor(yamlSource("proxies:\n  - {name: tailscale, type: tailscale}\n"), { 0: "yaml" });
    tabs.onValueChange("tailscale");
    expect(setters[0]).toHaveBeenCalledWith("tailscale");
    expect(setters[1]).toHaveBeenCalledWith("new");
    expect(setters[2]).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tailscale-2", stateDir: expect.stringMatching(/^tailscale\/subboost-/) })
    );
  });

  it("adds a node from the Tailscale page and returns to the YAML", () => {
    const { html, props, setters } = renderEditor(yamlSource(MIXED), onPage("new"));
    expect(html).toContain("写入这份 YAML 的 proxies 列表");
    // The client requirement lives on the page rather than in a separate document.
    expect(html).toContain("v1.19.25");
    expect(html).not.toContain(CONTENT_LABEL);
    expect(chip("新建节点").selected).toBe(true);
    expect(chip("ts").selected).toBe(false);
    expect(mocks.buttons.some((props) => props.children === "完成")).toBe(true);

    button("添加到 YAML").onClick();
    expect(props.onUpdateContent).toHaveBeenCalledWith("y", `${MIXED}  - name: office\n    type: tailscale\n    state-dir: tailscale/a\n`);
    expect(setters[0]).toHaveBeenCalledWith("yaml");
  });

  it("edits a node chosen on the page, writing only when something changed", () => {
    const changed = renderEditor(yamlSource(MIXED), onPage(1, { 3: edited() }));
    expect(chip("ts").selected).toBe(true);
    button("应用到 YAML").onClick();
    expect(changed.props.onUpdateContent).toHaveBeenCalledWith("y", `${MIXED}    hostname: laptop\n`);
    expect(changed.setters[0]).toHaveBeenCalledWith("yaml");

    const unchanged = renderEditor(yamlSource(MIXED), onPage(1));
    button("应用到 YAML").onClick();
    expect(unchanged.props.onUpdateContent).not.toHaveBeenCalled();
    expect(unchanged.setters[0]).toHaveBeenCalledWith("yaml");
  });

  it("switches nodes and pages at once when the form is clean", () => {
    const { tabs, setters } = renderEditor(yamlSource(MIXED), onPage(1));
    chip("新建节点").onClick();
    expect(setters[1]).toHaveBeenCalledWith("new");
    expect(setters[2]).toHaveBeenCalledWith(expect.objectContaining({ name: "tailscale" }));
    tabs.onValueChange("yaml");
    expect(setters[0]).toHaveBeenCalledWith("yaml");
  });

  it("asks before another node or page drops unapplied edits", () => {
    const dirty = renderEditor(yamlSource(MIXED), onPage(1, { 3: edited() }));
    chip("新建节点").onClick();
    dirty.tabs.onValueChange("yaml");
    expect(dirty.setters[6]).toHaveBeenCalledTimes(2);
    expect(dirty.setters[1]).not.toHaveBeenCalled();
    expect(dirty.setters[0]).not.toHaveBeenCalled();

    // With the confirmation open: applying writes the node, then makes the requested switch.
    const confirming = renderEditor(yamlSource(MIXED), onPage(1, { 3: edited(), 6: true }));
    chip("新建节点").onClick();
    button("应用修改").onClick();
    expect(confirming.props.onUpdateContent).toHaveBeenCalledWith("y", `${MIXED}    hostname: laptop\n`);
    expect(confirming.setters[1]).toHaveBeenCalledWith("new");

    const discarding = renderEditor(yamlSource(MIXED), onPage(1, { 3: edited(), 6: true }));
    discarding.tabs.onValueChange("yaml");
    button("放弃修改").onClick();
    expect(discarding.props.onUpdateContent).not.toHaveBeenCalled();
    expect(discarding.setters[0]).toHaveBeenCalledWith("yaml");
  });

  it("asks before closing the dialog drops unapplied edits, and can apply and close", () => {
    const dirty = renderEditor(yamlSource(MIXED), onPage(1, { 3: edited() }));
    mocks.dialogs[0].onOpenChange(false);
    button("完成").onClick();
    expect(dirty.props.onClose).not.toHaveBeenCalled();
    expect(dirty.setters[6]).toHaveBeenCalledTimes(2);

    const confirming = renderEditor(yamlSource(MIXED), onPage(1, { 3: edited(), 6: true }));
    mocks.dialogs[0].onOpenChange(false);
    button("应用修改").onClick();
    expect(confirming.props.onApplyContent).toHaveBeenCalledWith(`${MIXED}    hostname: laptop\n`);
    button("放弃修改").onClick();
    expect(confirming.props.onClose).toHaveBeenCalledTimes(1);

    const clean = renderEditor(yamlSource(MIXED), onPage(1));
    mocks.dialogs[0].onOpenChange(false);
    expect(clean.props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes at once from the YAML page and from other source types", () => {
    const text = renderEditor(yamlSource(MIXED));
    mocks.dialogs[0].onOpenChange(false);
    button("完成").onClick();
    expect(text.props.onClose).toHaveBeenCalledTimes(2);

    const url = renderEditor({ id: "u", type: "url", content: "https://local.subboost.test/sub" });
    expect(mocks.tabs).toHaveLength(0);
    expect(mocks.dialogContents[0].className).not.toContain("h-[85dvh]");
    mocks.dialogs[0].onOpenChange(false);
    expect(url.props.onClose).toHaveBeenCalledTimes(1);

    renderEditor({ id: "n", type: "nodes", content: "ss://node" });
    expect(mocks.dialogContents[0].className).toContain("h-[85dvh]");
  });

  it("ignores requests for the page or node already shown", () => {
    const { tabs, setters } = renderEditor(yamlSource(MIXED), onPage("new"));
    tabs.onValueChange("tailscale");
    chip("新建节点").onClick();
    expect(setters[0]).not.toHaveBeenCalled();
    expect(setters[1]).not.toHaveBeenCalled();

    // A clean form switches straight to an existing node without a new draft.
    chip("ts").onClick();
    expect(setters[1]).toHaveBeenCalledWith(1);
    expect(setters[2]).not.toHaveBeenCalled();
  });

  it("lists nodes the form cannot read and explains when one is chosen", () => {
    const ODD = "proxies:\n  - {type: tailscale, state-dir: tailscale/x}\n  - {name: odd, type: tailscale, hostname: [a]}\n";
    const unnamed = renderEditor(yamlSource(ODD), onPage(0));
    expect(chip("（未命名）").selected).toBe(true);
    expect(unnamed.html).toContain("名称");

    const odd = renderEditor(yamlSource(ODD), onPage(1));
    expect(odd.html).toContain("hostname 不是字符串");
    // Without a form, the YAML page opens at once.
    odd.tabs.onValueChange("yaml");
    expect(odd.setters[0]).toHaveBeenCalledWith("yaml");

    const missing = renderEditor(yamlSource(ODD), onPage(5));
    expect(missing.html).toContain("找不到该节点");
  });

  it("starts a fresh draft even when the YAML cannot be read", () => {
    const { tabs, setters } = renderEditor(yamlSource("x: &a v\n"));
    tabs.onValueChange("tailscale");
    expect(setters[2]).toHaveBeenCalledWith(expect.objectContaining({ name: "tailscale" }));
  });

  it("explains on the page when the form cannot write this YAML", () => {
    const anchored = renderEditor(yamlSource("x: &a v\nproxies:\n  - {name: ts, type: tailscale, hostname: *a}\n"), onPage("new"));
    expect(anchored.html).toContain("无法用表单写入这份 YAML");
    expect(anchored.html).toContain("YAML 锚点");
    button("完成").onClick();
    expect(anchored.props.onClose).toHaveBeenCalledTimes(1);

    const inline = renderEditor(yamlSource("proxies: [{name: ts, type: tailscale}]\n"), onPage("new"));
    expect(inline.html).toContain("行内列表");
    expect(mocks.buttons.some((props) => props.children === "添加到 YAML")).toBe(false);
    renderEditor(yamlSource("proxies: [{name: ts, type: tailscale}]\n"), onPage(0));
    expect(mocks.buttons.some((props) => props.children === "应用到 YAML")).toBe(false);
  });
});
