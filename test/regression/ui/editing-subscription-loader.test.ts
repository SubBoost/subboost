import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import { useEditingSubscriptionLoader } from "@subboost/ui/product/home/use-editing-subscription-loader";

const mocks = vi.hoisted(() => {
  const bag: {
    effectCleanups: Array<() => void>;
    storeState: any;
    stateSetters: Array<ReturnType<typeof vi.fn>>;
  } = {
    effectCleanups: [],
    storeState: {},
    stateSetters: [],
  };

  const useConfigStore = vi.fn() as any;
  useConfigStore.getState = vi.fn(() => bag.storeState);
  useConfigStore.setState = vi.fn((updater: any) => {
    const patch = typeof updater === "function" ? updater(bag.storeState) : updater;
    bag.storeState = { ...bag.storeState, ...patch };
    return bag.storeState;
  });

  return {
    bag,
    useState: vi.fn((initial: unknown) => {
      const setter = vi.fn();
      bag.stateSetters.push(setter);
      return [initial, setter];
    }),
    useEffect: vi.fn((effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") bag.effectCleanups.push(cleanup);
    }),
    useConfigStore,
    captureAuthConfigHandoff: vi.fn(),
    toast: vi.fn(),
  };
});

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
  useRef: () => ({ current: null }),
  useEffect: mocks.useEffect,
}));

vi.mock("../../../node_modules/react/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
  useRef: () => ({ current: null }),
  useEffect: mocks.useEffect,
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: mocks.useConfigStore,
}));

vi.mock("@subboost/ui/store/config-store/auth-handoff", () => ({
  captureAuthConfigHandoff: mocks.captureAuthConfigHandoff,
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({
  toast: mocks.toast,
}));

function node(name: string, extra: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "node"}.example.com`,
    port: 443,
    cipher: "aes-128-gcm",
    password: "secret",
    ...extra,
  } as unknown as ParsedNode;
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

async function flushAsync() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    editSubscriptionId: "sub-1",
    loadSubscription: vi.fn(),
    loginHref: "/login",
    setCopied: vi.fn(),
    setEditingSubscription: vi.fn(),
    setStoreSources: vi.fn(),
    setSubscriptionName: vi.fn(),
    setSubscriptionUrl: vi.fn(),
    ...overrides,
  } as any;
}

function resetStoreState(overrides: Record<string, unknown> = {}) {
  const reset = vi.fn();
  const generateConfig = vi.fn();
  mocks.bag.storeState = {
    reset,
    generateConfig,
    sources: [],
    nodes: [],
    enabledProxyGroups: ["select", "auto", "ai", "cn"],
    customRuleSets: [],
    builtinRuleEdits: {},
    proxyGroupNameOverrides: {},
    experimentalCnUseCnRuleSet: false,
    cnIpNoResolve: true,
    customRules: [],
    customProxyGroups: [],
    dialerProxyGroups: [],
    hiddenProxyGroups: [],
    proxyGroupOrder: [],
    ruleOrder: [],
    deletedNodeNames: [],
    deletedNodes: [],
    listenerPorts: {},
    ...overrides,
  };
  return { reset, generateConfig };
}

describe("useEditingSubscriptionLoader branch coverage", () => {
  let originalWindow: typeof globalThis.window | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bag.effectCleanups = [];
    mocks.bag.stateSetters = [];
    resetStoreState();
    originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "" } },
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("uses the fallback error message when a failed response has no public error", async () => {
    const options = makeOptions({
      loadSubscription: vi.fn(async () => response(502, {})),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(mocks.toast).toHaveBeenCalledWith({ title: "加载订阅失败", variant: "destructive" });
    expect(options.setEditingSubscription).toHaveBeenCalledWith(null);
  });

  it("hydrates an empty valid subscription when arrays and config are absent", async () => {
    const { reset, generateConfig } = resetStoreState({
      enabledProxyGroups: ["select", "auto"],
      ruleOrder: ["existing"],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "",
            urls: "not-array",
            nodes: "not-array",
            config: null,
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(reset).toHaveBeenCalled();
    expect(generateConfig).toHaveBeenCalled();
    expect(options.setStoreSources).not.toHaveBeenCalled();
    expect(mocks.bag.storeState.nodes).toEqual([]);
    expect(options.setEditingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sub-1",
        name: "未命名订阅",
        autoUpdateInterval: null,
        smartNodeMatchingEnabled: true,
      })
    );
  });

  it("normalizes sparse config sources, module overrides, order lists, and listener ports", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000002);
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Sparse",
            urls: [],
            nodes: [
              node("A", { _sourceIds: ["1"] }),
              node("B", { _sourceIds: ["2"] }),
              node("C", { _sourceIds: ["3"] }),
            ],
            subscriptionInfo: { upload: 1, download: 2, total: 3 },
            config: {
              sources: [
                null,
                { type: "bad", content: "ignored" },
                { type: "url", content: " https://url.example/sub ", lastParsedContent: " " },
                {
                  type: "yaml",
                  content: "proxies: []",
                  lastParsedContent: " proxies: [] ",
                  subscriptionUserInfo: { upload: -1 },
                },
                { type: "nodes", content: "ss://node", lastParsedContent: " ss://node " },
              ],
              deletedNodes: [null, { originName: " ", name: "Bad" }, { originName: " B ", name: " " }],
              deletedNodeNames: ["B", "B", " "],
              hiddenProxyGroups: [1, " cn ", "cn", ""],
              customRuleSets: [
                { id: "ai-ip", name: "ai-ip", behavior: "ipcidr", path: "geoip/ai.mrs", target: "🤖 Labs", noResolve: true },
                { id: "ai-domain", name: "ai-domain", behavior: "domain", path: "geosite/ai.mrs", target: "🤖 Labs" },
              ],
              builtinRuleEdits: { "module:ai:openai": { enabled: false } },
              proxyGroupNameOverrides: { ai: "Labs", bad: 1 },
              proxyGroupOrder: [1, "module:ai", "module:ai", ""],
              ruleOrder: ["module:ai", "module:ai"],
              listenerPorts: { A: 41000, B: 41001, C: 70000, Missing: 41002, Bad: "41003" },
              cnIpNoResolve: false,
              experimentalCnUseCnRuleSet: true,
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({ id: "1", type: "url", content: "https://url.example/sub" }),
      expect.objectContaining({ id: "2", type: "yaml", content: "proxies: []", lastParsedContent: "proxies: []" }),
      expect.objectContaining({ id: "3", type: "nodes", content: "ss://node", lastParsedContent: "ss://node" }),
    ]);
    expect(mocks.bag.storeState).toMatchObject({
      nodes: [
        expect.objectContaining({ name: "A" }),
        expect.objectContaining({ name: "C" }),
      ],
      deletedNodeNames: ["B"],
      hiddenProxyGroups: ["cn"],
      enabledProxyGroups: ["select", "auto", "ad", "private", "global", "final"],
      customRuleSets: [
        { id: "ai-ip", name: "ai-ip", behavior: "ipcidr", path: "geoip/ai.mrs", target: "🤖 Labs", noResolve: true },
        { id: "ai-domain", name: "ai-domain", behavior: "domain", path: "geosite/ai.mrs", target: "🤖 Labs" },
      ],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      proxyGroupNameOverrides: { ai: "Labs" },
      proxyGroupOrder: ["module:ai"],
      listenerPorts: { A: 41000 },
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
    });
  });

  it("falls back from current sources when url order differs", async () => {
    resetStoreState({
      sources: [
        { id: "url-current", type: "url", content: 123 },
        { id: "yaml-current", type: "yaml", content: "proxies: []" },
      ],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            urls: ["https://new.example/sub"],
            nodes: [node("New")],
            config: {},
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "1",
        type: "url",
        content: "https://new.example/sub",
      }),
    ]);
  });

  it("restores duplicate url sources with stable candidate ids and url metadata fallbacks", async () => {
    resetStoreState({
      sources: [
        {
          id: "current-url",
          type: "url",
          content: "ftp://current.invalid/sub",
          lastParsedContent: "ftp://current.invalid/last",
          tag: " Current ",
          nameTemplate: " {name} ",
          useProxyProviders: true,
          userinfoUrl: "mailto:current-info",
          userinfoUserAgent: " Current-UA ",
          subscriptionUserInfo: { upload: 1, total: 2 },
        },
        { id: "current-yaml", type: "yaml", content: " proxies: [] ", lastParsedContent: " old yaml " },
      ],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Duplicate URLs",
            urls: ["ftp://one.invalid/sub", 42, " https://two.example/sub "],
            nodes: [node("A", { _sourceIds: ["b"] }), node("B", { _sourceIds: ["a"] })],
            subscriptionInfo: { upload: 10, total: 100 },
            config: {
              sources: [
                {
                  type: "url",
                  content: "ftp://one.invalid/sub",
                  lastParsedContent: "ftp://one.invalid/last",
                  userinfoUrl: "mailto:one-info",
                  userinfoUserAgent: " Agent-One ",
                  subscriptionUserInfo: { download: 5 },
                },
                {
                  type: "url",
                  content: " https://two.example/sub ",
                  useProxyProviders: true,
                  subscriptionUserInfo: { expire: 1893456000 },
                },
              ],
              listenerPorts: { "": 41000, A: 41001, B: 41002 },
              ruleOrder: [],
              proxyGroupOrder: [],
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "a",
        type: "url",
        content: "ftp://one.invalid/sub",
        lastParsedContent: "ftp://one.invalid/last",
        userinfoUrl: "mailto:one-info",
        userinfoUserAgent: "Agent-One",
        subscriptionUserInfo: { download: 5 },
        nodeCount: 1,
      }),
      expect.objectContaining({
        id: "b",
        type: "url",
        content: "https://two.example/sub",
        lastParsedContent: "https://two.example/sub",
        useProxyProviders: true,
        subscriptionUserInfo: { expire: 1893456000 },
        nodeCount: 1,
      }),
    ]);
    expect(mocks.bag.storeState.listenerPorts).toEqual({ A: 41001, B: 41002 });
    expect(mocks.bag.storeState.ruleOrder).toEqual([]);
  });

  it("does not borrow current mixed sources when saved urls match", async () => {
    resetStoreState({
      sources: [
        {
          id: "current-url",
          type: "url",
          content: " https://same.example/sub ",
          lastParsedContent: " https://same.example/last ",
          tag: " Current ",
          nameTemplate: " {tag}-{name} ",
          useProxyProviders: true,
          userinfoUrl: "https://same.example/info",
          userinfoUserAgent: " Same-UA ",
          subscriptionUserInfo: { upload: 1, total: 2 },
        },
        {
          id: "current-yaml",
          type: "yaml",
          content: " proxies: [] ",
          lastParsedContent: " previous yaml ",
          tag: " Y ",
          lastParsedTag: " old-y ",
          lastParsedNameTemplate: " {name} ",
        },
      ],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            urls: ["https://same.example/sub"],
            nodes: [node("Same")],
            subscriptionInfo: { upload: 10, total: 20 },
            config: {},
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "1",
        content: "https://same.example/sub",
        lastParsedContent: "https://same.example/sub",
        subscriptionUserInfo: { upload: 10, total: 20 },
      }),
    ]);
  });

  it("deduplicates saved source ids and falls back for invalid URL-like fields", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000003);
    resetStoreState({
      ruleOrder: ["state-rule"],
      proxyGroupOrder: ["state-group"],
      sources: [
        {
          id: "current-url",
          type: "url",
          content: "not a normalized url",
          lastParsedContent: "not a normalized last url",
          userinfoUrl: "not a normalized info url",
        },
      ],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Duplicate source ids",
            urls: ["not a normalized url", 123],
            nodes: [
              node("A", { _sourceIds: ["dup"] }),
              node("B", { _sourceIds: ["dup-2"] }),
            ],
            config: {
              sources: [
                {
                  id: "dup",
                  type: "url",
                  content: "not a normalized url",
                  lastParsedContent: "not a normalized last url",
                  userinfoUrl: "not a normalized info url",
                },
                {
                  id: "dup",
                  type: "url",
                  content: "also not a normalized url",
                  lastParsedContent: "also not a normalized last url",
                  userinfoUrl: "also not a normalized info url",
                },
              ],
              deletedNodes: [
                { originName: " Ghost ", name: "Ghost Display" },
                { originName: "Ghost", name: "Duplicate Ghost" },
              ],
              moduleRuleOverrides: {
                empty: [
                  { id: "valid-empty-path", path: " " },
                  { id: "missing-path" },
                  null,
                ],
              },
              moduleRuleExclusions: "bad",
              listenerPorts: { A: 42000, B: 42001 },
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "dup",
        type: "url",
        content: "not a normalized url",
        lastParsedContent: "not a normalized last url",
        userinfoUrl: "not a normalized info url",
        nodeCount: 1,
      }),
      expect.objectContaining({
        id: "dup-2",
        type: "url",
        content: "also not a normalized url",
        lastParsedContent: "also not a normalized last url",
        userinfoUrl: "also not a normalized info url",
        nodeCount: 1,
      }),
    ]);
    expect(mocks.bag.storeState.deletedNodeNames).toEqual(["Ghost"]);
    expect(mocks.bag.storeState.customRuleSets).toEqual([]);
    expect(mocks.bag.storeState.builtinRuleEdits).toEqual({});
    expect(mocks.bag.storeState.ruleOrder).toEqual(["state-rule"]);
    expect(mocks.bag.storeState.proxyGroupOrder).toEqual(["state-group"]);
  });

  it("suppresses rejected loader errors after effect cleanup", async () => {
    let rejectLoad: (reason: unknown) => void = () => undefined;
    const options = makeOptions({
      loadSubscription: vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectLoad = reject;
          })
      ),
    });

    useEditingSubscriptionLoader(options);
    expect(mocks.bag.effectCleanups).toHaveLength(1);
    mocks.bag.effectCleanups[0]();
    rejectLoad(new Error("network down"));
    await flushAsync();

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(options.setEditingSubscription).not.toHaveBeenCalled();
  });
});
