import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    localAdmin: { findFirst: mocks.findFirst },
  },
}));

import { getAllowUnsafeSubscriptionSources } from "./source-import-settings";

describe("local source import settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to disabled when no local administrator exists", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    await expect(getAllowUnsafeSubscriptionSources()).resolves.toBe(false);
  });

  it("reads the persisted local administrator setting", async () => {
    mocks.findFirst.mockResolvedValueOnce({ allowUnsafeSubscriptionSources: true });

    await expect(getAllowUnsafeSubscriptionSources()).resolves.toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      select: { allowUnsafeSubscriptionSources: true },
    });
  });
});
