import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(
        stateMock.overrides,
        index,
      )
        ? stateMock.overrides[index]
        : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved =
          typeof next === "function"
            ? (next as (prev: unknown) => unknown)(value)
            : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
    useEffect: (
      effect: () => void | (() => void),
      deps?: React.DependencyList,
    ) => {
      if (!stateMock.runEffects) return actual.useEffect(effect, deps);
      return effect();
    },
  };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: unknown, props: any) => {
    if (type === "button") mocks.captures.buttons.push(props);
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
  ArrowRight: () => null,
  Check: () => null,
  Pencil: () => null,
  Trash2: () => null,
  X: () => null,
}));
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
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => {
    mocks.captures.selects.push(props);
    return props.children;
  },
  SelectContent: (props: any) => props.children,
  SelectItem: (props: any) => props.children,
  SelectTrigger: (props: any) => {
    mocks.captures.selectTriggers.push(props);
    return React.createElement(
      "div",
      { className: props.className },
      props.children,
    );
  },
  SelectValue: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
	  PROXY_GROUP_MODULES: [
	    { id: "auto", name: "Auto", rules: [] },
	    { id: "fallback", name: "Fallback", rules: [] },
	  ],
}));
vi.mock("@subboost/core/generator/module-rules", () => ({
  getModuleRuleOrderKey: (moduleId: string, ruleId: string) =>
    `${moduleId}:${ruleId}`,
  getEffectiveModuleRules: vi.fn(() => mocks.effectiveRules),
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) =>
    override || module.name,
}));
vi.mock("@subboost/core/proxy-group-targets", () => ({
  resolveProxyGroupTargetName: (
    target: unknown,
    options: {
      moduleNames?: Record<string, string>;
      customProxyGroups?: Array<{ id: string; name: string }>;
      fallbackTarget?: string;
    } = {},
  ) => {
    if (typeof target === "string") return target;
    if (target && typeof target === "object") {
      const entry = target as { kind?: string; id?: string };
      if (entry.kind === "module" && entry.id) {
        return options.moduleNames?.[entry.id] ?? options.fallbackTarget ?? entry.id;
      }
      if (entry.kind === "custom" && entry.id) {
        return (
          options.customProxyGroups?.find((group) => group.id === entry.id)?.name ??
          options.fallbackTarget ??
          entry.id
        );
      }
    }
    return options.fallbackTarget ?? "";
  },
}));
vi.mock("@subboost/core/rules/custom-routing-rule-sets", () => ({
  buildRuleSetUrlFromPath: (path: string, base: string) =>
    `${base.replace(/\/+$/, "")}/${path}`,
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

import { ProxyGroupsAddedRuleSets } from "./proxy-groups-added-rule-sets";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import {
  RULE_EDIT_ACTIONS_CLASS,
  RULE_EDIT_PRIMARY_FIELD_CLASS,
  RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
  RULE_EDIT_TRAILING_CONTROLS_CLASS,
  RULE_TARGET_SELECT_TRIGGER_CLASS,
} from "./proxy-groups-rule-editor-layout";

const moduleItem = {
  key: "custom-rule-set:rule-a",
  id: "rule-a",
  name: "Rule A",
  behavior: "domain",
  path: "geosite/rule-a.mrs",
  noResolve: true,
  source: { kind: "custom-rule-set", id: "rule-a" },
  target: { kind: "module", id: "auto", value: "module:auto", name: "Auto" },
};

const customItem = {
  key: "custom-rule-set:rule-b",
  id: "rule-b",
  name: "Rule B",
  behavior: "ipcidr",
  path: "geoip/rule-b.mrs",
  source: { kind: "custom-rule-set", id: "rule-b" },
  target: {
    kind: "custom",
    id: "custom-1",
    value: "custom:custom-1",
    name: "Custom",
  },
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
  mocks.captures.buttons = [];
  mocks.captures.inputs = [];
  mocks.captures.selects = [];
  mocks.captures.selectTriggers = [];
  mocks.captures.switches = [];
  try {
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupsAddedRuleSets, props),
    );
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

function findEditingDeleteButton() {
  return mocks.captures.buttons.find(
    (props: any) =>
      props.title === "删除规则集" &&
      String(props.className).includes("h-7 w-7"),
  );
}

describe("ProxyGroupsAddedRuleSets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = {
      buttons: [],
      inputs: [],
      selects: [],
      selectTriggers: [],
      switches: [],
    };
    mocks.ruleSets = [moduleItem, customItem];
    for (const proxyModule of PROXY_GROUP_MODULES as Array<{ rules?: unknown[] }>) {
      proxyModule.rules = [];
    }
    mocks.effectiveRules = [];
    mocks.store = {
      ruleProviderBaseUrl: "https://rules.example/",
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: [],
      customRuleSets: [
        { id: "rule-a", name: "Rule A", behavior: "domain", path: "geosite/rule-a.mrs", target: "Auto", noResolve: true },
        { id: "rule-b", name: "Rule B", behavior: "ipcidr", path: "geoip/rule-b.mrs", target: "Custom" },
      ],
      builtinRuleEdits: {},
      customProxyGroups: [
        {
          id: "custom-1",
          name: "Custom",
        },
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

  it("renders added rule set rows as path-only summaries", () => {
    const { html } = renderAdded();

    expect(html).toContain("RULE-SET");
    expect(html).toContain("geosite/rule-a");
    expect(html).toContain("geoip/rule-b");
    expect(html).toContain("Auto");
    expect(html).toContain("Custom");
    expect(html).not.toContain("geosite/rule-a.mrs");
    expect(html).not.toContain("geoip/rule-b.mrs");
    expect(html).not.toContain("Rule A");
    expect(html).not.toContain("Rule B");
    expect(html).not.toContain("域名");
    expect(html).not.toContain("IP");
  });

  it("renders empty search hints and editing controls", () => {
    mocks.ruleSets = [];
    expect(
      renderAdded({}, { showSearchHint: false, totalRules: null }).html,
    ).toBe("");
    expect(
      renderAdded({}, { showSearchHint: true, totalRules: 12 }).html,
    ).toContain("12");

    mocks.ruleSets = [moduleItem];
    const { html, setters } = renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/draft.mrs",
        targetValue: "module:auto",
        noResolve: false,
      },
    });

    expect(html).toContain("geosite/draft");
    expect(html).toContain("Target");
    expect(html).not.toContain("geosite/draft.mrs");
    expect(html).toContain(RULE_EDIT_PRIMARY_FIELD_CLASS);
    expect(html).toContain(RULE_EDIT_TRAILING_CONTROLS_CLASS);
    expect(html).toContain(RULE_EDIT_ACTIONS_CLASS);
    expect(html).toContain("proxy-group-rule-no-resolve-label");
    expect(mocks.captures.inputs).toHaveLength(0);
    expect(mocks.captures.selects).toHaveLength(1);
    expect(RULE_TARGET_SELECT_TRIGGER_CLASS).toContain("w-[120px]");
    expect(RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS).toContain(
      "proxy-group-custom-rule-editor-target",
    );
    expect(RULE_EDIT_ACTIONS_CLASS).toContain("w-[92px]");
    expect(mocks.captures.selectTriggers[0].className).toBe(
      RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
    );
    mocks.captures.selects[0].onValueChange("custom:custom-1");
    mocks.captures.switches[0].onCheckedChange(true);
    expect(setters[1]).toHaveBeenCalledWith(expect.any(Function));
    const draftUpdaters = setters[1].mock.calls
      .map((call) => call[0])
      .filter(
        (value): value is (prev: unknown) => unknown =>
          typeof value === "function",
      );
    expect(draftUpdaters.map((updater) => updater(null))).toEqual([null, null]);
  });

  it("renders raw rule-set paths and hides rows targeting hidden modules", () => {
    mocks.ruleSets = [
      {
        ...moduleItem,
        key: "custom-rule-set:raw",
        id: "raw",
        path: "https://cdn.example/plain-rule.txt",
        noResolve: false,
      },
      {
        ...moduleItem,
        key: "custom-rule-set:hidden",
        id: "hidden",
        path: "geosite/hidden.mrs",
        target: {
          kind: "module",
          id: "fallback",
          value: "module:fallback",
          name: "Fallback",
        },
      },
    ];
    mocks.store.hiddenProxyGroups = ["fallback"];

    const { html } = renderAdded();

    expect(html).toContain("https://cdn.example/plain-rule.txt");
    expect(html).not.toContain("geosite/hidden");
  });

  it("saves module rule edits across module and custom targets", () => {
    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:auto",
        noResolve: true,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith(
      "auto",
      "rule-a",
      {
        id: "rule-a",
        name: "Rule A",
        behavior: "domain",
        path: "geosite/rule-a.mrs",
        noResolve: true,
      },
    );

    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:fallback",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("auto", "rule-a", {
      kind: "module",
      id: "fallback",
    });
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith(
      "fallback",
      "rule-a",
      {
        id: "rule-a",
        name: "Rule A",
        behavior: "domain",
        path: "geosite/rule-a.mrs",
      },
    );

    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "custom:custom-2",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("auto", "rule-a", {
      kind: "custom",
      id: "custom-2",
    });
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith("custom-2", "rule-a", {
      id: "rule-a",
      name: "Rule A",
      behavior: "domain",
      path: "geosite/rule-a.mrs",
    });
  });

  it("saves custom rule edits and enables target modules when needed", () => {
    renderAdded({
      0: customItem.key,
      1: {
        path: "geoip/rule-b.mrs",
        targetValue: "custom:custom-2",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("custom-1", "rule-b", {
      kind: "custom",
      id: "custom-2",
    });
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith("custom-2", "rule-b", {
      id: "rule-b",
      name: "Rule B",
      behavior: "ipcidr",
      path: "geoip/rule-b.mrs",
    });

    mocks.store.enabledProxyGroups = [];
    renderAdded({
      0: customItem.key,
      1: {
        path: "geoip/rule-b.mrs",
        targetValue: "module:fallback",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("fallback");
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("custom-1", "rule-b", {
      kind: "module",
      id: "fallback",
    });
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith("fallback", "rule-b", {
      id: "rule-b",
      name: "Rule B",
      behavior: "ipcidr",
      path: "geoip/rule-b.mrs",
    });

    renderAdded({
      0: customItem.key,
      1: {
        path: "geoip/rule-b.mrs",
        targetValue: "custom:custom-1",
        noResolve: true,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith("custom-1", "rule-b", {
      id: "rule-b",
      name: "Rule B",
      behavior: "ipcidr",
      path: "geoip/rule-b.mrs",
      noResolve: true,
    });
  });

  it("rejects conflicts, removes items, and cancels editing", () => {
    mocks.store.customRuleSets = [
      ...mocks.store.customRuleSets,
      { id: "rule-a", name: "Rule A", behavior: "domain", path: "geosite/rule-a.mrs", target: "Fallback" },
    ];
    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:fallback",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "规则集已存在", variant: "warning" }),
    );

    mocks.effectiveRules = [];
    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:auto",
        noResolve: false,
      },
    });
    findEditingDeleteButton().onClick();
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith("auto", "rule-a");
    expect(stateMock.setters[0]).toHaveBeenCalledWith(null);

    renderAdded({
      0: customItem.key,
      1: {
        path: "geoip/rule-b.mrs",
        targetValue: "custom:custom-1",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "取消编辑")
      .onClick();
    expect(stateMock.setters[0]).toHaveBeenCalledWith(null);
    findEditingDeleteButton().onClick();
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith("custom-1", "rule-b");
  });

  it("rejects builtin and blank custom target conflicts", () => {
    (PROXY_GROUP_MODULES[1] as any).rules = [
      { id: "other-rule" },
      { id: "rule-a" },
    ];
    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:fallback",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "规则集已存在", variant: "warning" }),
    );

    mocks.toast.mockClear();
    mocks.store.builtinRuleEdits = {
      "fallback:rule-a": { enabled: false },
    };
    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:fallback",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("auto", "rule-a", {
      kind: "module",
      id: "fallback",
    });

    mocks.store.moveModuleRule.mockClear();
    mocks.store.builtinRuleEdits = {
      "fallback:rule-a": { target: { kind: "custom", id: "custom-2" } },
    };
    renderAdded({
      0: moduleItem.key,
      1: {
        path: "geosite/rule-a.mrs",
        targetValue: "module:fallback",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith("auto", "rule-a", {
      kind: "module",
      id: "fallback",
    });

    mocks.store.customProxyGroups = [
      { id: "custom-1", name: "Custom" },
      { id: "blank", name: "   " },
    ];
    renderAdded({
      0: customItem.key,
      1: {
        path: "geoip/rule-b.mrs",
        targetValue: "custom:blank",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props: any) => props.title === "保存规则集")
      .onClick();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "规则集已存在", variant: "warning" }),
    );
  });

  it("starts editing from row buttons and clears stale editing state", () => {
    const { setters } = renderAdded();
    mocks.captures.buttons
      .find((props: any) => props.title === "编辑规则集")
      .onClick();
    expect(setters[0]).toHaveBeenCalledWith(moduleItem.key);
    expect(setters[1]).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "geosite/rule-a.mrs",
        targetValue: "module:auto",
      }),
    );

    renderAdded(
      {
        0: "missing",
        1: { path: "ghost.mrs", targetValue: "module:auto", noResolve: false },
      },
      undefined,
      {
        runEffects: true,
      },
    );
    expect(stateMock.setters[0]).toHaveBeenCalledWith(null);
    expect(stateMock.setters[1]).toHaveBeenCalledWith(null);
  });

});
