import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readJsonResponse: vi.fn(),
  readSourceImportResponse: vi.fn(),
  withCsrfHeaders: vi.fn((headers?: HeadersInit) => headers ?? {}),
}));

vi.mock("@subboost/ui/product/home/home-surface", () => ({
  HomeSurface: (props: any) => React.createElement("div", props, "home"),
}));
vi.mock("@subboost/ui/product/client-response", () => ({
  readJsonResponse: mocks.readJsonResponse,
  readSourceImportResponse: mocks.readSourceImportResponse,
}));
vi.mock("@subboost/ui/lib/csrf", () => ({
  withCsrfHeaders: mocks.withCsrfHeaders,
}));

import { localHomeAdapter } from "./home-adapter";

type RequiredHomeAdapter = {
  sourceImport: {
    importSource: NonNullable<NonNullable<typeof localHomeAdapter.productApi>["sourceImport"]>["importSource"];
  };
  rules: {
    getTotalRules: NonNullable<NonNullable<NonNullable<typeof localHomeAdapter.productApi>["rules"]>["getTotalRules"]>;
    searchRules: NonNullable<NonNullable<NonNullable<typeof localHomeAdapter.productApi>["rules"]>["searchRules"]>;
    loadCnCandidateRules: NonNullable<
      NonNullable<NonNullable<typeof localHomeAdapter.productApi>["rules"]>["loadCnCandidateRules"]
    >;
  };
  loadSubscription: NonNullable<typeof localHomeAdapter.loadSubscription>;
  subscription: {
    saveSubscription: NonNullable<NonNullable<typeof localHomeAdapter.subscription>["saveSubscription"]>;
  };
};

function requireHomeAdapter() {
  const productApi = localHomeAdapter.productApi;
  const sourceImport = productApi?.sourceImport;
  const rules = productApi?.rules;
  const loadSubscription = localHomeAdapter.loadSubscription;
  const subscription = localHomeAdapter.subscription;
  const importSource = sourceImport?.importSource;
  const getTotalRules = rules?.getTotalRules;
  const searchRules = rules?.searchRules;
  const loadCnCandidateRules = rules?.loadCnCandidateRules;
  const saveSubscription = subscription?.saveSubscription;

  expect(importSource).toBeDefined();
  expect(getTotalRules).toBeDefined();
  expect(searchRules).toBeDefined();
  expect(loadCnCandidateRules).toBeDefined();
  expect(loadSubscription).toBeDefined();
  expect(saveSubscription).toBeDefined();

  return {
    sourceImport: {
      importSource: importSource!,
    },
    rules: {
      getTotalRules: getTotalRules!,
      searchRules: searchRules!,
      loadCnCandidateRules: loadCnCandidateRules!,
    },
    loadSubscription: loadSubscription!,
    subscription: {
      saveSubscription: saveSubscription!,
    },
  } satisfies RequiredHomeAdapter;
}

describe("local home page adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });

  it("calls local APIs and normalizes default response fields", async () => {
    const adapter = requireHomeAdapter();

    mocks.readSourceImportResponse.mockResolvedValueOnce({ content: 123, headers: null, parseResult: { nodes: [] } });
    await expect(adapter.sourceImport.importSource({ url: "https://example.test/sub" })).resolves.toEqual({
      content: "",
      headers: {},
      parseResult: { nodes: [] },
    });
    expect(fetch).toHaveBeenCalledWith("/api/source-import", expect.objectContaining({ method: "POST" }));
    expect(mocks.withCsrfHeaders).toHaveBeenCalledWith({ "Content-Type": "application/json" });

    mocks.readJsonResponse.mockResolvedValueOnce({ totalRules: "bad" });
    await expect(adapter.rules.getTotalRules()).resolves.toBe(0);

    mocks.readJsonResponse.mockResolvedValueOnce({ totalRules: "bad" });
    await expect(adapter.rules.searchRules({ keyword: "hk", page: 2, size: 5 })).resolves.toEqual({
      items: [],
      totalRules: 0,
      totalMatched: undefined,
      source: undefined,
    });

    mocks.readJsonResponse.mockResolvedValueOnce({});
    await expect(adapter.rules.loadCnCandidateRules({ moduleIds: [], excludedRuleKeys: [] })).resolves.toEqual([]);

    mocks.readJsonResponse.mockResolvedValueOnce({ items: [{ id: "candidate" }] });
    await expect(adapter.rules.loadCnCandidateRules({ moduleIds: ["cn"], excludedRuleKeys: ["auto:rule"] })).resolves.toEqual([
      { id: "candidate" },
    ]);
    expect((fetch as any).mock.calls.at(-1)[0]).toContain("modules=cn");
    expect((fetch as any).mock.calls.at(-1)[0]).toContain("excluded=auto%3Arule");

    await adapter.loadSubscription("space id");
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions/space%20id");

    await adapter.subscription.saveSubscription({ isEditing: false, subscriptionId: null, payload: { name: "new" } });
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions");
    expect((fetch as any).mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "POST" }));

    await adapter.subscription.saveSubscription({ isEditing: true, subscriptionId: "sub/1", payload: { name: "edit" } });
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions/sub%2F1");
    expect((fetch as any).mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "PUT" }));
  });
});
