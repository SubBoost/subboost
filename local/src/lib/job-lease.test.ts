import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import {
  acquireLocalJobLease,
  releaseLocalJobLease,
  renewLocalJobLease,
  startLocalJobLeaseHeartbeat,
} from "./job-lease";

describe("local job lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("acquires only when the conditional database upsert returns a row", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ name: "local-cron", ownerToken: "owner", expiresAt: new Date() }])
      .mockResolvedValueOnce([]);

    await expect(acquireLocalJobLease({ name: "local-cron", leaseMs: 300_000 })).resolves.toMatchObject({
      name: "local-cron",
    });
    await expect(acquireLocalJobLease({ name: "local-cron", leaseMs: 300_000 })).resolves.toBeNull();
  });

  it("renews and releases only the current owner", async () => {
    const lease = { name: "local-cron", ownerToken: "owner", expiresAt: new Date() };
    mocks.prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await expect(renewLocalJobLease(lease, 300_000)).resolves.toBe(true);
    await expect(releaseLocalJobLease(lease)).resolves.toBeUndefined();
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("fails closed when heartbeat renewal loses ownership", async () => {
    const lease = { name: "local-cron", ownerToken: "owner", expiresAt: new Date() };
    mocks.prisma.$executeRaw.mockResolvedValueOnce(0);
    const heartbeat = startLocalJobLeaseHeartbeat({ lease, leaseMs: 300_000, intervalMs: 60_000 });

    await expect(heartbeat.assertOwned()).rejects.toThrow("Local job lease lost");
    await heartbeat.stop();
  });
});
