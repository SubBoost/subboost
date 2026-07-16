import { beforeEach, describe, expect, it, vi } from "vitest";
import { runLocalSubscriptionAutoUpdateCron } from "./auto-update-service";

const mocks = vi.hoisted(() => ({
  applyCronUpdateOutcome: vi.fn(),
  buildSubscriptionCacheExpiry: vi.fn(),
  buildSubscriptionFetchCallbacks: vi.fn(),
  createCronUpdateAccumulator: vi.fn(),
  encryptJson: vi.fn(),
  extractHostsFromSubscriptionUrls: vi.fn(),
  finalizeCronUpdateSummary: vi.fn(),
  prepareRefreshCacheResult: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    subscription: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    subscriptionAutoUpdateState: {
      upsert: vi.fn(),
    },
  },
  readSubscriptionSecrets: vi.fn(),
  recordCronUpdateSkipped: vi.fn(),
  refreshNodeSnapshot: vi.fn(),
  resolveAutomaticRefreshCompletionDecision: vi.fn(),
  resolveAutomaticRefreshFailureAnalysis: vi.fn(),
  resolveAutomaticRefreshUnexpectedFailureCompletion: vi.fn(),
  resolveAutoUpdateScheduleState: vi.fn(),
  resolveSubscriptionAutoUpdateState: vi.fn(),
}));

vi.mock("@subboost/server-core/subscription", () => ({
  applyCronUpdateOutcome: mocks.applyCronUpdateOutcome,
  createCronUpdateAccumulator: mocks.createCronUpdateAccumulator,
  extractHostsFromSubscriptionUrls: mocks.extractHostsFromSubscriptionUrls,
  finalizeCronUpdateSummary: mocks.finalizeCronUpdateSummary,
  prepareRefreshCacheResult: mocks.prepareRefreshCacheResult,
  recordCronUpdateSkipped: mocks.recordCronUpdateSkipped,
  refreshNodeSnapshot: mocks.refreshNodeSnapshot,
  resolveAutomaticRefreshCompletionDecision: mocks.resolveAutomaticRefreshCompletionDecision,
  resolveAutomaticRefreshFailureAnalysis: mocks.resolveAutomaticRefreshFailureAnalysis,
  resolveAutomaticRefreshUnexpectedFailureCompletion: mocks.resolveAutomaticRefreshUnexpectedFailureCompletion,
  resolveAutoUpdateScheduleState: mocks.resolveAutoUpdateScheduleState,
  resolveSubscriptionAutoUpdateState: mocks.resolveSubscriptionAutoUpdateState,
}));
vi.mock("./crypto", () => ({ encryptJson: mocks.encryptJson }));
vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./subscription-service", () => ({
  buildSubscriptionCacheExpiry: mocks.buildSubscriptionCacheExpiry,
  buildSubscriptionFetchCallbacks: mocks.buildSubscriptionFetchCallbacks,
  MAX_NODES_PER_SUBSCRIPTION: 500,
  readSubscriptionSecrets: mocks.readSubscriptionSecrets,
}));

const now = new Date("2026-06-06T00:00:00.000Z");
const subscription = {
  id: "sub-1",
  name: "Sub",
  ownerId: "admin-1",
  owner: { username: "ry" },
  autoUpdateInterval: 60,
  createdAt: new Date("2026-06-05T00:00:00.000Z"),
  lastUpdatedAt: null,
  autoUpdateState: null,
  updatedAt: new Date("2026-06-05T00:00:00.000Z"),
};

function accumulator(total: number) {
  return { total, skipped: 0, outcomes: [] as unknown[] };
}

describe("local subscription auto update service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    mocks.createCronUpdateAccumulator.mockImplementation(accumulator);
    mocks.recordCronUpdateSkipped.mockImplementation((acc) => {
      acc.skipped += 1;
    });
    mocks.applyCronUpdateOutcome.mockImplementation((acc, outcome) => {
      acc.outcomes.push(outcome);
    });
    mocks.finalizeCronUpdateSummary.mockImplementation((acc, options) => ({ ...acc, options }));
    mocks.prisma.subscription.findMany.mockResolvedValue([subscription]);
    mocks.prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.subscriptionAutoUpdateState.upsert.mockResolvedValue({ upsert: true });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback({
      subscription: { updateMany: mocks.prisma.subscription.updateMany },
      subscriptionAutoUpdateState: { upsert: mocks.prisma.subscriptionAutoUpdateState.upsert },
    }));
    mocks.resolveSubscriptionAutoUpdateState.mockReturnValue({ lastAttemptedAt: null, externalFailureCount: 0 });
    mocks.resolveAutoUpdateScheduleState.mockReturnValue({ due: true });
    mocks.readSubscriptionSecrets.mockReturnValue({ config: { rules: [] }, urls: ["https://airport.example/sub"], nodes: [] });
    mocks.extractHostsFromSubscriptionUrls.mockReturnValue(["airport.example"]);
    mocks.buildSubscriptionFetchCallbacks.mockReturnValue({ fetchSubscription: vi.fn() });
    mocks.refreshNodeSnapshot.mockResolvedValue({ savedSources: [{ url: "https://airport.example/sub" }] });
    mocks.resolveAutomaticRefreshFailureAnalysis.mockReturnValue({
      failureState: { externalFailureCount: 1 },
      failureReason: "all sources failed",
    });
    mocks.prepareRefreshCacheResult.mockReturnValue({
      ok: true,
      cacheEntry: { nodes: [{ name: "A" }], subscriptionInfo: { upload: 1 } },
      nodeCount: 1,
    });
    mocks.resolveAutomaticRefreshCompletionDecision.mockReturnValue({
      kind: "success",
      nextAutoUpdateState: {
        state: { lastAttemptedAt: now, externalFailureCount: 0 },
        shouldDisableAutoUpdate: false,
      },
      outcome: { kind: "updated", subscriptionId: "sub-1" },
    });
    mocks.resolveAutomaticRefreshUnexpectedFailureCompletion.mockReturnValue({
      attemptedState: { lastAttemptedAt: now, externalFailureCount: 1 },
      message: "unexpected",
      outcome: { kind: "failed", subscriptionId: "sub-1" },
    });
    mocks.encryptJson.mockImplementation((value) => ({ encrypted: value }));
    mocks.buildSubscriptionCacheExpiry.mockReturnValue(new Date("2026-06-07T00:00:00.000Z"));
  });

  it("uses the local six-minute minimum interval when saved values are lower", async () => {
    await runLocalSubscriptionAutoUpdateCron(now);

    expect(mocks.resolveAutoUpdateScheduleState).toHaveBeenCalledWith(
      expect.objectContaining({ intervalSeconds: 360 })
    );
  });

  it("skips subscriptions that are not due", async () => {
    mocks.resolveAutoUpdateScheduleState.mockReturnValueOnce({ due: false });

    await expect(runLocalSubscriptionAutoUpdateCron(now)).resolves.toEqual(
      expect.objectContaining({ total: 1, skipped: 1 })
    );

    expect(mocks.refreshNodeSnapshot).not.toHaveBeenCalled();
    expect(mocks.applyCronUpdateOutcome).not.toHaveBeenCalled();
  });

  it("refreshes due subscriptions and writes encrypted cache state", async () => {
    const result = await runLocalSubscriptionAutoUpdateCron(now);

    expect(result).toEqual(expect.objectContaining({ total: 1, outcomes: [{ kind: "updated", subscriptionId: "sub-1" }] }));
    expect(mocks.refreshNodeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { rules: [] },
        urls: ["https://airport.example/sub"],
        storedNodes: [],
      })
    );
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1", updatedAt: subscription.updatedAt },
        data: expect.objectContaining({
          encryptedNodes: { encrypted: [{ name: "A" }] },
          encryptedConfig: { encrypted: { rules: [], sources: [{ url: "https://airport.example/sub" }] } },
          encryptedSubscriptionInfo: { encrypted: { upload: 1 } },
        }),
      })
    );
    expect(mocks.prisma.subscriptionAutoUpdateState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subscriptionId: "sub-1" } })
    );
  });

  it("records all-source failures and disables auto update when requested", async () => {
    mocks.prepareRefreshCacheResult.mockReturnValueOnce({ ok: false, reason: "no_nodes" });
    mocks.resolveAutomaticRefreshCompletionDecision.mockReturnValueOnce({
      kind: "all_sources_failed",
      nextAutoUpdateState: {
        state: { lastAttemptedAt: now, externalFailureCount: 3 },
        shouldDisableAutoUpdate: true,
      },
      outcome: { kind: "disabled", subscriptionId: "sub-1" },
    });

    await expect(runLocalSubscriptionAutoUpdateCron(now)).resolves.toEqual(
      expect.objectContaining({ outcomes: [{ kind: "disabled", subscriptionId: "sub-1" }] })
    );

    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ autoUpdateInterval: null }),
      })
    );
    expect(console.warn).toHaveBeenCalledWith(
      "[local-subscription-cron] auto update disabled",
      expect.objectContaining({ subscriptionId: "sub-1" })
    );
  });

  it("records attempted state for partial refresh failures", async () => {
    mocks.prepareRefreshCacheResult.mockReturnValueOnce({ ok: false, reason: "partial" });
    mocks.resolveAutomaticRefreshCompletionDecision.mockReturnValueOnce({
      kind: "retry",
      attemptedState: { lastAttemptedAt: now, externalFailureCount: 1 },
      outcome: { kind: "failed", subscriptionId: "sub-1" },
    });

    await runLocalSubscriptionAutoUpdateCron(now);

    expect(mocks.prisma.subscriptionAutoUpdateState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ externalFailureCount: 1 }),
        update: expect.objectContaining({ externalFailureCount: 1 }),
      })
    );
    expect(mocks.applyCronUpdateOutcome).toHaveBeenCalledWith(expect.anything(), {
      kind: "failed",
      subscriptionId: "sub-1",
    });
  });

  it("captures unexpected failures and keeps the cron summary going", async () => {
    mocks.readSubscriptionSecrets.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error("state write failed"));

    await expect(runLocalSubscriptionAutoUpdateCron(now)).resolves.toEqual(
      expect.objectContaining({ outcomes: [{ kind: "failed", subscriptionId: "sub-1" }] })
    );

    expect(mocks.resolveAutomaticRefreshUnexpectedFailureCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedHosts: [],
        error: expect.any(Error),
        attemptStartedAt: expect.any(Date),
      })
    );
    expect(console.error).toHaveBeenCalledWith(
      "[local-subscription-cron] failed",
      expect.objectContaining({ subscriptionId: "sub-1", message: "unexpected" })
    );
  });

  it("treats a CAS miss as a stale skip without publishing success", async () => {
    mocks.prisma.subscription.updateMany.mockResolvedValueOnce({ count: 0 });

    await runLocalSubscriptionAutoUpdateCron(now);

    expect(mocks.prisma.subscriptionAutoUpdateState.upsert).not.toHaveBeenCalled();
    expect(mocks.applyCronUpdateOutcome).toHaveBeenCalledWith(expect.anything(), {
      status: "skipped",
      requestedHosts: ["airport.example"],
      recordHosts: false,
    });
    expect(console.info).not.toHaveBeenCalled();
  });
});
