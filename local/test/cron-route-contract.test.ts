import { beforeEach, describe, expect, it, vi } from "vitest";

import { runLocalSubscriptionAutoUpdateCron } from "@local/lib/auto-update-service";
import { refreshRuleIndex } from "@local/lib/rule-catalog";
import * as updateSubscriptionsRoute from "../app/api/cron/update-subscriptions/route";
import * as updateRuleIndexRoute from "../app/api/cron/update-rule-index/route";

vi.mock("@local/lib/auto-update-service", () => ({
  runLocalSubscriptionAutoUpdateCron: vi.fn(),
}));

vi.mock("@local/lib/rule-catalog", () => ({
  refreshRuleIndex: vi.fn(),
}));

function cronRequest(secret?: string): Request {
  return new Request("http://local.test/api/cron/update-subscriptions", {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

function cronRequestWithAuthorization(authorization: string): Request {
  return new Request("http://local.test/api/cron/update-subscriptions", {
    method: "POST",
    headers: { Authorization: authorization },
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CRON_SECRET", "secret-1");
  vi.mocked(runLocalSubscriptionAutoUpdateCron).mockResolvedValue({
    results: { total: 0, updated: 0, skipped: 0, failed: 0, errors: [] },
    updatedSubscriptions: [],
    failedSubscriptions: [],
    updatedUsers: [],
    topHosts: [],
  });
  vi.mocked(refreshRuleIndex).mockResolvedValue({
    status: "skipped",
    index: { geosite: [], geoip: [], fetchedAt: 1, expiresAt: 2, source: "remote" },
    diff: {
      fetchedAt: 1,
      totalRemoteRules: 0,
      totalCuratedRules: 0,
      missingCuratedRules: [],
      missingModuleRuleRefs: [],
      duplicateCuratedRuleIds: [],
      unknownCategories: [],
      remoteOnlySample: [],
    },
  });
});

describe("local cron routes", () => {
  it("rejects cron calls when CRON_SECRET is missing in production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await updateSubscriptionsRoute.POST(cronRequest());
    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      error: "CRON_SECRET not configured.",
      code: "CONFIGURATION_ERROR",
    });
    expect(runLocalSubscriptionAutoUpdateCron).not.toHaveBeenCalled();
  });

  it("allows missing CRON_SECRET only for the explicit development bypass", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_CRON", "true");
    vi.stubEnv("CRON_SECRET", "");

    const response = await updateSubscriptionsRoute.POST(cronRequest());

    expect(response.status).toBe(200);
    expect(runLocalSubscriptionAutoUpdateCron).toHaveBeenCalledTimes(1);
  });

  it("rejects calls with the wrong cron secret", async () => {
    const response = await updateSubscriptionsRoute.POST(cronRequest("wrong"));
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({
      error: "Invalid cron secret.",
      code: "UNAUTHORIZED",
    });
    expect(runLocalSubscriptionAutoUpdateCron).not.toHaveBeenCalled();
  });

  it("rejects raw token authorization headers", async () => {
    const response = await updateSubscriptionsRoute.POST(cronRequestWithAuthorization("secret-1"));
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({
      error: "Invalid cron secret.",
      code: "UNAUTHORIZED",
    });
    expect(runLocalSubscriptionAutoUpdateCron).not.toHaveBeenCalled();
  });

  it("runs the local subscription auto-update cron when authorized", async () => {
    const response = await updateSubscriptionsRoute.POST(cronRequest("secret-1"));
    expect(response.status).toBe(200);
    expect(runLocalSubscriptionAutoUpdateCron).toHaveBeenCalledTimes(1);
    expect((await readJson(response)).success).toBe(true);
  });

  it("runs the rule index refresh cron when authorized", async () => {
    const response = await updateRuleIndexRoute.POST(
      new Request("http://local.test/api/cron/update-rule-index", {
        method: "POST",
        headers: { Authorization: "bearer secret-1" },
      })
    );
    expect(response.status).toBe(200);
    expect(refreshRuleIndex).toHaveBeenCalledWith({ force: false });
    expect((await readJson(response)).success).toBe(true);
  });
});
