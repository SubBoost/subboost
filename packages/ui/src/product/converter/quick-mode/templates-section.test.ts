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

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
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
      return effect();
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

vi.mock("lucide-react", () => ({
  Globe: () => null,
  Heart: () => null,
  Loader2: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", props, props.children);
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

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function renderSection(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures = { buttons: [], cards: [], inputs: [], rawButtons: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(TemplatesSection));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("quick mode TemplatesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    stateMock.runEffects = false;
    mocks.captures = { buttons: [], cards: [], inputs: [], rawButtons: [] };
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

    mocks.captures.cards[1].onClick();
    expect(mocks.store.setTemplate).toHaveBeenCalledWith("standard");
    expect(mocks.interactions.templateSelected).toHaveBeenCalledWith({
      source: "builtin",
      templateType: "standard",
    });

    mocks.captures.cards.at(-1).onClick();
    expect(setters[0]).toHaveBeenCalledWith(true);
    expect(mocks.interactions.templateCatalogOpened).toHaveBeenCalledWith({ mode: "quick" });
  });

  it("renders catalog search, loading, empty, and filtered states", () => {
    expect(renderSection({ 0: true, 1: true }).html).toContain("Catalog");

    let result = renderSection({ 0: true, 1: false, 2: [], 3: "" });
    expect(result.html).toContain("暂无可用模板");

    result = renderSection({ 0: true, 1: false, 2: catalogItems, 3: "vpn" });
    expect(result.html).toContain("VPN Config");
    expect(result.html).not.toContain("Raw YAML");
    mocks.captures.inputs[0].onChange({ target: { value: "raw" } });
    expect(result.setters[3]).toHaveBeenCalledWith("raw");
  });

  it("applies catalog config templates", async () => {
    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({
      kind: "config",
      name: "VPN Config",
      config: { template: "full" },
    });

    const { setters } = renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[0].onClick();
    await flushPromises();

    expect(setters[4]).toHaveBeenCalledWith("tpl-config");
    expect(mocks.store.setAppliedTemplateId).toHaveBeenCalledWith("tpl-config");
    expect(mocks.store.applyTemplateConfig).toHaveBeenCalledWith({ template: "full" });
    expect(setters[0]).toHaveBeenCalledWith(false);
    expect(setters[3]).toHaveBeenCalledWith("");
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "config",
      result: "success",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已应用模板：VPN Config", variant: "success" }));
    expect(setters[4]).toHaveBeenCalledWith(null);
  });

  it("rejects unsupported catalog templates and missing details", async () => {
    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({ kind: "yaml", name: "Raw YAML" });
    renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[1].onClick();
    await flushPromises();
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "yaml",
      result: "validationError",
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));

    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue(null);
    renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[0].onClick();
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
    renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[0].onClick();
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

    const result = renderSection({ 0: true, 2: catalogItems });

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
    expect(setters[5]).toHaveBeenCalledWith({
      minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
      standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
      full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
    });

    const stopPropagation = vi.fn();
    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick({ stopPropagation });
    await flushPromises();

    expect(stopPropagation).toHaveBeenCalled();
    expect(mocks.productApi.templates.toggleTemplateEngagement).toHaveBeenCalledWith("builtin-minimal");
    expect(mocks.interactions.templateEngagementToggled).toHaveBeenCalledWith({ source: "builtin", engaged: true });
    expect(setters[5]).toHaveBeenCalledWith(expect.any(Function));
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
      5: {
        minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
        standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
        full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
      },
    });

    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick({ stopPropagation: vi.fn() });
    await flushPromises();

    const updater = setters[5].mock.calls.at(-1)?.[0] as (prev: any) => any;
    expect(updater({
      minimal: { id: "builtin-minimal", engagementCount: 7, isEngaged: true },
      standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
      full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
    }).minimal).toEqual({ id: "builtin-minimal", engagementCount: 7, isEngaged: false });
  });

  it("skips builtin engagement when the template id is missing", async () => {
    const { setters } = renderSection({
      5: {
        minimal: { id: "", engagementCount: 7, isEngaged: false },
        standard: { id: "builtin-standard", engagementCount: 0, isEngaged: false },
        full: { id: "builtin-full", engagementCount: 0, isEngaged: false },
      },
    });

    mocks.captures.rawButtons.find((props: any) => props.title === "Like").onClick({ stopPropagation: vi.fn() });
    await flushPromises();

    expect(mocks.productApi.templates.toggleTemplateEngagement).not.toHaveBeenCalled();
    expect(setters[5]).not.toHaveBeenCalled();
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
    const unnamed = renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[0].onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已应用模板：未命名模板" }));
    expect(unnamed.setters[4]).toHaveBeenCalledWith(null);

    mocks.productApi.templates.loadTemplateDetail.mockResolvedValue({ kind: "markdown", name: "Doc" });
    renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[0].onClick();
    await flushPromises();
    expect(mocks.interactions.templateApplied).toHaveBeenCalledWith({
      source: "catalog",
      kind: "unknown",
      result: "validationError",
    });

    mocks.productApi.templates.loadTemplateDetail = undefined;
    const noLoader = renderSection({ 0: true, 1: false, 2: catalogItems, 3: "" });
    mocks.captures.buttons[0].onClick();
    await flushPromises();
    expect(noLoader.setters[4]).not.toHaveBeenCalled();
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

    const loaded = renderSection({ 0: true, 1: false, 2: catalogItems, 3: "vpn" });
    await flushPromises();

    expect(loaded.setters[1]).toHaveBeenCalledWith(true);
    expect(loaded.setters[2]).toHaveBeenCalledWith(catalogItems);
    expect(loaded.setters[1]).toHaveBeenCalledWith(false);
    expect(mocks.interactions.templateSearchCompleted).toHaveBeenCalledWith({
      source: "catalog",
      resultCount: 1,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.productApi.templates.loadCatalogTemplates.mockRejectedValue(new Error("network"));
    const failed = renderSection({ 0: true, 1: false, 2: [], 3: "" });
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(failed.setters[2]).toHaveBeenCalledWith([]);
    expect(failed.setters[1]).toHaveBeenCalledWith(false);
  });
});
