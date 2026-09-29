// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subscription } from "@subboost/ui/dashboard/dashboard-types";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  userStore: {} as Record<string, any>,
  confirmDialog: vi.fn(),
  toast: vi.fn(),
  buildRefreshSubscriptionSuccessToast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  runEffects: false,
}));

function mockReactModule(actual: typeof React) {
  return {
    ...actual,
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
    useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
      if (!stateMock.runEffects) return actual.useEffect(effect, deps);
      return effect();
    },
  };
}

vi.mock("react", async (importOriginal) => mockReactModule(await importOriginal<typeof import("react")>()));
vi.mock("../../../node_modules/react/index.js", async (importOriginal) =>
  mockReactModule(await importOriginal<typeof import("react")>())
);

vi.mock("next/link", () => ({ default: (props: any) => props.children }));
vi.mock("lucide-react", () => ({
  QrCode: () => null,
  X: () => null,
  AlertTriangle: () => null,
  Check: () => null,
  Clock: () => null,
  Copy: () => null,
  Download: () => null,
  ExternalLink: () => null,
  FileCode: () => null,
  MoreVertical: () => null,
  Plus: () => null,
  RefreshCw: () => null,
  Settings: () => null,
  Shield: () => null,
  Trash2: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", { title: props.title }, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: any) => props.children,
  CardContent: (props: any) => props.children,
  CardHeader: (props: any) => props.children,
  CardTitle: (props: any) => props.children,
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.userStore }));
vi.mock("@subboost/core/subscription/auto-update-interval", () => ({
  autoUpdateIntervalHoursToSeconds: (hours: number) => Math.round(hours * 3600),
  autoUpdateIntervalSecondsToHours: (seconds: number) => Math.round((seconds / 3600) * 1000) / 1000,
  getAutoUpdateIntervalPolicyMinLabel: (policy: { minHours: number }) => `${policy.minHours} 小时`,
  resolveAutoUpdateIntervalPolicy: (isAdmin: boolean, override?: Record<string, unknown>) => ({
    defaultHours: typeof override?.defaultHours === "number" ? override.defaultHours : 24,
    minHours: typeof override?.minHours === "number" ? override.minHours : isAdmin ? 1 : 6,
    stepHours: typeof override?.stepHours === "number" ? override.stepHours : 1,
    requireIntegerHours:
      typeof override?.requireIntegerHours === "boolean" ? override.requireIntegerHours : true,
  }),
}));
vi.mock("@subboost/ui/dashboard/dashboard-stats-cards", () => ({
  DashboardStatsCards: (props: any) => {
    mocks.captures.stats = props;
    return null;
  },
}));
vi.mock("@subboost/ui/dashboard/dashboard-format", () => ({
  formatDashboardDate: (value: string) => `date:${value}`,
  formatIntervalLabel: (seconds: number) => `${seconds / 3600} 小时`,
}));
vi.mock("@subboost/ui/dashboard/dashboard-refresh-toast", () => ({
  buildRefreshSubscriptionSuccessToast: mocks.buildRefreshSubscriptionSuccessToast,
}));
vi.mock("@subboost/ui/dashboard/subscription-settings-dialog", () => ({
  SubscriptionSettingsDialog: (props: any) => {
    mocks.captures.settingsDialog = props;
    return null;
  },
}));

import { SubscriptionDashboardSurface, type DashboardSurfaceAdapter } from "@subboost/ui/dashboard/subscription-dashboard-surface";

const user = { id: "user-1", isAdmin: false, name: "Alice" };

const subscription = {
  id: "sub-1",
  token: "token-1",
  name: "Primary",
  subscriptionUrl: "https://example.com/sub",
  isPrimary: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastAccessedAt: null,
  lastUpdatedAt: "2026-01-02T00:00:00.000Z",
  autoUpdateInterval: 86400,
  smartNodeMatchingEnabled: true,
  autoUpdateState: {
    externalFailureCount: 0,
    failureSourceState: null,
    lastFailedAt: null,
    lastAttemptedAt: null,
    disabledAt: null,
    disabledReason: null,
    disabledPreviousInterval: null,
  },
} satisfies Subscription;

function disabledSubscription(id: string, name: string): Subscription {
  return {
    ...subscription,
    id,
    name,
    autoUpdateInterval: null,
    autoUpdateState: {
      ...subscription.autoUpdateState,
      disabledAt: "2026-01-03T00:00:00.000Z",
      disabledReason: "fetch_failed",
    },
  };
}

function createAdapter(overrides: Partial<DashboardSurfaceAdapter> = {}): DashboardSurfaceAdapter {
  return {
    loginHref: "/login",
    newSubscriptionHref: "/new",
    templatesHref: "/templates",
    settingsHref: "/settings",
    settingsTitle: "设置",
    settingsDescription: "账户设置",
    editSubscriptionHref: (sub) => `/edit/${sub.id}`,
    fetchSubscriptions: vi.fn(async () => [subscription]),
    deleteSubscription: vi.fn(async () => undefined),
    refreshSubscription: vi.fn(async () => ({ updated: true } as any)),
    updateSubscriptionSettings: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderSurface(adapter = createAdapter(), overrides: Record<number, unknown> = {}, options: { runEffects?: boolean } = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  stateMock.runEffects = options.runEffects ?? false;
  mocks.captures.buttons = [];
  mocks.captures.stats = undefined;
  mocks.captures.settingsDialog = undefined;
  try {
    const html = renderToStaticMarkup(React.createElement(SubscriptionDashboardSurface, { adapter }));
    return { html, setters: stateMock.setters, adapter };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("public dashboard surface remaining branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [] };
    mocks.userStore = { user, isLoading: false, fetchUser: vi.fn() };
    mocks.buildRefreshSubscriptionSuccessToast.mockReturnValue({ title: "刷新成功", variant: "success" });
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
    vi.stubGlobal("setTimeout", vi.fn((callback: () => void) => {
      callback();
      return 1 as any;
    }));
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("runs guest effects and default dashboard adapter fallbacks", async () => {
    mocks.userStore = { user: null, isLoading: false, fetchUser: vi.fn() };
    const adapter = createAdapter({ loginHref: undefined });
    const { html, setters } = renderSurface(adapter, {}, { runEffects: true });
    await flushPromises();

    expect(html).toContain("请先登录");
    expect(setters[1]).toHaveBeenCalledWith(false);
    expect(adapter.fetchSubscriptions).not.toHaveBeenCalled();
  });

  it("deduplicates disabled auto-update notices and reports plural disabled subscriptions", async () => {
    const first = disabledSubscription("sub-2", "Disabled A");
    const second = disabledSubscription("sub-3", "Disabled B");
    const fingerprint = "2026-01-03T00:00:00.000Z:fetch_failed";
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => fingerprint),
      setItem: vi.fn(),
    });

    renderSurface(createAdapter(), { 0: [first], 1: false }, { runEffects: true });
    await flushPromises();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    renderSurface(createAdapter(), { 0: [first, second], 1: false }, { runEffects: true });
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "2 个订阅的自动更新已关闭",
      variant: "warning",
    }));
  });

  it("renders copied state and adapter defaults for edit and quick action links", () => {
    const adapter = createAdapter({
      newSubscriptionHref: undefined,
      editSubscriptionHref: undefined,
      settingsTitle: undefined,
      settingsDescription: undefined,
    });
    const { html } = renderSurface(adapter, { 0: [subscription], 1: false, 2: "sub-1" });

    expect(html).toContain("已复制");
    expect(html).toContain("账户设置");
    expect(html).toContain("管理您的账户和数据导出");
  });

  it("handles non-finite settings intervals and fallback save errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invalidInterval = {
      ...subscription,
      autoUpdateInterval: Number.NaN,
    } satisfies Subscription;
    const { setters } = renderSurface(createAdapter(), { 0: [invalidInterval], 1: false, 2: null, 3: null });
    mocks.captures.buttons.find((props: any) => props.title === "订阅设置（改名 / 自动更新）").onClick();
    expect(setters[9]).toHaveBeenCalledWith(24);

    const failingAdapter = createAdapter({ updateSubscriptionSettings: vi.fn(async () => { throw "bad"; }) });
    renderSurface(failingAdapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Renamed", 7: true, 8: false, 9: 24, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "保存失败，请稍后重试",
      variant: "destructive",
    }));
    expect(error).toHaveBeenCalledWith("Failed to save subscription settings:", "bad");
    error.mockRestore();
  });

  it("updates only the saved subscription while preserving sibling rows", async () => {
    const sibling = { ...subscription, id: "sub-2", name: "Sibling" } satisfies Subscription;
    const adapter = createAdapter();
    const { setters } = renderSurface(adapter, {
      0: [subscription, sibling],
      1: false,
      4: true,
      5: subscription,
      6: "Renamed",
      7: false,
      8: true,
      9: 6,
      10: false,
    });

    await mocks.captures.settingsDialog.onSave();
    const updater = setters[0].mock.calls.at(-1)?.[0] as (prev: Subscription[]) => Subscription[];
    const updated = updater([subscription, sibling]);
    expect(updated[0]).toMatchObject({
      id: "sub-1",
      name: "Renamed",
      smartNodeMatchingEnabled: false,
      autoUpdateInterval: 21600,
      autoUpdateState: expect.objectContaining({ disabledAt: null, disabledReason: null }),
    });
    expect(updated[1]).toBe(sibling);
  });
});
