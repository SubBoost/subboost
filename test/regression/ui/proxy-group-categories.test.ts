// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reactState = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  reset(initial: unknown[] = []) {
    this.slots = [...initial];
    this.index = 0;
  },
  rewind() {
    this.index = 0;
  },
}));

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, any>,
  moduleCards: [] as Array<Record<string, any>>,
  dropdownItems: [] as Array<Record<string, any>>,
  confirmDialog: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => unknown) => {
      effect();
    },
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const slot = reactState.index;
      reactState.index += 1;
      if (reactState.slots[slot] === undefined) {
        reactState.slots[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      const setState = (next: unknown) => {
        reactState.slots[slot] =
          typeof next === "function" ? (next as (prev: unknown) => unknown)(reactState.slots[slot]) : next;
      };
      return [reactState.slots[slot], setState];
    },
  };
});

vi.mock("../../../node_modules/react/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => unknown) => {
      effect();
    },
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const slot = reactState.index;
      reactState.index += 1;
      if (reactState.slots[slot] === undefined) {
        reactState.slots[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      const setState = (next: unknown) => {
        reactState.slots[slot] =
          typeof next === "function" ? (next as (prev: unknown) => unknown)(reactState.slots[slot]) : next;
      };
      return [reactState.slots[slot], setState];
    },
  };
});

vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
  Pencil: () => null,
  RotateCcw: () => null,
}));
vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => React.createElement("div", props, props.children),
  DropdownMenuContent: (props: any) => React.createElement("div", props, props.children),
  DropdownMenuItem: (props: any) => {
    mocks.dropdownItems.push(props);
    return React.createElement("button", props, props.children);
  },
  DropdownMenuLabel: (props: any) => React.createElement("span", props, props.children),
  DropdownMenuTrigger: (props: any) => React.createElement("span", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.store }));
vi.mock("@subboost/ui/product/converter/advanced-mode/sections/proxy-groups-custom-groups-panel", () => ({
  ProxyGroupsCustomGroupsPanel: () => React.createElement("div", { "data-panel": "custom-groups" }),
}));
vi.mock("@subboost/ui/product/converter/advanced-mode/sections/proxy-groups-custom-routing-rules", () => ({
  ProxyGroupsCustomRoutingRules: () => React.createElement("div", { "data-panel": "custom-routing" }),
}));
vi.mock("@subboost/ui/product/converter/advanced-mode/sections/proxy-groups-module-card", () => ({
  ProxyGroupsModuleCard: (props: any) => {
    mocks.moduleCards.push(props);
    return React.createElement("section", { "data-module": props.module.id }, props.display.full);
  },
}));

import { ProxyGroupsCategories } from "../../../packages/ui/src/product/converter/advanced-mode/sections/proxy-groups-categories";

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<Record<string, any>>) => boolean,
  out: Array<React.ReactElement<Record<string, any>>> = [],
) {
  React.Children.forEach(node, (child: unknown) => {
    if (!React.isValidElement(child)) return;
    const element = child as React.ReactElement<Record<string, any>>;
    if (predicate(element)) out.push(element);
    collectElements(element.props.children, predicate, out);
  });
  return out;
}

function renderCategories(initialState: unknown[] = [new Set(["core", "service", "other", "custom"])]) {
  mocks.moduleCards = [];
  mocks.dropdownItems = [];
  reactState.reset(initialState);
  const tree = ProxyGroupsCategories();
  mocks.moduleCards = collectElements(tree, (element) => Boolean(element.props.module && element.props.onToggleEnabled)).map(
    (element) => element.props,
  );
  mocks.dropdownItems = collectElements(
    tree,
    (element) => element.props.className === "text-xs" && typeof element.props.onClick === "function",
  ).map((element) => element.props);
  return tree;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = {
    ruleProviderBaseUrl: "https://rules.example/base/",
    cnIpNoResolve: true,
    setCnIpNoResolve: vi.fn(),
    experimentalCnUseCnRuleSet: false,
    setExperimentalCnUseCnRuleSet: vi.fn(),
    enabledProxyGroups: ["select", "ad", "private", "streaming-west"],
    hiddenProxyGroups: ["google"],
    toggleProxyGroup: vi.fn(),
    hideProxyGroup: vi.fn(),
    restoreHiddenProxyGroup: vi.fn(),
    customRuleSets: [
      { id: "extra-ad", name: "Extra Ad", behavior: "domain", path: "geosite/extra-ad.mrs", target: "广告拦截" },
    ],
    builtinRuleEdits: {},
    moduleRuleEditWarningAccepted: false,
    customRules: [{ id: "manual", type: "DOMAIN", value: "example.com", target: "广告拦截" }],
    updateCustomRule: vi.fn(),
    removeCustomRule: vi.fn(),
    addModuleRules: vi.fn(),
    removeModuleRule: vi.fn(),
    moveModuleRule: vi.fn(),
    restoreModuleRule: vi.fn(),
    resetModuleRuleTarget: vi.fn(),
    acceptModuleRuleEditWarning: vi.fn(),
    proxyGroupNameOverrides: { ad: "广告拦截" },
    setProxyGroupNameOverride: vi.fn(),
    clearProxyGroupNameOverride: vi.fn(),
    customProxyGroups: [
      { id: "custom", name: "🛑 Custom Group", emoji: "", groupType: "select" },
      { id: "target", name: "Target Group", emoji: "", groupType: "select" },
    ],
    dialerProxyGroups: [
      { id: "dialer", name: " Dialer Group ", type: "select", enabled: true, relayNodes: [], targetNodes: [] },
      null,
    ],
    proxyGroupAdvancedModeEnabled: false,
    setProxyGroupAdvancedModeEnabled: vi.fn(),
  };
});

describe("public ProxyGroupsCategories branch coverage", () => {
  it("restores hidden modules and toggles module rule expansion", () => {
    renderCategories();
    expect(mocks.dropdownItems).toHaveLength(1);

    mocks.dropdownItems[0].onClick();
    expect(mocks.store.restoreHiddenProxyGroup).toHaveBeenCalledWith("google");

    const adCard = mocks.moduleCards.find((card) => card.module.id === "ad")!;
    adCard.onToggleRulesExpanded();
    expect(reactState.slots[3]).toEqual(new Set(["ad"]));
    reactState.rewind();
    const tree = ProxyGroupsCategories();
    mocks.moduleCards = collectElements(tree, (element) => Boolean(element.props.module && element.props.onToggleEnabled)).map(
      (element) => element.props,
    );
    const expandedAdCard = mocks.moduleCards.find((card) => card.module.id === "ad")!;
    expandedAdCard.onToggleRulesExpanded();
    expect(reactState.slots[3]).toEqual(new Set());
  });

  it("guards core module disable and hide actions with confirmation", async () => {
    renderCategories();
    const coreCard = mocks.moduleCards.find((card) => card.module.category === "core" && card.isEnabled)!;

    mocks.confirmDialog.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await coreCard.onToggleEnabled();
    expect(mocks.store.toggleProxyGroup).not.toHaveBeenCalled();

    await coreCard.onToggleEnabled();
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith(coreCard.module.id);

    await coreCard.onHide();
    expect(mocks.store.hideProxyGroup).toHaveBeenCalledWith(coreCard.module.id);
  });

  it("toggles and hides non-core modules without the core warning branch", async () => {
    renderCategories();
    const nonCore = mocks.moduleCards.find((card) => card.module.category !== "core")!;

    await nonCore.onToggleEnabled();
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith(nonCore.module.id);

    mocks.confirmDialog.mockResolvedValueOnce(true);
    await nonCore.onHide();
    expect(mocks.store.hideProxyGroup).toHaveBeenCalledWith(nonCore.module.id);
  });

  it("validates module rename uniqueness and commits clear/set branches", () => {
    renderCategories([new Set(["core", "service"]), "ad", "Custom Group", new Set()]);
    mocks.moduleCards.find((card) => card.module.id === "ad")!.onCommitEditing();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "代理组名称已存在，请换一个名称。",
      variant: "warning",
    });

    renderCategories([new Set(["core", "service"]), "ad", "No Duplicate", new Set()]);
    mocks.moduleCards.find((card) => card.module.id === "ad")!.onCommitEditing();
    expect(mocks.store.setProxyGroupNameOverride).toHaveBeenCalledWith("ad", "No Duplicate");

    renderCategories([new Set(["core", "service"]), "ad", "", new Set()]);
    mocks.moduleCards.find((card) => card.module.id === "ad")!.onCommitEditing();
    expect(mocks.store.clearProxyGroupNameOverride).toHaveBeenCalledWith("ad");
  });

  it("adds rules to modules or custom groups through captured module-card handlers", () => {
    renderCategories();
    const card = mocks.moduleCards.find((item) => item.module.id === "ad")!;
    const rule = { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" };

    card.onAddRules([rule]);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith({ kind: "module", id: "ad" }, [rule]);

    card.onAddRulesToModule("streaming-west", [rule]);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith({ kind: "module", id: "streaming-west" }, [rule]);
    expect(mocks.store.toggleProxyGroup).not.toHaveBeenCalledWith("streaming-west");

    card.onAddRulesToModule("youtube", [rule]);
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("youtube");

    card.onAddRuleToCustomGroup("missing", rule);
    card.onAddRuleToCustomGroup("custom", rule);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith({ kind: "custom", id: "custom" }, [rule]);

    mocks.store.customRuleSets = [{ id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs", target: "🛑 Custom Group" }];
    card.onAddRuleToCustomGroup("custom", rule);
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith({ kind: "custom", id: "custom" }, [rule]);
  });
});
