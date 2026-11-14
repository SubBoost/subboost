// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BaseConfigYamlError, generateClashConfig } from "@subboost/core/generator";
import {
  buildGeneratedRuleEntries,
  generateRules,
  hasFullRuleOrderKeys,
  normalizePersistedRuleOrder,
  resolveAppliedRuleOrder,
} from "@subboost/core/generator/rules";
import {
  detachSourceNodesFromState,
  mergeParsedSourceNodes,
  prepareSourceParsedNodes,
} from "@subboost/core/subscription/source-node-refresh";
import { ORIGIN_NAME_KEY, SOURCE_IDS_KEY } from "@subboost/core/subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";
import { YamlHighlight } from "@subboost/ui/product/preview/diff-highlight";
import { createNodeActions } from "@subboost/ui/store/config-store/actions/node-actions";
import { createProxyGroupActions } from "@subboost/ui/store/config-store/actions/proxy-group-actions";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import { PagePager } from "@subboost/ui/components/ui/page-pager";
import { ProtocolBadge, getProtocolBadgeClass } from "@subboost/ui/components/ui/protocol-badge";
import { SmartNodeMatchingHelp } from "@subboost/ui/components/subscription/smart-node-matching-help";
import { SubscriptionImportErrorBadge } from "@subboost/ui/product/converter/subscription-import-error";
import { DashboardStatsCards } from "@subboost/ui/dashboard/dashboard-stats-cards";
import { buildRefreshSubscriptionSuccessToast } from "@subboost/ui/dashboard/dashboard-refresh-toast";
import { formatDashboardDate, formatIntervalLabel } from "@subboost/ui/dashboard/dashboard-format";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  pickRandomEmoji,
  toProxyGroupNameDraft,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-name-editor";
import {
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-type-menu";
import {
  buildManualRuleTargets,
  listCustomRulesForTarget,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-rule-targets";
import {
  getRuleDisplayName,
  replaceRuleProviderBase,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-groups-rules-search";
import { parseCustomRuleBatchImport } from "@subboost/core/rules/custom-rule-batch-import";
import {
  buildCnRuleCandidatesFromSources,
  buildCnRuleVariantIds,
  buildLocalCnRuleCandidates,
  collectCnCandidateParents,
  normalizeRuleListLines,
} from "@subboost/core/rules/cn-candidate-utils";

const UUID = "11111111-1111-4111-8111-111111111111";
const REALITY_PUBLIC_KEY = "A".repeat(43);

function ssNode(name: string, patch: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "node"}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
    ...patch,
  } as unknown as ParsedNode;
}

function vmessNode(name: string, patch: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "vmess",
    server: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "vmess"}.example.com`,
    port: 443,
    uuid: UUID,
    alterId: 0,
    cipher: "auto",
    tls: true,
    ...patch,
  } as unknown as ParsedNode;
}

function createProxyGroupHarness(overrides: Record<string, unknown> = {}) {
  let state = {
    ...structuredClone(initialState),
    ...overrides,
  } as any;

  const applyPatch = (patch: any) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const setAndGenerateConfig = (updater: any) => {
    applyPatch(updater(state));
  };

  const actions = createProxyGroupActions(() => undefined, () => state, setAndGenerateConfig);
  return { actions, getState: () => state };
}

function createNodeHarness(overrides: Record<string, unknown> = {}) {
  let state = {
    ...structuredClone(initialState),
    ...overrides,
  } as any;

  const applyPatch = (patch: any) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const set = (patch: any) => {
    applyPatch(typeof patch === "function" ? patch(state) : patch);
  };
  const setAndGenerateConfig = (updater: any) => {
    applyPatch(updater(state));
  };

  const actions = createNodeActions(set, () => state, setAndGenerateConfig);
  return { actions, getState: () => state };
}

describe("public generator and refresh branch coverage", () => {
  it("refreshes source nodes across blank origins, duplicate ownership, and smart matching", () => {
    const prepared = prepareSourceParsedNodes(
      [
        ssNode("  ", { server: "blank.example.com" }),
        ssNode("Alpha", { server: "alpha-new.example.com" }),
        ssNode("Gamma", { server: "gamma.example.com" }),
      ],
      { currentTag: " New ", currentNameTemplate: "{tag}-{name}" }
    );

    expect(prepared[0]).toMatchObject({
      name: "",
      [ORIGIN_NAME_KEY]: "",
    });

    const stateNodes = [
      ssNode("Pinned Alpha", {
        server: "alpha-old.example.com",
        [ORIGIN_NAME_KEY]: "Alpha",
        [SOURCE_IDS_KEY]: ["source-b", "source-a", "source-b", ""],
        _manual: true,
      }),
      ssNode("Second Alpha", {
        server: "alpha-second.example.com",
        [ORIGIN_NAME_KEY]: "Alpha",
        [SOURCE_IDS_KEY]: ["source-a"],
      }),
      ssNode("Gamma", {
        server: "gamma.example.com",
      }),
      ssNode("Deleted Display", {
        [ORIGIN_NAME_KEY]: "Deleted Origin",
      }),
      ssNode("Manual"),
    ];

    const result = mergeParsedSourceNodes(stateNodes, prepared, ["Deleted Display", " ", ""], {
      sourceId: "source-a",
      lastTag: "Old",
      lastNameTemplate: "{tag}-{name}",
      currentTag: "New",
      currentNameTemplate: "{tag}-{name}",
    });

    expect(result.nodes.map((node) => node.name)).toEqual(["Pinned Alpha", "Gamma", "Deleted Display", "Manual"]);
    expect(result.nodes[0]).toMatchObject({
      server: "alpha-new.example.com",
      _manual: true,
      [SOURCE_IDS_KEY]: ["source-b", "source-a"],
    });
    expect(result.nodes[1]).toMatchObject({
      [ORIGIN_NAME_KEY]: "Gamma",
      [SOURCE_IDS_KEY]: ["source-a"],
    });

    const detached = detachSourceNodesFromState(
      [
        ssNode("No Source"),
        ssNode("Multi", { [SOURCE_IDS_KEY]: ["source-a", "source-c"] }),
        ssNode("Only", { [SOURCE_IDS_KEY]: ["source-a"] }),
      ],
      "source-a"
    );
    expect(detached.nodes.map((node) => node.name)).toEqual(["No Source", "Multi"]);
    expect(detached.nodes[1]).toMatchObject({ [SOURCE_IDS_KEY]: ["source-c"] });
  });

  it("exercises proxy group action no-op and fallback branches", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000001);
    const { actions, getState } = createProxyGroupHarness({
      enabledProxyGroups: ["select", "auto"],
      hiddenProxyGroups: [123, "", "ai"],
      proxyGroupAdvanced: {},
      customRuleSets: [],
      builtinRuleEdits: {
        "module:ai:openai": { enabled: false },
        "module:ai:anthropic": { enabled: false },
      },
      proxyGroupNameOverrides: undefined,
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "🤖 AI 服务" }],
      customProxyGroups: [
        {
          id: "custom-1",
          name: "Custom",
          emoji: "",
          groupType: "select",
        },
      ],
      ruleProviderBaseUrl: "https://rules.example.com/base/",
    });

    actions.hideProxyGroup(" ai ");
    actions.restoreHiddenProxyGroup(" ai ");
    expect(getState().hiddenProxyGroups).toEqual([]);
    expect(getState().enabledProxyGroups).toContain("ai");

    actions.updateProxyGroupAdvanced("ai", {
      sourceIds: ["source-1", "source-1", 123 as never],
      regions: ["US" as never, "moon" as never],
      includeRegex: " AI ",
      excludeRegex: "",
      excludedMembers: [
        { kind: "node", name: " Node " },
        { kind: "node", name: " Node " },
        { kind: "dialer", id: "ignored" } as never,
      ],
    });
    expect(getState().proxyGroupAdvanced.ai).toEqual({
      sourceIds: ["source-1"],
      regions: ["us"],
      includeRegex: "AI",
      excludedMembers: [{ kind: "node", name: "Node" }],
    });

    actions.removeModuleRule(undefined as never, undefined as never);
    actions.removeModuleRule("ai", "openai");
    expect(getState().builtinRuleEdits).toMatchObject({
      "module:ai:openai": { enabled: false },
      "module:ai:anthropic": { enabled: false },
    });

    actions.restoreModuleRule("ai", "openai");
    expect(getState().builtinRuleEdits).toEqual({ "module:ai:anthropic": { enabled: false } });

    actions.moveModuleRule("ai", "anthropic", { kind: "custom", id: "custom-1" });
    expect(getState().builtinRuleEdits["module:ai:anthropic"]).toEqual({
      target: { kind: "custom", id: "custom-1" },
    });

    actions.setProxyGroupNameOverride("ai", "Labs");
    actions.clearProxyGroupNameOverride("ai");
    expect(getState().proxyGroupNameOverrides).toEqual({});
  });

  it("covers proxy group action guard rails and extra-rule movement branches", () => {
    const { actions, getState } = createProxyGroupHarness({
      enabledProxyGroups: ["select"],
      hiddenProxyGroups: ["ai"],
      proxyGroupAdvanced: {},
      customRuleSets: [
        { id: "custom-a", name: "Custom A", behavior: "domain", path: "geosite/custom-a.mrs", target: "🤖 AI 服务" },
        { id: "custom-b", name: "Custom B", behavior: "ipcidr", path: "geoip/custom-b.mrs", target: "🤖 AI 服务", noResolve: true },
        { id: "exists", name: "Exists", behavior: "domain", path: "https://rules.example/exists.mrs", target: "Custom Target" },
      ],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "Load" }],
      dialerProxyGroups: [
        { id: "dialer", name: "Dialer", type: "select", enabled: true, relayNodes: ["Load"], targetNodes: [] },
      ],
      customProxyGroups: [
        { id: "custom-target", name: "Custom Target", emoji: "", groupType: "select" },
      ],
      ruleProviderBaseUrl: "https://rules.example/base/",
    });

    actions.setProxyGroupOrder([" module:ai ", "module:ai", "", "custom:one", "filtered:old"]);
    expect(getState().proxyGroupOrder).toEqual(["module:ai", "custom:one"]);
    actions.setProxyGroupOrder("bad" as never);
    expect(getState().proxyGroupOrder).toEqual([]);

    const beforeHide = getState();
    actions.hideProxyGroup("ai");
    expect(getState()).toMatchObject({
      hiddenProxyGroups: beforeHide.hiddenProxyGroups,
      enabledProxyGroups: beforeHide.enabledProxyGroups,
    });
    actions.hideProxyGroup("not-built-in");
    actions.restoreHiddenProxyGroup("not-built-in");

    actions.updateProxyGroupAdvanced("not-built-in", { sourceIds: ["ignored"] });
    expect(getState().proxyGroupAdvanced).toEqual({});
    actions.updateProxyGroupAdvanced("ai", {
      sourceIds: "bad" as never,
      regions: "bad" as never,
      includeRegex: 123 as never,
      excludeRegex: 456 as never,
      excludedMembers: "bad" as never,
    });
    expect(getState().proxyGroupAdvanced.ai).toEqual({});

    actions.addModuleRules("ai", [
      null as never,
      { id: " ", name: "", behavior: "domain", path: "" },
      { id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" },
      { id: "custom-a", name: "Duplicate", behavior: "domain", path: "geosite/duplicate.mrs" },
      { id: "new-extra", name: "", behavior: "domain", path: "geoip/new-extra.mrs", noResolve: false },
    ]);
    expect(getState().builtinRuleEdits["module:ai:openai"]).toBeUndefined();
    expect(getState().customRuleSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "new-extra", behavior: "ipcidr", noResolve: false })])
    );

    actions.updateModuleRule("ai", "missing", { name: "Ignored" });
    actions.updateModuleRule("ai", "custom-a", { path: "geoip/custom-a.mrs", noResolve: false });
    expect(getState().customRuleSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "custom-a", behavior: "ipcidr", noResolve: false })])
    );

    actions.removeModuleRule("ai", "custom-a");
    expect(getState().customRuleSets).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "custom-a" })])
    );
    expect(getState().customRuleSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "custom-b" })])
    );

    actions.moveModuleRule("ai", "custom-b", { kind: "module", id: "youtube" });
    expect(getState().enabledProxyGroups).toContain("youtube");
    expect(getState().customRuleSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "custom-b",
          target: { kind: "module", id: "youtube" },
        }),
      ])
    );

    actions.moveModuleRule("youtube", "custom-b", { kind: "custom", id: "custom-target" });
    expect(getState().customRuleSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "custom-b",
          target: { kind: "custom", id: "custom-target" },
        }),
      ])
    );

    actions.restoreModuleDefaultRules("ai");
    expect(getState().builtinRuleEdits["module:ai:openai"]).toBeUndefined();
    actions.setProxyGroupNameOverride("select", "Core Override");
    actions.clearProxyGroupNameOverride("select");
  });

  it("covers proxy group no-change branches for undefined maps and missing targets", () => {
    const { actions, getState } = createProxyGroupHarness({
      enabledProxyGroups: ["select"],
      proxyGroupAdvanced: {},
      customRuleSets: [],
      builtinRuleEdits: {},
      proxyGroupNameOverrides: undefined,
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "Other Target" }],
      dialerProxyGroups: [
        { id: "dialer", name: "Dialer", type: "select", enabled: true, relayNodes: ["Other Target"], targetNodes: [] },
      ],
      customProxyGroups: [],
      ruleProviderBaseUrl: "https://rules.example/base/",
    });

    const beforeAdvancedNoop = getState();
    actions.updateProxyGroupAdvanced("missing", { sourceIds: ["ignored"] });
    expect(getState()).toStrictEqual(beforeAdvancedNoop);

    const beforeNoop = getState();
    actions.addModuleRules("ai", [{ id: "openai", name: "OpenAI", behavior: "domain", path: "geosite/openai.mrs" }]);
    expect(getState()).toStrictEqual(beforeNoop);

    actions.updateModuleRule("ai", "missing", { name: "Ignored" });
    actions.removeModuleRule("ai", "missing");
    actions.moveModuleRule("ai", "openai", { kind: "module", id: "missing-target" });
    expect(getState().enabledProxyGroups).not.toContain("missing-target");

    actions.moveModuleRule("ai", "openai", { kind: "module", id: "youtube" });
    expect(getState().enabledProxyGroups).toContain("youtube");
    expect(getState().builtinRuleEdits["module:ai:openai"]?.target).toEqual({
      kind: "module",
      id: "youtube",
    });

    actions.restoreModuleRule(undefined as never, undefined as never);
    actions.clearProxyGroupNameOverride("ai");
    expect(getState().proxyGroupNameOverrides).toEqual({});
  });

  it("covers node action restore, rename, order, and listener-port branches", () => {
    const { actions, getState } = createNodeHarness({
      nodes: [
        ssNode("Alpha", { _originName: "Origin Alpha", _sourceIds: ["source-a"] }),
        ssNode("Beta"),
        ssNode("Gamma"),
      ],
      sources: [{ id: "source-a", tag: "A", nameTemplate: "[{tag}] {name}" }],
      deletedNodeNames: ["Ghost", "Cached"],
      deletedNodes: [
        { originName: "Ghost" },
        {
          originName: "Cached",
          name: "Beta",
          node: ssNode("Beta", { _originName: "Cached" }),
          listenerPort: 12000,
          dialerRelayGroupIds: ["dialer"],
          dialerTargetGroupIds: ["dialer"],
        },
        {
          originName: "Origin Alpha",
          name: "Existing",
          node: ssNode("Existing", { _originName: "Origin Alpha" }),
        },
      ],
      listenerPorts: { Alpha: 10000, Beta: 10001, Gamma: "bad" },
      dialerProxyGroups: [
        { id: "dialer", name: "Dialer", type: "select", enabled: true, relayNodes: ["Alpha", "Alpha", "DIRECT"], targetNodes: ["Alpha", "Gamma"] },
      ],
    });

    actions.removeNode("");
    expect(getState().deletedNodeNames).not.toContain("");
    actions.restoreDeletedNode(" ");
    actions.restoreDeletedNode("Ghost");
    expect(getState().deletedNodeNames).not.toContain("Ghost");
    actions.restoreDeletedNode("Origin Alpha");
    expect(getState().nodes.map((node: ParsedNode) => node.name)).not.toContain("Existing");

    actions.restoreDeletedNode("Cached");
    expect(getState().nodes.map((node: ParsedNode) => node.name)).toContain("Beta (2)");
    expect(getState().listenerPorts["Beta (2)"]).toBe(12000);
    expect(getState().dialerProxyGroups[0].relayNodes).toContain("Beta (2)");
    expect(getState().dialerProxyGroups[0].targetNodes).toContain("Beta (2)");

    actions.restoreNodeName("Alpha");
    expect(getState().nodes[0].name).toBe("[A] Origin Alpha");
    expect(getState().listenerPorts["[A] Origin Alpha"]).toBe(10000);

    actions.moveNode("missing", "up");
    actions.moveNode("[A] Origin Alpha", "up");
    actions.moveNode("[A] Origin Alpha", "down");
    expect(getState().nodes[1].name).toBe("[A] Origin Alpha");

    actions.setNodeOrder("missing", 1);
    actions.setNodeOrder("[A] Origin Alpha", Number.NaN);
    actions.setNodeOrder("[A] Origin Alpha", 1);
    expect(getState().nodes[0].name).toBe("[A] Origin Alpha");

    actions.renameNode("Gamma", "Beta");
    expect(getState().nodes.map((node: ParsedNode) => node.name)).toContain("Beta (3)");
    actions.renameNode("Beta (3)", "Beta (3)");
    actions.renameNode("Beta (3)", " ");

    actions.bulkRenameNodes([]);
    actions.bulkRenameNodes([{ oldName: "missing", newName: "Nope" }]);
    actions.bulkRenameNodes([
      null as never,
      { oldName: "Beta", newName: "Bulk" },
      { oldName: "Beta (2)", newName: "Bulk" },
      { oldName: "Beta (3)", newName: "" },
    ]);
    expect(getState().nodes.map((node: ParsedNode) => node.name)).toEqual(
      expect.arrayContaining(["Bulk", "Bulk (2)"])
    );

    actions.setListenerPort(" ", 13000);
    actions.setListenerPort("Bulk", 13000);
    actions.setListenerPort("Bulk", 13000);
    actions.setListenerPort("Bulk", 0);
    actions.setListenerPort("Bulk", null);
    expect(getState().listenerPorts.Bulk).toBeUndefined();

    actions.bulkSetListenerPorts(null as never);
    actions.bulkSetListenerPorts({ "": 1234, "Bulk 2": 14000, Alpha: 14000, Bad: 0, Drop: null });
    expect(getState().listenerPorts["Bulk 2"]).toBe(14000);
    expect(getState().listenerPorts.Alpha).toBeUndefined();
  });
});
