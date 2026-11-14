import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  interactions: {
    templateApplied: vi.fn(),
    templateCatalogOpened: vi.fn(),
    templateEngagementToggled: vi.fn(),
    templateSearchCompleted: vi.fn(),
    templateSelected: vi.fn(),
  },
  productApi: {} as Record<string, any>,
  store: {} as Record<string, any>,
  toast: vi.fn(),
  userStore: {} as Record<string, any>,
}));

// useState call order in TemplatesSection.
const PICKER_SOURCE = 0;
const PICKER_LOADING = 1;
const PICKER_TEMPLATES = 2;
const PICKER_LOAD_FAILED = 3;
const PICKER_SEARCH = 4;
const PICKER_APPLYING_ID = 5;
const BUILTIN_ENGAGEMENT = 6;

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  cleanups: [] as Array<() => void>,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  runEffects: false,
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
    useEffect: (effect: () => void | (() => void)) => {
      if (!stateMock.runEffects) return undefined;
      const cleanup = effect();
      if (typeof cleanup === "function") stateMock.cleanups.push(cleanup);
      return cleanup;
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

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: any, props: any) => {
    if (type === "button") {
      mocks.captures.rawButtons ||= [];
      mocks.captures.rawButtons.push(props || {});
    }
  };
  return {
    ...actual,
    jsx: (type: any, props: any, key?: any) => {
      capture(type, props);
      return actual.jsx(type, props, key);
    },
    jsxs: (type: any, props: any, key?: any) => {
      capture(type, props);
      return actual.jsxs(type, props, key);
    },
  };
});

vi.mock("next/link", () => ({
  default: (props: any) => {
    mocks.captures.links.push(props);
    return React.createElement("a", { href: props.href }, props.children);
  },
}));
vi.mock("lucide-react", () => ({
  FileCode: () => null,
  Globe: () => null,
  Heart: () => null,
  Loader2: () => null,
  Upload: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    const { asChild: _asChild, ...rest } = props;
    return React.createElement("button", rest, props.children);
  },
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
  DialogHeader: (props: any) => props.children,
  DialogTitle: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return { useConfigStore };
});
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.userStore }));
vi.mock("@subboost/core/templates/builtin", () => ({
  BUILTIN_TEMPLATE_IDS: {
    minimal: "builtin-minimal",
    standard: "builtin-standard",
    full: "builtin-full",
  },
}));
vi.mock("@subboost/ui/product/api-adapter", () => ({
  useProductApiAdapter: () => mocks.productApi,
}));
vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));
vi.mock("./constants", () => ({
  templates: [
    { id: "minimal", name: "Minimal", description: "Light", groups: 1, rules: 2 },
    { id: "standard", name: "Standard", description: "Balanced", groups: 3, rules: 4 },
    { id: "full", name: "Full", description: "Everything", groups: 5, rules: 6 },
  ],
}));

import { TemplatesSection } from "./templates-section";

const catalogItems = [
  { id: "tpl-config", name: "VPN Config", description: "Config template" },
  { id: "tpl-yaml", name: "Raw YAML", description: "YAML template" },
];

const myItems = [{ id: "my-config", name: "Home Rules", description: "Saved by me" }];

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pickerApplyButtons() {
  return mocks.captures.buttons.filter((props: any) => props.className === "flex-shrink-0");
}

function renderSection(overrides: Record<number, unknown> = {}, props: Record<string, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures = { buttons: [], cards: [], inputs: [], links: [], rawButtons: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(TemplatesSection, props));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

function openedPicker(source: "catalog" | "my", templates: unknown[], search = "") {
  return {
    [PICKER_SOURCE]: source,
    [PICKER_LOADING]: false,
    [PICKER_TEMPLATES]: templates,
    [PICKER_SEARCH]: search,
  };
}

describe("quick mode TemplatesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    stateMock.runEffects = false;
    stateMock.cleanups = [];
    mocks.captures = { buttons: [], cards: [], inputs: [], links: [], rawButtons: [] };
    mocks.store = {
      template: "minimal",
      setTemplate: vi.fn(),
      applyTemplateConfig: vi.fn(),
      setAppliedTemplateId: vi.fn(),
    };
    mocks.userStore = { user: { id: "u1" } };
    mocks.productApi = {
      templates: {
        labels: {
          catalogName: "Catalog",
          catalogDescription: "Pick one",
          catalogSelectAction: "Browse",
          engagementAction: "Like",
          engagementLoginRequired: "Login first",
        },
        catalogEnabled: true,
        builtinEngagementEnabled: true,
        loadBuiltinTemplateEngagement: vi.fn(),
        loadCatalogTemplates: vi.fn(),
        loadTemplateDetail: vi.fn(),
        toggleTemplateEngagement: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects built-in templates and opens the catalog", () => {
    const { setters } = renderSection();

    mocks.captures.rawButtons.find((props: any) => props["aria-label"] === "选择 Standard 模板").onClick();
    expect(mocks.store.setTemplate).toHaveBeenCalledWith("standard");
    expect(mocks.interactions.templateSelected).toHaveBeenCalledWith({
      source: "builtin",
      templateType: "standard",
    });

    mocks.captures.rawButtons.find((props: any) => props["aria-label"] === "打开Catalog").onClick();
    expect(setters[PICKER_SOURCE]).toHaveBeenCalledWith("catalog");
    expect(setters[PICKER_TEMPLATES]).toHaveBeenCalledWith([]);
    expect(setters[PICKER_LOAD_FAILED]).toHaveBeenCalledWith(false);
    expect(setters[PICKER_LOADING]).toHaveBeenCalledWith(true);
    expect(setters[PICKER_SEARCH]).toHaveBeenCalledWith("");
    expect(mocks.interactions.templateCatalogOpened).toHaveBeenCalledWith({ mode: "quick" });
  });

  it("closes the picker only when the dialog requests closing", () => {
    const { setters } = renderSection(openedPicker("catalog", catalogItems));

    expect(mocks.captures.dialog.open).toBe(true);
    mocks.captures.dialog.onOpenChange(true);
    expect(setters[PICKER_SOURCE]).not.toHaveBeenCalled();
    mocks.captures.dialog.onOpenChange(false);
    expect(setters[PICKER_SOURCE]).toHaveBeenCalledWith(null);

    renderSection();
    expect(mocks.captures.dialog.open).toBe(false);
  });

  it("renders catalog search, loading, failure, empty, and filtered states", () => {
    expect(renderSection({ [PICKER_SOURCE]: "catalog", [PICKER_LOADING]: true }).html).toContain("Catalog");

    let result = renderSection({ ...openedPicker("catalog", []), [PICKER_LOAD_FAILED]: true });
    expect(result.html).toContain("加载模板失败，请稍后重试");
    expect(result.html).not.toContain("暂无可用模板");

    result = renderSection(openedPicker("catalog", []));
    expect(result.html).toContain("暂无可用模板");

    result = renderSection(
      openedPicker("catalog", [...catalogItems, { id: "blank", name: "", description: undefined }], "vpn")
    );
    expect(result.html).toContain("VPN Config");
    expect(result.html).not.toContain("Raw YAML");
    expect(pickerApplyButtons()).toHaveLength(1);
    mocks.captures.inputs[0].onChange({ target: { value: "raw" } });
    expect(result.setters[PICKER_SEARCH]).toHaveBeenCalledWith("raw");
  });

  it("applies catalog config templates", async () => {
    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({
      kind: "config",
      name: "VPN Config",
      config: { template: "full" },
    });

    const { setters } = renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[0].onClick();
    await flushPromises();

    expect(setters[PICKER_APPLYING_ID]).toHaveBeenCalledWith("tpl-config");
    expect(mocks.store.setAppliedTemplateId).toHaveBeenCalledWith("tpl-config");
    expect(mocks.store.applyTemplateConfig).toHaveBeenCalledWith({ template: "full" });
    expect(setters[PICKER_SOURCE]).toHaveBeenCalledWith(null);
    expect(setters[PICKER_SEARCH]).toHaveBeenCalledWith("");
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "config",
      result: "success",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已应用模板：VPN Config", variant: "success" }));
    expect(setters[PICKER_APPLYING_ID]).toHaveBeenCalledWith(null);
  });

  it("rejects unsupported catalog templates and missing details", async () => {
    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({ kind: "yaml", name: "Raw YAML" });
    renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[1].onClick();
    await flushPromises();
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "yaml",
      result: "validationError",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));

    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue(null);
    renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[0].onClick();
    await flushPromises();
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "unknown",
      result: "runtimeError",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "获取模板失败", variant: "destructive" }));
  });

  it("reports runtime failures and hides optional catalog features when disabled", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.productApi.templates.loadTemplateDetail.mockRejectedValue(new Error("network"));
    renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[0].onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "应用模板失败，请稍后重试", variant: "destructive" }));
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: "network" }));

    mocks.productApi.templates.catalogEnabled = false;
    mocks.productApi.templates.builtinEngagementEnabled = false;
    const result = renderSection();
    expect(result.html).toContain("Minimal");
    expect(mocks.captures.cards).toHaveLength(3);
  });

  it("renders fallback labels when template API metadata is absent", () => {
    mocks.productApi = {};

    const result = renderSection({ [PICKER_SOURCE]: "catalog", [PICKER_TEMPLATES]: catalogItems });

    expect(result.html).toContain("模板目录");
    expect(result.html).toContain("选择模板");
    expect(mocks.captures.cards).toHaveLength(3);
  });

  it("loads builtin engagement stats and toggles engagement", async () => {
    stateMock.runEffects = true;
    mocks.productApi.templates.loadBuiltinTemplateEngagement.mockResolvedValue({
      minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
    });
    mocks.productApi.templates.toggleTemplateEngagement.mockResolvedValue({
      isEngaged: true,
      engagementCount: 8,
    });

    const { setters } = renderSection();
    await flushPromises();

    expect(mocks.productApi.templates.loadBuiltinTemplateEngagement).toHaveBeenCalledWith([
      "builtin-minimal",
      "builtin-standard",
      "builtin-full",
    ]);
    expect(setters[BUILTIN_ENGAGEMENT]).toHaveBeenCalledWith({
      minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
      standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
      full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
    });

    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick();
    await flushPromises();

    expect(mocks.productApi.templates.toggleTemplateEngagement).toHaveBeenCalledWith("builtin-minimal");
    expect(mocks.interactions.templateEngagementToggled).toHaveBeenCalledWith({ source: "builtin", engaged: true });
    expect(setters[BUILTIN_ENGAGEMENT]).toHaveBeenCalledWith(expect.any(Function));
  });

  it("ignores builtin engagement load failures and keeps previous counts for malformed toggle responses", async () => {
    stateMock.runEffects = true;
    mocks.productApi.templates.loadBuiltinTemplateEngagement.mockRejectedValue(new Error("network"));

    renderSection();
    await flushPromises();
    expect(mocks.productApi.templates.loadBuiltinTemplateEngagement).toHaveBeenCalled();

    stateMock.runEffects = false;
    mocks.productApi.templates.toggleTemplateEngagement.mockResolvedValue({
      isEngaged: false,
      engagementCount: "bad",
    });
    const { setters } = renderSection({
      [BUILTIN_ENGAGEMENT]: {
        minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
        standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
        full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
      },
    });

    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick({ stopPropagation: vi.fn() });
    await flushPromises();

    const updater = setters[BUILTIN_ENGAGEMENT].mock.calls.at(-1)?.[0] as (prev: any) => any;
    expect(updater({
      minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
      standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
      full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
    }).minimal).toEqual({ id: "builtin-minimal", engagementCount: 7, isEngaged: false });
  });

  it("skips builtin engagement when the template id is missing", async () => {
    const { setters } = renderSection({
      [BUILTIN_ENGAGEMENT]: {
        minimal: { id: "", engagementCount: 7, isEngaged: false },
        standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
        full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
      },
    });

    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick({ stopPropagation: vi.fn() });
    await flushPromises();

    expect(mocks.productApi.templates.toggleTemplateEngagement).not.toHaveBeenCalled();
    expect(setters[BUILTIN_ENGAGEMENT]).not.toHaveBeenCalled();
  });

  it("reports engagement failures and login-disabled engagement buttons", async () => {
    mocks.productApi.templates.toggleTemplateEngagement.mockRejectedValue(new Error("failed"));
    renderSection();

    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick({ stopPropagation: vi.fn() });
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "操作失败", variant: "destructive" });

    mocks.userStore = { user: null };
    renderSection();
    const disabledButton = mocks.captures.rawButtons.find((props: any) => props.title === "Login first");
    expect(disabledButton).toMatchObject({ disabled: true });
    disabledButton.onClick({ stopPropagation: vi.fn() });
    await flushPromises();
    expect(mocks.productApi.templates.toggleTemplateEngagement).toHaveBeenCalledTimes(1);
  });

  it("handles unnamed config templates, unknown template kinds, and missing detail loaders", async () => {
    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({
      kind: "config",
      name: "",
      config: { template: "minimal" },
    });
    const unnamed = renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[0].onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已应用模板：未命名模板" }));
    expect(unnamed.setters[PICKER_APPLYING_ID]).toHaveBeenCalledWith(null);

    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({ kind: "markdown", name: "Doc" });
    renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[0].onClick();
    await flushPromises();
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "unknown",
      result: "validationError",
    });

    mocks.productApi.templates.loadTemplateDetail = undefined;
    const noLoader = renderSection(openedPicker("catalog", catalogItems));
    pickerApplyButtons()[0].onClick();
    await flushPromises();
    expect(noLoader.setters[PICKER_APPLYING_ID]).not.toHaveBeenCalled();
  });

  it("loads catalog templates, handles load failures, and tracks search completion", async () => {
    vi.stubGlobal("window", {
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
      clearTimeout: vi.fn(),
    });
    stateMock.runEffects = true;
    mocks.productApi.templates.loadCatalogTemplates.mockResolvedValue(catalogItems);

    const loaded = renderSection(openedPicker("catalog", catalogItems, "vpn"));
    await flushPromises();

    expect(loaded.setters[PICKER_LOADING]).toHaveBeenCalledWith(true);
    expect(loaded.setters[PICKER_TEMPLATES]).toHaveBeenCalledWith(catalogItems);
    expect(loaded.setters[PICKER_LOADING]).toHaveBeenCalledWith(false);
    expect(mocks.interactions.templateSearchCompleted).toHaveBeenCalledWith({
      source: "catalog",
      resultCount: 1,
    });
    stateMock.cleanups.forEach((cleanup) => cleanup());
    expect(window.clearTimeout).toHaveBeenCalledWith(1);
    stateMock.cleanups = [];

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.productApi.templates.loadCatalogTemplates.mockRejectedValue(new Error("network"));
    const failed = renderSection(openedPicker("catalog", []));
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(failed.setters[PICKER_TEMPLATES]).toHaveBeenCalledWith([]);
    expect(failed.setters[PICKER_LOAD_FAILED]).toHaveBeenCalledWith(true);
    expect(failed.setters[PICKER_LOADING]).toHaveBeenCalledWith(false);
  });

  it("ignores picker results that arrive after the picker closes", async () => {
    stateMock.runEffects = true;
    let resolveTemplates: (items: unknown[]) => void = () => undefined;
    mocks.productApi.templates.loadCatalogTemplates.mockReturnValue(
      new Promise((resolve) => {
        resolveTemplates = resolve;
      })
    );
    const loaded = renderSection(openedPicker("catalog", []));
    stateMock.cleanups.forEach((cleanup) => cleanup());
    resolveTemplates(catalogItems);
    await flushPromises();
    expect(loaded.setters[PICKER_TEMPLATES]).not.toHaveBeenCalled();
    expect(loaded.setters[PICKER_LOADING]).not.toHaveBeenCalledWith(false);

    stateMock.cleanups = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let rejectTemplates: (error: Error) => void = () => undefined;
    mocks.productApi.templates.loadCatalogTemplates.mockReturnValue(
      new Promise((_, reject) => {
        rejectTemplates = reject;
      })
    );
    const failed = renderSection(openedPicker("catalog", []));
    stateMock.cleanups.forEach((cleanup) => cleanup());
    rejectTemplates(new Error("late"));
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: "late" }));
    expect(failed.setters[PICKER_LOAD_FAILED]).not.toHaveBeenCalledWith(true);
  });

  describe("my templates", () => {
    beforeEach(() => {
      mocks.productApi.templates.loadMyTemplates = vi.fn();
    });

    it("shows the entry only for signed-in users with a my-templates loader, independent of the catalog", () => {
      mocks.productApi.templates.catalogEnabled = false;
      renderSection();
      expect(mocks.captures.cards).toHaveLength(4);
      expect(mocks.captures.rawButtons.some((props: any) => props["aria-label"] === "打开Catalog")).toBe(false);
      expect(mocks.captures.rawButtons.some((props: any) => props["aria-label"] === "打开我的模板")).toBe(true);

      mocks.userStore = { user: null };
      renderSection();
      expect(mocks.captures.cards).toHaveLength(3);
      expect(mocks.captures.rawButtons.some((props: any) => props["aria-label"] === "打开我的模板")).toBe(false);

      mocks.userStore = { user: { id: "u1" } };
      mocks.productApi.templates.loadMyTemplates = undefined;
      renderSection();
      expect(mocks.captures.cards).toHaveLength(3);
    });

    it("renders the entry after the catalog and opens the my-templates picker without catalog tracking", () => {
      const { html, setters } = renderSection();
      expect(mocks.captures.cards).toHaveLength(5);
      expect(html.indexOf("Catalog")).toBeLessThan(html.indexOf("我的模板"));
      expect(html).toContain("选择并应用您上传的配置模板");
      expect(html).toContain("从我的模板选择");

      mocks.captures.rawButtons.find((props: any) => props["aria-label"] === "打开我的模板").onClick();
      expect(setters[PICKER_SOURCE]).toHaveBeenCalledWith("my");
      expect(setters[PICKER_LOADING]).toHaveBeenCalledWith(true);
      expect(mocks.interactions.templateCatalogOpened).not.toHaveBeenCalled();
    });

    it("loads and lists my templates in the shared picker", async () => {
      stateMock.runEffects = true;
      mocks.productApi.templates.loadMyTemplates.mockResolvedValue(myItems);

      const { setters } = renderSection({ [PICKER_SOURCE]: "my" });
      await flushPromises();

      expect(mocks.productApi.templates.loadMyTemplates).toHaveBeenCalledOnce();
      expect(mocks.productApi.templates.loadCatalogTemplates).not.toHaveBeenCalled();
      expect(setters[PICKER_TEMPLATES]).toHaveBeenCalledWith(myItems);

      const listed = renderSection(openedPicker("my", myItems));
      expect(listed.html).toContain("我的模板");
      expect(listed.html).toContain("Home Rules");
      expect(pickerApplyButtons()).toHaveLength(1);
    });

    it("shows an upload hint when the user has no templates", () => {
      const onOpen = vi.fn();
      const withUpload = renderSection(openedPicker("my", []), {
        templateUpload: { href: "/templates?upload=1", onOpen },
      });
      expect(withUpload.html).toContain("暂无模板，可将当前配置上传为模板");
      expect(withUpload.html).not.toContain("暂无可用模板");
      expect(mocks.captures.links[0]).toMatchObject({ href: "/templates?upload=1" });
      const uploadButton = mocks.captures.buttons.find((props: any) => props.asChild);
      expect(uploadButton).toMatchObject({ variant: "outline", size: "sm" });
      uploadButton.onClick();
      expect(onOpen).toHaveBeenCalledOnce();

      const withoutUpload = renderSection(openedPicker("my", []));
      expect(withoutUpload.html).toContain("暂无模板，可将当前配置上传为模板");
      expect(mocks.captures.links).toHaveLength(0);

      const failed = renderSection({ ...openedPicker("my", []), [PICKER_LOAD_FAILED]: true });
      expect(failed.html).toContain("加载模板失败，请稍后重试");
      expect(failed.html).not.toContain("暂无模板，可将当前配置上传为模板");

      const unmatched = renderSection(openedPicker("my", myItems, "missing"));
      expect(unmatched.html).toContain("暂无可用模板");
    });

    it("applies my templates and reports them with the my source", async () => {
      vi.stubGlobal("window", {
        setTimeout: vi.fn((callback: () => void) => {
          callback();
          return 1;
        }),
        clearTimeout: vi.fn(),
      });
      stateMock.runEffects = true;
      mocks.productApi.templates.loadMyTemplates.mockResolvedValue(myItems);
      mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({
        kind: "config",
        name: "Home Rules",
        config: { template: "standard" },
      });

      const { setters } = renderSection(openedPicker("my", myItems, "home"));
      await flushPromises();
      expect(mocks.interactions.templateSearchCompleted).toHaveBeenCalledWith({ source: "my", resultCount: 1 });

      pickerApplyButtons()[0].onClick();
      await flushPromises();

      expect(mocks.productApi.templates.loadTemplateDetail).toHaveBeenCalledWith("my-config");
      expect(mocks.store.setAppliedTemplateId).toHaveBeenCalledWith("my-config");
      expect(mocks.store.applyTemplateConfig).toHaveBeenCalledWith({ template: "standard" });
      expect(setters[PICKER_SOURCE]).toHaveBeenCalledWith(null);
      expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
        source: "my",
        kind: "config",
        result: "success",
      });
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已应用模板：Home Rules", variant: "success" }));

      mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({ kind: "yaml", name: "Uploaded YAML" });
      stateMock.runEffects = false;
      renderSection(openedPicker("my", myItems));
      pickerApplyButtons()[0].onClick();
      await flushPromises();
      expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
        source: "my",
        kind: "yaml",
        result: "validationError",
      });
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
    });
  });
});
