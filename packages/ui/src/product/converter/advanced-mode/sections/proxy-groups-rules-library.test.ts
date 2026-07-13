import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any[]>,
  effectiveRulesByModule: {} as Record<string, any[]>,
  interactions: {
    ruleAdded: vi.fn(),
  },
  search: {} as Record<string, any>,
  store: {} as Record<string, any>,
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  enabled: false,
  effects: [] as Array<() => void | (() => void)>,
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
        : initial;
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
      stateMock.effects.push(effect);
      return undefined;
    },
  };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: unknown, props: any) => {
    if (type === "button" && typeof props?.onClick === "function") {
      (mocks.captures.nativeButtons ||= []).push(props);
    }
    if (type === "div" && typeof props?.onClick === "function") {
      (mocks.captures.nativeDivs ||= []).push(props);
    }
  };
  return {
    ...actual,
    jsx: (type: unknown, props: any, key?: string) => {
      capture(type, props);
      return actual.jsx(type as any, props, key);
    },
    jsxs: (type: unknown, props: any, key?: string) => {
      capture(type, props);
      return actual.jsxs(type as any, props, key);
    },
  };
});

vi.mock("lucide-react", () => ({
  Check: () => null,
  Loader2: () => null,
  Search: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => {
    mocks.captures.badges.push(props);
    return React.createElement("span", props, props.children);
  },
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
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => {
    mocks.captures.selects.push(props);
    return React.createElement("select", null, props.children);
  },
  SelectContent: (props: any) => React.createElement(React.Fragment, null, props.children),
  SelectItem: (props: any) => React.createElement("option", { value: props.value }, props.children),
  SelectTrigger: (props: any) => React.createElement(React.Fragment, null, props.children),
  SelectValue: (props: any) => React.createElement("span", null, props.placeholder),
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "auto", name: "Auto", rules: [{ id: "netflix" }] },
    { id: "fallback", name: "Fallback", rules: [] },
    { id: "bare", name: "Bare" },
  ],
}));
vi.mock("@subboost/core/generator/module-rules", () => ({
  getModuleRuleOrderKey: (moduleId: string, ruleId: string) => `module:${moduleId}:${ruleId}`,
  getEffectiveModuleRules: vi.fn((module: { id: string }) => mocks.effectiveRulesByModule[module.id] || []),
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) => override || module.name,
}));
vi.mock("@subboost/core/rules/metadata", () => ({
  RULE_CATEGORIES: {
    streaming: { name: "流媒体" },
    telegram: { name: "通讯" },
  },
}));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return { useConfigStore };
});
vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));
vi.mock("./proxy-groups-added-rule-sets", () => ({
  ProxyGroupsAddedRuleSets: (props: any) => {
    mocks.captures.addedRuleSets.push(props);
    return React.createElement("div", null, props.showSearchHint ? "added-rules-hint" : "added-rules");
  },
}));
vi.mock("./proxy-groups-rules-search", () => ({
  getRuleDisplayName: (rule: any) => rule.nameZh || rule.name || rule.id,
  replaceRuleProviderBase: (url: string, base: string) => {
    const match = url.match(/\/(geosite|geoip)\/[^/]+\.mrs$/);
    return match ? `${base.replace(/\/+$/, "")}/${match[1]}/${url.split("/").pop()}` : url;
  },
  useRulesLibrarySearch: () => mocks.search,
}));

import { ProxyGroupsRulesLibrary } from "./proxy-groups-rules-library";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";

const netflixRule = {
  id: "netflix",
  nameZh: "Netflix",
  behavior: "domain",
  category: "streaming",
  url: "https://raw.example/geosite/netflix.mrs",
};

const telegramRule = {
  id: "telegram",
  nameZh: "Telegram",
  behavior: "ipcidr",
  category: "telegram",
  url: "https://raw.example/geoip/telegram.mrs",
};

const invalidRule = {
  id: "invalid",
  nameZh: "Invalid",
  behavior: "domain",
  category: "streaming",
  url: "https://raw.example/invalid.txt",
};

const unknownCategoryRule = {
  id: "unknown-category",
  nameZh: "Unknown Category",
  behavior: "domain",
  category: "unknown",
  url: "https://raw.example/geosite/unknown-category.mrs",
};

function renderLibrary(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.effects = [];
  stateMock.setters = [];
  mocks.captures = { addedRuleSets: [], badges: [], buttons: [], inputs: [], nativeButtons: [], nativeDivs: [], selects: [] };
  try {
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsRulesLibrary));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("ProxyGroupsRulesLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { addedRuleSets: [], badges: [], buttons: [], inputs: [], nativeButtons: [], nativeDivs: [], selects: [] };
    (PROXY_GROUP_MODULES[0] as any).rules = [{ id: "netflix" }];
    (PROXY_GROUP_MODULES[1] as any).rules = [];
    (PROXY_GROUP_MODULES[2] as any).rules = undefined;
    mocks.effectiveRulesByModule = {};
    mocks.search = {
      ruleSearchKeyword: "netflix",
      setRuleSearchKeyword: vi.fn(),
      searchResults: [netflixRule, telegramRule],
      rulesSearchLoading: false,
      rulesSearchLoadingMore: false,
      rulesSearchError: "",
      rulesSearchSource: "fresh",
      totalMatched: 2,
      totalRules: 30,
      canLoadMore: false,
      handleLoadMore: vi.fn(),
    };
    mocks.store = {
      ruleProviderBaseUrl: "https://rules.example/",
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: [],
      toggleProxyGroup: vi.fn(),
      customRuleSets: [],
      builtinRuleEdits: {},
      addModuleRules: vi.fn(),
      customProxyGroups: [
        { id: "custom-1", name: "Custom" },
        { id: "custom-2", name: "Target" },
      ],
      updateCustomProxyGroup: vi.fn(),
      proxyGroupNameOverrides: { auto: "Auto", fallback: "Fallback" },
    };
  });

  it("renders search states and forwards search controls", () => {
    const { html } = renderLibrary();
    expect(html).toContain("匹配 2");
    expect(mocks.captures.addedRuleSets[0]).toEqual({ showSearchHint: false, totalRules: 30 });
    mocks.captures.inputs[0].onChange({ target: { value: "steam" } });
    expect(mocks.search.setRuleSearchKeyword).toHaveBeenCalledWith("steam");

    mocks.search.rulesSearchLoading = true;
    expect(renderLibrary().html).toContain("搜索中");

    mocks.search.rulesSearchLoading = false;
    mocks.search.rulesSearchError = "bad query";
    expect(renderLibrary().html).toContain("bad query");

    mocks.search.rulesSearchError = "";
    mocks.search.searchResults = [];
    mocks.search.totalMatched = 0;
    expect(renderLibrary().html).toContain("未找到相关规则");

    mocks.search.searchResults = [netflixRule];
    mocks.search.totalMatched = 3;
    mocks.search.rulesSearchSource = "stale";
    mocks.search.canLoadMore = true;
    renderLibrary();
    mocks.captures.buttons.find((props) => props.onClick === mocks.search.handleLoadMore).onClick();
    expect(mocks.search.handleLoadMore).toHaveBeenCalled();

    mocks.search.ruleSearchKeyword = "rare";
    mocks.search.searchResults = [unknownCategoryRule];
    mocks.search.totalMatched = 1;
    mocks.search.totalRules = 0;
    expect(renderLibrary().html).toContain("匹配 1 · 规则库");
    expect(renderLibrary().html).toContain("unknown");

    mocks.search.ruleSearchKeyword = " ";
    mocks.search.totalRules = 42;
    expect(renderLibrary().html).toContain("42 规则");
  });

  it("shows assigned rules and enables a disabled built-in group", () => {
    let result = renderLibrary();
    expect(result.html).toContain("已启用");
    expect(result.html).toContain("属于");

    (PROXY_GROUP_MODULES[0] as any).rules = [{ id: "telegram" }];
    mocks.search.searchResults = [telegramRule];
    result = renderLibrary();
    expect(result.html).toContain("IP");

    mocks.store.enabledProxyGroups = [];
    mocks.search.searchResults = [netflixRule, telegramRule];
    (PROXY_GROUP_MODULES[0] as any).rules = [{ id: "netflix" }];
    renderLibrary();
    mocks.captures.buttons.find((props) => props.children === "开启代理组").onClick();
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("auto");

    mocks.store.customRuleSets = [{ id: "telegram", name: "Telegram", behavior: "ipcidr", path: "geoip/telegram.mrs", target: "Custom" }];
    result = renderLibrary();
    expect(result.html).toContain("Custom");
    expect(result.html).toContain("已添加");

    mocks.store.customRuleSets = [{ id: "telegram", name: "Telegram", behavior: "ipcidr", path: "geoip/telegram.mrs", target: "Target" }];
    result = renderLibrary();
    expect(result.html).toContain("Target");
    expect(result.html).toContain("已添加");
  });

  it("adds selected rules to a custom group", () => {
    const { setters } = renderLibrary({ 0: [telegramRule], 1: "custom:custom-1" });
    mocks.captures.selects[0].onValueChange("module:auto");
    expect(setters[1]).toHaveBeenCalledWith("module:auto");

    mocks.captures.buttons.find((props) => props.children === "添加").onClick();

    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [
      {
        id: "telegram",
        name: "Telegram",
        behavior: "ipcidr",
        path: "https://raw.example/geoip/telegram.mrs",
        noResolve: true,
      },
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已添加规则集" }));
    expect(mocks.interactions.ruleAdded).toHaveBeenCalledWith({ source: "library", kind: "ruleset" });
    expect(setters[0]).toHaveBeenCalledWith([]);
  });

  it("adds selected rules to another custom group", () => {
    const { html } = renderLibrary({ 0: [telegramRule], 1: "custom:custom-2" });
    expect(html).toContain("自定义组");
    expect(html).toContain("Target");

    mocks.captures.buttons.find((props) => props.children === "添加").onClick();

    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-2", [
      {
        id: "telegram",
        name: "Telegram",
        behavior: "ipcidr",
        path: "https://raw.example/geoip/telegram.mrs",
        noResolve: true,
      },
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "已添加规则集",
      description: expect.stringContaining("Target"),
    }));
  });

  it("adds valid selected rules to a module and reports skipped invalid rules", () => {
    mocks.store.enabledProxyGroups = [];
    const { html } = renderLibrary({ 0: [telegramRule, invalidRule], 1: "module:auto" });
    expect(html).toContain("已选择");

    mocks.captures.buttons.find((props) => props.children === "添加").onClick();

    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("auto");
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("auto", [
      {
        id: "telegram",
        name: "Telegram",
        behavior: "ipcidr",
        path: "geoip/telegram.mrs",
        noResolve: true,
      },
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "已添加规则集",
      description: expect.stringContaining("1 条无法识别"),
    }));
  });

  it("warns when selected rules conflict or add nothing new", () => {
    renderLibrary({ 0: [netflixRule], 1: "custom:custom-1" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "规则集已在其他分流组中",
      variant: "warning",
    }));
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();

    mocks.store.customRuleSets = [{ id: "telegram", name: "Telegram", behavior: "ipcidr", path: "geoip/telegram.mrs", target: "Custom" }];
    renderLibrary({ 0: [telegramRule], 1: "custom:custom-1" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "没有新增规则集",
      variant: "warning",
    }));
  });

  it("clears hidden module targets and toggles unassigned rule selection", () => {
    const placeholderResult = renderLibrary({ 1: "__label_modules__" });
    stateMock.effects[0]();
    expect(placeholderResult.setters[1]).not.toHaveBeenCalledWith("");

    renderLibrary({ 1: "custom:custom-1" });
    stateMock.effects[0]();
    expect(stateMock.setters[1]).not.toHaveBeenCalledWith("");

    const { setters } = renderLibrary({ 1: "module:missing" });
    stateMock.effects[0]();
    expect(setters[1]).toHaveBeenCalledWith("");

    renderLibrary({ 1: "module:auto" });
    stateMock.effects[0]();
    expect(stateMock.setters[1]).not.toHaveBeenCalledWith("");

    const filteredResult = renderLibrary({ 1: "custom:missing" });
    stateMock.effects[0]();
    expect(filteredResult.setters[1]).toHaveBeenCalledWith("");

    renderLibrary({ 1: "custom:custom-1" });
    stateMock.effects[0]();
    expect(stateMock.setters[1]).not.toHaveBeenCalledWith("");

    renderLibrary();
    const firstRuleDiv = mocks.captures.nativeDivs.find((props) => String(props.className).includes("cursor-pointer"));
    firstRuleDiv.onClick();
    expect(stateMock.setters[0]).toHaveBeenCalledWith([telegramRule]);

    renderLibrary({ 0: [telegramRule] });
    const selectedRuleDiv = mocks.captures.nativeDivs.find((props) => String(props.className).includes("cursor-pointer"));
    selectedRuleDiv.onClick();
    expect(stateMock.setters[0]).toHaveBeenCalledWith([]);
  });

  it("clears and removes selected rule chips", () => {
    const selectedRules = [
      netflixRule,
      telegramRule,
      invalidRule,
      { ...netflixRule, id: "steam", nameZh: "Steam" },
      { ...netflixRule, id: "google", nameZh: "Google" },
      { ...netflixRule, id: "youtube", nameZh: "YouTube" },
    ];
    const { html } = renderLibrary({ 0: selectedRules, 1: "custom:custom-1" });
    expect(html).toContain("+1");

    mocks.captures.nativeButtons.find((props) => props.children === "清空").onClick();
    expect(stateMock.setters[0]).toHaveBeenCalledWith([]);

    mocks.captures.badges.find((props) => typeof props.onClick === "function").onClick();
    expect(stateMock.setters[0]).toHaveBeenCalledWith(selectedRules.slice(1));
  });

  it("ignores invalid add targets before mutating groups", () => {
    const addButton = () => mocks.captures.buttons.find((props) => props.children === "添加");

    renderLibrary({ 0: [], 1: "custom:custom-1" });
    expect(addButton()).toBeUndefined();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();

    renderLibrary({ 0: [netflixRule], 1: "__label_custom__" });
    addButton().onClick();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();

    renderLibrary({ 0: [netflixRule], 1: "bad:target" });
    addButton().onClick();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();

    mocks.store.hiddenProxyGroups = ["auto"];
    renderLibrary({ 0: [netflixRule], 1: "module:auto" });
    addButton().onClick();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();

    mocks.store.hiddenProxyGroups = [];
    mocks.store.customProxyGroups = [];
    renderLibrary({ 0: [netflixRule], 1: "custom:missing" });
    addButton().onClick();
    expect(mocks.store.updateCustomProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();
  });

  it("handles existing module rules and enabled module additions", () => {
    renderLibrary({ 0: [netflixRule], 1: "module:auto" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "没有新增规则集",
      description: expect.stringContaining("1 条已存在"),
      variant: "warning",
    }));
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.store.enabledProxyGroups = ["auto"];
    renderLibrary({ 0: [telegramRule], 1: "module:auto" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.store.toggleProxyGroup).not.toHaveBeenCalled();
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("auto", [
      {
        id: "telegram",
        name: "Telegram",
        behavior: "ipcidr",
        path: "geoip/telegram.mrs",
        noResolve: true,
      },
    ]);

    vi.clearAllMocks();
    mocks.store.customRuleSets = [
      { id: "telegram", name: "Telegram", behavior: "ipcidr", path: "geoip/telegram.mrs", target: "Custom" },
    ];
    renderLibrary({ 0: [telegramRule], 1: "module:fallback" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalledWith("fallback", expect.arrayContaining([
      expect.objectContaining({ id: "telegram" }),
    ]));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "规则集已在其他分流组中",
      variant: "warning",
    }));
  });

  it("handles moved builtin targets and modules without preset rules", () => {
    mocks.store.builtinRuleEdits = { "module:auto:netflix": { target: "Target" } };
    renderLibrary({ 0: [netflixRule], 1: "custom:custom-1" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "规则集已在其他分流组中",
      description: expect.stringContaining("Target"),
      variant: "warning",
    }));

    vi.clearAllMocks();
    mocks.store.builtinRuleEdits = {};
    mocks.store.enabledProxyGroups = [];
    renderLibrary({ 0: [telegramRule], 1: "module:bare" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();

    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("bare");
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("bare", [
      {
        id: "telegram",
        name: "Telegram",
        behavior: "ipcidr",
        path: "geoip/telegram.mrs",
        noResolve: true,
      },
    ]);
  });

  it("covers empty hints, loading-more state, disabled builtin edits, and optional interactions", () => {
    mocks.search.ruleSearchKeyword = "";
    mocks.search.searchResults = [];
    mocks.search.totalRules = 0;
    expect(renderLibrary().html).toContain("规则库");
    expect(mocks.captures.addedRuleSets[0]).toEqual({ showSearchHint: true, totalRules: 0 });

    mocks.search.ruleSearchKeyword = "all";
    mocks.search.searchResults = [telegramRule];
    mocks.search.totalMatched = undefined;
    mocks.search.canLoadMore = true;
    mocks.search.rulesSearchLoadingMore = true;
    expect(renderLibrary().html).toContain("显示 1");
    expect(mocks.captures.buttons.find((props) => props.onClick === mocks.search.handleLoadMore).disabled).toBe(true);

    mocks.search.rulesSearchLoadingMore = false;
    mocks.search.searchResults = [netflixRule];
    mocks.store.builtinRuleEdits = { "module:auto:netflix": { enabled: false } };
    renderLibrary();
    expect(mocks.captures.nativeDivs.some((props) => String(props.className).includes("cursor-pointer"))).toBe(true);

    mocks.store.builtinRuleEdits = {};
    mocks.store.customRuleSets = [{ id: "netflix", name: "Netflix", behavior: "domain", path: "geosite/netflix.mrs", target: "Custom" }];
    expect(renderLibrary().html).toContain("域名");

    vi.clearAllMocks();
    mocks.interactions = { ruleAdded: vi.fn() };
    mocks.store.customRuleSets = [];
    mocks.search.searchResults = [telegramRule];
    renderLibrary({ 0: [telegramRule], 1: "custom:custom-1" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [
      expect.objectContaining({ id: "telegram" }),
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已添加规则集" }));
  });

  it("summarizes long conflict lists and warns when only invalid custom rules are selected", () => {
    const conflictRules = Array.from({ length: 9 }, (_, index) => ({
      ...telegramRule,
      id: `conflict-${index}`,
      nameZh: `Conflict ${index}`,
      url: `https://raw.example/geoip/conflict-${index}.mrs`,
    }));
    mocks.store.customRuleSets = conflictRules.map((rule) => ({
      id: rule.id,
      name: rule.nameZh,
      behavior: "ipcidr",
      path: `geoip/${rule.id}.mrs`,
      target: "Target",
    }));
    mocks.search.searchResults = conflictRules;
    renderLibrary({ 0: conflictRules, 1: "custom:custom-1" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "规则集已在其他分流组中",
      description: expect.stringContaining("以及 1 条"),
    }));

    vi.clearAllMocks();
    mocks.store.customRuleSets = [];
    const emptyUrlRule = { ...invalidRule, id: "empty-url", url: "" };
    mocks.search.searchResults = [emptyUrlRule];
    renderLibrary({ 0: [emptyUrlRule], 1: "custom:custom-1" });
    mocks.captures.buttons.find((props) => props.children === "添加").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "没有新增规则集",
      description: expect.stringContaining("1 条已存在"),
      variant: "warning",
    }));
  });
});
