"use client";
import {
  SubscriptionDashboardSurface,
  type DashboardSurfaceAdapter,
} from "@subboost/ui/dashboard/subscription-dashboard-surface";
import { readJsonResponse } from "@subboost/ui/product/client-response";
import type { RefreshSubscriptionResponse, Subscription } from "@subboost/ui/dashboard/dashboard-types";
import { LOCAL_AUTO_UPDATE_POLICY } from "@local/lib/auto-update-policy";
import { withCsrfHeaders } from "@subboost/ui/lib/csrf";

function resolveLocalDashboardDownloadUrl(subscription: Subscription): string {
  try {
    const url = new URL(subscription.subscriptionUrl, window.location.href);
    if (url.pathname.includes("/api/subscriptions/")) {
      return `${window.location.origin}${url.pathname}${url.search}`;
    }
  } catch {}
  return subscription.subscriptionUrl;
}

const localDashboardAdapter: DashboardSurfaceAdapter = {
  loginHref: "/login",
  newSubscriptionHref: "/?newSubscription=1",
  settingsHref: "/dashboard/settings",
  settingsDescription: "管理账号和运行状态",
  autoUpdateIntervalPolicy: LOCAL_AUTO_UPDATE_POLICY,
  fetchSubscriptions: async () => {
    const response = await fetch("/api/subscriptions");
    const data = await readJsonResponse<{ subscriptions?: Subscription[]; error?: string }>(response, "获取订阅失败");
    return Array.isArray(data.subscriptions) ? data.subscriptions : [];
  },
  deleteSubscription: async (id) => {
    const response = await fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: withCsrfHeaders(),
    });
    await readJsonResponse<{ error?: string }>(response, "删除失败");
  },
  refreshSubscription: async (id) => {
    const response = await fetch(`/api/subscriptions/${encodeURIComponent(id)}/refresh`, {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
    });
    const data = await readJsonResponse<RefreshSubscriptionResponse>(response, "刷新失败");
    return data;
  },
  updateSubscriptionSettings: async (id, payload) => {
    const response = await fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    await readJsonResponse<{ error?: string }>(response, "保存失败");
  },
  resolveDownloadUrl: resolveLocalDashboardDownloadUrl,
};

export default function DashboardPage() {
  return <SubscriptionDashboardSurface adapter={localDashboardAdapter} />;
}
