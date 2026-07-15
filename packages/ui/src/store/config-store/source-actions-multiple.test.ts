import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import type { SubscriptionSource } from "./definitions";
import {
  PROXY_PROVIDER_HINT,
  createHarness,
  getSourceActionMocks,
  node,
  parseResult,
  resetSourceActionMocks,
  source,
} from "./source-actions.test-utils";

const mocks = getSourceActionMocks();

type DeferredFetchResult = {
  content: string;
  headers: Record<string, string>;
  parseResult: ReturnType<typeof parseResult>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createSourceActions parseMultipleSources", () => {
  beforeEach(resetSourceActionMocks);

  it("parses multiple mixed sources and records per-source metadata", async () => {
    mocks.fetchUrlContentInBrowser
      .mockResolvedValueOnce({
        content: "url content",
        headers: {},
        parseResult: parseResult([node("Remote")]),
      })
      .mockRejectedValueOnce(new Error("fetch failed"));
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Yaml")], ["yaml warning"]));

    const sources = [
      source({ id: "url-ok", type: "url", content: "https://example.com/ok", tag: "U" }),
      source({ id: "url-provider", type: "url", content: "https://example.com/provider", useProxyProviders: true }),
      source({ id: "url-fail", type: "url", content: "https://example.com/fail" }),
      source({ id: "yaml", type: "yaml", content: "proxies: []", tag: "Y" }),
      source({ id: "empty", type: "nodes", content: "   " }),
    ];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().isLoading).toBe(false);
    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["[U]Remote", "[Y]Yaml"]);
    expect(getState().parseErrors).toEqual([
      "源 #3 获取失败: fetch failed",
      "源 #4: yaml warning",
    ]);
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "url-ok")).toMatchObject({
      parsed: true,
      parsing: false,
      nodeCount: 1,
      lastParsedContent: "https://example.com/ok",
      lastParsedTag: "U",
    });
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "url-provider")).toMatchObject({
      parsed: true,
      lastParsedContent: "https://example.com/provider",
    });
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "url-fail")).toMatchObject({
      parsed: false,
      error: "fetch failed",
    });
  });

  it("parses provider metadata defaults and expire-only userinfo during multi-source imports", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://remote",
      headers: {
        "subscription-userinfo": "expire=1893456000",
      },
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Remote")]));
    const sources = [
      source({
        id: "provider",
        type: "url",
        content: "https://example.com/provider.yaml",
        useProxyProviders: true,
        tag: 7 as never,
        nameTemplate: null as never,
      }),
      source({
        id: "url-ok",
        type: "url",
        content: "https://example.com/ok",
        nameTemplate: "{name}",
      }),
    ];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([
      expect.objectContaining({ name: "Remote", _originName: "Remote", _sourceIds: ["url-ok"] }),
    ]);
    expect(getState().sources).toEqual([
      expect.objectContaining({
        id: "provider",
        parsed: true,
        lastParsedContent: "https://example.com/provider.yaml",
      }),
      expect.objectContaining({
        id: "url-ok",
        parsed: true,
        subscriptionUserInfo: { expire: 1893456000 },
        lastParsedNameTemplate: "{name}",
      }),
    ]);
  });

  it("records invalid proxy-provider URLs during multi-source parsing", async () => {
    const sources = [
      source({ id: "bad-provider", type: "url", content: "ftp://example.com/provider", useProxyProviders: true }),
      source({ id: "not-url", type: "url", content: "not a url", useProxyProviders: true }),
    ];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([]);
    expect(getState().parseErrors).toEqual([
      "url ftp://example.com/*** 解析失败: 只支持 HTTP/HTTPS url",
      "url not a url... 解析失败: 无效的 url 格式",
    ]);
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "bad-provider")).toMatchObject({
      parsed: false,
      error: "只支持 HTTP/HTTPS url",
    });
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "not-url")).toMatchObject({
      parsed: false,
      error: "无效的 url 格式",
    });
  });

  it("records URL fetch and content parse failures during multi-source parsing", async () => {
    mocks.fetchUrlContentInBrowser.mockRejectedValueOnce("offline");
    mocks.parseSubscription.mockImplementationOnce(() => {
      throw new Error("bad yaml");
    });
    const sources = [
      source({ id: "url-fail", type: "url", content: "https://example.com/fail" }),
      source({ id: "yaml-fail", type: "yaml", content: "bad yaml" }),
      source({ id: "blank", type: "nodes", content: "   " }),
    ];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([]);
    expect(getState().parseErrors).toEqual([
      "源 #1 获取失败: 未知错误",
      "源 #2 解析失败: bad yaml",
    ]);
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "url-fail")).toMatchObject({
      parsed: false,
      error: "未知错误",
      errorInfo: expect.objectContaining({
        suggestedActions: expect.arrayContaining([PROXY_PROVIDER_HINT]),
      }),
    });
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "yaml-fail")).toMatchObject({
      parsed: false,
      error: "bad yaml",
    });
    expect(getState().sources.find((item: SubscriptionSource) => item.id === "blank")).toEqual(sources[2]);
  });

  it("records non-Error parse failures during multi-source parsing without proxy-provider hints", async () => {
    mocks.parseSubscription.mockImplementationOnce(() => {
      throw "bad nodes";
    });
    const sources = [source({ id: "nodes-fail", type: "nodes", content: "bad nodes" })];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([]);
    expect(getState().parseErrors).toEqual(["源 #1 解析失败: 未知错误"]);
    expect(getState().sources[0]).toMatchObject({
      parsed: false,
      error: "未知错误",
      errorInfo: expect.objectContaining({
        suggestedActions: expect.not.arrayContaining([PROXY_PROVIDER_HINT]),
      }),
    });
  });

  it("parses subscription userinfo during multi-source URL imports", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://remote",
      headers: {
        "subscription-userinfo": "download=2048; total=4096",
      },
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Remote")]));
    const sources = [source({ id: "url-ok", type: "url", content: "https://example.com/ok" })];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([
      expect.objectContaining({ name: "Remote", _originName: "Remote", _sourceIds: ["url-ok"] }),
    ]);
    expect(getState().sources[0]).toMatchObject({
      parsed: true,
      nodeCount: 1,
      subscriptionUserInfo: { download: 2048, total: 4096 },
      lastParsedContent: "https://example.com/ok",
    });
  });

  it("ignores non-numeric URL userinfo and keeps raw URL content when normalization fails", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://remote",
      headers: {
        "subscription-userinfo": "upload=bad; expire=never",
      },
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Remote")]));
    const sources = [source({ id: "url-ok", type: "url", content: "not a url" })];
    const { actions, getState } = createHarness({ sources });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([
      expect.objectContaining({ name: "Remote", _originName: "Remote", _sourceIds: ["url-ok"] }),
    ]);
    expect(getState().sources[0]).toMatchObject({
      parsed: true,
      subscriptionUserInfo: undefined,
      lastParsedContent: "not a url",
    });
  });

  it("merges duplicate parsed nodes and prunes stale listener ports and dialer nodes", async () => {
    const duplicate = node("Duplicate", {
      server: "same.example.com",
      _originName: "Duplicate",
    });
    mocks.parseSubscription
      .mockReturnValueOnce(parseResult([duplicate], ["first warning"]))
      .mockReturnValueOnce(parseResult([duplicate]));
    const sources = [
      source({ id: "s1", type: "yaml", content: "one" }),
      source({ id: "s2", type: "yaml", content: "two" }),
    ];
    const { actions, getState } = createHarness({
      sources,
      listenerPorts: {
        Duplicate: 41000,
        Stale: 41001,
      },
      dialerProxyGroups: [
        {
          id: "dialer-1",
          name: "Relay",
          type: "select",
          relayNodes: ["Duplicate", "DIRECT", "Stale"],
          targetNodes: ["Duplicate", "Stale"],
        },
      ],
    });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toHaveLength(1);
    expect(getState().nodes[0]).toMatchObject({
      name: "Duplicate",
      _originName: "Duplicate",
      _sourceIds: ["s1", "s2"],
    });
    expect(getState().listenerPorts).toEqual({ Duplicate: 41000 });
    expect(getState().dialerProxyGroups[0]).toMatchObject({
      relayNodes: ["Duplicate", "DIRECT"],
      targetNodes: ["Duplicate"],
    });
    expect(getState().parseErrors).toEqual(["源 #1: first warning"]);
    expect(getState().sources).toEqual([
      expect.objectContaining({ id: "s1", parsed: true, parsing: false, nodeCount: 1 }),
      expect.objectContaining({ id: "s2", parsed: true, parsing: false, nodeCount: 1 }),
    ]);
  });

  it("deduplicates same-source duplicate nodes and filters deleted origins during multi-source parsing", async () => {
    mocks.parseSubscription.mockReturnValueOnce(
      parseResult([
        node("Duplicate", { server: "same.example.com" }),
        node("Duplicate", { server: "same.example.com" }),
        node("Deleted"),
      ])
    );
    const sources = [source({ id: "s1", type: "yaml", content: "one" })];
    const { actions, getState } = createHarness({
      sources,
      deletedNodeNames: ["Deleted"],
      listenerPorts: {
        Duplicate: 41000,
        Deleted: 41001,
        Stale: 41002,
      },
    });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toHaveLength(1);
    expect(getState().nodes[0]).toMatchObject({
      name: "Duplicate",
      _originName: "Duplicate",
      _sourceIds: ["s1"],
    });
    expect(getState().listenerPorts).toEqual({ Duplicate: 41000 });
  });

  it("keeps repeated origins when multiple distinct deleted-origin nodes are reimported", async () => {
    mocks.parseSubscription.mockReturnValueOnce(
      parseResult([
        node("Shared Origin", {
          _originName: "Shared Origin",
          server: "one.example.com",
        }),
        node("Shared Origin", {
          _originName: "Shared Origin",
          server: "two.example.com",
        }),
      ])
    );
    const sources = [source({ id: "s1", type: "yaml", content: "one" })];
    const { actions, getState } = createHarness({
      sources,
      deletedNodeNames: ["Shared Origin"],
    });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes).toEqual([
      expect.objectContaining({ name: "Shared Origin", _originName: "Shared Origin", server: "one.example.com" }),
      expect.objectContaining({ name: "Shared Origin (2)", _originName: "Shared Origin", server: "two.example.com" }),
    ]);
  });

  it("filters deleted node identity records while keeping blank-origin fallbacks", async () => {
    const deleted = node("Gone");
    const blankOrigin = node("Blank Origin", { _originName: " " });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([deleted, blankOrigin, node("Fresh")]));
    const sources = [source({ id: "s1", type: "yaml", content: "one" })];
    const { actions, getState } = createHarness({
      sources,
      deletedNodes: [
        { originName: " Gone ", node: deleted },
        { node: null },
        { originName: " ", node: blankOrigin },
      ],
    });

    await actions.parseMultipleSources(sources);

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Blank Origin", "Fresh"]);
    expect(getState().sources[0]).toMatchObject({
      parsed: true,
      nodeCount: 3,
    });
  });

  it("discards the entire batch when any source fingerprint changes before completion", async () => {
    const first = deferred<DeferredFetchResult>();
    const second = deferred<DeferredFetchResult>();
    mocks.fetchUrlContentInBrowser.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const sources = [
      source({ id: "s1", type: "url", content: "https://example.com/one" }),
      source({ id: "s2", type: "url", content: "https://example.com/two" }),
    ];
    const { actions, getState } = createHarness({ sources, nodes: [node("Keep")] });

    const running = actions.parseMultipleSources(sources);
    actions.setSources(
      getState().sources.map((item: SubscriptionSource) =>
        item.id === "s2" ? { ...item, nameTemplate: "{name}-changed" } : item
      )
    );
    first.resolve({ content: "one", headers: {}, parseResult: parseResult([node("One")]) });
    await Promise.resolve();
    second.resolve({ content: "two", headers: {}, parseResult: parseResult([node("Two")]) });
    await running;

    expect(getState().isLoading).toBe(false);
    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Keep"]);
    expect(getState().sources).toEqual([
      expect.objectContaining({ id: "s1" }),
      expect.objectContaining({ id: "s2", nameTemplate: "{name}-changed" }),
    ]);
    expect(getState().sources[0]).not.toHaveProperty("parsed");
    expect(getState().sources[1]).not.toHaveProperty("parsed");
  });
});
