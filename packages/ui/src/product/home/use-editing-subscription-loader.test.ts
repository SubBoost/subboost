import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import { useEditingSubscriptionLoader } from "./use-editing-subscription-loader";

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
    parseSubscription: vi.fn(),
  };
});

vi.mock("react", () => ({
  useState: mocks.useState,
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

vi.mock("@subboost/core/parser", () => ({
  parseSubscription: mocks.parseSubscription,
}));

function node(name: string, extra: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase()}.example.com`,
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
    enabledProxyGroups: ["select", "auto", "ai"],
    customRuleSets: [],
    builtinRuleEdits: {},
    proxyGroupNameOverrides: {},
    experimentalCnUseCnRuleSet: false,
    cnIpNoResolve: true,
    proxyGroupAdvanced: {},
    proxyGroupOrder: [],
    ruleOrder: [],
    ...overrides,
  };
  return { reset, generateConfig };
}

describe("useEditingSubscriptionLoader", () => {
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
    mocks.parseSubscription.mockReturnValue({ nodes: [], errors: [], totalParsed: 0, totalFailed: 0 });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("does nothing when there is no editing subscription id", async () => {
    const options = makeOptions({ editSubscriptionId: null });

    const isLoading = useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(isLoading).toBe(false);
    expect(options.loadSubscription).not.toHaveBeenCalled();
    expect(mocks.useConfigStore.setState).not.toHaveBeenCalled();
  });

  it("captures the draft and redirects to login on 401", async () => {
    const options = makeOptions({
      loadSubscription: vi.fn(async () => response(401, { error: "login required" })),
      loginHref: "/login?next=/",
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(mocks.captureAuthConfigHandoff).toHaveBeenCalledWith(mocks.bag.storeState);
    expect(globalThis.window.location.href).toBe("/login?next=/");
    expect(mocks.useConfigStore.setState).not.toHaveBeenCalled();
  });

  it("hydrates a saved subscription config into the editor store", async () => {
    const { reset, generateConfig } = resetStoreState({
      enabledProxyGroups: ["select", "auto", "ai", "youtube"],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Saved",
            autoUpdateInterval: 7200,
            urls: ["https://example.com/sub"],
            nodes: [
              node("Remote", {
                _sourceIds: ["source-url"],
              }),
              node("Deleted"),
            ],
            config: {
              sources: [
                {
                  id: "source-url",
                  type: "url",
                  content: " https://example.com/sub ",
                  tag: "TAG",
                  nameTemplate: "{tag}-{name}",
                  useProxyProviders: true,
                  userinfoUrl: " https://example.com/userinfo ",
                  userinfoUserAgent: " Clash.Meta ",
                  subscriptionUserInfo: { upload: 1024, download: -1, total: 4096 },
                },
              ],
              deletedNodes: [{ originName: "Deleted", name: "Deleted" }],
              deletedNodeNames: ["Legacy", "Deleted"],
              template: "full",
              enabledGroups: ["select", "auto", "ai", "youtube"],
              hiddenProxyGroups: ["youtube"],
              customRules: [{ type: "DOMAIN", value: "example.com", target: "🤖 AI 服务" }],
              customProxyGroups: [{ id: "custom-1", name: "Custom", emoji: "", groupType: "select" }],
              customRuleSets: [
                {
                  id: "custom-ai",
                  name: "Custom AI",
                  behavior: "domain",
                  path: "geosite/custom-ai.mrs",
                  target: "🤖 Labs",
                },
              ],
              builtinRuleEdits: { "module:ai:openai": { enabled: false } },
              moduleRuleEditWarningAccepted: true,
              dialerProxyGroups: [{ id: "dialer-1", name: "Relay", relayNodes: ["Remote"], targetNodes: [] }],
              proxyGroupNameOverrides: { ai: "Labs" },
              proxyGroupOrder: ["module:ai", "module:ai", ""],
              listenerPorts: { Remote: 41000, Deleted: 41001 },
              appliedTemplateId: "template-1",
              dnsYaml: "dns: {}",
              ruleProviderBaseUrl: "https://rules.example.com",
              testUrl: "https://test.example.com",
              testInterval: 600,
              urlTestLazy: true,
              urlTestTolerance: 50,
              cnIpNoResolve: false,
              experimentalCnUseCnRuleSet: true,
              smartNodeMatchingEnabled: false,
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(reset).toHaveBeenCalled();
    expect(generateConfig).toHaveBeenCalled();
    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "source-url",
        type: "url",
        content: "https://example.com/sub",
        parsed: true,
        parsing: false,
        nodeCount: 1,
        useProxyProviders: true,
        userinfoUrl: "https://example.com/userinfo",
        userinfoUserAgent: "Clash.Meta",
        subscriptionUserInfo: { upload: 1024, total: 4096 },
      }),
    ]);
    expect(mocks.bag.storeState).toMatchObject({
      nodes: [expect.objectContaining({ name: "Remote", _originName: "Remote", _sourceIds: ["source-url"] })],
      deletedNodeNames: ["Deleted", "Legacy"],
      template: "full",
      enabledProxyGroups: ["select", "auto", "ai"],
      hiddenProxyGroups: ["youtube"],
      customProxyGroups: [
        { id: "custom-1", name: "Custom", emoji: "", groupType: "select", advanced: {} },
      ],
      proxyGroupAdvancedModeEnabled: true,
      customRuleSets: [
        {
          id: "custom-ai",
          name: "Custom AI",
          behavior: "domain",
          path: "geosite/custom-ai.mrs",
          target: "🤖 Labs",
        },
      ],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      moduleRuleEditWarningAccepted: true,
      proxyGroupNameOverrides: { ai: "Labs" },
      proxyGroupOrder: ["module:ai"],
      listenerPorts: { Remote: 41000 },
      appliedTemplateId: "template-1",
      dnsYaml: "dns: {}",
      ruleProviderBaseUrl: "https://rules.example.com",
      testUrl: "https://test.example.com",
      testInterval: 600,
      urlTestLazy: true,
      urlTestTolerance: 50,
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
    });
    expect(options.setEditingSubscription).toHaveBeenCalledWith({
      id: "sub-1",
      token: "token-1",
      name: "Saved",
      autoUpdateInterval: 7200,
      smartNodeMatchingEnabled: false,
    });
    expect(options.setSubscriptionName).toHaveBeenCalledWith("Saved");
    expect(options.setSubscriptionUrl).toHaveBeenCalledWith("");
    expect(options.setCopied).toHaveBeenCalledWith(false);
  });

  it("falls back to URL sources when config sources are absent", async () => {
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "",
            urls: [" https://one.example/sub ", "https://two.example/sub"],
            nodes: [node("One"), node("Two")],
            config: {},
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({ id: "sub-url-1", type: "url", content: "https://one.example/sub", parsed: true }),
      expect.objectContaining({ id: "sub-url-2", type: "url", content: "https://two.example/sub", parsed: true }),
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "节点来源信息缺失",
        variant: "warning",
      })
    );
    expect(options.setEditingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "未命名订阅",
        autoUpdateInterval: null,
        smartNodeMatchingEnabled: true,
      })
    );
  });

  it("hydrates single URL sources from the saved subscription info snapshot", async () => {
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Saved Info",
            urls: ["https://one.example/sub"],
            nodes: [node("One", { _sourceIds: ["1"] })],
            subscriptionInfo: { upload: 1024, download: 2048, total: 4096, expire: 1893456000 },
            config: {
              sources: [{ id: "1", type: "url", content: "https://one.example/sub" }],
            },
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
        content: "https://one.example/sub",
        subscriptionUserInfo: { upload: 1024, download: 2048, total: 4096, expire: 1893456000 },
      }),
    ]);
  });

  it("restores per-source subscription info for one source among multiple saved sources", async () => {
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Multi Saved Info",
            urls: ["https://one.example/sub", "https://two.example/sub"],
            nodes: [
              node("One", { _sourceIds: ["source-1"] }),
              node("Two", { _sourceIds: ["source-2"] }),
            ],
            subscriptionInfo: { upload: 10_000, download: 20_000, total: 100_000, expire: 1893456000 },
            config: {
              sources: [
                {
                  id: "source-1",
                  type: "url",
                  content: "https://one.example/sub",
                  subscriptionUserInfo: { upload: 1024, download: 2048, total: 4096, expire: 1893456000 },
                },
                {
                  id: "source-2",
                  type: "url",
                  content: "https://two.example/sub",
                },
              ],
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "source-1",
        type: "url",
        content: "https://one.example/sub",
        subscriptionUserInfo: { upload: 1024, download: 2048, total: 4096, expire: 1893456000 },
      }),
      expect.objectContaining({
        id: "source-2",
        type: "url",
        content: "https://two.example/sub",
      }),
    ]);
    const restoredSources = options.setStoreSources.mock.calls[0][0];
    expect(restoredSources[1]).not.toHaveProperty("subscriptionUserInfo");
  });

  it("preserves current non-url sources when subscription urls still match", async () => {
    const { reset, generateConfig } = resetStoreState({
      sources: [
        {
          id: "url-current",
          type: "url",
          content: " https://one.example/sub ",
          tag: "A",
          nameTemplate: "{tag}-{name}",
          useProxyProviders: true,
          userinfoUrl: " https://one.example/userinfo ",
          userinfoUserAgent: " Clash.Meta ",
          lastParsedTag: "A",
          lastParsedNameTemplate: "{tag}-{name}",
        },
        { id: "yaml-current", type: "yaml", content: "proxies: []", lastParsedContent: "proxies: []" },
        { id: "nodes-current", type: "nodes", content: "ss://node", lastParsedContent: "ss://node" },
      ],
      deletedNodes: [],
    });
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "Current Sources",
            autoUpdateInterval: 30.4,
            urls: ["https://one.example/sub"],
            nodes: [
              node("Active", { _sourceIds: ["url-current"] }),
              node("Gone", { _sourceIds: ["url-current"] }),
            ],
            config: {
              deletedNodeNames: ["Gone"],
              listenerPorts: { Active: 41000, Gone: 41001, Bad: "x", OutOfRange: 70000 },
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(reset).toHaveBeenCalled();
    expect(generateConfig).toHaveBeenCalled();
    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "url-current",
        type: "url",
        content: "https://one.example/sub",
        lastParsedContent: "https://one.example/sub",
        tag: "A",
        nameTemplate: "{tag}-{name}",
        useProxyProviders: true,
        userinfoUrl: "https://one.example/userinfo",
        userinfoUserAgent: "Clash.Meta",
      }),
      expect.objectContaining({ id: "yaml-current", type: "yaml", content: "proxies: []", lastParsedContent: "proxies: []" }),
      expect.objectContaining({ id: "nodes-current", type: "nodes", content: "ss://node", lastParsedContent: "ss://node" }),
    ]);
    expect(mocks.bag.storeState.nodes).toEqual([
      expect.objectContaining({ name: "Active", _originName: "Active" }),
    ]);
    expect(mocks.bag.storeState.deletedNodes).toEqual([{ originName: "Gone", name: "Gone" }]);
    expect(mocks.bag.storeState.listenerPorts).toEqual({ Active: 41000 });
    expect(options.setEditingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ autoUpdateInterval: 30, smartNodeMatchingEnabled: true })
    );
  });

  it("rebuilds config sources with stable and candidate ids", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: {
            id: "sub-1",
            token: "token-1",
            urls: [],
            nodes: [node("A", { _sourceIds: ["source-b"] }), node("B", { _sourceIds: ["source-a"] })],
            config: {
              sources: [
                {
                  type: "url",
                  content: " https://b.example/sub ",
                  lastParsedContent: " https://b.example/last ",
                  lastParsedTag: "B",
                  lastParsedNameTemplate: "{name}",
                },
                {
                  type: "url",
                  content: " https://a.example/sub ",
                  userinfoUrl: "",
                  userinfoUserAgent: "",
                },
                { type: "yaml", content: "proxies: []" },
                { type: "nodes", content: "ss://node" },
                { id: "bad", type: "url", content: "" },
                { type: "bad", content: "ignored" },
              ],
            },
          },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(options.setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "sub-src-1700000000000-0",
        type: "url",
        content: "https://b.example/sub",
        lastParsedContent: "https://b.example/last",
        lastParsedTag: "B",
        lastParsedNameTemplate: "{name}",
      }),
      expect.objectContaining({
        id: "sub-src-1700000000000-1",
        type: "url",
        content: "https://a.example/sub",
        lastParsedContent: "https://a.example/sub",
      }),
      expect.objectContaining({
        id: "sub-src-1700000000000-2",
        type: "yaml",
        content: "proxies: []",
      }),
      expect.objectContaining({
        id: "sub-src-1700000000000-3",
        type: "nodes",
        content: "ss://node",
      }),
    ]);
  });

  it("reports malformed subscription payloads through toast", async () => {
    const options = makeOptions({
      loadSubscription: vi.fn(async () =>
        response(200, {
          subscription: { id: "sub-1", name: "Broken" },
        })
      ),
    });

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(mocks.toast).toHaveBeenCalledWith({
      title: "订阅数据不完整",
      variant: "destructive",
    });
    expect(options.setEditingSubscription).toHaveBeenCalledWith(null);
  });

  it("reports missing loaders, rejected loaders, and non-ok responses", async () => {
    const missingLoader = makeOptions({ loadSubscription: undefined });
    useEditingSubscriptionLoader(missingLoader);
    await flushAsync();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "当前应用未配置订阅加载接口",
      variant: "destructive",
    });
    expect(missingLoader.setEditingSubscription).toHaveBeenCalledWith(null);

    vi.clearAllMocks();
    const rejectedLoader = makeOptions({
      loadSubscription: vi.fn(async () => {
        throw "network";
      }),
    });
    useEditingSubscriptionLoader(rejectedLoader);
    await flushAsync();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "加载订阅失败", variant: "destructive" });

    vi.clearAllMocks();
    const nonOk = makeOptions({
      loadSubscription: vi.fn(async () => response(500, { error: "服务异常" })),
    });
    useEditingSubscriptionLoader(nonOk);
    await flushAsync();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "服务异常", variant: "destructive" });
  });

  it("skips final state updates after cleanup cancels the load", async () => {
    let resolveLoad: (value: Response) => void = () => undefined;
    const options = makeOptions({
      loadSubscription: vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveLoad = resolve;
          })
      ),
    });

    useEditingSubscriptionLoader(options);
    expect(mocks.bag.effectCleanups).toHaveLength(1);
    mocks.bag.effectCleanups[0]();
    resolveLoad(
      response(200, {
        subscription: {
          id: "sub-1",
          token: "token-1",
          urls: [],
          nodes: [],
          config: {},
        },
      })
    );
    await flushAsync();

    expect(options.setEditingSubscription).not.toHaveBeenCalled();
    expect(mocks.bag.stateSetters[0]).toHaveBeenCalledWith(true);
    expect(mocks.bag.stateSetters[0]).not.toHaveBeenCalledWith(false);
  });
});
