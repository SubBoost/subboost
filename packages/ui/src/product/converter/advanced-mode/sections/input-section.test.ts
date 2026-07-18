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
  userInfoDisplay: { traffic: "1 GB", expire: "2026-01-01" } as any,
  markSourceAsPendingImport: vi.fn(),
  moveSubscriptionSource: vi.fn(),
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  runEffects: false,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    createElement: (type: any, props: any, ...children: any[]) => {
      if (stateMock.enabled && type === "button") {
        mocks.captures.rawButtons.push(props ?? {});
      }
      return actual.createElement(type, props, ...children);
    },
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (stateMock.enabled && stateMock.runEffects) {
        effect();
        return;
      }
      return actual.useEffect(effect, deps);
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
  const capture = (type: any, props: any) => {
    if (stateMock.enabled && type === "button") {
      mocks.captures.rawButtons.push(props ?? {});
    }
  };
  return {
    ...actual,
    jsx: (type: any, props: any, key: any) => {
      capture(type, props);
      return actual.jsx(type, props, key);
    },
    jsxs: (type: any, props: any, key: any) => {
      capture(type, props);
      return actual.jsxs(type, props, key);
    },
  };
});

vi.mock("@radix-ui/react-popover", () => ({
  Anchor: (props: any) => props.children,
  Close: (props: any) => props.children,
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
  ChevronUp: () => null,
  CircleHelp: () => null,
  FileCode: () => null,
  HelpCircle: () => null,
  Loader2: () => null,
  Link2: () => null,
  Maximize2: () => null,
  Menu: () => null,
  Plus: () => null,
  Server: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (props: any) => props.children }));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.captures.textareas.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/subscription/import-error", () => ({
  normalizeSubscriptionImportErrorInfo: (value: any) => (value ? { message: value.message || String(value) } : null),
}));
vi.mock("@subboost/core/node-name-template", () => ({
  DEFAULT_NODE_NAME_TEMPLATE: "[{tag}] {name}",
  formatNodeNameFromTemplate: ({ originName, tag, template }: any) => `${template || "{name}"}:${tag || ""}:${originName}`,
}));
vi.mock("@subboost/ui/components/ui/icon-button", () => ({
  IconButton: (props: any) => {
    mocks.captures.iconButtons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return {
    getNodeSourceIds: (node: any) => (Array.isArray(node?._sourceIds) ? node._sourceIds : []),
    useConfigStore,
  };
});
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.userStore }));
vi.mock("@subboost/ui/product/subscription/subscription-userinfo-display", () => ({
  getSubscriptionUserInfoDisplay: () => mocks.userInfoDisplay,
}));
vi.mock("@subboost/ui/product/subscription/source-import-state", () => ({
  markSourceAsPendingImport: mocks.markSourceAsPendingImport,
}));
vi.mock("@subboost/ui/product/subscription/source-order", () => ({ moveSubscriptionSource: mocks.moveSubscriptionSource }));
vi.mock("@subboost/ui/product/converter/source-display-label", () => ({
  buildSourceDisplayLabel: ({ typeLabel, order, total, tag }: any) => `${typeLabel} ${order}/${total}${tag ? ` ${tag}` : ""}`,
}));
vi.mock("@subboost/ui/product/converter/source-controls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@subboost/ui/product/converter/source-controls")>();
  return {
    ...actual,
    AddSourceMenu: (props: any) => {
      mocks.captures.addSourceMenus.push(props);
      return null;
    },
    SourceTypeChoices: (props: any) => {
      mocks.captures.sourceTypeChoices.push(props);
      return null;
    },
  };
});
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => mocks.interactions }));
vi.mock("../constants", () => ({
  sourceTypeInfo: {
    url: { label: "订阅链接", placeholder: "https://example.com/sub", icon: () => null },
    yaml: { label: "YAML 配置", placeholder: "proxies:", icon: () => null },
    nodes: { label: "节点链接", placeholder: "ss://node", icon: () => null },
  },
}));
vi.mock("../section-header", () => ({
  SectionHeader: (props: any) => {
    mocks.captures.header = props;
    return null;
  },
}));
vi.mock("@subboost/ui/product/converter/subscription-import-error", () => ({
  SubscriptionImportErrorBadge: (props: any) => {
    mocks.captures.errorBadge = props;
    return null;
  },
}));
vi.mock("./input-source-editor-dialog", () => ({
  InputSourceEditorDialog: (props: any) => {
    mocks.captures.editor = props;
    return null;
  },
}));

import { InputSection } from "./input-section";

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

const nodesSource = {
  id: "s2",
  type: "nodes",
  content: "ss://node",
  error: "parse failed",
  parsed: false,
  parsing: false,
};

function renderSection(overrides: Record<number, unknown> = {}, props = { isExpanded: true, onToggle: vi.fn() }) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.iconButtons = [];
  mocks.captures.addSourceMenus = [];
  mocks.captures.rawButtons = [];
  mocks.captures.sourceTypeChoices = [];
  mocks.captures.textareas = [];
  try {
    const html = renderToStaticMarkup(React.createElement(InputSection, props));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("advanced mode InputSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateMock.runEffects = false;
    mocks.captures = {
      addSourceMenus: [],
      buttons: [],
      iconButtons: [],
      inputs: [],
      sourceTypeChoices: [],
      textareas: [],
    };
    mocks.userInfoDisplay = { traffic: "1 GB", expire: "2026-01-01" };
    mocks.markSourceAsPendingImport.mockImplementation((source) => ({ ...source, pendingImport: true }));
    mocks.moveSubscriptionSource.mockImplementation((sources) => sources.slice().reverse());
    mocks.store = {
      nodes: [
        { name: "Alpha", type: "ss", _sourceIds: ["s1"] },
        { name: "Beta", type: "vless", _sourceIds: ["s1"] },
      ],
      parseErrors: [{ message: "bad subscription" }],
      sources: [urlSource, nodesSource],
      setSources: vi.fn(),
      parseSingleSource: vi.fn(),
    };
    mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 2 } } };
  });

  it("renders source summaries, errors, add controls, and the expanded editor", () => {
    renderSection({ 0: true, 1: "s1" });

    expect(mocks.captures.header).toEqual(expect.objectContaining({ title: "节点导入", isExpanded: true }));
    expect(mocks.captures.errorBadge).toEqual(expect.objectContaining({ errorMessage: "parse failed" }));
    expect(mocks.captures.editor).toEqual(
      expect.objectContaining({
        source: urlSource,
        previewName: "[{tag}] {name}:HK:节点名称",
      })
    );
    expect(mocks.captures.inputs.some((props: any) => props.value === "https://example.com/sub")).toBe(true);
    expect(mocks.captures.textareas.some((props: any) => props.value === "ss://node")).toBe(true);
    expect(mocks.captures.addSourceMenus[0]).toEqual(expect.objectContaining({ open: true, compact: true }));
  });

  it("updates source content and metadata through captured fields", () => {
    renderSection({ 1: "s1" });

    const mainUrlInput = mocks.captures.inputs.find((props: any) => props.placeholder === "https://example.com/sub");
    mainUrlInput.onChange({ target: { value: "https://new.example/sub" } });
    expect(mocks.store.setSources).toHaveBeenCalledWith(expect.any(Array));
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "https://new.example/sub" }));

    const textArea = mocks.captures.textareas.find((props: any) => props.value === "ss://node");
    textArea.onChange({ target: { value: "trojan://node" } });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "trojan://node" }));

    mocks.captures.editor.onUpdateContent("s1", "https://editor.example/sub");
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ content: "https://editor.example/sub" }));

    mocks.captures.editor.onUpdateMeta("s1", { tag: "JP" });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ tag: "JP" }));

    mocks.markSourceAsPendingImport.mockClear();
    mocks.captures.editor.onUpdateMeta("s1", { nameTemplate: "{name}", useProxyProviders: true });
    mocks.captures.editor.onUpdateMeta("s1", { userinfoUrl: "https://meta.example/info" });
    mocks.captures.editor.onUpdateMeta("s1", { userinfoUserAgent: "mihomo" });
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledTimes(3);

    mocks.markSourceAsPendingImport.mockClear();
    mocks.captures.editor.onUpdateMeta("s1", { nodeCount: 9 });
    expect(mocks.markSourceAsPendingImport).not.toHaveBeenCalled();
  });

  it("closes the editor and re-imports only changed sources", () => {
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

    mocks.captures.editor.onClose();
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
    mocks.captures.editor.onClose();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
  });

  it("runs source initialization and editor snapshot effects", () => {
    stateMock.runEffects = true;
    mocks.store.sources = [];
    renderSection();
    expect(mocks.store.setSources).toHaveBeenCalledWith([
      { id: "1", type: "url", content: "", nameTemplate: "[{tag}] {name}" },
    ]);
    expect(stateMock.setters[2]).toHaveBeenCalledWith(null);

    mocks.store.setSources.mockClear();
    mocks.store.sources = [urlSource];
    renderSection({ 1: "s1" });
    expect(mocks.store.setSources).not.toHaveBeenCalled();
    expect((stateMock.setters[2] as any).lastValue).toEqual({
      id: "s1",
      content: "https://example.com/sub",
      tag: "HK",
      nameTemplate: "[{tag}] {name}",
      useProxyProviders: false,
      userinfoUrl: "https://example.com/userinfo",
      userinfoUserAgent: "clash",
    });

    const existingSnapshot = { id: "s1", content: "same", tag: "", nameTemplate: "", useProxyProviders: false, userinfoUrl: "", userinfoUserAgent: "" };
    renderSection({ 1: "s1", 2: existingSnapshot });
    expect((stateMock.setters[2] as any).lastValue).toBe(existingSnapshot);

    mocks.store.sources = [
      {
        id: "s3",
        type: "url",
        content: "https://missing-meta.example/sub",
        parsed: true,
        nodeCount: 1,
      },
    ];
    renderSection({ 1: "s3" });
    expect((stateMock.setters[2] as any).lastValue).toEqual({
      id: "s3",
      content: "https://missing-meta.example/sub",
      tag: "",
      nameTemplate: "",
      useProxyProviders: false,
      userinfoUrl: "",
      userinfoUserAgent: "",
    });
  });

  it("adds sources from the menu and enforces per-type quotas", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(123456);
    try {
      renderSection({ 0: true });
      mocks.captures.addSourceMenus[0].onAdd("yaml");

      expect(mocks.store.setSources).toHaveBeenCalledWith([
        urlSource,
        nodesSource,
        { id: "123456", type: "yaml", content: "", nameTemplate: "[{tag}] {name}" },
      ]);
      expect(mocks.interactions.sourceAdded).toHaveBeenCalledWith({
        mode: "advanced",
        sourceType: "yaml",
        sourceCount: 3,
      });
      expect(stateMock.setters[0]).toHaveBeenCalledWith(false);

      mocks.store.setSources.mockClear();
      mocks.interactions.sourceAdded.mockClear();
      renderSection({ 0: true });
      mocks.captures.addSourceMenus[0].onAdd("url");
      expect(mocks.toast).not.toHaveBeenCalled();

      mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 1 } } };
      renderSection({ 0: true });
      mocks.captures.addSourceMenus[0].onAdd("url");
      expect(mocks.toast).toHaveBeenCalledWith({ title: "每种导入方式最多 1 个", variant: "warning" });

      mocks.toast.mockClear();
      mocks.userStore = { user: null };
      mocks.store.sources = [
        { ...urlSource, id: "s1" },
        { ...urlSource, id: "s2" },
      ];
      renderSection({ 0: true });
      mocks.captures.addSourceMenus[0].onAdd("url");
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "未登录用户每种导入方式最多 2 个（登录后可提升）",
        variant: "warning",
      });

      mocks.toast.mockClear();
      mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: "bad" } } };
      mocks.store.sources = Array.from({ length: 5 }, (_, index) => ({ ...urlSource, id: `url-${index}` }));
      renderSection({ 0: true });
      mocks.captures.addSourceMenus[0].onAdd("url");
      expect(mocks.toast).toHaveBeenCalledWith({ title: "每种导入方式最多 5 个", variant: "warning" });
    } finally {
      now.mockRestore();
    }
  });

  it("switches source types, moves sources, and removes sources", () => {
    renderSection();

    mocks.captures.sourceTypeChoices.find((props: any) => props.value === "url").onChange("yaml");
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "",
        lastParsedContent: undefined,
        lastParsedNameTemplate: undefined,
        lastParsedTag: undefined,
        type: "yaml",
        useProxyProviders: undefined,
        userinfoUrl: undefined,
        userinfoUserAgent: undefined,
      })
    );
    expect(mocks.store.setSources).toHaveBeenCalledWith(expect.any(Array));

    mocks.store.setSources.mockClear();
    mocks.captures.sourceTypeChoices.find((props: any) => props.value === "url").onChange("url");
    expect(mocks.store.setSources).not.toHaveBeenCalled();

    mocks.store.sources = [
      {
        ...urlSource,
        id: "yaml-1",
        type: "yaml",
        useProxyProviders: true,
        userinfoUrl: "https://info.example",
        userinfoUserAgent: "clash",
      },
    ];
    renderSection();
    mocks.captures.sourceTypeChoices.find((props: any) => props.value === "yaml").onChange("url");
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "url",
        useProxyProviders: true,
        userinfoUrl: "https://info.example",
        userinfoUserAgent: "clash",
      })
    );

    mocks.store.sources = [urlSource, nodesSource];
    renderSection();
    mocks.captures.iconButtons.find((props: any) => props.label === "下移" && !props.disabled).onClick();
    expect(mocks.moveSubscriptionSource).toHaveBeenCalledWith(mocks.store.sources, "s1", "down");
    expect(mocks.store.setSources).toHaveBeenCalledWith([nodesSource, urlSource]);

    mocks.store.setSources.mockClear();
    mocks.captures.iconButtons.find((props: any) => props.label === "上移" && !props.disabled).onClick();
    expect(mocks.moveSubscriptionSource).toHaveBeenCalledWith(mocks.store.sources, "s2", "up");

    mocks.captures.iconButtons.find((props: any) => props.label === "高级编辑").onClick();
    expect(stateMock.setters[1]).toHaveBeenCalledWith(expect.any(String));

    mocks.store.setSources.mockClear();
    mocks.captures.iconButtons.find((props: any) => props.label === "删除导入源").onClick();
    expect(mocks.store.setSources).toHaveBeenCalledWith([nodesSource]);
  });

  it("blocks type switches when the target quota is already used", () => {
    mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 1 } } };
    renderSection();

    mocks.captures.sourceTypeChoices.find((props: any) => props.value === "url").onChange("nodes");

    expect(mocks.toast).toHaveBeenCalledWith({ title: "每种导入方式最多 1 个", variant: "warning" });
    expect(mocks.store.setSources).not.toHaveBeenCalled();
  });

  it("imports sources and reports success, runtime, and validation outcomes", async () => {
    renderSection();
    mocks.captures.iconButtons.find((props: any) => props.label === "重新导入").onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.store.parseSingleSource).toHaveBeenCalledWith("s1");
    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith({
      mode: "advanced",
      sourceType: "url",
      result: "success",
      sourceCount: 2,
      nodeCount: 2,
      usesProxyProvider: false,
    });

    mocks.interactions.sourceImported.mockClear();
    mocks.store.parseSingleSource.mockClear();
    mocks.store.sources = [{ ...urlSource, parsed: false, error: "failed", nodeCount: 0 }];
    renderSection();
    mocks.captures.iconButtons.find((props: any) => props.label === "导入此源").onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith(expect.objectContaining({ result: "runtimeError" }));

    mocks.interactions.sourceImported.mockClear();
    mocks.store.sources = [{ ...urlSource, parsed: false, error: undefined, errorInfo: undefined, nodeCount: undefined }];
    renderSection();
    mocks.captures.iconButtons.find((props: any) => props.label === "导入此源").onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith(expect.objectContaining({ result: "validationError" }));

    mocks.interactions.sourceImported.mockClear();
    mocks.store.sources = [{ ...urlSource, parsed: false, error: "fallback failed", nodeCount: 0 }];
    mocks.store.parseSingleSource.mockImplementationOnce(async () => {
      mocks.store.sources = [];
    });
    renderSection();
    mocks.captures.iconButtons.find((props: any) => props.label === "导入此源").onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.interactions.sourceImported).toHaveBeenCalledWith(expect.objectContaining({ result: "runtimeError" }));
  });

  it("renders collapsed, empty, and anonymous states", () => {
    renderSection({}, { isExpanded: false, onToggle: vi.fn() });
    expect(mocks.captures.header).toEqual(expect.objectContaining({ isExpanded: false }));
    expect(mocks.captures.inputs).toEqual([]);

    mocks.userStore = { user: null };
    mocks.store.nodes = [];
    mocks.store.parseErrors = [];
    mocks.store.sources = [{ ...urlSource, content: "", parsed: false, nodeCount: undefined }];
    const { setters } = renderSection();
    expect(mocks.captures.editor).toEqual(expect.objectContaining({ source: null }));

    mocks.captures.addSourceMenus[0].onOpenChange(true);
    expect(setters[0]).toHaveBeenCalledWith(true);

    mocks.userInfoDisplay = { traffic: "", expire: "" };
    mocks.store.sources = [{ ...urlSource, parsed: true, nodeCount: 1, subscriptionUserInfo: undefined }];
    const { html } = renderSection();
    expect(html).toContain("暂无已用流量/到期时间信息");
  });
});
