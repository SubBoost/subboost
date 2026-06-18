import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  clearNodes: vi.fn(),
  clearUser: vi.fn(),
  configSetState: vi.fn(),
  consumeAuthConfigHandoff: vi.fn(),
  fetchUser: vi.fn(),
  generateConfig: vi.fn(),
  handleAcceptSaveRequirement: vi.fn(),
  handleDownload: vi.fn(),
  handleGenerate: vi.fn(),
  loadSubscription: vi.fn(),
  parseMultipleSources: vi.fn(),
  setConfigDraftUserScope: vi.fn(),
  setCopied: vi.fn(),
  setEditingSubscription: vi.fn(),
  setSaveRequirementDialog: vi.fn(),
  setSources: vi.fn(),
  setSubscriptionName: vi.fn(),
  setSubscriptionUrl: vi.fn(),
  user: { id: "user-1", aiAssistantEnabled: true } as any,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "editSubscriptionId" ? "sub-1" : null),
  }),
}));

vi.mock("@subboost/ui/store/config-store", () => {
  const state = {
    nodes: [{ name: "Node" }],
    deletedNodeNames: [],
    deletedNodes: [],
    generatedYaml: "proxies: []",
    generatedYamlError: null,
    isLoading: false,
    sources: [{ id: "s1", type: "url", content: "https://example.com/sub" }],
    setSources: mocks.setSources,
    parseMultipleSources: mocks.parseMultipleSources,
    clearNodes: mocks.clearNodes,
    generateConfig: mocks.generateConfig,
    template: "minimal",
    enabledProxyGroups: ["PROXY"],
    hiddenProxyGroups: [],
    customProxyGroups: [],
    moduleRuleOverrides: {},
    moduleRuleExclusions: {},
    moduleRuleEditWarningAccepted: false,
    customRules: [],
    ruleOrder: [],
    allRulesOrderEditingEnabled: false,
    dialerProxyGroups: [],
    listenerPorts: {},
    dnsYaml: "",
    ruleProviderBaseUrl: "",
    testUrl: "https://cp.cloudflare.com/generate_204",
    testInterval: 300,
    cnIpNoResolve: false,
    experimentalCnUseCnRuleSet: false,
    proxyGroupNameOverrides: {},
    appliedTemplateId: "builtin:minimal",
  };
  const useConfigStore = () => state;
  (useConfigStore as any).setState = mocks.configSetState;
  (useConfigStore as any).getState = () => ({ generateConfig: mocks.generateConfig });
  return {
    setConfigDraftUserScope: mocks.setConfigDraftUserScope,
    useConfigStore,
  };
});

vi.mock("@subboost/ui/store/config-store/auth-handoff", () => ({
  consumeAuthConfigHandoff: mocks.consumeAuthConfigHandoff,
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => ({
    user: mocks.user,
    fetchUser: mocks.fetchUser,
    clearUser: mocks.clearUser,
  }),
}));

vi.mock("@subboost/ui/store/ui-store", () => ({
  useUIStore: (selector: (state: any) => unknown) =>
    selector({
      editingSubscription: { id: "sub-1", name: "Existing" },
      setEditingSubscription: mocks.setEditingSubscription,
    }),
}));

vi.mock("@subboost/ui/product/home/use-subscription-link", () => ({
  useSubscriptionLink: vi.fn(() => ({
    saveRequirementDialog: true,
    setSaveRequirementDialog: mocks.setSaveRequirementDialog,
    handleAcceptSaveRequirement: mocks.handleAcceptSaveRequirement,
    setSubscriptionName: mocks.setSubscriptionName,
    setSubscriptionUrl: mocks.setSubscriptionUrl,
    setCopied: mocks.setCopied,
  })),
}));

vi.mock("@subboost/ui/product/home/use-clean-new-subscription-intent", () => ({
  useCleanNewSubscriptionIntent: vi.fn((props: any) => {
    mocks.captures.cleanIntent = props;
  }),
}));

vi.mock("@subboost/ui/product/home/use-editing-subscription-loader", () => ({
  useEditingSubscriptionLoader: vi.fn((props: any) => {
    mocks.captures.editingLoader = props;
    return false;
  }),
}));

vi.mock("@subboost/ui/product/home/use-home-actions", () => ({
  useHomeActions: vi.fn((props: any) => {
    mocks.captures.homeActions = props;
    return {
      handleDownload: mocks.handleDownload,
      handleGenerate: mocks.handleGenerate,
      hasValidSources: true,
    };
  }),
}));

vi.mock("@subboost/ui/product/api-adapter", () => ({
  ProductApiAdapterProvider: ({ adapter, children }: React.PropsWithChildren<{ adapter?: unknown }>) => {
    mocks.captures.productApiAdapter = adapter;
    return React.createElement(React.Fragment, null, children);
  },
}));

vi.mock("@subboost/ui/product/interactions", () => ({
  ProductInteractionAdapterProvider: ({ adapter, children }: React.PropsWithChildren<{ adapter?: unknown }>) => {
    mocks.captures.interactions = adapter;
    return React.createElement(React.Fragment, null, children);
  },
}));

vi.mock("@subboost/ui/product/home/home-layout", () => ({
  HomeLayout: (props: any) => {
    mocks.captures.homeLayout = props;
    return React.createElement("section", null, props.noticeSlot, props.saveRequirementSlot, props.generatedYaml);
  },
}));

import { HomeSurface } from "./home-surface";

describe("HomeSurface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = {};
    mocks.user = { id: "user-1", aiAssistantEnabled: true };
    mocks.fetchUser.mockResolvedValue(undefined);
    mocks.consumeAuthConfigHandoff.mockReturnValue(null);
  });

  async function flushAsync() {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  }

  it("wires product adapters, home hooks, layout slots, and auth effects", async () => {
    const productApi = { sourceImport: { importSource: vi.fn() } };
    const interactions = { sourceAdded: vi.fn() };
    const adapter = {
      productApi,
      interactions,
      subscription: { loginHref: "/login" },
      loadSubscription: mocks.loadSubscription,
      loginHref: "/service-login",
      recordConfigDownload: vi.fn(),
      onConfigImport: vi.fn(),
      onConfigExport: vi.fn(),
      renderNotice: ({ user, showAiColumn }: any) => `notice:${user.id}:${showAiColumn}`,
      renderAnnouncement: vi.fn(),
      renderSaveRequirementDialog: ({ open }: any) => `save:${open}`,
    };

    const html = renderToStaticMarkup(React.createElement(HomeSurface, { adapter }));
    await flushAsync();

    expect(html).toContain("notice:user-1:true");
    expect(html).toContain("save:true");
    expect(html).toContain("proxies: []");
    expect(mocks.captures.productApiAdapter).toBe(productApi);
    expect(mocks.captures.interactions).toBe(interactions);
    expect(mocks.captures.homeActions).toMatchObject({
      generatedYaml: "proxies: []",
      appliedTemplateId: "builtin:minimal",
      storeSources: [{ id: "s1", type: "url", content: "https://example.com/sub" }],
    });
    expect(mocks.captures.cleanIntent).toMatchObject({
      authChecked: false,
      setCopied: mocks.setCopied,
      setEditingSubscription: mocks.setEditingSubscription,
    });
    expect(mocks.captures.editingLoader).toMatchObject({
      editSubscriptionId: "sub-1",
      loginHref: "/service-login",
      loadSubscription: mocks.loadSubscription,
    });
    expect(mocks.captures.homeLayout).toMatchObject({
      showAiColumn: true,
      editSubscriptionId: "sub-1",
      hasValidSources: true,
      handleGenerate: mocks.handleGenerate,
      handleDownload: mocks.handleDownload,
      onConfigImport: adapter.onConfigImport,
      onConfigExport: adapter.onConfigExport,
    });
    expect(mocks.fetchUser).toHaveBeenCalled();
    expect(mocks.setConfigDraftUserScope).toHaveBeenCalledWith("user-1");
    expect(mocks.consumeAuthConfigHandoff).toHaveBeenCalled();
    expect(mocks.configSetState).not.toHaveBeenCalled();
    expect(mocks.captures.cleanIntent.authChecked).toBe(false);
  });

  it("uses subscription login fallback and skips handoff when no user is signed in", async () => {
    mocks.user = null;
    mocks.fetchUser.mockRejectedValueOnce(new Error("offline"));
    const adapter = {
      subscription: { loginHref: "/subscription-login" },
      renderNotice: ({ user, showAiColumn }: any) => `notice:${String(user)}:${showAiColumn}`,
    };

    const html = renderToStaticMarkup(React.createElement(HomeSurface, { adapter }));
    await flushAsync();

    expect(html).toContain("notice:null:false");
    expect(mocks.captures.editingLoader.loginHref).toBe("/subscription-login");
    expect(mocks.setConfigDraftUserScope).toHaveBeenCalledWith(null);
    expect(mocks.consumeAuthConfigHandoff).not.toHaveBeenCalled();
    expect(mocks.configSetState).not.toHaveBeenCalled();
  });

  it("restores captured auth handoff config for signed-in users", () => {
    mocks.consumeAuthConfigHandoff.mockReturnValueOnce({ nodes: [{ name: "Restored" }], generatedYaml: "old" });

    renderToStaticMarkup(React.createElement(HomeSurface));

    expect(mocks.configSetState).toHaveBeenCalledWith(expect.any(Function));
    const updated = mocks.configSetState.mock.calls[0][0]({ previous: true });
    expect(updated).toEqual(expect.objectContaining({
      previous: true,
      nodes: [{ name: "Restored" }],
      parseErrors: [],
      isLoading: false,
      generatedYaml: "",
      generatedYamlError: null,
      history: [],
      historyIndex: -1,
    }));
    expect(mocks.generateConfig).toHaveBeenCalled();
  });
});
