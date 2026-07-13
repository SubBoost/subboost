import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  userStore: {} as Record<string, any>,
  confirmDialog: vi.fn(),
  toast: vi.fn(),
  clipboardWriteText: vi.fn(),
  buildRefreshSubscriptionSuccessToast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  runEffects: false,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
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
});

vi.mock("next/link", () => ({ default: (props: any) => props.children }));
vi.mock("lucide-react", () => ({
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
  Star: () => null,
  Trash2: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return null;
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

import { SubscriptionDashboardSurface, type DashboardSurfaceAdapter } from "./subscription-dashboard-surface";

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
};

const disabledSubscription = {
  ...subscription,
  id: "sub-2",
  name: "Disabled",
  isPrimary: false,
  autoUpdateInterval: null,
  autoUpdateState: {
    ...subscription.autoUpdateState,
    disabledAt: "2026-01-03T00:00:00.000Z",
    disabledReason: "fetch_failed",
  },
};

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
    renderAnnouncement: () => "announcement",
    renderHeaderActions: () => "header-action",
    renderExtraQuickActions: () => "extra-action",
    beforeStatsSlot: "before-stats",
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

function stubDocumentActions() {
  const anchor = {
    href: "",
    download: "",
    rel: "",
    style: {} as Record<string, string>,
    click: vi.fn(),
    remove: vi.fn(),
  };
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  };
  const appendChild = vi.fn();
  const execCommand = vi.fn(() => true);
  const createElement = vi.fn((tagName: string) => {
    if (tagName === "a") return anchor;
    if (tagName === "textarea") return textarea;
    throw new Error(`Unexpected element: ${tagName}`);
  });

  vi.stubGlobal("document", {
    createElement,
    body: { appendChild },
    execCommand,
  });

  return { anchor, textarea, appendChild, createElement, execCommand };
}

describe("SubscriptionDashboardSurface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [] };
    mocks.userStore = { user, isLoading: false, fetchUser: vi.fn() };
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.clipboardWriteText.mockResolvedValue(undefined);
    mocks.buildRefreshSubscriptionSuccessToast.mockReturnValue({ title: "刷新成功", variant: "success" });
    vi.stubGlobal("navigator", { clipboard: { writeText: mocks.clipboardWriteText } });
    vi.stubGlobal("setTimeout", vi.fn((callback: () => void) => {
      callback();
      return 1 as any;
    }));
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("window", {
      location: {
        href: "http://localhost/dashboard",
        origin: "http://localhost",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders loading, login prompt, empty state, stats, and quick actions", () => {
    mocks.userStore = { user: null, isLoading: true, fetchUser: vi.fn() };
    renderSurface();
    expect(mocks.captures.stats).toBeUndefined();

    mocks.userStore = { user: null, isLoading: false, fetchUser: vi.fn() };
    expect(renderSurface().html).toContain("请先登录");

    mocks.userStore = { user, isLoading: false, fetchUser: vi.fn() };
    const { html } = renderSurface(createAdapter(), { 0: [], 1: false });
    expect(html).toContain("暂无订阅");
    expect(html).not.toContain("完整订阅链接是持有者凭证");
    expect(html).not.toContain("账号临时封禁");
    expect(html).toContain("announcement");
    expect(html).toContain("extra-action");
    expect(mocks.captures.stats).toEqual({ subscriptionCount: 0, user });
    expect(mocks.captures.settingsDialog).toEqual(expect.objectContaining({ open: false, userIsAdmin: false }));
  });

  it("runs mount effects, handles fetch failures, and shows disabled auto-update notices", async () => {
    const adapter = createAdapter({ fetchSubscriptions: vi.fn(async () => [subscription]) });
    const mounted = renderSurface(adapter, {}, { runEffects: true });
    await flushPromises();
    expect(mocks.userStore.fetchUser).toHaveBeenCalled();
    expect(adapter.fetchSubscriptions).toHaveBeenCalled();
    expect(mounted.setters[0]).toHaveBeenCalledWith([subscription]);

    const failingAdapter = createAdapter({ fetchSubscriptions: vi.fn(async () => { throw new Error("offline"); }) });
    const failed = renderSurface(failingAdapter, {}, { runEffects: true });
    await flushPromises();
    expect(failed.setters[0]).toHaveBeenCalledWith([]);

    renderSurface(adapter, { 0: [disabledSubscription], 1: false }, { runEffects: true });
    await flushPromises();
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "subboost:notice:auto_update_disabled:user-1:sub-2",
      "2026-01-03T00:00:00.000Z:fetch_failed"
    );
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "自动更新已关闭", variant: "warning" }));
  });

  it("copies, deletes, refreshes, and opens settings for subscriptions", async () => {
    const { setters, adapter } = renderSurface(createAdapter(), { 0: [subscription, disabledSubscription], 1: false, 2: null, 3: null });

    await mocks.captures.buttons.find((props: any) => props.title === "复制订阅链接").onClick();
    await flushPromises();
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith("https://example.com/sub");
    expect(setters[2]).toHaveBeenCalledWith("sub-1");
    expect(setters[2]).toHaveBeenCalledWith(null);

    mocks.captures.buttons.find((props: any) => props.className?.includes("text-red-400")).onClick();
    await flushPromises();
    expect(mocks.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "删除" }));
    expect(adapter.deleteSubscription).toHaveBeenCalledWith("sub-1");
    expect(setters[0]).toHaveBeenCalledWith(expect.any(Function));

    mocks.captures.buttons.find((props: any) => props.title === "重新生成配置并刷新缓存").onClick();
    await flushPromises();
    expect(setters[3]).toHaveBeenCalledWith("sub-1");
    expect(adapter.refreshSubscription).toHaveBeenCalledWith("sub-1");
    expect(adapter.fetchSubscriptions).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "刷新成功", variant: "success" });

    mocks.captures.buttons.find((props: any) => props.title === "订阅设置（改名 / 自动更新）").onClick();
    expect(setters[5]).toHaveBeenCalledWith(subscription);
    expect(setters[6]).toHaveBeenCalledWith("Primary");
    expect(setters[7]).toHaveBeenCalledWith(true);
    expect(setters[8]).toHaveBeenCalledWith(true);
    expect(setters[9]).toHaveBeenCalledWith(24);
    expect(setters[4]).toHaveBeenCalledWith(true);

    const settingsButtons = mocks.captures.buttons.filter((props: any) => props.title === "订阅设置（改名 / 自动更新）");
    settingsButtons[1].onClick();
    expect(setters[5]).toHaveBeenCalledWith(disabledSubscription);
    expect(setters[8]).toHaveBeenCalledWith(false);
    expect(setters[9]).toHaveBeenCalledWith(24);
  });

  it("falls back to legacy copy for non-secure self-host origins", async () => {
    const dom = stubDocumentActions();
    vi.stubGlobal("navigator", {});
    const { setters } = renderSurface(createAdapter(), { 0: [subscription], 1: false, 2: null, 3: null });

    await mocks.captures.buttons.find((props: any) => props.title === "复制订阅链接").onClick();
    await flushPromises();

    expect(dom.createElement).toHaveBeenCalledWith("textarea");
    expect(dom.textarea.value).toBe("https://example.com/sub");
    expect(dom.textarea.select).toHaveBeenCalled();
    expect(dom.execCommand).toHaveBeenCalledWith("copy");
    expect(dom.textarea.remove).toHaveBeenCalled();
    expect(setters[2]).toHaveBeenCalledWith("sub-1");
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("downloads subscription YAML with a yaml filename instead of opening a new tab", async () => {
    const dom = stubDocumentActions();
    const blob = new Blob(["mixed-port: 7890\n"], { type: "text/yaml" });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: vi.fn(async () => blob) }));
    const createObjectURL = vi.fn(() => "blob:subboost-config");
    const revokeObjectURL = vi.fn();
    class TestURL extends URL {}
    TestURL.createObjectURL = createObjectURL;
    TestURL.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", TestURL);

    renderSurface(createAdapter(), { 0: [subscription], 1: false, 2: null, 3: null });
    await mocks.captures.buttons.find((props: any) => props.title === "下载订阅配置").onClick();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/sub");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(dom.createElement).toHaveBeenCalledWith("a");
    expect(dom.anchor.href).toBe("blob:subboost-config");
    expect(dom.anchor.download).toBe("Primary.yaml");
    expect(dom.anchor.rel).toBe("noopener noreferrer");
    expect(dom.anchor.click).toHaveBeenCalled();
    expect(dom.anchor.remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:subboost-config");
  });

  it("reports download failures without opening the subscription URL", async () => {
    const dom = stubDocumentActions();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("cors");
    }));

    renderSurface(createAdapter(), { 0: [subscription], 1: false, 2: null, 3: null });
    await mocks.captures.buttons.find((props: any) => props.title === "下载订阅配置").onClick();
    await flushPromises();

    expect(dom.createElement).not.toHaveBeenCalledWith("a");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "下载失败",
      variant: "destructive",
    }));
  });

  it("uses the adapter download URL resolver before fetching subscription YAML", async () => {
    const dom = stubDocumentActions();
    const blob = new Blob(["mixed-port: 7890\n"], { type: "text/yaml" });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: vi.fn(async () => blob) }));
    vi.stubGlobal("fetch", fetchMock);
    class TestURL extends URL {}
    TestURL.createObjectURL = vi.fn(() => "blob:subboost-config");
    TestURL.revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", TestURL);

    const crossOriginSubscription = {
      ...subscription,
      subscriptionUrl: "https://subscription.example.test/download/token-1?download=1",
    };
    const resolveDownloadUrl = vi.fn(() => "http://localhost/download/token-1?download=1");
    renderSurface(createAdapter({ resolveDownloadUrl }), {
      0: [crossOriginSubscription],
      1: false,
      2: null,
      3: null,
    });
    await mocks.captures.buttons.find((props: any) => props.title === "下载订阅配置").onClick();
    await flushPromises();

    expect(resolveDownloadUrl).toHaveBeenCalledWith(crossOriginSubscription);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost/download/token-1?download=1");
    expect(dom.anchor.download).toBe("Primary.yaml");
  });

  it("guards cancelled delete and in-flight refresh failures", async () => {
    const adapter = createAdapter({ refreshSubscription: vi.fn(async () => { throw new Error("refresh failed"); }) });
    renderSurface(adapter, { 0: [subscription], 1: false, 2: null, 3: "sub-1" });
    mocks.captures.buttons.find((props: any) => props.title === "重新生成配置并刷新缓存").onClick();
    await flushPromises();
    expect(adapter.refreshSubscription).not.toHaveBeenCalled();

    renderSurface(adapter, { 0: [subscription], 1: false, 2: null, 3: null });
    mocks.captures.buttons.find((props: any) => props.title === "重新生成配置并刷新缓存").onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "refresh failed", variant: "destructive" }));

    mocks.confirmDialog.mockResolvedValueOnce(false);
    mocks.captures.buttons.find((props: any) => props.className?.includes("text-red-400")).onClick();
    await flushPromises();
    expect(adapter.deleteSubscription).not.toHaveBeenCalled();

    const badRefreshAdapter = createAdapter({ refreshSubscription: vi.fn(async () => { throw "bad"; }) });
    renderSurface(badRefreshAdapter, { 0: [subscription], 1: false, 2: null, 3: null });
    mocks.captures.buttons.find((props: any) => props.title === "重新生成配置并刷新缓存").onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "刷新失败，请稍后重试", variant: "destructive" }));

    const deleteFailAdapter = createAdapter({ deleteSubscription: vi.fn(async () => { throw new Error("delete failed"); }) });
    renderSurface(deleteFailAdapter, { 0: [subscription], 1: false, 2: null, 3: null });
    mocks.captures.buttons.find((props: any) => props.className?.includes("text-red-400")).onClick();
    await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "删除失败，请稍后重试", variant: "destructive" }));
  });

  it("validates and saves subscription settings", async () => {
    const adapter = createAdapter();
    renderSurface(adapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "  ", 7: true, 8: true, 9: 24, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "订阅名称不能为空且长度不能超过 100 字符", variant: "warning" }));

    renderSurface(adapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Renamed", 7: false, 8: true, 9: 5, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "自动更新最小间隔为 6 小时", variant: "warning" }));

    renderSurface(adapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Renamed", 7: false, 8: true, 9: Number.NaN, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "自动更新间隔必须是有效小时数", variant: "warning" }));

    renderSurface(adapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Renamed", 7: false, 8: true, 9: 6.5, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "自动更新间隔必须是整数小时", variant: "warning" }));

    renderSurface(adapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Renamed", 7: false, 8: true, 9: 6, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(adapter.updateSubscriptionSettings).toHaveBeenCalledWith("sub-1", {
      name: "Renamed",
      smartNodeMatchingEnabled: false,
      autoUpdateInterval: 21600,
    });
    expect(stateMock.setters[0]).toHaveBeenCalledWith(expect.any(Function));
    expect(stateMock.setters[4]).toHaveBeenCalledWith(false);

    renderSurface(adapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Manual", 7: true, 8: false, 9: 24, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(adapter.updateSubscriptionSettings).toHaveBeenCalledWith("sub-1", {
      name: "Manual",
      smartNodeMatchingEnabled: true,
      autoUpdateInterval: null,
    });

    const guardedAdapter = createAdapter();
    renderSurface(guardedAdapter, { 0: [subscription], 1: false, 4: true, 5: null, 6: "No sub", 7: true, 8: false, 9: 24, 10: false });
    await mocks.captures.settingsDialog.onSave();
    renderSurface(guardedAdapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Saving", 7: true, 8: false, 9: 24, 10: true });
    await mocks.captures.settingsDialog.onSave();
    expect(guardedAdapter.updateSubscriptionSettings).not.toHaveBeenCalled();

    const failingAdapter = createAdapter({ updateSubscriptionSettings: vi.fn(async () => { throw new Error("save failed"); }) });
    renderSurface(failingAdapter, { 0: [subscription], 1: false, 4: true, 5: subscription, 6: "Renamed", 7: true, 8: false, 9: 24, 10: false });
    await mocks.captures.settingsDialog.onSave();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "save failed", variant: "destructive" }));
  });
});
