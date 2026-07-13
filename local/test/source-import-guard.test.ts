import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@local/lib/source-import-settings", () => ({
  getAllowUnsafeSubscriptionSources: vi.fn(async () => false),
}));

import { importSourceUrlDirect } from "@local/lib/source-import";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("local source import network guard", () => {
  it("rejects local addresses before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await importSourceUrlDirect({ url: "http://127.0.0.1:8080/sub.yaml" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorInfo.category).toBe("security");
      expect(result.error).toContain("禁止访问");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
