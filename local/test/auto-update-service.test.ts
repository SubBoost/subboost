import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshNodeSnapshot } from "@subboost/server-core/subscription";
import { prisma } from "@local/lib/prisma";
import { runLocalSubscriptionAutoUpdateCron } from "@local/lib/auto-update-service";

const dbMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(async () => ({ count: 1 })),
  upsert: vi.fn(async (args) => args),
  transaction: vi.fn(),
}));

vi.mock("@local/lib/crypto", () => ({
  decryptJson: vi.fn((ciphertext: string | null | undefined, fallback: unknown) =>
    ciphertext ? JSON.parse(ciphertext.replace(/^json:/, "")) : fallback
  ),
  decryptJsonObject: vi.fn((ciphertext: string | null | undefined) =>
    ciphertext ? JSON.parse(ciphertext.replace(/^json:/, "")) : {}
  ),
  encryptJson: vi.fn((value: unknown) => `encrypted:${JSON.stringify(value)}`),
}));

vi.mock("@local/lib/prisma", () => ({
  prisma: {
    subscription: {
      findMany: dbMocks.findMany,
      updateMany: dbMocks.updateMany,
    },
    subscriptionAutoUpdateState: {
      upsert: dbMocks.upsert,
    },
    $transaction: dbMocks.transaction,
  },
}));

vi.mock("@subboost/server-core/subscription", async (importActual) => {
  const actual = await importActual<typeof import("@subboost/server-core/subscription")>();
  return {
    ...actual,
    refreshNodeSnapshot: vi.fn(),
  };
});

const node = {
  name: "node-a",
  type: "trojan",
  server: "example.com",
  port: 443,
  password: "secret",
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    ownerId: "admin-1",
    name: "Main",
    token: "token-1",
    isPrimary: false,
    encryptedUrls: 'json:["https://example.com/sub.yaml"]',
    encryptedNodes: "json:[]",
    encryptedConfig: 'json:{"sources":[{"id":"src-1","type":"url","content":"https://example.com/sub.yaml"}]}',
    encryptedSubscriptionInfo: "json:{}",
    autoUpdateInterval: 3600,
    cacheExpiresAt: null,
    lastAccessedAt: null,
    lastUpdatedAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    owner: { username: "root" },
    autoUpdateState: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.subscription.findMany).mockReset();
  vi.mocked(prisma.subscription.updateMany).mockClear();
  vi.mocked(prisma.subscriptionAutoUpdateState.upsert).mockClear();
  vi.mocked(prisma.$transaction).mockClear();
  dbMocks.updateMany.mockResolvedValue({ count: 1 });
  dbMocks.transaction.mockImplementation(async (callback) => callback({
    subscription: { updateMany: dbMocks.updateMany },
    subscriptionAutoUpdateState: { upsert: dbMocks.upsert },
  }));
  vi.mocked(refreshNodeSnapshot).mockReset();
});

describe("local subscription auto-update service", () => {
  it("skips subscriptions that are not due yet", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([
      subscription({ createdAt: new Date("2026-06-02T00:00:00.000Z"), lastUpdatedAt: new Date("2026-06-02T00:00:00.000Z") }),
    ] as never);

    const summary = await runLocalSubscriptionAutoUpdateCron(new Date("2026-06-02T00:30:00.000Z"));
    expect(summary.results).toMatchObject({ total: 1, updated: 0, skipped: 1, failed: 0 });
    expect(refreshNodeSnapshot).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("refreshes due subscriptions and persists the refreshed cache", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([subscription()] as never);
    vi.mocked(refreshNodeSnapshot).mockResolvedValue({
      nodes: [node],
      subscriptionInfo: { upload: 0, download: 0, total: 1024 },
      savedSources: [{ id: "src-1", type: "url", content: "https://example.com/sub.yaml" }],
      attemptedUrlFetch: true,
      usedUrlFetch: true,
      refreshableSourceCount: 1,
      refreshedSourceCount: 1,
      refreshedUrlSourceCount: 1,
      refreshedStaticSourceCount: 0,
      detachedSourceCount: 0,
      failedSourceCount: 0,
      failedSources: [],
    } as never);

    const summary = await runLocalSubscriptionAutoUpdateCron(new Date("2026-06-02T02:00:00.000Z"));
    expect(summary.results).toMatchObject({ total: 1, updated: 1, skipped: 0, failed: 0 });
    expect(refreshNodeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ["https://example.com/sub.yaml"],
        storedNodes: [],
      })
    );
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1", updatedAt: new Date("2026-06-01T00:00:00.000Z") },
        data: expect.objectContaining({
          encryptedNodes: expect.stringContaining("node-a"),
          encryptedConfig: expect.stringContaining("src-1"),
          lastUpdatedAt: expect.any(Date),
          cacheExpiresAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.subscriptionAutoUpdateState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: "sub-1" },
        update: expect.objectContaining({
          externalFailureCount: 0,
          lastAttemptedAt: expect.any(Date),
        }),
      })
    );
  });
});
