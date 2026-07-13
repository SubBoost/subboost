import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "./definitions";
import {
  AUTH_CONFIG_HANDOFF_STORAGE_NAME,
  captureAuthConfigHandoff,
  consumeAuthConfigHandoff,
  hasAuthConfigHandoff,
} from "./auth-handoff";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

function installStorage(storage: ReturnType<typeof createStorage> | null) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  });
}

function meaningfulState(overrides: Record<string, unknown> = {}) {
  return {
    ...structuredClone(initialState),
    sources: [
      {
        id: "source-1",
        type: "url",
        content: "https://example.com/sub",
        name: "Source",
        lastParsedContent: "https://example.com/sub",
        lastParsedTag: "A",
        lastParsedNameTemplate: "{tag}-{name}",
        tag: "A",
        nameTemplate: "{tag}-{name}",
        useProxyProviders: true,
        userinfoUrl: "https://example.com/userinfo",
        userinfoUserAgent: "Clash.Meta",
        parsed: true,
        nodeCount: 2,
        subscriptionUserInfo: { download: 1, total: 2 },
      },
    ],
    nodes: [{ name: "Node A" }],
    deletedNodeNames: ["Gone"],
    deletedNodes: [{ originName: "Gone", name: "Gone" }],
    customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "Proxy" }],
    customProxyGroups: [{ id: "custom-1", name: "Custom", emoji: "", groupType: "select" }],
    proxyGroupAdvanced: { ai: { includeRegex: "AI" } },
    proxyGroupAdvancedModeEnabled: true,
    customRuleSets: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 Labs" }],
    builtinRuleEdits: { "module:ai:openai": { enabled: false } },
    dialerProxyGroups: [{ id: "dialer-1", name: "Relay", relayNodes: ["Node A"], targetNodes: [] }],
    proxyGroupNameOverrides: { ai: "Labs" },
    proxyGroupOrder: ["module:ai"],
    ruleOrder: ["module:ai:openai"],
    moduleRuleEditWarningAccepted: true,
    appliedTemplateId: "template-1",
    template: "full",
    enabledProxyGroups: ["select", "auto", "ai"],
    hiddenProxyGroups: ["youtube"],
    dnsYaml: "dns: {}",
    mixedPort: 7891,
    allowLan: true,
    testUrl: "https://test.example.com",
    testInterval: 600,
    ruleProviderBaseUrl: "https://rules.example.com",
    cnIpNoResolve: false,
    experimentalCnUseCnRuleSet: true,
    listenerPorts: { "Node A": 41000 },
    groupListeners: [{ id: "gl-1", target: "Relay", port: 42000 }],
    ...overrides,
  } as any;
}

describe("auth config handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete (globalThis as any).window;
  });

  it("does nothing when session storage is unavailable", () => {
    expect(hasAuthConfigHandoff()).toBe(false);
    expect(consumeAuthConfigHandoff()).toBeNull();
    expect(() => captureAuthConfigHandoff(meaningfulState())).not.toThrow();

    installStorage(null);
    expect(hasAuthConfigHandoff()).toBe(false);
    expect(consumeAuthConfigHandoff()).toBeNull();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get sessionStorage() {
          throw new Error("blocked");
        },
      },
    });

    expect(hasAuthConfigHandoff()).toBe(false);
    expect(consumeAuthConfigHandoff()).toBeNull();
  });

  it("removes stored handoff when the config has no meaningful changes", () => {
    const storage = createStorage({ [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: "old" });
    installStorage(storage);

    captureAuthConfigHandoff(structuredClone(initialState) as any);

    expect(storage.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("captures and consumes a meaningful config snapshot", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const storage = createStorage();
    installStorage(storage);

    captureAuthConfigHandoff(meaningfulState());
    expect(storage.setItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME, expect.any(String));
    expect(hasAuthConfigHandoff()).toBe(true);

    const consumed = consumeAuthConfigHandoff();

    expect(consumed).toMatchObject({
      sources: [
        expect.objectContaining({
          id: "source-1",
          type: "url",
          content: "https://example.com/sub",
          useProxyProviders: true,
          subscriptionUserInfo: { download: 1, total: 2 },
        }),
      ],
      nodes: [{ name: "Node A" }],
      deletedNodeNames: ["Gone"],
      deletedNodes: [{ originName: "Gone", name: "Gone" }],
      template: "full",
      enabledProxyGroups: ["select", "auto", "ai"],
      hiddenProxyGroups: ["youtube"],
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "Proxy" }],
      customProxyGroups: [{ id: "custom-1", name: "Custom", emoji: "", groupType: "select" }],
      proxyGroupAdvanced: { ai: { includeRegex: "AI" } },
      proxyGroupAdvancedModeEnabled: true,
      customRuleSets: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 Labs" }],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      proxyGroupNameOverrides: { ai: "Labs" },
      proxyGroupOrder: ["module:ai"],
      ruleOrder: ["module:ai:openai"],
      moduleRuleEditWarningAccepted: true,
      appliedTemplateId: "template-1",
      dnsYaml: "dns: {}",
      mixedPort: 7891,
      allowLan: true,
      testUrl: "https://test.example.com",
      testInterval: 600,
      ruleProviderBaseUrl: "https://rules.example.com",
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
      listenerPorts: { "Node A": 41000 },
      groupListeners: [{ id: "gl-1", target: "Relay", port: 42000 }],
    });
    expect(storage.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
  });

  it("falls back to empty captured sources when the current source list is malformed", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const storage = createStorage();
    installStorage(storage);

    captureAuthConfigHandoff(meaningfulState({ sources: [{ id: "bad", type: "bad", content: "x" }], nodes: [{ name: "Node A" }] }));
    const consumed = consumeAuthConfigHandoff();

    expect(consumed).toMatchObject({
      sources: [],
      nodes: [{ name: "Node A" }],
    });
  });

  it("cleans up expired, malformed, and unwritable handoff data", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_700_001);
    const expired = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: JSON.stringify({
        version: 1,
        createdAt: 1_700_000_000_000,
        state: meaningfulState(),
      }),
    });
    installStorage(expired);
    expect(hasAuthConfigHandoff()).toBe(false);
    expect(expired.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);

    const malformed = createStorage({ [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: "{bad" });
    installStorage(malformed);
    expect(consumeAuthConfigHandoff()).toBeNull();
    expect(malformed.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);

    const wrongVersion = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: JSON.stringify({ version: 99, createdAt: Date.now(), state: {} }),
    });
    installStorage(wrongVersion);
    expect(hasAuthConfigHandoff()).toBe(false);
    expect(wrongVersion.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);

    const invalidCreatedAt = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: JSON.stringify({ version: 1, createdAt: "now", state: {} }),
    });
    installStorage(invalidCreatedAt);
    expect(hasAuthConfigHandoff()).toBe(false);
    expect(invalidCreatedAt.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);

    const unwritable = createStorage();
    unwritable.setItem.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    installStorage(unwritable);
    captureAuthConfigHandoff(meaningfulState());
    expect(unwritable.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);

    const unreadable = createStorage();
    unreadable.getItem.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    installStorage(unreadable);
    expect(consumeAuthConfigHandoff()).toBeNull();
    expect(unreadable.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
  });

  it("normalizes only valid fields from stored state", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const storage = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: JSON.stringify({
        version: 1,
        createdAt: 1_700_000_000_000,
        state: {
          sources: [{ id: "bad", type: "bad", content: "x" }],
          nodes: [{ name: "Node" }, "bad"],
          deletedNodeNames: ["Gone", 1],
          deletedNodes: [{ originName: "Gone" }],
          template: "bad",
          enabledProxyGroups: ["select", 1],
          hiddenProxyGroups: "bad",
          customProxyGroups: [{ id: "custom" }],
          proxyGroupAdvancedModeEnabled: true,
          customRuleSets: [
            {
              id: "custom-ai",
              name: "Custom AI",
              behavior: "domain",
              path: "geosite/custom-ai.mrs",
              target: "Labs",
            },
          ],
          builtinRuleEdits: { "module:ai:openai": { enabled: false } },
          customRules: [{ id: "rule" }],
          dialerProxyGroups: [{ id: "dialer" }],
          proxyGroupNameOverrides: { ai: "Labs", bad: 1 },
          proxyGroupOrder: ["module:ai", 1],
          ruleOrder: ["rule", 2],
          moduleRuleEditWarningAccepted: false,
          appliedTemplateId: null,
          dnsYaml: "dns: {}",
          mixedPort: 7890,
          allowLan: true,
          testUrl: "https://test.example.com",
          testInterval: Number.NaN,
          ruleProviderBaseUrl: "https://rules.example.com",
          cnIpNoResolve: false,
          experimentalCnUseCnRuleSet: true,
          listenerPorts: { A: 41000, B: Number.NaN },
        },
      }),
    });
    installStorage(storage);

    const consumed = consumeAuthConfigHandoff();

    expect(consumed).toEqual({
      deletedNodeNames: ["Gone"],
      deletedNodes: [{ originName: "Gone" }],
      enabledProxyGroups: ["select"],
      customProxyGroups: [],
      proxyGroupAdvancedModeEnabled: true,
      customRuleSets: [
        {
          id: "custom-ai",
          name: "Custom AI",
          behavior: "domain",
          path: "geosite/custom-ai.mrs",
          target: "Labs",
        },
      ],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      customRules: [{ id: "rule" }],
      dialerProxyGroups: [{ id: "dialer" }],
      proxyGroupOrder: ["module:ai"],
      ruleOrder: ["rule"],
      moduleRuleEditWarningAccepted: false,
      appliedTemplateId: null,
      dnsYaml: "dns: {}",
      mixedPort: 7890,
      allowLan: true,
      testUrl: "https://test.example.com",
      ruleProviderBaseUrl: "https://rules.example.com",
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
    });
  });

  it("normalizes valid sources while dropping invalid optional source fields", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const storage = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: JSON.stringify({
        version: 1,
        createdAt: 1_700_000_000_000,
        state: {
          sources: [
            {
              id: "source-1",
              type: "url",
              content: "https://example.com/sub",
              parsed: "yes",
              nodeCount: Number.NaN,
              subscriptionUserInfo: "bad",
            },
          ],
        },
      }),
    });
    installStorage(storage);

    const consumed = consumeAuthConfigHandoff();

    expect(consumed).toEqual({
      sources: [{ id: "source-1", type: "url", content: "https://example.com/sub" }],
    });
  });
});
