import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  generatedProxyGroups: [] as any[],
  customRuleSets: [] as any[],
  effectiveRules: [] as any[],
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

const effectMock = vi.hoisted(() => ({
  run: false,
  refCurrent: null as any,
  cleanup: undefined as void | (() => void),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (stateMock.enabled && effectMock.run) {
        effectMock.cleanup = effect() || undefined;
        return;
      }
      return actual.useEffect(effect, deps);
    },
    useRef: (initial: unknown) => {
      if (stateMock.enabled && effectMock.run) {
        return { current: effectMock.refCurrent };
      }
      return actual.useRef(initial);
    },
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
  };
});

vi.mock("zustand/react/shallow", () => ({ useShallow: (selector: any) => selector }));
vi.mock("lucide-react", () => ({
  Network: () => null,
  Server: () => null,
}));
vi.mock("@subboost/ui/components/ui/protocol-badge", () => ({
  ProtocolBadge: (props: any) => {
    mocks.captures.protocolBadges.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: (selector?: any) => (typeof selector === "function" ? selector(mocks.store) : mocks.store),
}));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
	  PROXY_GROUP_MODULES: [
	    {
	      id: "select",
	      name: "🚀 节点选择",
	      emoji: "🚀",
	      groupType: "select",
	      category: "core",
	      rules: [{ id: "sel", name: "Select Rule", behavior: "classical" }],
	    },
	    {
	      id: "auto",
	      name: "⚡ 自动选择",
	      emoji: "⚡",
	      groupType: "url-test",
	      category: "service",
	      rules: [{ id: "r1", name: "Rule One", behavior: "domain" }],
	    },
	    { id: "ad", name: "🛑 广告拦截", emoji: "🛑", groupType: "select", category: "other" },
	  ],
  generateProxyGroups: vi.fn(() => mocks.generatedProxyGroups),
  buildProviderProxyGroups: (attachments: any[], reservedNames: Iterable<string>) => {
    const reserved = new Set(reservedNames);
    const groups: any[] = [];
    const names: string[] = [];
    for (const attachment of attachments) {
      if (!attachment || attachment.mode !== "grouped") continue;
      const base = attachment.groupName || attachment.key;
      let name = base;
      let suffix = 2;
      while (reserved.has(name)) name = `${base} ${suffix++}`;
      reserved.add(name);
      names.push(name);
      groups.push({ name, type: "select", use: [attachment.key] });
    }
    return { groups, names };
  },
}));
vi.mock("@subboost/core/generator/module-rules", () => ({
  getModuleRuleOrderKey: (moduleId: string, ruleId: string) => `module:${moduleId}:${ruleId}`,
  getEffectiveModuleRules: vi.fn(() => mocks.effectiveRules),
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (module: { id: string; name: string }, override?: string) => override || module.name,
  splitLeadingEmoji: (raw: string) => {
    const match = typeof raw === "string" ? raw.match(/^(\S+)\s+(.+)$/) : null;
    if (match) return { hasEmojiPrefix: true, emoji: match[1], label: match[2] };
    return { hasEmojiPrefix: false, emoji: "", label: raw ?? "" };
  },
}));
vi.mock("@subboost/core/rules/custom-routing-rule-sets", () => ({
  collectCustomRoutingRuleSets: vi.fn(() => mocks.customRuleSets),
}));
vi.mock("./visual-graph/custom-rules-preview", () => ({
  CustomRulesPreview: (props: any) => {
    mocks.captures.customRulesPreview = props;
    return null;
  },
}));
vi.mock("./visual-graph/emoji", () => ({ getDialerEmojiFromName: () => "🔁" }));
vi.mock("./visual-graph/proxy-groups-preview", () => ({
  ProxyGroupsPreview: (props: any) => {
    mocks.captures.proxyGroupsPreview = props;
    return null;
  },
}));

import { VisualGraph } from "./visual-graph";

const nodes = [
  { name: "🇭🇰 Alpha", type: "ss" },
  { name: "Beta", type: "vless" },
  { name: "Gamma", type: "trojan" },
];

function renderGraph(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.protocolBadges = [];
  mocks.captures.proxyGroupsPreview = undefined;
  mocks.captures.customRulesPreview = undefined;
  try {
    const html = renderToStaticMarkup(React.createElement(VisualGraph));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("VisualGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    effectMock.run = false;
    effectMock.refCurrent = null;
    effectMock.cleanup = undefined;
    mocks.captures = { protocolBadges: [] };
    mocks.generatedProxyGroups = [
      { name: "🚀 节点选择", type: "select", proxies: ["DIRECT"] },
      { name: "⚡ 自动选择", type: "url-test", proxies: ["🇭🇰 Alpha"] },
      { name: "🧩 Custom", type: "load-balance", strategy: "round-robin", proxies: ["Beta"] },
      { name: "🧩 Filtered", type: "select", proxies: ["Gamma"] },
      { name: "External", type: "fallback", proxies: ["REJECT"] },
    ];
    mocks.customRuleSets = [{ id: "rs1" }];
    mocks.effectiveRules = [{ id: "r1", name: "Rule One", behavior: "domain" }];
    mocks.store = {
      nodes,
      sources: [],
      enabledProxyGroups: ["select", "auto"],
      dialerProxyGroups: [{ id: "d1", name: "Relay", enabled: true, relayNodes: ["Relay"], targetNodes: ["Beta"], type: "select" }],
      customRules: [{ id: "manual" }],
      customProxyGroups: [{ id: "custom-1", name: "🧩 Custom", emoji: "🧩", groupType: "load-balance", strategy: "round-robin" }],
      customRuleSets: [],
      builtinRuleEdits: {},
      proxyGroupNameOverrides: {},
      proxyGroupOrder: ["dialer:d1", "module:auto", "missing", "module:select", "dialer:d1"],
      testUrl: "https://example.com",
      testInterval: 300,
      ruleProviderBaseUrl: "https://rules.example",
      setProxyGroupOrder: vi.fn(),
    };
  });

  it("renders empty state when there are no nodes", () => {
    mocks.store.nodes = [];
    const { html } = renderGraph();

    expect(html).toContain("添加节点后显示可视化关系图");
    expect(mocks.captures.proxyGroupsPreview).toBeUndefined();
  });

  it("shows airport groups derived from grouped provider sources", () => {
    mocks.store.proxyGroupOrder = [];
    mocks.store.sources = [
      {
        id: "s1",
        type: "url",
        content: "https://a.example.com/sub",
        useProxyProviders: true,
        providerMode: "grouped",
        providerGroupName: "✈️ 测试机场",
      },
      {
        id: "s2",
        type: "url",
        content: "https://b.example.com/sub",
        useProxyProviders: true,
        providerMode: "bare",
      },
    ];
    renderGraph();

    const groups = mocks.captures.proxyGroupsPreview.displayGroups;
    const providerGroups = groups.filter((group: any) => group.category === "provider");
    // 仅分组模式的 provider 生成机场组卡片
    expect(providerGroups).toHaveLength(1);
    expect(providerGroups[0]).toMatchObject({
      id: "name:✈️ 测试机场",
      name: "✈️ 测试机场",
      emoji: "✈️",
      groupType: "select",
      rules: [],
    });
    // 插在自动选择之后
    const autoIndex = groups.findIndex((group: any) => group.id === "module:auto");
    const airportIndex = groups.findIndex((group: any) => group.id === "name:✈️ 测试机场");
    expect(airportIndex).toBe(autoIndex + 1);
  });

  it("reorders airport groups via proxyGroupOrder using generator-compatible name keys", () => {
    mocks.store.proxyGroupOrder = ["name:✈️ 测试机场", "module:select"];
    mocks.store.sources = [
      {
        id: "s1",
        type: "url",
        content: "https://a.example.com/sub",
        useProxyProviders: true,
        providerMode: "grouped",
        providerGroupName: "✈️ 测试机场",
      },
    ];
    renderGraph();

    const groups = mocks.captures.proxyGroupsPreview.displayGroups;
    // 拖拽序（name: 前缀 key）能命中机场组：机场组排到最前，不再被追加到末尾
    expect(groups[0]).toMatchObject({ id: "name:✈️ 测试机场" });
    expect(groups[1]).toMatchObject({ id: "module:select" });
  });

  it("builds display groups, node previews, custom rules, and drag callbacks", () => {
    const { html, setters } = renderGraph({ 0: new Set(["module:auto"]), 1: null, 2: null, 3: 360 });

    expect(html).toContain("3");
    expect(mocks.captures.protocolBadges.map((props: any) => props.type)).toEqual(["ss", "vless", "trojan"]);
    expect(mocks.captures.customRulesPreview).toEqual({
      customRules: [{ id: "manual" }],
      ruleSets: [{ id: "rs1" }],
    });

    const preview = mocks.captures.proxyGroupsPreview;
    expect(preview.preferVerticalDialerLayout).toBe(true);
    expect(preview.displayGroups.map((group: any) => group.id)).toEqual([
      "dialer:d1",
      "module:auto",
      "module:select",
      "custom:custom-1",
      "name:🧩 Filtered",
      "name:External",
    ]);
    expect(preview.displayGroups.find((group: any) => group.id === "module:auto").rules).toEqual([
      { id: "r1", name: "Rule One", behavior: "domain" },
    ]);
    expect(preview.defaultProxyByGroupName.get("🚀 节点选择")).toBe("DIRECT");

    preview.onToggleExpand("module:auto");
    expect(setters[0]).toHaveBeenCalledWith(expect.any(Function));
    preview.onToggleExpand("module:select");
    expect((setters[0] as any).lastValue.has("module:select")).toBe(true);
    preview.onSetDraggingGroupId("module:auto");
    expect(setters[1]).toHaveBeenCalledWith("module:auto");
    preview.onSetDragOverGroup({ id: "module:select", position: "before" });
    expect(setters[2]).toHaveBeenCalledWith({ id: "module:select", position: "before" });
    preview.onSetProxyGroupOrder(["module:auto"]);
    expect(mocks.store.setProxyGroupOrder).toHaveBeenCalledWith(["module:auto"]);
  });

  it("uses selector defaults when optional store slices are absent", () => {
    mocks.generatedProxyGroups = [{ name: "🚀 节点选择", type: "select", proxies: ["DIRECT"] }];
    mocks.customRuleSets = [];
    mocks.store = {
      nodes: [{ name: "Only", type: "ss" }],
      enabledProxyGroups: ["select"],
      testUrl: "https://example.com",
      testInterval: 300,
      ruleProviderBaseUrl: "https://rules.example",
      setProxyGroupOrder: vi.fn(),
    };

    const { html } = renderGraph();

    expect(html).toContain("1");
    expect(mocks.captures.proxyGroupsPreview.displayGroups).toEqual([
      expect.objectContaining({ id: "module:select", name: "🚀 节点选择" }),
    ]);
    expect(mocks.captures.customRulesPreview).toEqual({
      customRules: [],
      ruleSets: [],
    });
  });

  it("shows builtin rules moved from another module into the target module", () => {
    mocks.generatedProxyGroups = [{ name: "🚀 节点选择", type: "select", proxies: ["DIRECT"] }];
    mocks.store = {
      ...mocks.store,
      builtinRuleEdits: {
        "module:auto:r1": { target: "🚀 节点选择" },
        "module:auto:missing": { target: "🚀 节点选择" },
        "module:missing:r1": { target: "🚀 节点选择" },
        "module:select:sel": { target: "🚀 节点选择" },
        "not-module": { target: "🚀 节点选择" },
      },
      proxyGroupOrder: [],
    };

    renderGraph();

    expect(mocks.captures.proxyGroupsPreview.displayGroups[0].rules).toEqual([
      { id: "sel", name: "Select Rule", behavior: "classical" },
      { id: "r1", name: "Rule One", behavior: "domain" },
    ]);
  });

  it("falls back to generated order and truncates long node lists", () => {
    mocks.store.proxyGroupOrder = [];
    mocks.store.dialerProxyGroups = [{ id: "d2", name: "Disabled", enabled: false }];
    mocks.store.nodes = Array.from({ length: 52 }, (_, index) => ({ name: `Node ${index}`, type: index % 2 === 0 ? "vmess" : "hysteria2" }));
    const { html } = renderGraph({ 3: 0 });

    expect(mocks.captures.proxyGroupsPreview.displayGroups.map((group: any) => group.id)).toEqual([
      "module:select",
      "module:auto",
      "custom:custom-1",
      "name:🧩 Filtered",
      "name:External",
    ]);
    expect(html).toContain("还有 2 个节点");
  });

  it("measures container width through resize fallback and ResizeObserver", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    effectMock.run = true;

    effectMock.refCurrent = null;
    let result = renderGraph();
    expect(result.setters[3]).not.toHaveBeenCalled();

    effectMock.refCurrent = { clientWidth: 500 };
    vi.stubGlobal("window", {
      getComputedStyle: () => ({ paddingLeft: "30", paddingRight: "20" }),
      addEventListener,
      removeEventListener,
    });
    vi.stubGlobal("ResizeObserver", undefined);

    result = renderGraph();

    expect(result.setters[3]).toHaveBeenCalledWith(450);
    expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    effectMock.cleanup?.();
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));

    vi.stubGlobal("window", {
      getComputedStyle: () => ({ paddingLeft: "", paddingRight: "not-a-number" }),
      addEventListener,
      removeEventListener,
    });
    result = renderGraph();
    expect(result.setters[3]).toHaveBeenCalledWith(500);

    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal("window", {
      getComputedStyle: () => ({ paddingLeft: "30", paddingRight: "20" }),
      addEventListener,
      removeEventListener,
    });
    const observerCtor = vi.fn(function FakeResizeObserver(this: any, callback: () => void) {
      this.observe = observe;
      this.disconnect = disconnect;
      callback();
    });
    vi.stubGlobal("ResizeObserver", observerCtor);

    result = renderGraph();

    expect(result.setters[3]).toHaveBeenCalledWith(450);
    expect(observe).toHaveBeenCalledWith(effectMock.refCurrent);
    effectMock.cleanup?.();
    expect(disconnect).toHaveBeenCalled();
  });

  it("handles fallback group metadata and additional node protocol colors", () => {
    mocks.generatedProxyGroups = [
      { name: null, type: "select", proxies: [] },
      { name: "Emoji Filter", type: "select", proxies: [] },
      { name: "Plain Custom", type: "fallback", strategy: "consistent-hashing", proxies: [] },
    ];
    mocks.store.nodes = [
      { name: "AnyTLS", type: "anytls" },
      { name: "Mystery", type: "unknown" },
    ];
    mocks.store.dialerProxyGroups = [
      { id: "d3", name: "Broken Dialer", enabled: true, relayNodes: "bad", targetNodes: "bad", type: "select" },
    ];
    mocks.store.customProxyGroups = [
      null,
      { id: "bad-type", name: 123 },
      { id: "bad-name", name: "   " },
      { id: "emoji", name: "Emoji Filter", emoji: "⭐", groupType: "select" },
      { id: "plain", name: "Plain Custom", emoji: "", groupType: "", strategy: "", rules: [] },
    ];
    mocks.store.proxyGroupOrder = ["name:", "custom:emoji", "custom:plain", "dialer:d3"];

    const { html } = renderGraph({ 3: 800 });
    const groups = mocks.captures.proxyGroupsPreview.displayGroups;

    expect(groups.map((group: any) => group.id)).toEqual(["name:", "custom:emoji", "custom:plain", "dialer:d3"]);
    expect(groups.find((group: any) => group.id === "custom:emoji")).toMatchObject({ emoji: "⭐" });
    expect(groups.find((group: any) => group.id === "dialer:d3").dialer).toMatchObject({
      relayNodes: [],
      targetNodes: [],
    });
    expect(mocks.captures.protocolBadges.map((props: any) => props.type)).toEqual(["anytls", "unknown"]);
    expect(html).toContain("bg-teal-400");
    expect(html).toContain("bg-gray-400");
  });

  it("merges built-in rule edits moved from another module and skips invalid edit records", () => {
    mocks.store.builtinRuleEdits = {
      "module:auto:r1": { enabled: false },
      "module:select:sel": { target: "⚡ 自动选择" },
      "module:select:missing": { target: "⚡ 自动选择" },
      "module:missing:ghost": { target: "⚡ 自动选择" },
      "not-a-module-key": { target: "⚡ 自动选择" },
    };

    renderGraph({ 3: 800 });
    const auto = mocks.captures.proxyGroupsPreview.displayGroups.find((group: any) => group.id === "module:auto");

    expect(auto.rules).toEqual([{ id: "sel", name: "Select Rule", behavior: "classical" }]);
  });
});
