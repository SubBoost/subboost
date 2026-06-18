import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboardAdapter: null as any,
  homeAdapter: null as any,
  readJsonResponse: vi.fn(),
  readSourceImportResponse: vi.fn(),
  userState: {
    fetchUser: vi.fn(),
    logout: vi.fn(),
    user: null as any,
  },
}));

vi.mock("lucide-react", () => ({
  LogOut: () => React.createElement("span", null, "LogOut"),
  ServerCog: () => React.createElement("span", null, "ServerCog"),
  ShieldCheck: () => React.createElement("span", null, "ShieldCheck"),
  UserPlus: () => React.createElement("span", null, "UserPlus"),
  Users: () => React.createElement("span", null, "Users"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => React.createElement("button", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: any) => React.createElement("section", props, props.children),
  CardContent: (props: any) => React.createElement("div", props, props.children),
  CardHeader: (props: any) => React.createElement("header", props, props.children),
  CardTitle: (props: any) => React.createElement("h2", props, props.children),
}));

vi.mock("@subboost/ui/dashboard/subscription-dashboard-surface", () => ({
  SubscriptionDashboardSurface: (props: any) => {
    mocks.dashboardAdapter = props.adapter;
    return React.createElement("main", null, "DashboardSurface");
  },
}));

vi.mock("@subboost/ui/product/client-response", () => ({
  readJsonResponse: mocks.readJsonResponse,
  readSourceImportResponse: mocks.readSourceImportResponse,
}));

vi.mock("@subboost/ui/product/home/home-surface", () => ({
  HomeSurface: (props: any) => {
    mocks.homeAdapter = props.adapter;
    return React.createElement("main", null, "HomeSurface");
  },
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => mocks.userState,
}));

import DashboardPage from "./dashboard/page";
import SettingsPage from "./dashboard/settings/page";
import manifest from "./manifest";
import HomePage from "./page";

describe("local app pages and adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.dashboardAdapter = null;
    mocks.homeAdapter = null;
    mocks.userState = {
      fetchUser: vi.fn(),
      logout: vi.fn(),
      user: null,
    };
  });

  it("builds the local web app manifest", () => {
    expect(manifest()).toMatchObject({
      short_name: "SubBoost",
      start_url: "/",
      display: "standalone",
      lang: "zh-CN",
      icons: [
        { src: "/icon.png", purpose: "any" },
        { src: "/icon.png", purpose: "maskable" },
      ],
    });
  });

  it("connects the local home adapter to local API routes", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.readSourceImportResponse.mockResolvedValueOnce({ content: "yaml", headers: {}, parseResult: { nodes: [] } });
    mocks.readJsonResponse
      .mockResolvedValueOnce({ totalRules: 7 })
      .mockResolvedValueOnce({ items: [{ id: "rule-1" }], totalRules: 7, totalMatched: 1, source: "remote" })
      .mockResolvedValueOnce({ items: [{ key: "cn" }] });

    renderToStaticMarkup(React.createElement(HomePage));
    const adapter = mocks.homeAdapter;

    await expect(adapter.productApi.sourceImport.importSource({ url: "https://example.test/sub" })).resolves.toEqual({
      content: "yaml",
      headers: {},
      parseResult: { nodes: [] },
    });
    await expect(adapter.productApi.rules.getTotalRules()).resolves.toBe(7);
    await expect(adapter.productApi.rules.searchRules({ keyword: "hk", page: 2, size: 10 })).resolves.toEqual({
      items: [{ id: "rule-1" }],
      totalRules: 7,
      totalMatched: 1,
      source: "remote",
    });
    await expect(adapter.productApi.rules.loadCnCandidateRules({ moduleIds: ["stream"], excludedRuleKeys: ["old"] })).resolves.toEqual([
      { key: "cn" },
    ]);
    await adapter.loadSubscription("sub 1");
    await adapter.subscription.saveSubscription({ isEditing: true, subscriptionId: "sub 1", payload: { name: "Sub" } });
    await adapter.subscription.saveSubscription({ isEditing: false, payload: { name: "New" } });

    expect(adapter.subscription.autoUpdateIntervalPolicy).toEqual({
      defaultHours: 12,
      minHours: 0.1,
      stepHours: 0.1,
      requireIntegerHours: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/source-import", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/subscriptions/sub%201", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/api/subscriptions/sub%201", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/subscriptions", expect.objectContaining({ method: "POST" }));
  });

  it("connects the dashboard adapter to local subscription routes", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.readJsonResponse.mockResolvedValueOnce({ subscriptions: [{ id: "sub-1" }] }).mockResolvedValueOnce({}).mockResolvedValueOnce({
      ok: true,
    });

    renderToStaticMarkup(React.createElement(DashboardPage));
    const adapter = mocks.dashboardAdapter;
    vi.stubGlobal("window", {
      location: {
        href: "http://23.80.90.37:31401/dashboard",
        origin: "http://23.80.90.37:31401",
      },
    });

    await expect(adapter.fetchSubscriptions()).resolves.toEqual([{ id: "sub-1" }]);
    await expect(adapter.deleteSubscription("sub 1")).resolves.toBeUndefined();
    await expect(adapter.refreshSubscription("sub 1")).resolves.toEqual({ ok: true });
    await expect(adapter.updateSubscriptionSettings("sub 1", { name: "Sub" })).resolves.toBeUndefined();
    expect(
      adapter.resolveDownloadUrl({
        subscriptionUrl: "http://localhost:3001/api/subscriptions/token-1/config.yaml",
      })
    ).toBe("http://23.80.90.37:31401/api/subscriptions/token-1/config.yaml");
    expect(adapter.autoUpdateIntervalPolicy).toEqual({
      defaultHours: 12,
      minHours: 0.1,
      stepHours: 0.1,
      requireIntegerHours: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subscriptions/sub%201",
      expect.objectContaining({ method: "DELETE", headers: {} })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/subscriptions/sub%201/refresh", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/subscriptions/sub%201", expect.objectContaining({ method: "PUT" }));
  });

  it("renders local settings for anonymous and authenticated states", () => {
    let html = renderToStaticMarkup(React.createElement(SettingsPage));
    expect(html).toContain("账户设置");
    expect(html).toContain("/api/health/live");

    mocks.userState = {
      fetchUser: vi.fn(),
      logout: vi.fn(),
      user: { username: "admin", subscriptionCount: 2, quota: { maxSubscriptions: 9999 } },
    };
    html = renderToStaticMarkup(React.createElement(SettingsPage));
    expect(html).toContain("当前账号");
    expect(html).toContain("创建账号");
  });
});
