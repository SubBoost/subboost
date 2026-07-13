import { describe, expect, it } from "vitest";
import {
  classifyStableExternalAutoUpdateFailure,
  parseAutoUpdateFailureSourceState,
  serializeAutoUpdateFailureSourceState,
  updateAutoUpdateFailureSourceState,
} from "./auto-update-failure";

describe("parseAutoUpdateFailureSourceState", () => {
  it("keeps valid source streak entries", () => {
    expect(
      parseAutoUpdateFailureSourceState(
        JSON.stringify({
          sourceA: {
            count: 2,
            fingerprint: "fingerprint-a",
            reason: "目标订阅服务返回 HTTP 403",
            lastFailedAt: "2026-05-20T00:00:00.000Z",
          },
        })
      )
    ).toEqual({
      sourceA: {
        count: 2,
        fingerprint: "fingerprint-a",
        reason: "目标订阅服务返回 HTTP 403",
        lastFailedAt: "2026-05-20T00:00:00.000Z",
      },
    });
  });

  it("drops malformed source streak entries and invalid JSON", () => {
    expect(parseAutoUpdateFailureSourceState("not-json")).toEqual({});
    expect(parseAutoUpdateFailureSourceState(JSON.stringify(["bad"]))).toEqual({});
    expect(
      parseAutoUpdateFailureSourceState(
        JSON.stringify({
          missingReason: {
            count: 1,
            fingerprint: "fingerprint-a",
            lastFailedAt: "2026-05-20T00:00:00.000Z",
          },
          invalidCount: {
            count: 0,
            fingerprint: "fingerprint-b",
            reason: "目标订阅服务返回 HTTP 403",
            lastFailedAt: "2026-05-20T00:00:00.000Z",
          },
          valid: {
            count: 1,
            fingerprint: "fingerprint-c",
            reason: "目标订阅服务返回 HTTP 404",
            lastFailedAt: "2026-05-20T01:00:00.000Z",
          },
        })
      )
    ).toEqual({
      valid: {
        count: 1,
        fingerprint: "fingerprint-c",
        reason: "目标订阅服务返回 HTTP 404",
        lastFailedAt: "2026-05-20T01:00:00.000Z",
      },
    });
  });
});

describe("serializeAutoUpdateFailureSourceState", () => {
  it("keeps empty source state serialized as null", () => {
    expect(serializeAutoUpdateFailureSourceState({})).toBeNull();
  });
});

describe("classifyStableExternalAutoUpdateFailure", () => {
  it("separates stable external failures from project-side or transient failures", () => {
    expect(classifyStableExternalAutoUpdateFailure({ errorMessage: "当前解析任务较多" })).toEqual({
      isStableExternalFailure: false,
      reason: "服务暂时不可用",
    });
    expect(classifyStableExternalAutoUpdateFailure({ httpStatus: 502 })).toEqual({
      isStableExternalFailure: false,
      reason: "目标服务临时错误 HTTP 502",
    });
    expect(classifyStableExternalAutoUpdateFailure({ responseStatus: 408 })).toEqual({
      isStableExternalFailure: true,
      reason: "订阅源请求超时 HTTP 408",
    });
    expect(classifyStableExternalAutoUpdateFailure({ errorMessage: "HTTP 429" })).toEqual({
      isStableExternalFailure: true,
      reason: "目标订阅服务返回 HTTP 429",
    });
    expect(classifyStableExternalAutoUpdateFailure({ errorCategory: "parse", errorMessage: "未解析到可用节点" })).toEqual({
      isStableExternalFailure: true,
      reason: "订阅内容格式或解析失败",
    });
    expect(classifyStableExternalAutoUpdateFailure({ errorCategory: "security", errorMessage: "内网地址禁止访问" })).toEqual({
      isStableExternalFailure: true,
      reason: "订阅 URL 不符合公网拉取要求",
    });
    expect(classifyStableExternalAutoUpdateFailure({ errorMessage: "ENOTFOUND sub.example.com" })).toEqual({
      isStableExternalFailure: true,
      reason: "订阅域名或证书异常",
    });
    expect(classifyStableExternalAutoUpdateFailure({ errorMessage: "unknown internal condition" })).toEqual({
      isStableExternalFailure: false,
      reason: "失败原因不满足稳定外部失败口径",
    });
  });
});

describe("updateAutoUpdateFailureSourceState", () => {
  it("increments stable failures, resets changed fingerprints, and disables at threshold", () => {
    const failedAt = new Date("2026-06-01T00:00:00.000Z");
    const sources = [
      { id: "source-a", type: "url", content: "https://example.com/a" },
      { id: "source-b", type: "url", content: "https://example.com/b" },
    ];
    const previous = updateAutoUpdateFailureSourceState({
      previousStateRaw: null,
      sources,
      failedSources: [{ ...sources[0], errorMessage: "HTTP 403", httpStatus: 403 }],
      failedAt,
    });

    expect(previous.maxFailureCount).toBe(1);
    expect(previous.shouldDisableAutoUpdate).toBe(false);

    const second = updateAutoUpdateFailureSourceState({
      previousStateRaw: previous.serializedSourceState,
      sources,
      failedSources: [
        { ...sources[0], errorMessage: "HTTP 403", httpStatus: 403 },
        { ...sources[1], errorMessage: "HTTP 502", httpStatus: 502 },
      ],
      failedAt,
      threshold: 2,
    });

    expect(second.failedSources).toEqual([
      {
        count: 2,
        isStableExternalFailure: true,
        reason: "目标订阅服务返回 HTTP 403",
        sourceId: "source-a",
      },
      {
        count: 0,
        isStableExternalFailure: false,
        reason: "目标服务临时错误 HTTP 502",
        sourceId: "source-b",
      },
    ]);
    expect(second.disableSource?.sourceId).toBe("source-a");
    expect(second.shouldDisableAutoUpdate).toBe(true);

    const changedFingerprint = updateAutoUpdateFailureSourceState({
      previousStateRaw: second.serializedSourceState,
      sources: [{ id: "source-a", type: "url", content: "https://example.com/new-a" }],
      failedSources: [{ id: "source-a", type: "url", content: "https://example.com/new-a", errorMessage: "HTTP 403" }],
      failedAt,
      threshold: 3,
    });

    expect(changedFingerprint.maxFailureCount).toBe(1);
    expect(changedFingerprint.shouldDisableAutoUpdate).toBe(false);
  });

  it("uses a fingerprint as the source key when an id is missing", () => {
    const result = updateAutoUpdateFailureSourceState({
      previousStateRaw: null,
      sources: [{ type: "url", content: "https://example.com/no-id" }],
      failedAt: new Date("2026-06-01T00:00:00.000Z"),
      failedSources: [{ type: "url", content: "https://example.com/no-id", errorMessage: "ECONNRESET" }],
    });

    expect(result.stableFailedSources).toHaveLength(1);
    expect(result.stableFailedSources[0]?.sourceId).toMatch(/^[0-9a-f]{32}$/);
    expect(result.serializedSourceState).toContain(result.stableFailedSources[0]?.sourceId);
  });
});
