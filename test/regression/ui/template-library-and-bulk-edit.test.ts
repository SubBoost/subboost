// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  productApi: {} as Record<string, any>,
  interactions: {
    templateApplied: vi.fn(),
    templateCatalogOpened: vi.fn(),
    templateEngagementToggled: vi.fn(),
    templateSearchCompleted: vi.fn(),
    templateSelected: vi.fn(),
  },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  searchParams: {
    get: vi.fn(),
  },
  userStore: {} as Record<string, any>,
  configStore: {} as Record<string, any>,
  confirmDialog: vi.fn(),
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  runEffectCleanups: false,
  runEffects: false,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
      if (!stateMock.runEffects) return actual.useEffect(effect, deps);
      const cleanup = effect();
      if (stateMock.runEffectCleanups && typeof cleanup === "function") cleanup();
      return undefined;
    },
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

vi.mock("../../../node_modules/react/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
      if (!stateMock.runEffects) return actual.useEffect(effect, deps);
      const cleanup = effect();
      if (stateMock.runEffectCleanups && typeof cleanup === "function") cleanup();
      return undefined;
    },
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

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("../../../node_modules/next/navigation.js", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
  FileCode: () => null,
  Globe: () => null,
  Heart: () => null,
  Link2: () => null,
  Loader2: () => null,
  Plus: () => null,
  Search: () => null,
  Upload: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.input = props;
    return React.createElement("input", props);
  },
}));
vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: any) => {
    mocks.captures.cards.push(props);
    return React.createElement("section", props, props.children);
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
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return React.createElement("button", {
      type: "button",
      "aria-pressed": props.checked,
      onClick: () => props.onCheckedChange?.(!props.checked),
    });
  },
}));
vi.mock("@subboost/ui/components/ui/tabs", () => ({
  Tabs: (props: any) => {
    mocks.captures.tabs = props;
    return props.children;
  },
  TabsContent: (props: any) => (props.value === mocks.captures.tabs?.value ? props.children : null),
  TabsList: (props: any) => props.children,
  TabsTrigger: (props: any) => {
    mocks.captures.tabTriggers.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.userStore }));
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.configStore }));
vi.mock("@subboost/core/templates/builtin", () => ({
  BUILTIN_TEMPLATE_IDS: {
    minimal: "builtin-minimal",
    standard: "builtin-standard",
    full: "builtin-full",
  },
  builtinIdToType: () => null,
}));
vi.mock("@subboost/core/time/beijing", () => ({ formatDateInBeijing: (iso: string) => `fmt:${iso}` }));
vi.mock("@subboost/ui/product/interactions", () => ({
  ProductInteractionAdapterProvider: (props: any) => props.children,
  useProductInteractionAdapter: () => mocks.interactions,
}));
vi.mock("@subboost/ui/product/api-adapter", () => ({
  useProductApiAdapter: () => mocks.productApi,
}));
vi.mock("@subboost/ui/templates/template-card", () => ({
  TemplateCard: (props: any) => {
    mocks.captures.templateCards.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/templates/template-upload-dialog", () => ({
  TemplateUploadDialog: (props: any) => {
    mocks.captures.uploadDialog = props;
    return null;
  },
}));

import { TemplateLibrarySurface } from "../../../packages/ui/src/templates/template-library-surface";
import { TemplatesSection } from "../../../packages/ui/src/product/converter/quick-mode/templates-section";
import { NodeManagementBulkEditDialog } from "../../../packages/ui/src/product/converter/advanced-mode/sections/node-management/bulk-edit-dialog";

const template = {
  id: "tpl-1",
  name: "Template One",
  description: "Template description",
  tags: ["tag-a"],
  engagementCount: 1,
  isEngaged: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function createAdapter(overrides: Record<string, unknown> = {}) {
  return {
    interactions: {
      templateApplied: vi.fn(),
      templateEngagementToggled: vi.fn(),
      templateSearchCompleted: vi.fn(),
      templateUploadOpened: vi.fn(),
    },
    allowDelete: true,
    allowEngagement: true,
    allowPublicTemplates: true,
    allowUpload: true,
    loadTemplates: vi.fn(async () => [template]),
    loadTemplateDetail: vi.fn(async () => ({ kind: "config", config: { template: "minimal" } })),
    deleteTemplate: vi.fn(async () => undefined),
    toggleTemplateEngagement: vi.fn(async () => ({ engagementCount: 2, isEngaged: true })),
    uploadTemplate: vi.fn(async () => undefined),
    ...overrides,
  } as any;
}

function renderSurface(
  adapter = createAdapter(),
  overrides: Record<number, unknown> = {},
  options: { runEffects?: boolean } = {}
) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.runEffects = Boolean(options.runEffects);
  stateMock.setters = [];
  mocks.captures = { buttons: [], cards: [], tabTriggers: [], templateCards: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(TemplateLibrarySurface, { adapter }));
    return { adapter, html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffectCleanups = false;
    stateMock.runEffects = false;
  }
}

function renderQuickTemplates(
  overrides: Record<number, unknown> = {},
  options: { runEffectCleanups?: boolean; runEffects?: boolean } = {}
) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.runEffectCleanups = Boolean(options.runEffectCleanups);
  stateMock.runEffects = Boolean(options.runEffects);
  stateMock.setters = [];
  mocks.captures = { buttons: [], cards: [], tabTriggers: [], templateCards: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(TemplatesSection));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffectCleanups = false;
    stateMock.runEffects = false;
  }
}

const bulkNodes = [
  { name: "Alpha  One", type: "ss", server: "alpha.example.com", port: 8388 },
  { name: "Beta", type: "ss", server: "beta.example.com", port: 8388 },
  { name: "[JP] Locked", type: "ss", server: "locked.example.com", port: 8388 },
  { name: "Frozen", type: "ss", server: "frozen.example.com", port: 8388 },
] as any[];

function resolveBulkNodeNameParts(node: { name: string }) {
  if (node.name === "[JP] Locked") {
    return { tags: ["JP"], tag: "JP", template: "[{tag}] {name}", baseName: "Locked", canEditBase: false };
  }
  if (node.name === "Frozen") {
    return { tags: [], tag: "", template: undefined, baseName: "Ignored", canEditBase: false };
  }
  return { tags: [], tag: "", template: undefined, baseName: node.name, canEditBase: true };
}

function renderBulkDialog(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.runEffects = false;
  stateMock.setters = [];
  mocks.captures = { buttons: [], cards: [], tabTriggers: [], templateCards: [], inputs: [], switches: [] };
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    nodes: bulkNodes,
    resolveNodeNameParts: resolveBulkNodeNameParts,
    bulkRenameNodes: vi.fn(),
    listenerPortEnabled: true,
    listenerPorts: {},
    bulkSetListenerPorts: vi.fn(),
    onClearListenerPortUiState: vi.fn(),
  };
  try {
    const html = renderToStaticMarkup(React.createElement(NodeManagementBulkEditDialog, props));
    return { html, props, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function extraButtonByText(text: string) {
  return mocks.captures.buttons.find((props: any) => props.children === text);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TemplateLibrarySurface extra branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.searchParams.get.mockReturnValue(null);
    mocks.userStore = { user: { id: "user-1", isAdmin: true }, fetchUser: vi.fn() };
    mocks.productApi = {};
    mocks.configStore = {
      template: "minimal",
      enabledProxyGroups: [],
      hiddenProxyGroups: [],
      customProxyGroups: [],
      customRuleSets: [],
      builtinRuleEdits: {},
      customRules: [],
      ruleOrder: [],
      dialerProxyGroups: [],
      proxyGroupNameOverrides: {},
      dnsYaml: "",
      mixedPort: 7890,
      allowLan: false,
      testUrl: "https://example.com",
      testInterval: 300,
      ruleProviderBaseUrl: "",
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: false,
      setTemplate: vi.fn(),
      applyTemplateConfig: vi.fn(),
      setAppliedTemplateId: vi.fn(),
    };
  });

  it("uses default tab settings, labels, and empty catalog copy", () => {
    const { html } = renderSurface(createAdapter({ labels: undefined, enabledTabs: undefined }), {
      2: "catalog",
      3: [],
    });

    expect(mocks.captures.tabTriggers.map((props: any) => props.value)).toEqual(["default", "catalog", "my"]);
    expect(html).toContain("模板目录");
    expect(html).toContain("没有找到模板");
  });

  it("keeps guarded upload, delete, and engagement operations as no-ops", async () => {
    mocks.userStore = { user: null, fetchUser: vi.fn() };
    mocks.searchParams.get.mockReturnValue("1");
    const adapter = createAdapter();
    const { setters } = renderSurface(adapter, { 3: [template] }, { runEffects: true });
    await flushPromises();

    expect(setters[6]).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();

    mocks.captures.templateCards[0].onDelete();
    mocks.captures.templateCards[0].onEngage();
    await flushPromises();

    expect(mocks.confirmDialog).not.toHaveBeenCalled();
    expect(adapter.deleteTemplate).not.toHaveBeenCalled();
    expect(adapter.toggleTemplateEngagement).not.toHaveBeenCalled();
  });

  it("respects disabled upload search params and engagement flags", async () => {
    mocks.searchParams.get.mockReturnValue("1");
    const adapter = createAdapter({ uploadSearchParam: false, allowEngagement: false });
    renderSurface(adapter, { 3: [template] }, { runEffects: true });
    await flushPromises();

    expect(mocks.router.replace).not.toHaveBeenCalled();
    mocks.captures.templateCards[0].onEngage();
    await flushPromises();
    expect(adapter.toggleTemplateEngagement).not.toHaveBeenCalled();
  });

  it("uses default error messages for non-Error delete and upload failures", async () => {
    const adapter = createAdapter({
      deleteTemplate: vi.fn(async () => {
        throw "delete failed";
      }),
      uploadTemplate: vi.fn(async () => {
        throw "upload failed";
      }),
    });

    renderSurface(adapter, { 2: "my", 3: [template] });
    mocks.captures.templateCards[0].onDelete();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "删除失败", variant: "destructive" }));

    renderSurface(adapter, { 6: true, 7: "", 12: "config" });
    await mocks.captures.uploadDialog.onUpload();
    expect(adapter.uploadTemplate).toHaveBeenCalledTimes(0);

    renderSurface(adapter, { 6: true, 7: "Broken", 12: "config" });
    await mocks.captures.uploadDialog.onUpload();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "上传失败", variant: "destructive" }));
  });

  it("covers quick template catalog and engagement fallback branches", async () => {
    mocks.userStore = { user: { id: "user-1" }, fetchUser: vi.fn() };
    mocks.configStore = {
      ...mocks.configStore,
      setTemplate: vi.fn(),
      applyTemplateConfig: vi.fn(),
      setAppliedTemplateId: vi.fn(),
    };
    mocks.productApi = {
      templates: {
        loadBuiltinTemplateEngagement: vi.fn(async () => ({})),
        loadCatalogTemplates: vi.fn(async () => [{ id: "blank", name: "", description: undefined }]),
        loadTemplateDetail: vi.fn(async () => ({ kind: "config", name: "", config: { template: "full" } })),
        toggleTemplateEngagement: vi.fn(async () => ({ isEngaged: true, engagementCount: 1 })),
      },
    };

    const loaded = renderQuickTemplates({ 0: "catalog", 1: false, 2: [{ id: "blank", name: "", description: undefined }], 4: "", 5: "blank" }, { runEffects: true });
    await flushPromises();

    expect(mocks.productApi.templates.loadBuiltinTemplateEngagement).toHaveBeenCalled();
    expect(loaded.setters[6]).toHaveBeenCalledWith({
      minimal: { id: "builtin-minimal", engagementCount: 0, isEngaged: false },
      standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
      full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
    });
    expect(mocks.captures.buttons.at(-1)).toMatchObject({ disabled: true });

    mocks.captures.buttons.at(-1).onClick();
    await flushPromises();
    expect(mocks.configStore.applyTemplateConfig).toHaveBeenCalledWith({ template: "full" });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已应用模板：未命名模板" }));

    mocks.productApi = {};
    const noEngagementApi = renderQuickTemplates({}, { runEffects: true });
    expect(noEngagementApi.setters[6]).not.toHaveBeenCalled();
  });

  it("does not update quick template state after cancellable effects are cleaned up", async () => {
    let resolveEngagement: (value: unknown) => void = () => undefined;
    let resolveCatalog: (value: unknown) => void = () => undefined;
    mocks.productApi = {
      templates: {
        loadBuiltinTemplateEngagement: vi.fn(() => new Promise((resolve) => {
          resolveEngagement = resolve;
        })),
        loadCatalogTemplates: vi.fn(() => new Promise((resolve) => {
          resolveCatalog = resolve;
        })),
        loadTemplateDetail: vi.fn(),
        toggleTemplateEngagement: vi.fn(),
      },
    };

    const result = renderQuickTemplates({ 0: "catalog" }, { runEffectCleanups: true, runEffects: true });
    resolveEngagement({});
    resolveCatalog([{ id: "late", name: "Late", description: "Late" }]);
    await flushPromises();

    expect(result.setters[6]).not.toHaveBeenCalled();
    expect(result.setters[2]).not.toHaveBeenCalledWith([{ id: "late", name: "Late", description: "Late" }]);
  });

  it("covers extra bulk edit preview and skipped-node branches", () => {
    let result = renderBulkDialog({ 0: 123 as never, 4: false, 5: false });
    expect(result.html).toContain("暂无可预览的变更");

    result = renderBulkDialog({ 0: "Alpha|Beta", 1: "Alpha" });
    expect(result.html).toContain("Beta");
    expect(result.html).not.toContain("Alpha One");

    result = renderBulkDialog({ 1: "(" });
    expect(result.html).toContain("无效正则");

    result = renderBulkDialog({ 0: "Alpha|Locked", 2: "One", 3: "Two" });
    expect(result.html).toContain("跳过：当前节点命名模板无法解析");
    extraButtonByText("完成").onClick();
    expect(result.props.bulkRenameNodes).toHaveBeenCalledWith([{ oldName: "Alpha  One", newName: "Alpha Two" }]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "跳过 1 个无法解析的节点", variant: "success" })
    );

    result = renderBulkDialog({ 0: "Frozen", 2: "Frozen", 3: "" });
    expect(result.html).toContain("跳过：新名称为空");
  });

  it("tracks unknown template kinds in the template library apply flow", async () => {
    const adapter = createAdapter({
      loadTemplateDetail: vi.fn(async () => ({ kind: "markdown", config: null })),
    });
    renderSurface(adapter, { 2: "catalog", 3: [template] });

    await mocks.captures.templateCards[0].onApply();

    expect(adapter.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "unknown",
      result: "validationError",
    });
  });
});
