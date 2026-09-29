import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  effects: [] as Array<() => unknown>,
  store: {} as Record<string, any>,
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  index: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => unknown) => {
      mocks.effects.push(effect);
    },
    useState: (initial: unknown) => {
      const index = stateMock.index++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function"
          ? (next as (previous: unknown) => unknown)(value)
          : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children }: any) => React.createElement("a", { href }, children),
}));
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
  Button: ({ asChild: _asChild, ...props }: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", { title: props.title, onClick: props.onClick }, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: any) => React.createElement("section", null, props.children),
  CardContent: (props: any) => React.createElement("div", null, props.children),
  CardHeader: (props: any) => React.createElement("header", null, props.children),
  CardTitle: (props: any) => React.createElement("h2", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: vi.fn() }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.store }));
vi.mock("@subboost/core/subscription/auto-update-interval", () => ({
  autoUpdateIntervalHoursToSeconds: (hours: number) => hours * 3600,
  autoUpdateIntervalSecondsToHours: (seconds: number) => seconds / 3600,
  getAutoUpdateIntervalPolicyMinLabel: () => "6 小时",
  resolveAutoUpdateIntervalPolicy: () => ({
    defaultHours: 24,
    minHours: 6,
    stepHours: 1,
    requireIntegerHours: true,
  }),
}));
vi.mock("@subboost/ui/dashboard/dashboard-stats-cards", () => ({ DashboardStatsCards: () => null }));
vi.mock("@subboost/ui/dashboard/dashboard-format", () => ({
  formatDashboardDate: (value: string) => value,
  formatIntervalLabel: (seconds: number) => `${seconds / 3600} 小时`,
}));
vi.mock("@subboost/ui/dashboard/dashboard-refresh-toast", () => ({
  buildRefreshSubscriptionSuccessToast: () => ({ title: "刷新成功" }),
}));
vi.mock("@subboost/ui/dashboard/subscription-settings-dialog", () => ({
  SubscriptionSettingsDialog: () => null,
}));

import {
  SubscriptionDashboardSurface,
  type DashboardSurfaceAdapter,
} from "../../../packages/ui/src/dashboard/subscription-dashboard-surface";
import type { Subscription } from "../../../packages/ui/src/dashboard/dashboard-types";

const subscription = {
  id: "sub-empty",
  token: "token-empty",
  name: "",
  subscriptionUrl: "https://example.com/empty",
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

function adapter(): DashboardSurfaceAdapter {
  return {
    loginHref: "/login",
    newSubscriptionHref: "/new",
    editSubscriptionHref: (item) => `/edit/${item.id}`,
    fetchSubscriptions: vi.fn(async () => []),
    deleteSubscription: vi.fn(async () => undefined),
    refreshSubscription: vi.fn(async () => ({ updated: true } as any)),
    updateSubscriptionSettings: vi.fn(async () => undefined),
  };
}

function renderDashboard(subscriptions: Subscription[]) {
  stateMock.index = 0;
  stateMock.overrides = { 0: subscriptions, 1: false };
  stateMock.setters = [];
  mocks.buttons = [];
  mocks.effects = [];
  renderToStaticMarkup(React.createElement(SubscriptionDashboardSurface, { adapter: adapter() }));
  return { setters: stateMock.setters };
}

function findButtons(title: string) {
  return mocks.buttons.filter((button) => button.title === title);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("dashboard action failures and notice deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store = {
      user: { id: "user", name: "Alice", isAdmin: false },
      isLoading: false,
      fetchUser: vi.fn(),
    };
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("setTimeout", vi.fn((callback: () => void) => {
      callback();
      return 1 as any;
    }));
  });

  it("deduplicates the same disabled-auto-update event within one mounted surface", () => {
    const disabled = {
      ...subscription,
      id: "disabled",
      name: "Disabled",
      autoUpdateInterval: null,
      autoUpdateState: {
        ...subscription.autoUpdateState,
        disabledAt: "2026-01-03T00:00:00.000Z",
        disabledReason: "fetch_failed",
      },
    } satisfies Subscription;
    renderDashboard([disabled]);
    mocks.effects[2]();
    mocks.effects[2]();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("reports clipboard failure after both browser copy mechanisms fail", async () => {
    const textarea = {
      setAttribute: vi.fn(),
      style: {},
      select: vi.fn(),
      remove: vi.fn(),
      value: "",
    };
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() },
      execCommand: vi.fn(() => false),
    });
    renderDashboard([subscription]);
    findButtons("复制订阅链接")[0].onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "复制失败，请手动复制订阅链接",
      variant: "destructive",
    });
  });

  it("uses safe fallback filenames and reports non-successful download responses", async () => {
    const invalidName = { ...subscription, id: "sub-invalid", name: "<>:*?" } satisfies Subscription;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderDashboard([subscription, invalidName]);

    for (const button of findButtons("下载订阅配置")) await button.onClick();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "下载失败",
      variant: "destructive",
    }));
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("opens settings with a finite interval without using the default-hours fallback", () => {
    const result = renderDashboard([{ ...subscription, name: "Regular" }]);
    findButtons("订阅设置（改名 / 自动更新）")[0].onClick();
    expect(result.setters[9]).toHaveBeenCalledWith(24);
  });
});
