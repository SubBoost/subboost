import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import { useEditingSubscriptionLoader } from "@subboost/ui/product/home/use-editing-subscription-loader";

const mocks = vi.hoisted(() => {
  const bag: {
    storeState: Record<string, unknown>;
    effectCleanups: Array<() => void>;
  } = {
    storeState: {},
    effectCleanups: [],
  };
  const useConfigStore = vi.fn() as ReturnType<typeof vi.fn> & {
    getState: ReturnType<typeof vi.fn>;
    setState: ReturnType<typeof vi.fn>;
  };
  useConfigStore.getState = vi.fn(() => bag.storeState);
  useConfigStore.setState = vi.fn((updater: unknown) => {
    const patch = typeof updater === "function"
      ? (updater as (state: Record<string, unknown>) => Record<string, unknown>)(bag.storeState)
      : updater;
    bag.storeState = { ...bag.storeState, ...(patch as Record<string, unknown>) };
  });
  return {
    bag,
    useConfigStore,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    useEffect: vi.fn((effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") bag.effectCleanups.push(cleanup);
    }),
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

function node(name: string, sourceId: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase()}.example.test`,
    port: 443,
    cipher: "aes-128-gcm",
    password: "test-only",
    _originName: name,
    _sourceIds: [sourceId],
  } as unknown as ParsedNode;
}

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

function resetStoreState() {
  mocks.bag.storeState = {
    reset: vi.fn(),
    generateConfig: vi.fn(),
    sources: [
      {
        id: "current-1",
        type: "url",
        content: " invalid first url ",
        lastParsedContent: " invalid previous url ",
        userinfoUrl: " invalid userinfo url ",
      },
      {
        id: "current-2",
        type: "url",
        content: " invalid second url ",
      },
      {
        id: "current-yaml",
        type: "yaml",
        content: "proxies: []",
      },
    ],
    nodes: [],
    enabledProxyGroups: ["select", "auto"],
    hiddenProxyGroups: [],
    customRules: [],
    customProxyGroups: [],
    customRuleSets: [],
    builtinRuleEdits: {},
    proxyGroupAdvanced: {},
    proxyGroupNameOverrides: {},
    proxyGroupOrder: [],
    ruleOrder: [],
    deletedNodeNames: [],
    deletedNodes: [],
    listenerPorts: {},
    groupListeners: [],
    dialerProxyGroups: [],
    appliedTemplateId: null,
    moduleRuleEditWarningAccepted: false,
    experimentalCnUseCnRuleSet: false,
    cnIpNoResolve: true,
    dnsYaml: "",
    ruleProviderBaseUrl: "",
    testUrl: "",
    testInterval: 300,
  };
}

async function flushAsync() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe("editing subscription loader state normalization", () => {
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bag.effectCleanups = [];
    resetStoreState();
    originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "" } },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("normalizes saved configuration without borrowing current mixed sources", async () => {
    const setStoreSources = vi.fn();
    const setEditingSubscription = vi.fn();
    const options = {
      editSubscriptionId: "sub-1",
      loadSubscription: vi.fn(async () =>
        response({
          subscription: {
            id: "sub-1",
            token: "token-1",
            name: "State coverage",
            urls: ["invalid first url", "invalid second url", 123],
            nodes: [node("Alpha", "current-1"), node("Beta", "current-2")],
            config: {
              proxyGroupAdvanced: {
                " group ": { includeRegex: " Alpha " },
                " empty ": {},
                " ": { excludeRegex: "Beta" },
              },
              groupListeners: [
                null,
                {},
                { target: { kind: "bad", id: "ignored" }, port: 41000 },
                { target: { kind: "module", id: 7 }, port: 41001 },
                { target: { kind: "custom", id: " " }, port: 41002 },
                {
                  id: " explicit ",
                  target: { kind: "module", id: " select " },
                  port: 41003,
                  enabled: false,
                  allowLan: true,
                },
                { id: " ", target: { kind: "custom", id: " custom " }, port: 41004 },
                { target: { kind: "custom", id: "custom" }, port: 41005 },
                { target: { kind: "dialer", id: "dialer" }, port: 70000 },
              ],
            },
          },
        })
      ),
      loginHref: "/login",
      setCopied: vi.fn(),
      setEditingSubscription,
      setStoreSources,
      setSubscriptionName: vi.fn(),
      setSubscriptionUrl: vi.fn(),
    };

    useEditingSubscriptionLoader(options);
    await flushAsync();

    expect(setStoreSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "sub-url-1",
        content: "invalid first url",
        lastParsedContent: "invalid first url",
      }),
      expect.objectContaining({
        id: "sub-url-2",
        content: "invalid second url",
        lastParsedContent: "invalid second url",
      }),
    ]);
    expect(mocks.bag.storeState.proxyGroupAdvanced).toEqual({
      group: { includeRegex: "Alpha" },
    });
    expect(mocks.bag.storeState.groupListeners).toEqual([
      {
        id: "explicit",
        target: { kind: "module", id: "select" },
        port: 41003,
        enabled: false,
        allowLan: true,
      },
      {
        id: "group_listener_7",
        target: { kind: "custom", id: "custom" },
        port: 41004,
      },
    ]);
    expect(setEditingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub-1", token: "token-1" })
    );
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "节点来源信息缺失", variant: "warning" }));
  });
});
