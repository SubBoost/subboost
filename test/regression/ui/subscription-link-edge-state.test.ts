import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAdapter, makeOptions } from "../../../packages/ui/src/product/home/use-subscription-link.test-helpers";

const mocks = vi.hoisted(() => {
  const bag: {
    state: unknown[];
    stateIndex: number;
    storeState: Record<string, unknown>;
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
  const useConfigStore = vi.fn() as ReturnType<typeof vi.fn> & {
    getState: ReturnType<typeof vi.fn>;
  };
  useConfigStore.getState = vi.fn(() => bag.storeState);
  return {
    bag,
    useConfigStore,
    captureAuthConfigHandoff: vi.fn(),
    toast: vi.fn(),
    getNodeSourceIds: vi.fn((node: { _sourceIds?: unknown }) =>
      Array.isArray(node?._sourceIds) ? node._sourceIds : []
    ),
    useProductInteractionAdapter: vi.fn(() => bag.interactions),
    useCallback: vi.fn((callback: unknown) => callback),
    useEffect: vi.fn(),
    useMemo: vi.fn((factory: () => unknown) => factory()),
    useState: vi.fn((initial: unknown) => {
      const index = bag.stateIndex;
      if (bag.state.length <= index) {
        bag.state.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      }
      const setter = vi.fn((next: unknown) => {
        bag.state[index] = typeof next === "function"
          ? (next as (current: unknown) => unknown)(bag.state[index])
          : next;
      });
      bag.stateIndex += 1;
      return [bag.state[index], setter];
    }),
  };
});

vi.mock("react", () => ({
  useCallback: mocks.useCallback,
  useEffect: mocks.useEffect,
  useMemo: mocks.useMemo,
  useState: mocks.useState,
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
  formatDateInBeijing: () => "2026-08-01",
}));

vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: mocks.useProductInteractionAdapter,
}));

import { useSubscriptionLink } from "@subboost/ui/product/home/use-subscription-link";

function useHookHarness(overrides: Record<string, unknown> = {}) {
  mocks.bag.stateIndex = 0;
  return useSubscriptionLink(makeOptions(overrides));
}

describe("subscription link edge state", () => {
  let originalWindow: typeof globalThis.window | undefined;
  let originalNavigator: typeof globalThis.navigator | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bag.state = [];
    mocks.bag.stateIndex = 0;
    mocks.bag.storeState = {
      proxyGroupAdvanced: {},
      proxyGroupAdvancedModeEnabled: false,
      proxyGroupOrder: [],
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
      groupListeners: [],
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
    vi.useRealTimers();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  });

  it("uses the default login path when no product subscription adapter exists", () => {
    const hook = useHookHarness({ subscriptionAdapter: null, user: null });

    hook.handleGenerateSubscription("quick");
    const loginToast = mocks.toast.mock.calls.at(-1)?.[0] as {
      action: { props: { onClick: () => void } };
    };
    loginToast.action.props.onClick();

    expect(globalThis.window.location.href).toBe("/login");
  });

  it("rejects zero auto-update hours before calling the save adapter", async () => {
    const adapter = makeAdapter();
    let hook = useHookHarness({ subscriptionAdapter: adapter });
    hook.setSubscriptionName("Zero interval");
    hook.setAutoUpdateEnabled(true);
    hook.setAutoUpdateHours(0);
    hook = useHookHarness({ subscriptionAdapter: adapter });

    await hook.handleCreateSubscription();

    expect(adapter.saveSubscription).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "自动更新间隔必须是有效小时数" })
    );
  });

  it("preserves invalid URL-shaped metadata and tolerates a rejected success body", async () => {
    const saveSubscription = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: vi.fn(async () => {
        throw new Error("empty response body");
      }),
    } as unknown as Response));
    const adapter = makeAdapter({ saveSubscription });
    const storeSources = [
      {
        id: "url-source",
        type: "url",
        content: " invalid subscription url ",
        userinfoUrl: " invalid userinfo url ",
        lastParsedContent: " invalid previous url ",
      },
      {
        id: "yaml-source",
        type: "yaml",
        content: "proxies: []",
      },
    ];
    let hook = useHookHarness({ subscriptionAdapter: adapter, storeSources, nodes: [] });
    hook.setSubscriptionName("Fallback metadata");
    hook = useHookHarness({ subscriptionAdapter: adapter, storeSources, nodes: [] });

    await hook.handleCreateSubscription();

    const payload = (
      saveSubscription.mock.calls[0][0] as {
        payload: {
          urls: string[];
          config: { sources: Array<Record<string, unknown>> };
        };
      }
    ).payload;
    expect(payload.urls).toEqual(["invalid subscription url"]);
    expect(payload.config.sources).toEqual([
      expect.objectContaining({
        id: "url-source",
        content: "invalid subscription url",
        userinfoUrl: "invalid userinfo url",
        lastParsedContent: "invalid previous url",
      }),
      expect.objectContaining({ id: "yaml-source", content: "proxies: []" }),
    ]);
    expect(payload.config.sources[1]).not.toHaveProperty("lastParsedContent");
    expect(mocks.bag.interactions.subscriptionLinkSaved).toHaveBeenCalledWith(
      expect.objectContaining({ result: "success" })
    );
  });

  it("tracks a successful editing-link copy and clears copied state after the timer", async () => {
    vi.useFakeTimers();
    const editingSubscription = {
      id: "sub-1",
      token: "token-1",
      name: "Existing",
      autoUpdateInterval: null,
      smartNodeMatchingEnabled: true,
    };
    let hook = useHookHarness({ editingSubscription });
    hook.setSubscriptionUrl("https://subboost.test/s/token-1");
    hook = useHookHarness({ editingSubscription });

    await hook.handleCopyUrl();
    expect(mocks.bag.state[7]).toBe(true);
    await vi.runAllTimersAsync();

    expect(mocks.bag.interactions.subscriptionLinkCopied).toHaveBeenCalledWith({
      flow: "update",
      mode: "quick",
    });
    expect(mocks.bag.state[7]).toBe(false);
  });
});
