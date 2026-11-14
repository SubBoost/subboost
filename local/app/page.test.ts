import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readJsonResponse: vi.fn(),
  readSourceImportResponse: vi.fn(),
}));

vi.mock("@subboost/ui/product/home/home-surface", () => ({
  HomeSurface: (props: any) => React.createElement("div", props, "home"),
}));
vi.mock("@subboost/ui/product/client-response", () => ({
  readJsonResponse: mocks.readJsonResponse,
  readSourceImportResponse: mocks.readSourceImportResponse,
}));

import Page from "./page";

function adapter() {
  const element = Page() as React.ReactElement<{ adapter: any }>;
  return element.props.adapter;
}

describe("local home page adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });

  it("calls local APIs and normalizes default response fields", async () => {
    const localAdapter = adapter();

    mocks.readSourceImportResponse.mockResolvedValueOnce({ content: 123, headers: null, parseResult: { nodes: [] } });
    await expect(localAdapter.productApi.sourceImport.importSource({ url: "https://example.test/sub" })).resolves.toEqual({
      content: "",
      headers: {},
      parseResult: { nodes: [] },
    });
    expect(fetch).toHaveBeenCalledWith("/api/source-import", expect.objectContaining({ method: "POST" }));

    mocks.readJsonResponse.mockResolvedValueOnce({ totalRules: "bad" });
    await expect(localAdapter.productApi.rules.getTotalRules()).resolves.toBe(0);

    mocks.readJsonResponse.mockResolvedValueOnce({ totalRules: "bad" });
    await expect(localAdapter.productApi.rules.searchRules({ keyword: "hk", page: 2, size: 5 })).resolves.toEqual({
      items: [],
      totalRules: 0,
      totalMatched: undefined,
      source: undefined,
    });

    mocks.readJsonResponse.mockResolvedValueOnce({});
    await expect(localAdapter.productApi.rules.loadCnCandidateRules({ moduleIds: [], excludedRuleKeys: [] })).resolves.toEqual([]);

    mocks.readJsonResponse.mockResolvedValueOnce({ items: [{ id: "candidate" }] });
    await expect(
      localAdapter.productApi.rules.loadCnCandidateRules({ moduleIds: ["cn"], excludedRuleKeys: ["auto:rule"] })
    ).resolves.toEqual([{ id: "candidate" }]);
    expect((fetch as any).mock.calls.at(-1)[0]).toContain("modules=cn");
    expect((fetch as any).mock.calls.at(-1)[0]).toContain("excluded=auto%3Arule");

    await localAdapter.loadSubscription("space id");
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions/space%20id");

    await localAdapter.subscription.saveSubscription({ isEditing: false, subscriptionId: null, payload: { name: "new" } });
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions");
    expect((fetch as any).mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "POST" }));

    await localAdapter.subscription.saveSubscription({ isEditing: true, subscriptionId: "sub/1", payload: { name: "edit" } });
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions/sub%2F1");
    expect((fetch as any).mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "PUT" }));
  });

  it("loads the signed-in user's templates without enabling the catalog", async () => {
    const localAdapter = adapter();
    const templates = localAdapter.productApi.templates;

    expect(templates).toMatchObject({ catalogEnabled: false, builtinEngagementEnabled: false });
    expect(templates.loadCatalogTemplates).toBeUndefined();

    mocks.readJsonResponse.mockResolvedValueOnce({
      templates: [
        { id: "tpl-1", name: "Home", description: "Mine" },
        { id: "tpl-2" },
      ],
    });
    await expect(templates.loadMyTemplates()).resolves.toEqual([
      { id: "tpl-1", name: "Home", description: "Mine" },
      { id: "tpl-2", name: "未命名模板", description: "" },
    ]);
    expect(fetch).toHaveBeenLastCalledWith("/api/templates?type=my", { cache: "no-store" });

    mocks.readJsonResponse.mockResolvedValueOnce({});
    await expect(templates.loadMyTemplates()).resolves.toEqual([]);

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(templates.loadTemplateDetail("missing")).resolves.toBeNull();
    expect(mocks.readJsonResponse).toHaveBeenCalledTimes(2);

    mocks.readJsonResponse.mockResolvedValueOnce({ template: { name: "Home", kind: "config", config: { template: "full" } } });
    await expect(templates.loadTemplateDetail("tpl/1")).resolves.toEqual({
      name: "Home",
      kind: "config",
      config: { template: "full" },
    });
    expect(fetch).toHaveBeenLastCalledWith("/api/templates/tpl%2F1", { cache: "no-store" });

    mocks.readJsonResponse.mockResolvedValueOnce({});
    await expect(templates.loadTemplateDetail("tpl-empty")).resolves.toBeNull();
  });
});
