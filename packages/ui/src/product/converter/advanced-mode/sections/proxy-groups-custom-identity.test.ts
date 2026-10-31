import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { computeGeneratedYaml } from "@subboost/ui/store/config-store/generated-yaml";
import { createProxyGroupActions } from "@subboost/ui/store/config-store/actions/proxy-group-actions";

const mocks = vi.hoisted(() => ({ state: {} as Record<string, any>, menus: [] as any[], buttons: [] as any[] }));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.state;
  useConfigStore.getState = () => mocks.state;
  return { useConfigStore };
});
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => ({}) }));
vi.mock("@subboost/ui/components/ui/button", () => ({ Button: (props: any) => { mocks.buttons.push(props); return null; } }));
vi.mock("@subboost/ui/components/ui/input", () => ({ Input: () => null }));
vi.mock("./proxy-group-name-editor", () => ({
  buildProxyGroupName: () => "", parseProxyGroupNameDraft: () => ({}), pickRandomEmoji: () => "",
  ProxyGroupNameEditor: () => null, toProxyGroupNameDraft: () => ({}),
}));
vi.mock("./proxy-groups-module-card", () => ({ ProxyGroupsModuleCard: (props: any) => props.rulesContentOverride }));
vi.mock("./group-advanced-settings-dialog", () => ({ GroupAdvancedSettingsDialog: () => null }));
vi.mock("./proxy-group-rule-row", () => ({
  ProxyGroupManualRuleRow: () => null,
  ProxyGroupRuleSetRow: (props: any) => props.actions,
  ProxyGroupRuleMoveMenu: (props: any) => { mocks.menus.push(props); return null; },
  isRuleSetMoveTarget: (target: any) => target?.kind === "module" || target?.kind === "custom",
}));

import { ProxyGroupsCustomGroupsPanel } from "./proxy-groups-custom-groups-panel";

const custom = { kind: "custom" as const, id: "cn" };
const ai = { kind: "module" as const, id: "ai", name: "AI" };
function renderPanel() {
  mocks.menus = [];
  mocks.buttons = [];
  renderToStaticMarkup(React.createElement(ProxyGroupsCustomGroupsPanel));
}

describe("custom group operations when ids collide", () => {
  beforeEach(() => {
    mocks.state = { ...structuredClone(initialState), enabledProxyGroups: ["select"],
      nodes: [{ name: "Fixture", type: "ss", server: "203.0.113.1", port: 443, cipher: "aes-128-gcm", password: "fixture" }],
      customProxyGroups: [{ id: "cn", name: "Regional", emoji: "", groupType: "select" }] };
    const update = (fn: any) => {
      mocks.state = { ...mocks.state, ...fn(mocks.state) };
      mocks.state.generatedYaml = computeGeneratedYaml(mocks.state as any);
    };
    Object.assign(mocks.state, createProxyGroupActions(vi.fn(), () => mocks.state as any, update));
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state as any);
  });

  it("adds, moves, and removes a custom rule set through the actual panel actions", () => {
    mocks.state.addModuleRules(custom, [{ id: "own-set", name: "Own Set", behavior: "domain", path: "geosite/own.mrs" }]);
    expect(mocks.state.generatedYaml).toContain("RULE-SET,own-set,Regional");
    renderPanel();
    mocks.menus.find((menu) => menu.ariaLabel === "移动 Own Set 规则集").onMove(ai);
    expect(mocks.state.customRuleSets[0].target).toEqual(expect.objectContaining({ kind: "module", id: "ai" }));
    mocks.state.moveModuleRule("ai", "own-set", custom);
    renderPanel();
    mocks.buttons.find((button) => button["aria-label"] === "删除 Own Set 规则集").onClick();
    expect(mocks.state.customRuleSets).toEqual([]);
    expect(mocks.state.generatedYaml).not.toContain("RULE-SET,own-set,");
  });

  it("moves and removes a preset through the actual custom panel", () => {
    mocks.state.moveModuleRule("microsoft", "onedrive", custom);
    expect(mocks.state.generatedYaml).toContain("RULE-SET,onedrive,Regional");
    renderPanel();
    mocks.menus.find((menu) => menu.ariaLabel === "移动 OneDrive 规则集").onMove(ai);
    expect(mocks.state.builtinRuleEdits["module:microsoft:onedrive"].target).toEqual(expect.objectContaining({ kind: "module", id: "ai" }));
    mocks.state.moveModuleRule("ai", "onedrive", custom);
    renderPanel();
    mocks.buttons.find((button) => button["aria-label"] === "删除 OneDrive 规则集").onClick();
    expect(mocks.state.builtinRuleEdits["module:microsoft:onedrive"].enabled).toBe(false);
    expect(mocks.state.generatedYaml).not.toContain("RULE-SET,onedrive,");
  });
});
