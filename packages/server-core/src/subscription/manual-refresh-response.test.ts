import { describe, expect, it } from "vitest";
import type {
  PreparedRefreshCacheResult,
  RefreshNodeSnapshotResult,
} from "./index";
import {
  buildManualRefreshFailureResponse,
  buildManualRefreshSuccessResponseBody,
} from "./manual-refresh-response";

function makeSnapshot(overrides: Partial<RefreshNodeSnapshotResult> = {}): RefreshNodeSnapshotResult {
  return {
    nodes: [],
    subscriptionInfo: {},
    savedSources: [],
    attemptedUrlFetch: true,
    usedUrlFetch: true,
    refreshableSourceCount: 2,
    refreshedSourceCount: 1,
    refreshedUrlSourceCount: 1,
    refreshedStaticSourceCount: 0,
    detachedSourceCount: 0,
    failedSourceCount: 1,
    failedSources: [],
    ...overrides,
  };
}

describe("manual refresh response helpers", () => {
  it("maps all failed source refreshes to the manual refresh external failure response", () => {
    const refreshResult: Extract<PreparedRefreshCacheResult, { ok: false }> = {
      ok: false,
      reason: "all_sources_failed",
      nodeCount: 0,
    };

    expect(buildManualRefreshFailureResponse({ refreshResult, maxNodesPerSubscription: 100 })).toEqual({
      body: {
        error: "刷新失败：所有导入源均不可用，已保留旧快照。",
        code: "EXTERNAL_FETCH_FAILED",
      },
      status: 502,
    });
  });

  it("maps empty refresh results to the manual refresh not found response", () => {
    const refreshResult: Extract<PreparedRefreshCacheResult, { ok: false }> = {
      ok: false,
      reason: "empty_result",
      nodeCount: 0,
    };

    expect(buildManualRefreshFailureResponse({ refreshResult, maxNodesPerSubscription: 100 })).toEqual({
      body: {
        error: "无可用节点：导入源不可用或解析失败。",
        code: "NOT_FOUND",
      },
      status: 404,
    });
  });

  it("maps node quota failures with the effective max node count", () => {
    const refreshResult: Extract<PreparedRefreshCacheResult, { ok: false }> = {
      ok: false,
      reason: "node_quota_exceeded",
      nodeCount: 101,
      maxNodesPerSubscription: 50,
    };

    expect(buildManualRefreshFailureResponse({ refreshResult, maxNodesPerSubscription: 100 })).toEqual({
      body: {
        error: "已超过节点数量上限 (50)",
        code: "QUOTA_EXCEEDED",
      },
      status: 403,
    });
  });

  it("builds the manual refresh success response body from snapshot and cache timestamp", () => {
    const refreshResult: Extract<PreparedRefreshCacheResult, { ok: true }> = {
      ok: true,
      refreshedConfig: {},
      cacheEntry: { nodes: [], generatedYaml: "yaml", subscriptionInfo: {} },
      generatedYaml: "yaml",
      nodeCount: 3,
    };

    expect(
      buildManualRefreshSuccessResponseBody({
        subscriptionId: "sub-1",
        refreshResult,
        snapshot: makeSnapshot({
          attemptedUrlFetch: false,
          usedUrlFetch: false,
          refreshableSourceCount: 4,
          refreshedSourceCount: 2,
          refreshedUrlSourceCount: 1,
          refreshedStaticSourceCount: 1,
          failedSourceCount: 2,
        }),
        cachedAt: new Date("2026-05-30T01:02:03.000Z"),
      })
    ).toEqual({
      success: true,
      subscriptionId: "sub-1",
      nodeCount: 3,
      attemptedUrlFetch: false,
      usedUrlFetch: false,
      refreshableSourceCount: 4,
      refreshedSourceCount: 2,
      refreshedUrlSourceCount: 1,
      refreshedStaticSourceCount: 1,
      failedSourceCount: 2,
      updatedAt: "2026-05-30T01:02:03.000Z",
    });
  });
});
