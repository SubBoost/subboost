import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  ruleSets: [] as any[],
  store: {} as Record<string, any>,
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(
        stateMock.overrides,
        index,
      )
        ? stateMock.overrides[index]
        : initial;
      return [value, vi.fn()];
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
    mocks.buttons.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => props.children,
  SelectContent: (props: any) => props.children,
  SelectItem: (props: any) => props.children,
  SelectTrigger: (props: any) => props.children,
  SelectValue: () => null,
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: () => null,
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
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) =>
    override || module.name,
}));
vi.mock("@subboost/core/proxy-group-targets", () => ({
  resolveProxyGroupTargetName: (target: unknown) =>
    typeof target === "string" ? target : "",
}));
vi.mock("@subboost/core/rules/custom-routing-rule-sets", () => ({
  collectCustomRoutingRuleSets: () => mocks.ruleSets,
  getRuleSetTargetValue: (target: { kind: string; id: string }) =>
    `${target.kind}:${target.id}`,
  normalizeRuleSetPathInput: (path: string) => path.trim(),
  parseRuleSetTargetValue: (value: string) => {
    const [kind, id] = value.split(":");
    return (kind === "module" || kind === "custom") && id
      ? { kind, id }
      : null;
  },
}));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => mocks.store,
}));

import { ProxyGroupsAddedRuleSets } from "./proxy-groups-added-rule-sets";

const moduleItem = {
  key: "custom-rule-set:rule-a",
  id: "rule-a",
  name: "Rule A",
  behavior: "domain",
  path: "geosite/rule-a.mrs",
  noResolve: true,
  source: { kind: "custom-rule-set", id: "rule-a" },
  target: {
    kind: "module",
    id: "auto",
    value: "module:auto",
    name: "Auto",
  },
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

function renderEditing(item: typeof moduleItem | typeof customItem, draft: unknown) {
  stateMock.callIndex = 0;
  stateMock.overrides = { 0: item.key, 1: draft };
  mocks.buttons = [];
  mocks.ruleSets = [item];
  renderToStaticMarkup(
    React.createElement(ProxyGroupsAddedRuleSets, {
      showSearchHint: false,
      totalRules: null,
    }),
  );
}

function clickSave() {
  mocks.buttons
    .find((props: any) => props.title === "保存规则集")
    .onClick();
}

describe("ProxyGroupsAddedRuleSets invalid saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store = {
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: [],
      customRuleSets: [],
      builtinRuleEdits: {},
      customProxyGroups: [{ id: "custom-1", name: "Custom" }],
      proxyGroupNameOverrides: { auto: "Auto" },
      toggleProxyGroup: vi.fn(),
      updateModuleRule: vi.fn(),
      removeModuleRule: vi.fn(),
      moveModuleRule: vi.fn(),
    };
  });

  it("ignores invalid saves and reports missing targets as conflicts", () => {
    renderEditing(moduleItem, {
      path: "geosite/rule-a.mrs",
      targetValue: "bad",
      noResolve: false,
    });
    clickSave();
    expect(mocks.store.updateModuleRule).not.toHaveBeenCalled();

    renderEditing(moduleItem, {
      path: "geosite/rule-a.mrs",
      targetValue: "module:missing",
      noResolve: false,
    });
    clickSave();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "规则集已存在", variant: "warning" }),
    );

    renderEditing(customItem, {
      path: "geoip/rule-b.mrs",
      targetValue: "custom:missing",
      noResolve: false,
    });
    clickSave();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "规则集已存在", variant: "warning" }),
    );

    renderEditing(moduleItem, {
      path: "   ",
      targetValue: "module:auto",
      noResolve: false,
    });
    clickSave();
    expect(mocks.store.updateModuleRule).not.toHaveBeenCalledWith(
      "auto",
      "rule-a",
      expect.objectContaining({ path: "" }),
    );
  });
});
