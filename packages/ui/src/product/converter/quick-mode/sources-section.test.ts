import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  userStore: {} as Record<string, any>,
  interactions: {
    sourceAdded: vi.fn(),
    sourceImported: vi.fn(),
  },
  getSubscriptionUserInfoDisplay: vi.fn(),
  markSourceAsPendingImport: vi.fn(),
  moveSubscriptionSource: vi.fn(),
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
    createElement: (type: any, props: any, ...children: any[]) => {
      if (type === "button") {
        mocks.captures.rawButtons ||= [];
        mocks.captures.rawButtons.push(props || {});
      }
      return actual.createElement(type, props, ...children);
    },
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
  const capture = (type: any, props: any, key?: any) => {
    if (type === "button") {
      mocks.captures.rawButtons ||= [];
      mocks.captures.rawButtons.push(props || {});
    }
    return actual.jsx(type, props, key);
  };
  return {
    ...actual,
    jsx: capture,
    jsxs: capture,
  };
});

vi.mock("@radix-ui/react-popover", () => ({
  Root: (props: any) => props.children,
  Trigger: (props: any) => props.children,
  Portal: (props: any) => props.children,
  Content: (props: any) => props.children,
  Arrow: () => null,
}));
vi.mock("lucide-react", () => ({
  AlertCircle: () => null,
  Check: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  ChevronUp: () => null,
  HelpCircle: () => null,
  Loader2: () => null,
  Maximize2: () => null,
  Menu: () => null,
  Plus: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.captures.textareas.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (props: any) => props.children }));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    mocks.captures.dialog = props;
    return props.children;
  },
  DialogContent: (props: any) => props.children,
  DialogHeader: (props: any) => props.children,
  DialogTitle: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));
vi.mock("@subboost/core/node-name-template", () => ({
  DEFAULT_NODE_NAME_TEMPLATE: "[{tag}] {name}",
  formatNodeNameFromTemplate: ({ originName, tag, template }: any) => `${template || "[{tag}] {name}"}:${tag || ""}:${originName}`,
}));
vi.mock("@subboost/core/subscription/import-error", () => ({
  normalizeSubscriptionImportErrorInfo: (value: any) => (value ? { message: value.message || String(value) } : null),
}));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return {
    getNodeSourceIds: (node: any) => (Array.isArray(node?._sourceIds) ? node._sourceIds : []),
    useConfigStore,
  };
});
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.userStore }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/product/converter/subscription-import-error", () => ({
  SubscriptionImportErrorBadge: (props: any) => {
    mocks.captures.errorBadge = props;
    return null;
  },
}));
vi.mock("@subboost/ui/product/converter/provider-mode-status-bar", () => ({
  ProviderModeStatusBar: (props: any) => {
    mocks.captures.statusBars.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/product/converter/provider-settings-fields", () => ({
  ProviderSettingsFields: (props: any) => {
    mocks.captures.providerSettings.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/product/subscription/subscription-userinfo-display", () => ({
  getSubscriptionUserInfoDisplay: mocks.getSubscriptionUserInfoDisplay,
}));
vi.mock("@subboost/ui/product/subscription/source-import-state", () => ({
  markSourceAsPendingImport: mocks.markSourceAsPendingImport,
}));
vi.mock("@subboost/ui/product/subscription/source-order", () => ({ moveSubscriptionSource: mocks.moveSubscriptionSource }));
vi.mock("@subboost/ui/product/converter/source-display-label", () => ({
  buildSourceDisplayLabel: ({ typeLabel, order, total, tag }: any) => `${typeLabel} ${order}/${total}${tag ? ` ${tag}` : ""}`,
}));
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => mocks.interactions }));
vi.mock("./constants", () => ({
  sourceTypeInfo: {
    url: {
      label: "URL",
      description: "URL source",
      placeholder: "https://example.com/sub",
      icon: () => null,
    },
    text: {
      label: "Text",
      description: "Text source",
      placeholder: "ss://node",
      icon: () => null,
    },
  },
}));

import { SourcesSection } from "./sources-section";

const urlSource = {
  id: "s1",
  type: "url",
  content: "https://example.com/sub",
  tag: "HK",
  nameTemplate: "[{tag}] {name}",
  useProxyProviders: false,
  userinfoUrl: "https://example.com/userinfo",
  userinfoUserAgent: "clash",
  parsed: true,
  nodeCount: 2,
  subscriptionUserInfo: { upload: 1 },
};

const textSource = {
  id: "s2",
  type: "text",
  content: "ss://node",
  error: "parse failed",
  parsed: false,
  parsing: false,
};

function renderSection(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.textareas = [];
  mocks.captures.switches = [];
  mocks.captures.statusBars = [];
  mocks.captures.providerSettings = [];
  mocks.captures.rawButtons = [];
  try {
    const html = renderToStaticMarkup(React.createElement(SourcesSection));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("quick mode SourcesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [], inputs: [], textareas: [], switches: [], statusBars: [], providerSettings: [], rawButtons: [] };
    mocks.getSubscriptionUserInfoDisplay.mockReturnValue({ traffic: "1 GB", expire: "2026-01-01" });
    mocks.markSourceAsPendingImport.mockImplementation((source) => ({ ...source, pendingImport: true }));
    mocks.moveSubscriptionSource.mockImplementation((sources) => sources.slice().reverse());
    mocks.store = {
      nodes: [
        { name: "Alpha", type: "ss", _sourceIds: ["s1"] },
        { name: "Beta", type: "vless", _sourceIds: ["s1"] },
      ],
      parseErrors: [{ message: "bad subscription" }],
      sources: [urlSource, textSource],
      setSources: vi.fn(),
      parseSingleSource: vi.fn(),
    };
    mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 2 } } };
  });

  it("renders source status, errors, add controls, and the expanded editor", () => {
    renderSection({ 0: true, 1: "s1" });

    expect(mocks.captures.errorBadge).toEqual(expect.objectContaining({ errorMessage: "parse failed" }));
    expect(mocks.captures.dialog).toEqual(expect.objectContaining({ open: true }));
    expect(mocks.captures.inputs.some((props: any) => props.value === "https://example.com/sub")).toBe(true);
    // 对话框换位后，url 输入行是对话框里的第一个 Input
    expect(mocks.captures.inputs[0]).toEqual(expect.objectContaining({ value: "https://example.com/sub" }));
    expect(mocks.captures.inputs.some((props: any) => props.value === "HK")).toBe(true);
    expect(mocks.captures.inputs.some((props: any) => props.readOnly)).toBe(true);
    expect(mocks.captures.textareas.some((props: any) => props.value === "ss://node")).toBe(true);
    // 主界面 url 编辑框：textarea + 内嵌状态栏
    expect(mocks.captures.textareas.some((props: any) => props.value === "https://example.com/sub")).toBe(true);
    expect(mocks.captures.statusBars).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ id: "s1", useProxyProviders: false }),
        defaultProviderKey: "url_s1",
      }),
    ]);
    expect(mocks.captures.switches).toEqual([expect.objectContaining({ checked: false })]);
  });

  it("updates source content and metadata through captured inputs", () => {
    renderSection({ 1: "s1" });

    const mainUrlEditor = mocks.captures.textareas.find((props: any) => props.placeholder === "https://example.com/sub");
    mainUrlEditor.onChange({ target: { value: "https://main.example/sub\n" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "https://main.example/sub" }));

    const enterEvent = { key: "Enter", preventDefault: vi.fn() };
    mainUrlEditor.onKeyDown(enterEvent);
    expect(enterEvent.preventDefault).toHaveBeenCalled();

    mocks.captures.statusBars[0].onCheckedChange(true);
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ useProxyProviders: true }));

    const mainUrlInput = mocks.captures.inputs.find((props: any) => props.placeholder === "https://example.com/sub" && props.value === urlSource.content);
    mainUrlInput.onChange({ target: { value: "https://new.example/sub" } });
    expect(mocks.store.setSources).toHaveBeenCalledWith(expect.any(Array));
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "https://new.example/sub" }));

    const textArea = mocks.captures.textareas.find((props: any) => props.value === "ss://node");
    textArea.onChange({ target: { value: "trojan://node" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "trojan://node" }));

    const tagInput = mocks.captures.inputs.find((props: any) => props.value === "HK");
    tagInput.onChange({ target: { value: "JP" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ tag: "JP" }));

    const templateInput = mocks.captures.inputs.find((props: any) => props.value === "[{tag}] {name}");
    templateInput.onChange({ target: { value: "{tag}-{name}" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ nameTemplate: "{tag}-{name}" }));

    mocks.captures.switches[0].onCheckedChange(true);
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ useProxyProviders: true }));

    const userinfoUrlInput = mocks.captures.inputs.find((props: any) => props.value === "https://example.com/userinfo");
    userinfoUrlInput.onChange({ target: { value: "https://new.example/userinfo" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ userinfoUrl: "https://new.example/userinfo" }));

    const userinfoUaInput = mocks.captures.inputs.find((props: any) => props.value === "clash");
    userinfoUaInput.onChange({ target: { value: "clash.meta/v1.19.16" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ userinfoUserAgent: "clash.meta/v1.19.16" }));
  });

  it("closes the expanded editor and triggers re-import only when metadata changed", () => {
    renderSection({
      1: "s1",
      2: {
        id: "s1",
        content: "old",
        tag: "OLD",
        nameTemplate: "old",
        useProxyProviders: true,
        userinfoUrl: "old",
        userinfoUserAgent: "old",
      },
    });

    mocks.captures.dialog.onOpenChange(false);
    expect(mocks.store.parseSingleSource).toHaveBeenCalledWith("s1");
    expect(stateMock.setters[1]).toHaveBeenCalledWith(null);

    mocks.store.parseSingleSource.mockClear();
    renderSection({
      1: "s1",
      2: {
        id: "s1",
        content: urlSource.content,
        tag: "HK",
        nameTemplate: "[{tag}] {name}",
        useProxyProviders: false,
        userinfoUrl: "https://example.com/userinfo",
        userinfoUserAgent: "clash",
      },
    });
    mocks.captures.buttons.at(-1).onClick();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
  });

  it("handles collapsed editor, empty nodes, anonymous quotas, and unchanged updates", () => {
    mocks.userStore = { user: null };
    mocks.store.nodes = [];
    mocks.store.parseErrors = [];
    mocks.store.sources = [{ ...urlSource, content: "", parsed: false, nodeCount: undefined }];
    renderSection();
    expect(mocks.captures.dialog).toEqual(expect.objectContaining({ open: false }));

    mocks.store.setSources.mockClear();
    const emptyEditor = mocks.captures.textareas.find((props: any) => props.placeholder === "https://example.com/sub");
    emptyEditor.onChange({ target: { value: "" } });
    expect(mocks.store.setSources).toHaveBeenCalledWith(expect.any(Array));
  });

  it("imports sources and reports success, runtime, and validation outcomes", async () => {
    renderSection();

    mocks.captures.rawButtons.find((props: any) => props.title === "重新导入").onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.store.parseSingleSource).toHaveBeenCalledWith("s1");
    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith({
      mode: "quick",
      sourceType: "url",
      result: "success",
      sourceCount: 2,
      nodeCount: 2,
      usesProxyProvider: false,
    });

    mocks.interactions.sourceImported.mockClear();
    mocks.captures.rawButtons.find((props: any) => props.title === "导入此源").onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.store.parseSingleSource).toHaveBeenCalledWith("s2");
    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "text", result: "runtimeError", nodeCount: 0 })
    );

    mocks.interactions.sourceImported.mockClear();
    mocks.store.sources = [{ ...textSource, error: undefined, errorInfo: undefined, parsed: false }];
    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "导入此源").onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith(
      expect.objectContaining({ result: "validationError" })
    );
  });

  it("adds, moves, removes, and retags sources from button actions", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    renderSection({ 0: true });
    const addMenuButtons = mocks.captures.rawButtons.filter((props: any) =>
      String(props.className).includes("w-full flex items-center gap-3")
    );
    addMenuButtons[0].onClick();

    expect(mocks.store.setSources).toHaveBeenCalledWith([
      urlSource,
      textSource,
      { id: "1700000000000", type: "url", content: "", nameTemplate: "[{tag}] {name}" },
    ]);
    expect(mocks.interactions.sourceAdded).toHaveBeenCalledWith({
      mode: "quick",
      sourceType: "url",
      sourceCount: 3,
    });

    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "下移" && !props.disabled).onClick();
    expect(mocks.moveSubscriptionSource).toHaveBeenCalledWith(mocks.store.sources, "s1", "down");
    expect(mocks.store.setSources).toHaveBeenCalledWith([...mocks.store.sources].reverse());

    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "删除").onClick();
    expect(mocks.store.setSources).toHaveBeenCalledWith([textSource]);

    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "Text").onClick();
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "s1",
        type: "text",
        content: "",
        useProxyProviders: undefined,
        userinfoUrl: undefined,
        userinfoUserAgent: undefined,
      })
    );
  });

  it("enforces source quotas for adding and type switching", () => {
    mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 1 } } };

    renderSection({ 0: true });
    const addMenuButtons = mocks.captures.rawButtons.filter((props: any) =>
      String(props.className).includes("w-full flex items-center gap-3")
    );
    addMenuButtons[0].onClick();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "每种导入方式最多 1 个",
      variant: "warning",
    });

    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "Text").onClick();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "每种导入方式最多 1 个",
      variant: "warning",
    });

    mocks.userStore = { user: null };
    mocks.store.sources = [
      urlSource,
      { ...urlSource, id: "s1b", content: "https://example.com/sub-2" },
      textSource,
    ];
    renderSection({ 0: true });
    const anonymousAddMenuButtons = mocks.captures.rawButtons.filter((props: any) =>
      String(props.className).includes("w-full flex items-center gap-3")
    );
    anonymousAddMenuButtons[0].onClick();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "未登录用户每种导入方式最多 2 个（登录后可提升）",
      variant: "warning",
    });
  });

  it("renders and edits non-url expanded sources", () => {
    renderSection({ 1: "s2" });

    const expandedTextarea = mocks.captures.textareas.find((props: any) =>
      String(props.className).includes("min-h-[60vh]")
    );
    expect(expandedTextarea).toMatchObject({ value: "ss://node" });

    expandedTextarea.onChange({ target: { value: "vmess://node" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "vmess://node" }));
  });

  it("allows admin quota bypass and valid text-to-url switching", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000001);
    mocks.userStore = { user: { isAdmin: true, quota: { maxImportSourcesPerType: 0 } } };
    mocks.store.sources = [
      urlSource,
      { ...urlSource, id: "s1b", content: "https://example.com/sub-2" },
      textSource,
    ];

    renderSection({ 0: true });
    const addMenuButtons = mocks.captures.rawButtons.filter((props: any) =>
      String(props.className).includes("w-full flex items-center gap-3")
    );
    addMenuButtons[0].onClick();

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.store.setSources).toHaveBeenCalledWith([
      ...mocks.store.sources,
      { id: "1700000000001", type: "url", content: "", nameTemplate: "[{tag}] {name}" },
    ]);

    mocks.store.setSources.mockClear();
    mocks.store.sources = [textSource];
    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "URL").onClick();

    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "s2",
        type: "url",
        content: "",
        useProxyProviders: false,
        userinfoUrl: undefined,
        userinfoUserAgent: undefined,
      })
    );
  });

  it("keeps no-op source actions from writing back", async () => {
    mocks.store.setSources.mockClear();
    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "URL").onClick();
    expect(mocks.store.setSources).not.toHaveBeenCalled();

    mocks.moveSubscriptionSource.mockReturnValueOnce(mocks.store.sources);
    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "下移" && !props.disabled).onClick();
    expect(mocks.store.setSources).not.toHaveBeenCalled();

    renderSection({ 1: "s1" });
    mocks.markSourceAsPendingImport.mockClear();
    const tagInput = mocks.captures.inputs.find((props: any) => props.value === "HK");
    tagInput.onChange({ target: { value: "HK" } });
    expect(mocks.markSourceAsPendingImport).not.toHaveBeenCalled();

    mocks.store.parseSingleSource.mockClear();
    mocks.store.sources = [{ ...urlSource, content: "", parsed: false, nodeCount: undefined }];
    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "导入此源").onClick();
    await Promise.resolve();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();

    mocks.store.sources = [{ ...urlSource, parsing: true }];
    renderSection();
    mocks.captures.rawButtons.find((props: any) => props.title === "导入中...").onClick();
    await Promise.resolve();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
  });

  it("renders fallback subscription info and parsed sources without node counts", () => {
    mocks.getSubscriptionUserInfoDisplay.mockReturnValueOnce({ traffic: "", expire: "" });
    const { html: emptyInfoHtml } = renderSection();
    expect(emptyInfoHtml).toContain("暂无已用流量/到期时间信息");

    mocks.getSubscriptionUserInfoDisplay.mockReturnValueOnce({ traffic: "", expire: "2026-12-31" });
    const { html: expireOnlyHtml } = renderSection();
    expect(expireOnlyHtml).toContain("到期时间：2026-12-31");

    mocks.store.sources = [{ ...urlSource, nodeCount: undefined, parsed: true }];
    const { html: parsedWithoutCountHtml } = renderSection();
    expect(parsedWithoutCountHtml).not.toContain("✓");
  });

  it("does not re-import a parsing expanded source on close", () => {
    mocks.store.sources = [{ ...urlSource, parsing: true }];
    renderSection({
      1: "s1",
      2: {
        id: "s1",
        content: "old",
        tag: "OLD",
        nameTemplate: "old",
        useProxyProviders: true,
        userinfoUrl: "old",
        userinfoUserAgent: "old",
      },
    });

    mocks.captures.dialog.onOpenChange(false);
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
    expect(stateMock.setters[1]).toHaveBeenCalledWith(null);
  });
});
