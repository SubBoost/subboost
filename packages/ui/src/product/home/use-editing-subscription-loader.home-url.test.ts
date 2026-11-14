import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditingSubscriptionLoader } from "./use-editing-subscription-loader";

const mocks = vi.hoisted(() => {
  const bag: {
    storeState: { reset: ReturnType<typeof vi.fn>; generateConfig: ReturnType<typeof vi.fn> };
    editRef: { current: string | null };
  } = {
    storeState: { reset: vi.fn(), generateConfig: vi.fn() },
    editRef: { current: null },
  };

  const useConfigStore = vi.fn() as any;
  useConfigStore.getState = vi.fn(() => bag.storeState);

  return {
    bag,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    useEffect: vi.fn((effect: () => void | (() => void)) => {
      effect();
    }),
    useConfigStore,
  };
});

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
  useRef: () => mocks.bag.editRef,
  useEffect: mocks.useEffect,
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: mocks.useConfigStore,
}));

vi.mock("@subboost/ui/store/config-store/auth-handoff", () => ({
  captureAuthConfigHandoff: vi.fn(),
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({
  toast: vi.fn(),
}));

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

describe("useEditingSubscriptionLoader home URL ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bag.editRef.current = null;
    mocks.bag.storeState = { reset: vi.fn(), generateConfig: vi.fn() };
  });

  it("drops a leftover editing record without resetting the current draft", () => {
    const options = makeOptions({ editSubscriptionId: null, hasEditingSubscription: true });

    useEditingSubscriptionLoader(options);

    expect(options.setEditingSubscription).toHaveBeenCalledOnce();
    expect(options.setEditingSubscription).toHaveBeenCalledWith(null);
    expect(options.setSubscriptionName).toHaveBeenCalledWith("");
    expect(options.setSubscriptionUrl).toHaveBeenCalledWith("");
    expect(options.setCopied).toHaveBeenCalledWith(false);
    expect(mocks.bag.storeState.reset).not.toHaveBeenCalled();
    expect(mocks.bag.storeState.generateConfig).not.toHaveBeenCalled();
    expect(options.loadSubscription).not.toHaveBeenCalled();
  });

  it("keeps the editing record for an edit URL and leaves same-page exits to the draft reset", () => {
    const editing = makeOptions({ editSubscriptionId: "sub-1", hasEditingSubscription: true, authChecked: false });
    useEditingSubscriptionLoader(editing);
    expect(editing.setEditingSubscription).not.toHaveBeenCalled();

    mocks.bag.editRef.current = "sub-1";
    const leaving = makeOptions({ editSubscriptionId: null, hasEditingSubscription: true });
    useEditingSubscriptionLoader(leaving);
    expect(mocks.bag.storeState.reset).toHaveBeenCalledOnce();
    expect(leaving.setEditingSubscription).toHaveBeenCalledOnce();
    expect(leaving.setEditingSubscription).toHaveBeenCalledWith(null);
  });
});
