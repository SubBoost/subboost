"use client";

import type { HomeSurfaceAdapter } from "@subboost/ui/product/home/home-surface";
import { readSourceImportResponse } from "@subboost/ui/product/client-response";
import { createRulesProductApi } from "@subboost/ui/product/api-adapter";
import { LOCAL_AUTO_UPDATE_POLICY } from "@local/lib/auto-update-policy";
import { withCsrfHeaders } from "@subboost/ui/lib/csrf";

export const localHomeAdapter: HomeSurfaceAdapter = {
  loginHref: "/login",
  productApi: {
    sourceImport: {
      importSource: async (request) => {
        const data = await readSourceImportResponse(
          await fetch("/api/source-import", {
            method: "POST",
            headers: withCsrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(request),
          })
        );
        return {
          content: typeof data.content === "string" ? data.content : "",
          headers: data.headers || {},
          parseResult: data.parseResult,
        };
      },
    },
    templates: {
      catalogEnabled: false,
      builtinEngagementEnabled: false,
    },
    rules: createRulesProductApi(),
  },
  loadSubscription: (id) => fetch(`/api/subscriptions/${encodeURIComponent(id)}`, { cache: "no-store" }),
  subscription: {
    loginHref: "/login",
    autoUpdateIntervalPolicy: LOCAL_AUTO_UPDATE_POLICY,
    saveSubscription: ({ isEditing, subscriptionId, payload }) => {
      const endpoint =
        isEditing && subscriptionId
          ? `/api/subscriptions/${encodeURIComponent(subscriptionId)}`
          : "/api/subscriptions";
      return fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
    },
  },
};
