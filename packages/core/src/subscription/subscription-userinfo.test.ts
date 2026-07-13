import { describe, expect, it } from "vitest";
import {
  hasSubscriptionUserInfo,
  isPlausibleSubscriptionUserInfo,
  mergeSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  parseSubscriptionUserInfo,
  resolveSubscriptionUserInfo,
} from "./subscription-userinfo";
import type { ParsedNode } from "@subboost/core/types/node";

function infoNode(name: string): ParsedNode {
  return {
    name,
    type: "direct",
  } as ParsedNode;
}

describe("subscription user info helpers", () => {
  it("parses numeric and date-like subscription-userinfo headers", () => {
    expect(parseSubscriptionUserInfo("upload=1024; download=2.5e3; total=4096; expire=2026-02-19")).toEqual({
      upload: 1024,
      download: 2500,
      total: 4096,
      expire: Math.floor(Date.UTC(2026, 1, 19, 12, 0, 0) / 1000),
    });
    expect(parseSubscriptionUserInfo("upload=-1; total=bad; expire=2026-02-19T00%3A00%3A00Z")).toMatchObject({
      expire: Math.floor(Date.parse("2026-02-19T00:00:00Z") / 1000),
    });
    expect(parseSubscriptionUserInfo("upload=1%ZZ; download=NaN; expire=2026-13-01")).toEqual({});
    expect(parseSubscriptionUserInfo("upload=10.9; expire=bad")).toEqual({
      upload: 10,
      download: undefined,
      total: undefined,
      expire: undefined,
    });
  });

  it("normalizes millisecond expiry values and rejects implausible magnitudes", () => {
    expect(parseSubscriptionUserInfo("expire=1760000000000").expire).toBe(1760000000);
    expect(parseSubscriptionUserInfo("expire=9999999999999999").expire).toBeUndefined();
    expect(normalizeSubscriptionUserInfo({ expire: 1760000000000 }).expire).toBe(1760000000);
  });

  it("normalizes plausibility and merges traffic snapshots", () => {
    expect(hasSubscriptionUserInfo(null)).toBe(false);
    expect(hasSubscriptionUserInfo(undefined)).toBe(false);
    expect(hasSubscriptionUserInfo({})).toBe(false);
    expect(hasSubscriptionUserInfo({ upload: 0 })).toBe(true);
    expect(isPlausibleSubscriptionUserInfo({ expire: 1900000000 })).toBe(true);
    expect(isPlausibleSubscriptionUserInfo({ upload: 2048 })).toBe(true);
    expect(isPlausibleSubscriptionUserInfo({ total: 2048 })).toBe(true);
    expect(isPlausibleSubscriptionUserInfo({ total: 10, upload: 1 })).toBe(false);
    expect(
      normalizeSubscriptionUserInfo({
        upload: -1,
        download: 2,
        total: 3,
        expire: 1,
      })
    ).toEqual({
      download: 2,
      total: 3,
    });
    expect(
      normalizeSubscriptionUserInfo({
        upload: Number.NaN,
        download: Number.POSITIVE_INFINITY,
        total: 0,
        expire: 1900000000,
      })
    ).toEqual({ total: 0, expire: 1900000000 });

    expect(
      mergeSubscriptionUserInfo(
        { upload: 1, download: 2, total: 3, expire: 2000000000 },
        { upload: 4, download: 5, total: 6, expire: 1900000000 }
      )
    ).toEqual({ upload: 5, download: 7, total: 9, expire: 1900000000 });
    expect(
      mergeSubscriptionUserInfo({ upload: 1 }, { upload: -1, download: 2, total: Number.NaN, expire: 2000000000 })
    ).toEqual({ upload: 1, download: 2, expire: 2000000000 });
  });

  it("uses info-node hints when headers are missing or clearly invalid", () => {
    const nodes = [
      infoNode("剩余流量: 8 GB"),
      infoNode("已用流量: 2 GB"),
      infoNode("总流量: 10 GB"),
      infoNode("套餐到期: 2026-02-19"),
    ];

    expect(resolveSubscriptionUserInfo({ upload: 1, download: 1, total: 2 }, nodes)).toMatchObject({
      upload: 2 * 1024 ** 3,
      download: 0,
      total: 10 * 1024 ** 3,
      expire: Math.floor(Date.UTC(2026, 1, 19, 12, 0, 0) / 1000),
    });
    expect(resolveSubscriptionUserInfo({}, [infoNode("总流量: 10 GB"), infoNode("剩余订阅流量: 1 GB")])).toMatchObject({
      upload: 9 * 1024 ** 3,
      download: 0,
      total: 10 * 1024 ** 3,
    });
    expect(resolveSubscriptionUserInfo({ upload: 2048, total: 1024 }, [])).toEqual({});
  });

  it("keeps meaningful headers while filling missing expiry from info nodes", () => {
    expect(
      resolveSubscriptionUserInfo(
        { upload: 2048, download: 1024, total: 4096 },
        [infoNode("总量: 20 GB"), infoNode("累计使用: 1 GB"), infoNode("订阅到期: 2026-03-01")]
      )
    ).toEqual({
      upload: 2048,
      download: 1024,
      total: 4096,
      expire: Math.floor(Date.UTC(2026, 2, 1, 12, 0, 0) / 1000),
    });
  });

  it("derives partial traffic snapshots from node hints", () => {
    expect(resolveSubscriptionUserInfo({}, [infoNode("累计已用: 1.5 GB")])).toEqual({
      upload: Math.round(1.5 * 1024 ** 3),
      download: 0,
    });
    expect(resolveSubscriptionUserInfo({}, [infoNode("总流量: 10 GB"), infoNode("剩余流量: 12 GB")])).toEqual({
      upload: 0,
      download: 0,
      total: 10 * 1024 ** 3,
    });
    expect(resolveSubscriptionUserInfo({}, [infoNode("流量上限: 10 GB")])).toEqual({});
    expect(resolveSubscriptionUserInfo({ upload: 2048, total: 1024 }, [infoNode("剩余流量: 999 B")])).toEqual({});
  });

  it("ignores unusable node labels and invalid date hints", () => {
    expect(
      resolveSubscriptionUserInfo(
        { expire: 1, upload: 2048 },
        [
          infoNode("剩余流量 8 GB"),
          infoNode("已使用流量: bad"),
          infoNode("套餐流量: -1 GB"),
          infoNode("过期时间: 2026-13-01"),
        ]
      )
    ).toEqual({ upload: 2048 });
    expect(resolveSubscriptionUserInfo(undefined, [infoNode("")])).toEqual({});
  });
});
