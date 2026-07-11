import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscriptionLink } from "./use-subscription-link";
import { makeAdapter, makeOptions, response } from "./use-subscription-link.test-helpers";

const mocks = vi.hoisted(() => {
  const bag: {
    state: unknown[];
    stateIndex: number;
    storeState: any;
    interactions: Record<string, ReturnType<typeof vi.fn>>;
  } = {
    state: [],
    stateIndex: 0,
    storeState: {},
    interactions: {
      saveRequirementAccepted: vi.fn(),
      subscriptionLinkCopied: vi.fn(),
      subscriptionLinkIntent: vi.fn(),
      subscriptionLinkSaved: vi.fn(),
    },
  };

  const useConfigStore = vi.fn() as any;
  useConfigStore.getState = vi.fn(() => bag.storeState);

  return {
    bag,
    captureAuthConfigHandoff: vi.fn(),
    getNodeSourceIds: vi.fn((node: any) => (Array.isArray(node?._sourceIds) ? node._sourceIds : [])),
    toast: vi.fn(),
    useConfigStore,
    useProductInteractionAdapter: vi.fn(() => bag.interactions),
    useCallback: vi.fn((callback: unknown) => callback),
    useMemo: vi.fn((factory: () => unknown) => factory()),
    useState: vi.fn((initial: unknown) => {
      const index = bag.stateIndex;
      if (bag.state.length <= index) {
        bag.state.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      }
      const setter = vi.fn((next: unknown) => {
        bag.state[index] = typeof next === "function" ? (next as (current: unknown) => unknown)(bag.state[index]) : next;
      });
      bag.stateIndex += 1;
      return [bag.state[index], setter];
    }),
  };
});

vi.mock("react", () => ({
  useCallback: mocks.useCallback,
  useMemo: mocks.useMemo,
  useState: mocks.useState,
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({
  ToastAction: "ToastAction",
  toast: mocks.toast,
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  getNodeSourceIds: mocks.getNodeSourceIds,
  useConfigStore: mocks.useConfigStore,
}));

vi.mock("@subboost/ui/store/config-store/auth-handoff", () => ({
  captureAuthConfigHandoff: mocks.captureAuthConfigHandoff,
}));

vi.mock("@subboost/core/time/beijing", () => ({
  formatDateInBeijing: () => "2026-06-06",
}));

vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: mocks.useProductInteractionAdapter,
}));

vi.mock("@subboost/core/subscription/auto-update-interval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@subboost/core/subscription/auto-update-interval")>();
  return actual;
});

function resetHookState() {
  mocks.bag.state = [];
  mocks.bag.stateIndex = 0;
}

function useRenderedHook(overrides: Record<string, unknown> = {}) {
  mocks.bag.stateIndex = 0;
  return useSubscriptionLink(makeOptions(overrides));
}

describe("useSubscriptionLink", () => {
  let originalWindow: typeof globalThis.window | undefined;
  let originalNavigator: typeof globalThis.navigator | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHookState();
    mocks.bag.storeState = {
      proxyGroupAdvanced: { auto: { includeRegex: "Fast" } },
      proxyGroupAdvancedModeEnabled: true,
      proxyGroupOrder: ["select", "auto"],
    };
    originalWindow = globalThis.window;
    originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "" } },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: vi.fn(async () => undefined) } },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  it("blocks subscription generation until auth and config are ready", () => {
    useRenderedHook({ authChecked: false }).handleGenerateSubscription("quick");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "正在确认登录状态，请稍后再试" }));
    expect(mocks.bag.interactions.subscriptionLinkIntent).toHaveBeenCalledWith({
      mode: "quick",
      result: "blockedAuth",
    });

    resetHookState();
    useRenderedHook({ generatedYaml: "" }).handleGenerateSubscription("advanced");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "请先生成配置后再生成订阅链接" }));
    expect(mocks.bag.interactions.subscriptionLinkIntent).toHaveBeenCalledWith({
      mode: "advanced",
      result: "blockedNoConfig",
    });
  });

  it("shows the login action and captures the current draft for guests", () => {
    useRenderedHook({ user: null }).handleGenerateSubscription("quick");

    const loginToast = mocks.toast.mock.calls.at(-1)?.[0] as any;
    loginToast.action.props.onClick();

    expect(mocks.captureAuthConfigHandoff).toHaveBeenCalledWith(mocks.bag.storeState);
    expect(globalThis.window.location.href).toBe("/login");
  });

  it("opens the dialog for ready users and initializes editing state", () => {
    const editingSubscription = {
      id: "sub-1",
      token: "old-token",
      name: "",
      autoUpdateInterval: 7200,
      smartNodeMatchingEnabled: false,
    };
    let hook = useRenderedHook({ editingSubscription });

    hook.handleGenerateSubscription("advanced");
    hook = useRenderedHook({ editingSubscription });

    expect(hook.subscriptionDialog).toBe(true);
    expect(hook.subscriptionName).toBe("");
    expect(hook.autoUpdateEnabled).toBe(true);
    expect(hook.autoUpdateHours).toBe(12);
    expect(hook.smartNodeMatchingEnabled).toBe(false);
    expect(mocks.bag.interactions.subscriptionLinkIntent).toHaveBeenCalledWith({
      mode: "advanced",
      result: "opened",
    });
  });

  it("opens the save requirement flow and continues after acceptance", async () => {
    const fetchUser = vi.fn(async () => undefined);
    const adapter = makeAdapter();
    let hook = useRenderedHook({
      fetchUser,
      subscriptionAdapter: adapter,
      user: { id: "user-1", saveRequirementSatisfied: false },
    });

    hook.handleGenerateSubscription("quick");
    hook = useRenderedHook({
      fetchUser,
      subscriptionAdapter: adapter,
      user: { id: "user-1", saveRequirementSatisfied: false },
    });

    expect(hook.saveRequirementDialog).toBe(true);
    await hook.handleAcceptSaveRequirement();
    hook = useRenderedHook({ fetchUser, subscriptionAdapter: adapter });

    expect(adapter.acceptSaveRequirement).toHaveBeenCalled();
    expect(fetchUser).toHaveBeenCalled();
    expect(hook.subscriptionDialog).toBe(true);
    expect(hook.subscriptionName).toBe("我的配置 2026-06-06");
  });

  it("handles missing, failed, and rejected save requirement acceptance", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchUser = vi.fn(async () => undefined);

    await useRenderedHook({ subscriptionAdapter: { loginHref: "/login" } }).handleAcceptSaveRequirement();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "当前应用未配置保存前置确认接口", variant: "destructive" })
    );

    const failedAdapter = makeAdapter({ acceptSaveRequirement: vi.fn(async () => response(403, { error: "blocked" })) });
    await useRenderedHook({ fetchUser, subscriptionAdapter: failedAdapter }).handleAcceptSaveRequirement();
    expect(fetchUser).not.toHaveBeenCalled();

    const error = new Error("accept offline");
    const rejectedAdapter = makeAdapter({ acceptSaveRequirement: vi.fn(async () => { throw error; }) });
    await useRenderedHook({ subscriptionAdapter: rejectedAdapter }).handleAcceptSaveRequirement();
    expect(console.error).toHaveBeenCalledWith("Accept save requirement error:", error);
  });

  it("saves a normalized subscription payload and tracks success", async () => {
    const adapter = makeAdapter();
    let hook = useRenderedHook({ subscriptionAdapter: adapter });
    hook.setSubscriptionName(" My Sub ");
    hook.setAutoUpdateEnabled(true);
    hook.setAutoUpdateHours(24);
    hook = useRenderedHook({ subscriptionAdapter: adapter });

    await hook.handleCreateSubscription();
    hook = useRenderedHook({ subscriptionAdapter: adapter });

    expect(adapter.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        isEditing: false,
        subscriptionId: null,
        payload: expect.objectContaining({
          name: " My Sub ",
          templateId: "template-1",
          autoUpdateInterval: 86_400,
          urls: ["https://airport.example/sub"],
          subscriptionInfo: { upload: 2_048, download: 1_024, total: 4_096 },
          config: expect.objectContaining({
            sources: [
              expect.objectContaining({
                content: "https://airport.example/sub",
                userinfoUrl: "https://airport.example/userinfo",
                userinfoUserAgent: "Clash.Meta",
                subscriptionUserInfo: { upload: 2_048, download: 1_024, total: 4_096 },
              }),
            ],
            proxyGroupAdvanced: { auto: { includeRegex: "Fast" } },
            proxyGroupAdvancedModeEnabled: true,
            listenerPorts: { "Node A": 41000 },
            proxyGroupOrder: ["select", "auto"],
            urlTestLazy: true,
            urlTestTolerance: 50,
          }),
        }),
      })
    );
    expect(hook.subscriptionUrl).toBe("https://subboost.test/s/token-1");
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ result: "success", autoUpdateEnabled: true })
    );
  });

  it("allows adapter-specific decimal auto-update intervals", async () => {
    const adapter = makeAdapter({
      autoUpdateIntervalPolicy: {
        defaultHours: 12,
        minHours: 0.1,
        stepHours: 0.1,
        requireIntegerHours: false,
      },
    });
    let hook = useRenderedHook({ subscriptionAdapter: adapter });
    expect(hook.autoUpdateHours).toBe(12);

    hook.setSubscriptionName("Fast Sub");
    hook.setAutoUpdateEnabled(true);
    hook.setAutoUpdateHours(0.1);
    hook = useRenderedHook({ subscriptionAdapter: adapter });

    await hook.handleCreateSubscription();

    expect(adapter.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ autoUpdateInterval: 360 }),
      })
    );
  });

  it("saves source metadata variants without adding empty subscription info", async () => {
    const adapter = makeAdapter();
    const storeSources = [
      {
        id: "url-provider",
        type: "url",
        content: " https://provider.example/sub ",
        tag: " Provider ",
        nameTemplate: " {name} ",
        useProxyProviders: true,
        lastParsedContent: " https://provider.example/parsed ",
        lastParsedTag: " Last ",
        lastParsedNameTemplate: " {tag}-{name} ",
        subscriptionUserInfo: {},
      },
      {
        id: "static-source",
        type: "manual",
        content: " ss://static ",
        lastParsedContent: " trojan://parsed ",
      },
      {
        id: "blank-source",
        type: "url",
        content: "   ",
      },
    ];
    let hook = useRenderedHook({ subscriptionAdapter: adapter, storeSources, nodes: [] });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ subscriptionAdapter: adapter, storeSources, nodes: [] });

    await hook.handleCreateSubscription();

    expect(adapter.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          urls: ["https://provider.example/sub"],
          config: expect.objectContaining({
            sources: [
              expect.objectContaining({
                id: "url-provider",
                content: "https://provider.example/sub",
                tag: "Provider",
                nameTemplate: "{name}",
                useProxyProviders: true,
                lastParsedContent: "https://provider.example/parsed",
                lastParsedTag: "Last",
                lastParsedNameTemplate: "{tag}-{name}",
              }),
              expect.objectContaining({
                id: "static-source",
                content: " ss://static ",
                lastParsedContent: "trojan://parsed",
              }),
            ],
          }),
        }),
      })
    );
    const payload = (adapter.saveSubscription as any).mock.calls[0][0].payload;
    expect(payload).not.toHaveProperty("subscriptionInfo");
    expect(payload.config.sources[0]).not.toHaveProperty("subscriptionUserInfo");
  });

  it("persists resolved per-source subscription info for one source among multiple imports", async () => {
    const adapter = makeAdapter();
    const storeSources = [
      {
        id: "source-1",
        type: "url",
        content: "https://one.example/sub",
      },
      {
        id: "source-2",
        type: "url",
        content: "https://two.example/sub",
      },
    ];
    const nodes = [
      {
        name: "剩余流量：3 GB",
        type: "ss",
        server: "info.one.example",
        port: 443,
        _sourceIds: ["source-1"],
      },
      {
        name: "套餐流量：10 GB",
        type: "ss",
        server: "plan.one.example",
        port: 443,
        _sourceIds: ["source-1"],
      },
      {
        name: "套餐到期：2030-01-01",
        type: "ss",
        server: "expire.one.example",
        port: 443,
        _sourceIds: ["source-1"],
      },
      {
        name: "Regular Node",
        type: "ss",
        server: "two.example",
        port: 443,
        _sourceIds: ["source-2"],
      },
    ];
    let hook = useRenderedHook({ subscriptionAdapter: adapter, storeSources, nodes });
    hook.setSubscriptionName("Multi Source");
    hook = useRenderedHook({ subscriptionAdapter: adapter, storeSources, nodes });

    await hook.handleCreateSubscription();

    const payload = (adapter.saveSubscription as any).mock.calls[0][0].payload;
    expect(payload.subscriptionInfo).toEqual({
      upload: 7 * 1024 ** 3,
      download: 0,
      total: 10 * 1024 ** 3,
      expire: 1893499200,
    });
    expect(payload.config.sources).toEqual([
      expect.objectContaining({
        id: "source-1",
        subscriptionUserInfo: {
          upload: 7 * 1024 ** 3,
          download: 0,
          total: 10 * 1024 ** 3,
          expire: 1893499200,
        },
      }),
      expect.objectContaining({
        id: "source-2",
      }),
    ]);
    expect(payload.config.sources[1]).not.toHaveProperty("subscriptionUserInfo");
  });

  it("handles invalid auto-update input before calling the adapter", async () => {
    const adapter = makeAdapter();
    let hook = useRenderedHook({ subscriptionAdapter: adapter });
    hook.setSubscriptionName("Sub");
    hook.setAutoUpdateEnabled(true);
    hook.setAutoUpdateHours(1.5);
    hook = useRenderedHook({ subscriptionAdapter: adapter });

    await hook.handleCreateSubscription();

    expect(adapter.saveSubscription).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "自动更新间隔必须是整数小时" }));
  });

  it("handles missing names, missing YAML, low auto-update intervals, and missing save adapters", async () => {
    const adapter = makeAdapter();

    await useRenderedHook({ subscriptionAdapter: adapter }).handleCreateSubscription();
    expect(adapter.saveSubscription).not.toHaveBeenCalled();
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ result: "validationError" })
    );

    resetHookState();
    let hook = useRenderedHook({ generatedYaml: "", subscriptionAdapter: adapter });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ generatedYaml: "", subscriptionAdapter: adapter });
    await hook.handleCreateSubscription();
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ result: "noInput" })
    );

    resetHookState();
    hook = useRenderedHook({ subscriptionAdapter: adapter });
    hook.setSubscriptionName("Sub");
    hook.setAutoUpdateEnabled(true);
    hook.setAutoUpdateHours(1);
    hook = useRenderedHook({ subscriptionAdapter: adapter });
    await hook.handleCreateSubscription();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("自动更新最小间隔") }));

    resetHookState();
    hook = useRenderedHook({ subscriptionAdapter: { loginHref: "/login" } });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ subscriptionAdapter: { loginHref: "/login" } });
    await hook.handleCreateSubscription();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "当前应用未配置订阅保存接口", variant: "destructive" })
    );
  });

  it("clears expired sessions and copies saved subscription URLs", async () => {
    const clearUser = vi.fn();
    const adapter = makeAdapter({
      saveSubscription: vi.fn(async () => response(401, { error: "expired" })),
    });
    let hook = useRenderedHook({ clearUser, subscriptionAdapter: adapter });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ clearUser, subscriptionAdapter: adapter });

    await hook.handleCreateSubscription();
    expect(clearUser).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "生成订阅链接需要登录" }));

    hook.setSubscriptionUrl("https://subboost.test/s/token-1");
    hook = useRenderedHook({ clearUser, subscriptionAdapter: adapter });
    await hook.handleCopyUrl();

    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith("https://subboost.test/s/token-1");
    expect(mocks.bag.interactions.subscriptionLinkCopied).toHaveBeenCalledWith({
      flow: "create",
      mode: "quick",
    });
  });

  it("updates editing subscriptions with fallback tokens and handles save failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const editingSubscription = {
      id: "sub-1",
      token: "old-token",
      name: "Old",
      autoUpdateInterval: null,
      smartNodeMatchingEnabled: true,
    };
    const setEditingSubscription = vi.fn();
    const adapter = makeAdapter({
      saveSubscription: vi.fn(async () => response(200, { subscription: {} })),
    });
    let hook = useRenderedHook({ editingSubscription, setEditingSubscription, subscriptionAdapter: adapter });
    hook.setSubscriptionName("Updated");
    hook = useRenderedHook({ editingSubscription, setEditingSubscription, subscriptionAdapter: adapter });

    await hook.handleCreateSubscription();

    expect(adapter.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ isEditing: true, subscriptionId: "sub-1" })
    );
    expect(setEditingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated", token: "old-token", autoUpdateInterval: null })
    );
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ flow: "update", result: "success" })
    );

    resetHookState();
    const validationAdapter = makeAdapter({ saveSubscription: vi.fn(async () => response(400, { error: "bad input" })) });
    hook = useRenderedHook({ subscriptionAdapter: validationAdapter });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ subscriptionAdapter: validationAdapter });
    await hook.handleCreateSubscription();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "bad input", variant: "destructive" }));
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ result: "validationError" })
    );

    resetHookState();
    const runtimeAdapter = makeAdapter({ saveSubscription: vi.fn(async () => response(500, {})) });
    hook = useRenderedHook({ subscriptionAdapter: runtimeAdapter });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ subscriptionAdapter: runtimeAdapter });
    await hook.handleCreateSubscription();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "创建失败", variant: "destructive" }));
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ result: "runtimeError" })
    );

    resetHookState();
    const error = new Error("save offline");
    const rejectedAdapter = makeAdapter({ saveSubscription: vi.fn(async () => { throw error; }) });
    hook = useRenderedHook({ subscriptionAdapter: rejectedAdapter });
    hook.setSubscriptionName("Sub");
    hook = useRenderedHook({ subscriptionAdapter: rejectedAdapter });
    await hook.handleCreateSubscription();
    expect(console.error).toHaveBeenCalledWith("Create subscription error:", error);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "创建订阅失败，请稍后重试", variant: "destructive" })
    );
  });

  it("ignores empty copy requests and handles copy failures for editing links", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await useRenderedHook().handleCopyUrl();
    expect(globalThis.navigator.clipboard.writeText).not.toHaveBeenCalled();

    const error = new Error("clipboard denied");
    (globalThis.navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);
    const editingSubscription = {
      id: "sub-1",
      token: "token-1",
      name: "Existing",
      autoUpdateInterval: null,
      smartNodeMatchingEnabled: true,
    };
    let hook = useRenderedHook({ editingSubscription });
    hook.setSubscriptionUrl("https://subboost.test/s/token-1");
    hook = useRenderedHook({ editingSubscription });

    await hook.handleCopyUrl();

    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith("https://subboost.test/s/token-1");
    expect(console.error).toHaveBeenCalledWith("Copy error:", error);
    expect(mocks.bag.interactions.subscriptionLinkCopied).not.toHaveBeenCalledWith(
      expect.objectContaining({ flow: "update" })
    );
  });
});
