// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  ruleSets: [] as any[],
  effectiveRules: [] as any[],
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  runEffects: false,
}));

function mockReactModule(actual: typeof React) {
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
    useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
      if (!stateMock.enabled) return actual.useEffect(effect, deps);
      return stateMock.runEffects ? effect() : undefined;
    },
  };
}

vi.mock("react", async (importOriginal) => mockReactModule(await importOriginal<typeof import("react")>()));
vi.mock("../../../node_modules/react/index.js", async (importOriginal) =>
  mockReactModule(await importOriginal<typeof import("react")>())
);

function mockJsxRuntime(actual: typeof import("react/jsx-runtime")) {
  const capture = (type: unknown, props: any, key?: unknown) => {
    if (typeof type === "string") {
      (mocks.captures.intrinsics ||= []).push({ type, props: props ?? {}, key });
    }
  };
  return {
    ...actual,
    jsx: (type: unknown, props: any, key?: unknown) => {
      capture(type, props, key);
      return actual.jsx(type as any, props, key as any);
    },
    jsxs: (type: unknown, props: any, key?: unknown) => {
      capture(type, props, key);
      return actual.jsxs(type as any, props, key as any);
    },
  };
}

vi.mock("react/jsx-runtime", async (importOriginal) =>
  mockJsxRuntime(await importOriginal<typeof import("react/jsx-runtime")>())
);
vi.mock(
  "../../../node_modules/react/jsx-runtime.js",
  async (importOriginal) => mockJsxRuntime(await importOriginal<typeof import("react/jsx-runtime")>())
);
vi.mock("lucide-react", () => ({
  ArrowRight: () => null,
  Check: () => null,
  Pencil: () => null,
  Trash2: () => null,
  X: () => null,
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
    return React.createElement("input", props);
  },
}));
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => {
    mocks.captures.selects.push(props);
    return React.createElement("select", null, props.children);
  },
  SelectContent: (props: any) => props.children,
  SelectItem: (props: any) => props.children,
  SelectTrigger: (props: any) => props.children,
  SelectValue: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "auto", name: "Auto" },
    { id: "fallback", name: "Fallback" },
  ],
}));
vi.mock("@subboost/core/generator/module-rules", () => ({
  getEffectiveModuleRules: vi.fn(() => mocks.effectiveRules),
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) => override || module.name,
}));
vi.mock("@subboost/core/rules/custom-routing-rule-sets", () => ({
  buildRuleSetUrlFromPath: (path: string, base: string) => `${base.replace(/\/+$/, "")}/${path}`,
  collectCustomRoutingRuleSets: () => mocks.ruleSets,
  getRuleSetTargetValue: (target: any) => `${target.kind}:${target.id}`,
  normalizeRuleSetPathInput: (path: string) => path.trim(),
  parseRuleSetTargetValue: (value: string) => {
    const [kind, id] = value.split(":");
    return kind && id ? { kind, id } : null;
  },
}));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return { useConfigStore };
});

import { ProxyGroupsAddedRuleSets } from "../../../packages/ui/src/product/converter/advanced-mode/sections/proxy-groups-added-rule-sets";

const moduleItem = {
  key: "module:auto:rule-a",
  id: "rule-a",
  name: "Rule A",
  behavior: "domain",
  path: "geosite/rule-a.mrs",
  noResolve: true,
  source: { kind: "module", id: "auto" },
  target: { kind: "module", id: "auto", value: "module:auto", name: "Auto" },
};

const customItem = {
  key: "custom:custom-1:rule-b",
  id: "rule-b",
  name: "Rule B",
  behavior: "ipcidr",
  path: "geoip/rule-b.mrs",
  source: { kind: "custom", id: "custom-1" },
  target: { kind: "custom", id: "custom-1", value: "custom:custom-1", name: "Custom" },
};

function renderAdded(
  overrides: Record<number, unknown> = {},
  props = { showSearchHint: false, totalRules: null as number | null },
  options: { runEffects?: boolean } = {},
) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  stateMock.runEffects = options.runEffects ?? false;
  mocks.captures = { buttons: [], inputs: [], selects: [], switches: [], intrinsics: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsAddedRuleSets, props));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

describe("public ProxyGroupsAddedRuleSets extra branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ruleSets = [moduleItem, customItem];
    mocks.effectiveRules = [];
    mocks.store = {
      ruleProviderBaseUrl: "https://rules.example/",
      enabledProxyGroups: ["auto", "fallback"],
      hiddenProxyGroups: [],
      customRuleSets: [
        { id: "rule-b", name: "Rule B", behavior: "ipcidr", path: "geoip/rule-b.mrs", target: "Custom", noResolve: true },
        { id: "keep", name: "Keep", behavior: "domain", path: "geosite/keep.mrs", target: "Custom" },
      ],
      builtinRuleEdits: {},
      customProxyGroups: [
        { id: "custom-1", name: "Custom" },
        { id: "custom-2", name: "Target" },
      ],
      proxyGroupNameOverrides: { auto: "Auto" },
      toggleProxyGroup: vi.fn(),
      addModuleRules: vi.fn(),
      updateModuleRule: vi.fn(),
      removeModuleRule: vi.fn(),
      moveModuleRule: vi.fn(),
      updateCustomProxyGroup: vi.fn(),
    };
  });

  it("covers effect early returns and non-numeric search hint", () => {
    renderAdded({}, undefined, { runEffects: true });
    expect(stateMock.setters[0]).not.toHaveBeenCalledWith(null);

    renderAdded(
      {
        0: moduleItem.key,
        1: { name: "Draft", behavior: "domain", path: "geosite/draft.mrs", targetValue: "module:auto", noResolve: false },
      },
      undefined,
      { runEffects: true },
    );
    expect(stateMock.setters[0]).not.toHaveBeenCalledWith(null);

    mocks.ruleSets = [];
    expect(renderAdded({}, { showSearchHint: true, totalRules: null }).html).toContain("从在线规则集中搜索");
  });

  it("removes non-editing rows without cancelling unrelated editing state", () => {
    const moduleRender = renderAdded({ 0: customItem.key });
    mocks.captures.buttons.find((props: any) => props.title === "删除规则集").onClick();
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith("auto", "rule-a");
    expect(moduleRender.setters[0]).not.toHaveBeenCalledWith(null);

    mocks.store.customProxyGroups = [];
    renderAdded({ 0: moduleItem.key });
    mocks.captures.buttons.filter((props: any) => props.title === "删除规则集").at(1).onClick();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
  });

  it("updates existing custom rules and avoids toggling enabled modules", () => {
    renderAdded({
      0: customItem.key,
      1: { name: "   ", behavior: "domain", path: " geosite/renamed.mrs ", targetValue: "custom:custom-1", noResolve: false },
    });
    mocks.captures.buttons.find((props: any) => props.title === "保存规则集").onClick();
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith("custom-1", "rule-b", {
      id: "rule-b",
      name: "Rule B",
      behavior: "domain",
      format: "mrs",
      path: "geosite/renamed.mrs",
    });

    renderAdded({
      0: customItem.key,
      1: { name: "Module", behavior: "domain", path: "geosite/module.mrs", targetValue: "module:fallback", noResolve: false },
    });
    mocks.captures.buttons.find((props: any) => props.title === "保存规则集").onClick();
    expect(mocks.store.toggleProxyGroup).not.toHaveBeenCalledWith("fallback");
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("custom-1", "rule-b", { kind: "module", id: "fallback" });
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith("fallback", "rule-b", {
      id: "rule-b",
      name: "Rule B",
      behavior: "domain",
      format: "mrs",
      path: "geosite/module.mrs",
    });
  });
});
