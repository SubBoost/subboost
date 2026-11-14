import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import type { ConfigActions, ConfigState } from "@subboost/ui/store/config-store/definitions";
import { computeGeneratedYaml } from "@subboost/ui/store/config-store/generated-yaml";
import { resolveModuleName } from "@subboost/core/generator/rules";
import type { VisualDisplayGroup } from "./preview/visual-graph/proxy-groups-preview";

type TestStore = ConfigState & Pick<ConfigActions, "setProxyGroupOrder">;

const mocks = vi.hoisted(() => {
  let state: TestStore | undefined;
  return {
    get state(): TestStore {
      if (!state) throw new Error("Test store not initialized");
      return state;
    },
    set state(value: TestStore) { state = value; },
    groups: [] as VisualDisplayGroup[],
    searchResults: [] as Array<Record<string, string>>,
  };
});
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: (selector?: (state: TestStore) => unknown) => selector ? selector(mocks.state) : mocks.state,
}));
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => ({}) }));
vi.mock("./converter/advanced-mode/sections/proxy-groups-added-rule-sets", () => ({ ProxyGroupsAddedRuleSets: () => null }));
vi.mock("./converter/advanced-mode/sections/proxy-groups-rules-search", () => ({
  getRuleDisplayName: () => "CollisionFixture",
  useRulesLibrarySearch: () => ({
    ruleSearchKeyword: "fixture", setRuleSearchKeyword: vi.fn(),
    searchResults: mocks.searchResults,
    rulesSearchLoading: false, rulesSearchLoadingMore: false, rulesSearchError: null,
    rulesSearchSource: "remote", totalMatched: 1, totalRules: 1, canLoadMore: false, handleLoadMore: vi.fn(),
  }),
}));
vi.mock("./preview/visual-graph/proxy-groups-preview", () => ({
  ProxyGroupsPreview: ({ displayGroups }: { displayGroups: VisualDisplayGroup[] }) => {
    mocks.groups = displayGroups;
    return null;
  },
}));

import { ProxyGroupsRulesLibrary } from "./converter/advanced-mode/sections/proxy-groups-rules-library";
import { VisualGraph } from "./preview/visual-graph";
import { RulesManagementSection } from "./converter/advanced-mode/sections/rules-management-section";

describe("real routing resolution in library and preview", () => {
  beforeEach(() => {
    mocks.groups = [];
    mocks.searchResults = [{ id: "fixture-collision-rule", nameZh: "CollisionFixture", behavior: "domain", category: "other" }];
    mocks.state = {
      ...structuredClone(initialState),
      nodes: [{ name: "Fixture Node", type: "ss", server: "203.0.113.10", port: 443, cipher: "aes-128-gcm", password: "fixture" }],
      enabledProxyGroups: ["select"], hiddenProxyGroups: [],
      customProxyGroups: [{ id: "regional", name: "Regional", emoji: "", groupType: "select" },
        { id: "literal", name: "custom:regional", emoji: "", groupType: "select", enabled: false }],
      customRuleSets: [{ id: "fixture-collision-rule", name: "CollisionFixture", behavior: "domain",
        path: "geosite/fixture.mrs", target: "custom:regional" }],
      customRules: [{ id: "plain", type: "DOMAIN", value: "local.subboost.test", target: "custom:regional" }],
      setProxyGroupOrder: vi.fn(),
    };
  });

  it("does not assign a disabled literal target to an enabled group with a matching ID", () => {
    const library = renderToStaticMarkup(React.createElement(ProxyGroupsRulesLibrary));
    expect(library).toContain("CollisionFixture");
    expect(library).not.toContain("已添加");
    const graph = renderToStaticMarkup(React.createElement(VisualGraph));
    expect(mocks.groups.find((group) => group.id === "custom:regional")?.rules).toEqual([]);
    expect(graph).not.toContain("CollisionFixture");
    expect(graph).not.toContain("local.subboost.test");
  });

  it("resolves the same string as a reference when the colliding literal group is absent", () => {
    mocks.state.customProxyGroups = [{ id: "regional", name: "Regional", emoji: "", groupType: "select" }];
    expect(renderToStaticMarkup(React.createElement(ProxyGroupsRulesLibrary))).toContain("已添加");
    expect(renderToStaticMarkup(React.createElement(VisualGraph))).toContain("CollisionFixture");
    expect(mocks.groups.find((group) => group.id === "custom:regional")?.rules)
      .toContainEqual(expect.objectContaining({ id: "fixture-collision-rule" }));
  });

  it("uses the generated node names and fallback target in both previews", () => {
    mocks.state.nodes = [{ name: "module:cn", type: "ss", server: "203.0.113.10", port: 443, cipher: "aes-128-gcm", password: "fixture" }];
    mocks.state.enabledProxyGroups = ["select", "microsoft"];
    mocks.state.customProxyGroups = [];
    mocks.state.customRuleSets = [];
    mocks.state.customRules = [{ id: "plain", type: "DOMAIN", value: "local.subboost.test", target: "module:cn" }];
    mocks.state.builtinRuleEdits = { "module:microsoft:onedrive": { target: "Missing" } };
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state);
    const manager = renderToStaticMarkup(React.createElement(RulesManagementSection, { isExpanded: true, onToggle: vi.fn() }));
    expect(manager).toContain("local.subboost.test");
    expect(manager).not.toContain(">Missing<");
    const graph = renderToStaticMarkup(React.createElement(VisualGraph));
    expect(graph.match(/title="module:cn"/g)).toHaveLength(2);
    expect(mocks.groups.find((group) => group.id === "module:select")?.rules)
      .toContainEqual(expect.objectContaining({ id: "onedrive" }));
  });

  it("shows a node-targeted rule set as assigned and does not project a literal node into a module", () => {
    mocks.state.nodes = [{ name: "module:cn", type: "ss", server: "203.0.113.10", port: 443, cipher: "aes-128-gcm", password: "fixture" }];
    mocks.state.enabledProxyGroups = ["select", "cn"];
    mocks.state.customProxyGroups = [];
    mocks.state.customRuleSets = [{ id: "fixture-collision-rule", name: "CollisionFixture", behavior: "domain", path: "geosite/fixture.mrs", target: "module:cn" }];
    mocks.state.builtinRuleEdits = { "module:microsoft:onedrive": { target: "module:cn" } };
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state);
    const library = renderToStaticMarkup(React.createElement(ProxyGroupsRulesLibrary));
    expect(library).toContain("已添加");
    expect(library).toContain("module:cn");
    renderToStaticMarkup(React.createElement(VisualGraph));
    expect(mocks.groups.find((group) => group.id === "module:cn")?.rules)
      .not.toContainEqual(expect.objectContaining({ id: "onedrive" }));
  });

  it("shows a rule set whose literal target is a node sharing a disabled custom name", () => {
    mocks.state.nodes = [{ name: "Regional", type: "ss", server: "203.0.113.10", port: 443, cipher: "aes-128-gcm", password: "fixture" }];
    mocks.state.customProxyGroups = [{ id: "regional", name: "Regional", emoji: "", groupType: "select", enabled: false }];
    mocks.state.customRuleSets = [{ id: "named", name: "Named Set", behavior: "domain", path: "geosite/named.mrs", target: "Regional" }];
    mocks.state.customRules = [];
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state);
    const graph = renderToStaticMarkup(React.createElement(VisualGraph));
    expect(graph).toContain("Named Set");
    expect(graph).toContain('text-purple-500">1</div>');
  });

  it("keeps structured target identity when built-in and custom names collide", () => {
    const name = resolveModuleName("cn");
    mocks.searchResults = [{ id: "onedrive", nameZh: "OneDrive", behavior: "domain", category: "other" }];
    mocks.state.enabledProxyGroups = ["select", "microsoft"];
    mocks.state.customProxyGroups = [{ id: "regional", name, emoji: "", groupType: "select" }];
    mocks.state.customRuleSets = [];
    mocks.state.builtinRuleEdits = { "module:microsoft:onedrive": { target: { kind: "module", id: "cn" } } };
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state);
    let html = renderToStaticMarkup(React.createElement(ProxyGroupsRulesLibrary));
    expect(html).toContain("开启代理组");
    expect(html).not.toContain("已添加");

    mocks.searchResults = [{ id: "fixture-collision-rule", nameZh: "CollisionFixture", behavior: "domain", category: "other" }];
    mocks.state.enabledProxyGroups = ["select", "cn"];
    mocks.state.customProxyGroups = [{ id: "regional", name, emoji: "", groupType: "select", enabled: false }];
    mocks.state.customRuleSets = [{ id: "fixture-collision-rule", name: "CollisionFixture", behavior: "domain", path: "geosite/fixture.mrs", target: { kind: "custom", id: "regional" } }];
    mocks.state.builtinRuleEdits = {};
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state);
    html = renderToStaticMarkup(React.createElement(ProxyGroupsRulesLibrary));
    expect(html).not.toContain("已启用");
    expect(html).not.toContain("已添加");
  });

  it.each(["DIRECT", "Fixture Node"])("shows a moved preset targeting %s outside proxy groups", (target) => {
    mocks.state.enabledProxyGroups = ["select"];
    mocks.state.customProxyGroups = [];
    mocks.state.customRuleSets = [];
    mocks.state.customRules = [];
    mocks.state.builtinRuleEdits = { "module:microsoft:onedrive": { target } };
    mocks.state.generatedYaml = computeGeneratedYaml(mocks.state);
    expect(String(mocks.state.generatedYaml)).toContain(`RULE-SET,onedrive,${target}`);
    const graph = renderToStaticMarkup(React.createElement(VisualGraph));
    expect(graph).toContain("OneDrive");
    expect(graph).toContain(`title="${target}"`);
  });
});
