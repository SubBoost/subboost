import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cards: [] as any[],
  interactions: {
    proxyGroupAdded: vi.fn(),
  },
  store: {} as Record<string, any>,
  toast: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  Check: () => null,
  Trash2: () => null,
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => React.createElement("button", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => React.createElement("input", props),
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));

vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "auto", name: "Auto" },
    { id: "fallback", name: "Fallback" },
  ],
}));

vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { name: string }, override?: string) => override || module.name,
}));

vi.mock("@subboost/core/proxy-group-targets", () => ({
  resolveProxyGroupTargetName: (target: any, options: any) => {
    if (typeof target === "string") return target;
    if (target?.kind === "custom") {
      return options.customProxyGroups.find((group: any) => group.id === target.id)?.name ?? "";
    }
    if (target?.kind === "module") return options.moduleNames[target.id] ?? "";
    return "";
  },
}));

vi.mock("@subboost/core/rules/custom-routing-rule-sets", () => ({
  extractRuleSetPathFromUrl: (url: string) => url,
}));

vi.mock("@subboost/core/types/config", () => ({
  DEFAULT_LOAD_BALANCE_STRATEGY: "consistent-hashing",
}));

vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return { useConfigStore };
});

vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));

vi.mock("./proxy-group-name-editor", () => ({
  buildProxyGroupName: (draft: { emoji?: string; name?: string }) => {
    const name = draft.name?.trim() ?? "";
    return name ? `${draft.emoji?.trim() || "C"} ${name}` : "";
  },
  parseProxyGroupNameDraft: (value: string, emoji: string) => ({ emoji, name: value.replace(/^\\S+\\s+/, "") }),
  pickRandomEmoji: () => "C",
  ProxyGroupNameEditor: () => null,
  toProxyGroupNameDraft: (value: { emoji?: string; name?: string }) => value,
}));

vi.mock("./proxy-group-rule-targets", () => ({
  buildManualRuleTargets: vi.fn(() => [{ name: "Auto" }]),
  listCustomRulesForTarget: (rules: any[], target: string) =>
    rules.filter((rule) => rule.target === target).map((rule, index) => ({ rule, index })),
}));

vi.mock("./proxy-group-rule-row", () => ({
  ProxyGroupManualRuleRow: () => null,
  ProxyGroupRuleMoveMenu: () => null,
  ProxyGroupRuleSetRow: () => null,
  isRuleSetMoveTarget: (value: unknown) => Boolean(value && typeof value === "object"),
}));

vi.mock("./proxy-group-type-menu", () => ({
  ProxyGroupTypeMenu: () => null,
}));

vi.mock("./proxy-groups-module-card", () => ({
  ProxyGroupsModuleCard: (props: any) => {
    mocks.cards.push(props);
    return React.createElement("section", null, props.rulesContentOverride);
  },
}));

import { ProxyGroupsCustomGroupsPanel } from "./proxy-groups-custom-groups-panel";

describe("ProxyGroupsCustomGroupsPanel card props", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cards = [];
    mocks.store = {
      enabledProxyGroups: ["auto"],
      hiddenProxyGroups: [],
      proxyGroupNameOverrides: { auto: "Auto" },
      customRules: [{ id: "manual-1", target: "C Custom" }],
      customProxyGroups: [
        {
          id: "custom-1",
          name: "C Custom",
          emoji: "C",
          groupType: "select",
          enabled: false,
          advanced: { sourceIds: ["old-source"] },
        },
      ],
      customRuleSets: [
        {
          id: "rule-a",
          name: "Rule A",
          behavior: "domain",
          path: "https://rules.example/rule-a.mrs",
          target: "C Custom",
        },
      ],
      dialerProxyGroups: [],
      addCustomProxyGroup: vi.fn(),
      removeCustomProxyGroup: vi.fn(),
      updateCustomProxyGroup: vi.fn(),
      updateCustomRule: vi.fn(),
      removeCustomRule: vi.fn(),
      moveModuleRule: vi.fn(),
      removeModuleRule: vi.fn(),
    };
  });

  it("wires custom group card actions and advanced patches", () => {
    renderToStaticMarkup(
      React.createElement(ProxyGroupsCustomGroupsPanel, {
        advancedMode: true,
        memberStats: new Map([["C Custom", { nodeCount: 2, ruleSetCount: 1 }]]),
      }),
    );

    const card = mocks.cards[0];
    expect(card).toMatchObject({
      advancedMode: true,
      isEnabled: false,
      memberStats: { nodeCount: 2, ruleSetCount: 1 },
      rulesCountOverride: 2,
    });

    card.onToggleEnabled();
    card.onStartEditing();
    card.onCancelEditing();
    card.onCommitEditing();
    card.onHide();
    card.acceptModuleRuleEditWarning();
    card.onToggleRulesExpanded();
    card.onAddRules();
    card.onAddRulesToModule();
    card.onAddRuleToCustomGroup();
    card.onRemoveExtraRule();
    card.onMoveRule();
    card.onMoveManualRule("manual-1", "Auto");
    card.onRemoveManualRule(0);
    card.onRestoreRule();
    card.onResetRuleTarget();
    card.onChangeCnIpNoResolve(true);
    card.onChangeExperimentalCnUseCnRuleSet(true);
    card.onChangeGroupType({ groupType: "load-balance", strategy: "round-robin" });
    card.onChangeGroupType({ groupType: "select" });

    const advanced = card.renderAdvancedContent(React.createElement("div", null, "rules"), 2) as React.ReactElement<any>;
    advanced.props.onChange({ regions: ["us"] });
    const emptyAdvanced = card.renderAdvancedContent(React.createElement("div", null, "rules"), 0) as React.ReactElement<any>;

    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", { enabled: true });
    expect(mocks.store.removeCustomProxyGroup).toHaveBeenCalledWith("custom-1");
    expect(mocks.store.updateCustomRule).toHaveBeenCalledWith("manual-1", { target: "Auto" });
    expect(mocks.store.removeCustomRule).toHaveBeenCalledWith(0);
    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", {
      groupType: "load-balance",
      strategy: "round-robin",
    });
    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", {
      groupType: "select",
      strategy: undefined,
    });
    expect(mocks.store.updateCustomProxyGroup).toHaveBeenCalledWith("custom-1", {
      advanced: { sourceIds: ["old-source"], regions: ["us"] },
    });
    expect(advanced.props.rulesContent).not.toBeNull();
    expect(emptyAdvanced.props.rulesContent).toBeNull();
  });
});
