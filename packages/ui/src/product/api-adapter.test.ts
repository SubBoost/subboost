import { describe, expect, it, vi } from "vitest";
import { createRulesProductApi } from "./api-adapter";

describe("createRulesProductApi", () => {
  it.each([undefined, "/custom/detect"])("posts rule detection to the configured endpoint: %s", async (endpoint) => {
    const metadata = { name: "rules", path: "https://local.subboost.test/rules", format: "text", behavior: "domain" };
    const fetchImpl = vi.fn(async () => Response.json(metadata));
    const signal = new AbortController().signal;
    const api = createRulesProductApi({ ruleDetectionEndpoint: endpoint, fetchImpl });
    expect(await api.detectRuleSet?.({ url: metadata.path, signal })).toEqual(metadata);
    expect(fetchImpl).toHaveBeenCalledWith(endpoint ?? "/api/rules/detect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: metadata.path }), signal, cache: "no-store",
    });
  });

  it("surfaces rule detection failures", async () => {
    const api = createRulesProductApi({ fetchImpl: vi.fn(async () => Response.json({ error: "unsupported" }, { status: 422 })) });
    await expect(api.detectRuleSet?.({ url: "https://local.subboost.test/rules" })).rejects.toThrow("unsupported");
  });

  it("uses the default rules endpoints and preserves response fallbacks", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://subboost.test");
      calls.push({ url, init });

      if (url.pathname === "/api/rules/search" && url.searchParams.get("keyword") === "") {
        return new Response(JSON.stringify({ totalRules: 123 }));
      }
      if (url.pathname === "/api/rules/search") {
        return new Response(
          JSON.stringify({
            items: [{ id: "google", name: "google", nameZh: "Google" }],
            totalRules: 123,
            totalMatched: 1,
            source: "remote",
          })
        );
      }
      if (url.pathname === "/api/rules/cn-candidates") {
        return new Response(JSON.stringify({ items: [{ id: "google-cn", name: "google-cn" }] }));
      }
      return new Response(JSON.stringify({ error: "missing" }), { status: 404 });
    }) as unknown as typeof fetch;
    const api = createRulesProductApi({ fetchImpl });

    await expect(api.getTotalRules?.()).resolves.toBe(123);
    await expect(api.searchRules?.({ keyword: "google", page: 2, size: 10 })).resolves.toEqual({
      items: [{ id: "google", name: "google", nameZh: "Google" }],
      totalRules: 123,
      totalMatched: 1,
      source: "remote",
    });
    await expect(
      api.loadCnCandidateRules?.({ moduleIds: ["google"], excludedRuleKeys: ["google:google"], signal: undefined })
    ).resolves.toEqual([{ id: "google-cn", name: "google-cn" }]);

    expect(calls.map((call) => call.url.pathname)).toEqual([
      "/api/rules/search",
      "/api/rules/search",
      "/api/rules/cn-candidates",
    ]);
    expect(calls[0].url.searchParams.get("keyword")).toBe("");
    expect(calls[1].url.searchParams.get("keyword")).toBe("google");
    expect(calls[1].url.searchParams.get("page")).toBe("2");
    expect(calls[1].url.searchParams.get("size")).toBe("10");
    expect(calls[2].url.searchParams.get("modules")).toBe("google");
    expect(calls[2].url.searchParams.get("excluded")).toBe("google:google");
    expect(calls.every((call) => call.init?.cache === "no-store")).toBe(true);
  });

  it("supports custom endpoints", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ items: [], totalRules: 0 }))) as unknown as typeof fetch;
    const api = createRulesProductApi({
      rulesSearchEndpoint: "/custom/search",
      cnCandidatesEndpoint: "/custom/cn",
      fetchImpl,
    });

    await api.searchRules?.({ keyword: "x", page: 1, size: 1 });
    await api.loadCnCandidateRules?.({ moduleIds: [], excludedRuleKeys: [] });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/custom/search?keyword=x&page=1&size=1",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/custom/cn?",
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
