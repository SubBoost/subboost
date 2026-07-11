import { vi } from "vitest";
import type { HomeSubscriptionAdapter } from "./use-subscription-link";

export function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

export function makeAdapter(overrides: Partial<HomeSubscriptionAdapter> = {}): HomeSubscriptionAdapter {
  return {
    loginHref: "/login",
    acceptSaveRequirement: vi.fn(async () => response(200, { ok: true })),
    saveSubscription: vi.fn(async () =>
      response(200, {
        subscription: {
          token: "token-1",
          subscriptionUrl: "https://subboost.test/s/token-1",
        },
      })
    ),
    ...overrides,
  };
}

export function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    authChecked: true,
    user: { id: "user-1", isAdmin: false, saveRequirementSatisfied: true },
    fetchUser: vi.fn(),
    clearUser: vi.fn(),
    subscriptionAdapter: makeAdapter(),
    generatedYaml: "proxies: []",
    editingSubscription: null,
    setEditingSubscription: vi.fn(),
    appliedTemplateId: "template-1",
    template: "full",
    storeSources: [
      {
        id: "source-url",
        type: "url",
        content: " https://airport.example/sub ",
        tag: "A",
        nameTemplate: "{tag}-{name}",
        userinfoUrl: " https://airport.example/userinfo ",
        userinfoUserAgent: " Clash.Meta ",
        subscriptionUserInfo: { upload: 2_048, download: 1_024, total: 4_096 },
      },
    ],
    nodes: [{ name: "Node A", type: "ss", server: "example.com", port: 443, _sourceIds: ["source-url"] }],
    deletedNodeNames: [],
    deletedNodes: [],
    enabledProxyGroups: ["select", "auto"],
    hiddenProxyGroups: [],
    customRules: [],
    customProxyGroups: [],
    customRuleSets: [],
    builtinRuleEdits: {},
    ruleOrder: [],
    moduleRuleEditWarningAccepted: false,
    dialerProxyGroups: [],
    proxyGroupNameOverrides: {},
    listenerPorts: { "Node A": 41000 },
    dnsYaml: "dns: {}",
    ruleProviderBaseUrl: "https://rules.example.com",
    testUrl: "https://test.example.com",
    testInterval: 600,
    urlTestLazy: true,
    urlTestTolerance: 50,
    cnIpNoResolve: true,
    experimentalCnUseCnRuleSet: false,
    ...overrides,
  } as any;
}
