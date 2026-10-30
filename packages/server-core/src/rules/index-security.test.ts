import { collectCnCandidateParents } from "@subboost/core/rules/cn-candidate-utils";
import { describe, expect, it, vi } from "vitest";
import { createRuleCatalogService, RuleIndexUnavailableError } from "./index";

function tree(paths: string[]): Response {
  return Response.json({ tree: paths.map((path) => ({ path, type: "blob", sha: "x" })) });
}

describe("rule discovery resource limits", () => {
  it("reuses the same list across distinct parent sets while honoring real exclusions", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta")) return Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] });
      if (url.includes("/git/trees/geo")) return tree(["geosite/google-cn.mrs", "geosite/youtube-cn.mrs", "geosite/geolocation-cn.mrs"]);
      return new Response(url.includes("geolocation-cn") ? "+.covered.test" : "+.example.test");
    }) as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl });
    const both = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google", "youtube"] });
    const google = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google"] });
    const excluded = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google", "youtube"], excludedRuleKeys: ["youtube:youtube", "not:a-real-parent"] });
    expect(both.allItems.map((item) => item.id)).toEqual(expect.arrayContaining(["google-cn", "youtube-cn"]));
    expect(google.allItems.map((item) => item.id)).toEqual(["google-cn"]);
    expect(excluded.allItems.map((item) => item.id)).toEqual(["google-cn"]);
    const listUrls = vi.mocked(fetchImpl).mock.calls.map(([input]) => String(input)).filter((url) => url.endsWith(".list"));
    expect(listUrls).toHaveLength(3);
    expect(new Set(listUrls).size).toBe(3);
  });

  it("rejects excess distinct discoveries while sharing in-flight list work", async () => {
    const parents = collectCnCandidateParents([], { defaultToAll: true }).slice(0, 5);
    expect(parents).toHaveLength(5);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta")) return Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] });
      if (url.includes("/git/trees/geo")) return tree(["geosite/geolocation-cn.mrs"]);
      await pending;
      return new Response("+.covered.test");
    }) as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl });
    await service.getRemoteRuleIndex();
    const keys = parents.map((parent) => `${parent.parentModuleId}:${parent.parentRuleId}`);
    const discoveries = Array.from({ length: 16 }, (_, mask) => service.getCnRuleCandidateDiscovery({
      moduleIds: [], excludedRuleKeys: keys.filter((_, index) => (mask & (1 << index)) !== 0),
    }));
    const excess = service.getCnRuleCandidateDiscovery({ moduleIds: [], excludedRuleKeys: [keys[4]] });
    await expect(excess).rejects.toBeInstanceOf(RuleIndexUnavailableError);
    await vi.waitFor(() => expect(vi.mocked(fetchImpl).mock.calls.filter(([input]) => String(input).endsWith(".list"))).toHaveLength(1));
    release();
    expect(await Promise.all(discoveries)).toHaveLength(16);
  });

  it("preserves stale and unavailable behavior when streamed lists exceed their limit", async () => {
    let oversized = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta")) return Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] });
      if (url.includes("/git/trees/geo")) return tree(["geosite/google-cn.mrs"]);
      return new Response(oversized ? "a".repeat(2 * 1024 * 1024 + 1) : "+.example.test");
    }) as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl });
    const first = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google"] });
    oversized = true;
    expect(await service.getCnRuleCandidateDiscovery({ moduleIds: ["google"], force: true })).toMatchObject({ source: "stale", allItems: first.allItems });
    const fresh = createRuleCatalogService({ fetchImpl });
    await expect(fresh.getCnRuleCandidateDiscovery({ moduleIds: ["google"] })).rejects.toBeInstanceOf(RuleIndexUnavailableError);
  });

  it("rejects a small-byte response that expands into excessive line entries", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta")) return Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] });
      if (url.includes("/git/trees/geo")) return tree(["geosite/google-cn.mrs"]);
      return new Response("\n".repeat(100_001));
    }) as typeof fetch;
    await expect(createRuleCatalogService({ fetchImpl }).getCnRuleCandidateDiscovery({ moduleIds: ["google"] }))
      .rejects.toThrow("too many lines");
  });

  it("bounds the combined size of otherwise valid lists in one discovery", async () => {
    const body = Array.from({ length: 55_000 }, (_, index) => `+.entry${index}.test`).join("\n");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta")) return Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] });
      if (url.includes("/git/trees/geo")) return tree(["geosite/google-cn.mrs", "geosite/youtube-cn.mrs"]);
      return new Response(body);
    }) as typeof fetch;
    await expect(createRuleCatalogService({ fetchImpl }).getCnRuleCandidateDiscovery({ moduleIds: ["google", "youtube"] }))
      .rejects.toThrow("discovery is too large");
  });

  it("bounds discovery cache entries even for many real exclusion combinations", async () => {
    const parents = collectCnCandidateParents([], { defaultToAll: true }).slice(0, 7);
    expect(parents).toHaveLength(7);
    const keys = parents.map((parent) => `${parent.parentModuleId}:${parent.parentRuleId}`);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/git/trees/meta")
      ? Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] })
      : tree([])) as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl, now: () => 100 });
    const entries = [];
    for (let mask = 0; mask < 65; mask += 1) {
      entries.push(await service.getCnRuleCandidateDiscovery({
        moduleIds: [], excludedRuleKeys: keys.filter((_, index) => (mask & (1 << index)) !== 0),
      }));
    }
    const firstAgain = await service.getCnRuleCandidateDiscovery({ moduleIds: [] });
    expect(firstAgain).toEqual(entries[0]);
    expect(firstAgain).not.toBe(entries[0]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects an oversized tree and returns a verified stale index when available", async () => {
    let oversized = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (oversized) return new Response("x".repeat(8 * 1024 * 1024 + 1));
      return String(input).includes("/git/trees/meta")
        ? Response.json({ tree: [{ path: "geo", type: "tree", sha: "geo" }] })
        : tree(["geosite/google.mrs"]);
    }) as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl });
    expect((await service.getRemoteRuleIndex()).geosite).toEqual(["google"]);
    oversized = true;
    expect(await service.getRemoteRuleIndex({ force: true })).toMatchObject({ source: "stale", geosite: ["google"] });
    await expect(createRuleCatalogService({ fetchImpl }).getRemoteRuleIndex()).rejects.toBeInstanceOf(RuleIndexUnavailableError);
  });
});
