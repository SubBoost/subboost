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

describe("createSourceActions", () => {
  beforeEach(resetSourceActionMocks);

  it("removes nodes and references when a source is deleted", () => {
    const { actions, getState } = createHarness({
      sources: [
        source({ id: "s1", type: "url", content: "https://one.example/sub" }),
        source({ id: "s2", type: "yaml", content: "proxies: []" }),
      ],
      nodes: [
        node("Only S1", { _sourceIds: ["s1"], _originName: "Only S1" }),
        node("Shared", { _sourceIds: ["s1", "s2"], _originName: "Shared" }),
        node("Only S2", { _sourceIds: ["s2"], _originName: "Only S2" }),
        node("Manual"),
      ],
      listenerPorts: {
        "Only S1": 41000,
        Shared: 41001,
        "Only S2": 41002,
        Manual: "bad",
      },
      dialerProxyGroups: [
        {
          id: "dialer-1",
          name: "Relay",
          relayNodes: ["DIRECT", "Only S1", "Shared", "Manual"],
          targetNodes: ["Only S1", "Only S2"],
        },
      ],
    });

    actions.setSources([source({ id: "s2", type: "yaml", content: "proxies: []" })]);

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Shared", "Only S2", "Manual"]);
    expect(getState().nodes[0]).toMatchObject({ _sourceIds: ["s2"] });
    expect(getState().listenerPorts).toEqual({
      Shared: 41001,
      "Only S2": 41002,
    });
    expect(getState().dialerProxyGroups[0]).toMatchObject({
      relayNodes: ["DIRECT", "Shared", "Manual"],
      targetNodes: ["Only S2"],
    });
  });

  it("updates source lists directly when no source ids are removed", () => {
    const existing = source({ id: "s1", type: "yaml", content: "old" });
    const next = source({ id: "s1", type: "yaml", content: "new" });
    const { actions, getState } = createHarness({
      sources: [existing],
      nodes: [node("Existing")],
    });

    actions.setSources([next]);

    expect(getState().sources).toEqual([next]);
    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Existing"]);
  });

  it("parses pasted content, deduplicates existing nodes, and respects deleted origins", () => {
    mocks.parseSubscription.mockReturnValueOnce(
      parseResult(
        [
          node("Existing", { server: "same.example.com", _originName: "Existing" }),
          node("Fresh"),
          node("Gone", { _originName: "Gone" }),
        ],
        ["minor warning"]
      )
    );
    const { actions, getState } = createHarness({
      nodes: [node("Existing", { server: "same.example.com" })],
      deletedNodeNames: ["Gone"],
    });

    actions.parseContent("ss://content");

    expect(getState().isLoading).toBe(false);
    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Existing", "Fresh"]);
    expect(getState().nodes[0]).toMatchObject({ _originName: "Existing" });
    expect(getState().nodes[1]).toMatchObject({ _originName: "Fresh" });
    expect(getState().parseErrors).toEqual(["minor warning"]);
  });

  it("marks invalid parse content errors without changing nodes", () => {
    mocks.parseSubscription.mockImplementationOnce(() => {
      throw new Error("bad syntax");
    });
    const { actions, getState } = createHarness({
      nodes: [node("Existing")],
    });

    actions.parseContent("bad");

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Existing"]);
    expect(getState().parseErrors).toEqual(["bad syntax"]);
    expect(getState().isLoading).toBe(false);
  });

  it("falls back to a generic pasted-content parse error for non-Error throws", () => {
    mocks.parseSubscription.mockImplementationOnce(() => {
      throw "bad syntax";
    });
    const { actions, getState } = createHarness({
      nodes: [node("Existing")],
    });

    actions.parseContent("bad");

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Existing"]);
    expect(getState().parseErrors).toEqual(["解析失败"]);
    expect(getState().isLoading).toBe(false);
  });

  it("skips missing and empty single sources", async () => {
    const { actions, getState } = createHarness({
      sources: [source({ id: "empty", type: "yaml", content: "   " })],
      nodes: [node("Existing")],
    });

    await actions.parseSingleSource("missing");
    await actions.parseSingleSource("empty");

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Existing"]);
    expect(mocks.parseSubscription).not.toHaveBeenCalled();
    expect(mocks.fetchUrlContentInBrowser).not.toHaveBeenCalled();
  });

  it("imports proxy-provider URL sources without fetching node content", async () => {
    const { actions, getState } = createHarness({
      sources: [
        source({
          id: "s1",
          type: "url",
          content: " https://example.com/provider.yaml ",
          useProxyProviders: true,
          tag: "TAG",
          nameTemplate: "{tag}-{name}",
        }),
      ],
      nodes: [node("Provider Node", { _sourceIds: ["s1"], _originName: "Provider Node" }), node("Manual")],
      listenerPorts: { "Provider Node": 41000, Manual: 41001 },
      dialerProxyGroups: [
        {
          id: "dialer-1",
          name: "Relay",
          relayNodes: ["DIRECT", "Provider Node", "Manual"],
          targetNodes: ["Provider Node"],
        },
      ],
    });

    await actions.parseSingleSource("s1");

    expect(mocks.fetchUrlContentInBrowser).not.toHaveBeenCalled();
    expect(mocks.parseSubscription).not.toHaveBeenCalled();
    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Manual"]);
    expect(getState().listenerPorts).toEqual({ Manual: 41001 });
    expect(getState().dialerProxyGroups[0]).toMatchObject({
      relayNodes: ["DIRECT", "Manual"],
      targetNodes: [],
    });
    expect(getState().sources[0]).toMatchObject({
      parsing: false,
      parsed: true,
      lastParsedContent: "https://example.com/provider.yaml",
      lastParsedTag: "TAG",
      lastParsedNameTemplate: "{tag}-{name}",
      error: undefined,
    });
  });

  it("records single proxy-provider URL validation errors", async () => {
    let harness = createHarness({
      sources: [source({ id: "s1", type: "url", content: "not a url", useProxyProviders: true })],
    });

    await harness.actions.parseSingleSource("s1");

    expect(harness.getState().sources[0]).toMatchObject({
      parsed: false,
      parsing: false,
      error: "无效的 url 格式",
      errorInfo: expect.objectContaining({ message: "无效的 url 格式" }),
    });

    harness = createHarness({
      sources: [source({ id: "s1", type: "url", content: "ftp://example.com/provider", useProxyProviders: true })],
    });

    await harness.actions.parseSingleSource("s1");

    expect(harness.getState().sources[0]).toMatchObject({
      parsed: false,
      parsing: false,
      error: "只支持 HTTP/HTTPS url",
      errorInfo: expect.objectContaining({ message: "只支持 HTTP/HTTPS url" }),
    });
  });

  it("parses a URL source with prefetched parse result and subscription userinfo", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ignored when parseResult is provided",
      headers: {
        "subscription-userinfo": "upload=1048576; download=2097152; total=10485760; expire=1893456000",
      },
      parseResult: parseResult([node("Remote Node")], ["remote warning"]),
    });
    const { actions, getState } = createHarness({
      sources: [
        source({
          id: "s1",
          type: "url",
          content: "https://example.com/sub",
          tag: "TAG",
          nameTemplate: "{tag}-{name}",
        }),
      ],
    });

    await actions.parseSingleSource("s1");

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["TAG-Remote Node"]);
    expect(getState().nodes[0]).toMatchObject({
      _originName: "Remote Node",
      _sourceIds: ["s1"],
    });
    expect(getState().parseErrors).toEqual(["remote warning"]);
    expect(getState().sources[0]).toMatchObject({
      parsing: false,
      parsed: true,
      nodeCount: 1,
      lastParsedContent: "https://example.com/sub",
      lastParsedTag: "TAG",
      lastParsedNameTemplate: "{tag}-{name}",
      subscriptionUserInfo: {
        upload: 1048576,
        download: 2097152,
        total: 10485760,
        expire: 1893456000,
      },
    });
  });

  it("reimports duplicate-origin node sources even when a legacy deleted name exists", async () => {
    mocks.parseSubscription.mockReturnValueOnce(
      parseResult([
        node("SOCKS-same.example.com:1080", {
          server: "same.example.com",
          port: 1080,
          password: "one",
        }),
        node("SOCKS-same.example.com:1080", {
          server: "same.example.com",
          port: 1080,
          password: "two",
        }),
      ])
    );
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "nodes", content: "socks5://same.example.com:1080:u:p" })],
      deletedNodeNames: ["SOCKS-same.example.com:1080"],
      deletedNodes: [],
    });

    await actions.parseSingleSource("s1");

    expect(getState().nodes).toEqual([
      expect.objectContaining({
        name: "SOCKS-same.example.com:1080",
        _originName: "SOCKS-same.example.com:1080",
        _sourceIds: ["s1"],
        password: "one",
      }),
      expect.objectContaining({
        name: "SOCKS-same.example.com:1080 (2)",
        _originName: "SOCKS-same.example.com:1080",
        _sourceIds: ["s1"],
        password: "two",
      }),
    ]);
    expect(getState().sources[0]).toMatchObject({
      parsing: false,
      parsed: true,
      nodeCount: 2,
    });
  });

  it("parses fetched URL content when no prefetched parse result exists", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://remote",
      headers: {},
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Remote Node")]));
    const { actions, getState } = createHarness({
      sources: [
        source({
          id: "s1",
          type: "url",
          content: " https://example.com/sub ",
          userinfoUrl: " https://example.com/userinfo ",
          userinfoUserAgent: " Clash.Meta ",
        }),
      ],
    });

    await actions.parseSingleSource("s1");

    expect(mocks.fetchUrlContentInBrowser).toHaveBeenCalledWith(" https://example.com/sub ", {
      userinfoUrl: " https://example.com/userinfo ",
      userinfoUserAgent: " Clash.Meta ",
    });
    expect(mocks.parseSubscription).toHaveBeenCalledWith("ss://remote");
    expect(getState().nodes).toEqual([
      expect.objectContaining({ name: "Remote Node", _originName: "Remote Node", _sourceIds: ["s1"] }),
    ]);
    expect(getState().sources[0]).toMatchObject({
      parsed: true,
      parsing: false,
      subscriptionUserInfo: undefined,
      lastParsedContent: "https://example.com/sub",
    });
  });

  it("keeps original URL text when a fetched single source cannot be normalized", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://remote",
      headers: {},
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Remote Node")]));
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "not a url" })],
    });

    await actions.parseSingleSource("s1");

    expect(getState().nodes).toEqual([
      expect.objectContaining({ name: "Remote Node", _originName: "Remote Node", _sourceIds: ["s1"] }),
    ]);
    expect(getState().sources[0]).toMatchObject({
      parsed: true,
      lastParsedContent: "not a url",
      subscriptionUserInfo: undefined,
    });
  });

  it("reimports changed URL sources while preserving unrelated source state", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://fresh",
      headers: {},
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Fresh Renamed")], [""]));
    const { actions, getState } = createHarness({
      sources: [
        source({
          id: "s1",
          type: "url",
          content: "https://example.com/new",
          lastParsedContent: "https://example.com/old",
          lastParsedTag: "OLD",
          lastParsedNameTemplate: "{tag}-{name}",
        }),
        source({ id: "s2", type: "yaml", content: "proxies: []", parsed: true }),
      ],
      nodes: [node("OLD-Fresh Renamed", { _originName: "Fresh Renamed", _sourceIds: ["s1"] })],
    });

    await actions.parseSingleSource("s1");

    expect(getState().nodes).toEqual([expect.objectContaining({ name: "Fresh Renamed" })]);
    expect(getState().parseErrors).toEqual([]);
    expect(getState().sources).toEqual([
      expect.objectContaining({
        id: "s1",
        parsed: true,
        lastParsedContent: "https://example.com/new",
        lastParsedTag: undefined,
        lastParsedNameTemplate: undefined,
      }),
      expect.objectContaining({ id: "s2", parsed: true }),
    ]);
  });

  it("accepts expire-only subscription userinfo from fetched URL content", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "ss://remote",
      headers: {
        "subscription-userinfo": "expire=1893456000",
      },
    });
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Remote Node")]));
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "https://example.com/sub" })],
    });

    await actions.parseSingleSource("s1");

    expect(getState().sources[0]).toMatchObject({
      parsed: true,
      subscriptionUserInfo: { expire: 1893456000 },
    });
  });

  it("records per-source errors when a single source parses no nodes", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "empty",
      headers: {},
      parseResult: parseResult([], ["没有节点"]),
    });
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "https://example.com/sub" })],
    });

    await actions.parseSingleSource("s1");

    expect(getState().nodes).toEqual([]);
    expect(getState().sources[0]).toMatchObject({
      parsed: false,
      parsing: false,
      subscriptionUserInfo: undefined,
      error: "没有节点",
      errorInfo: expect.objectContaining({
        message: "没有节点",
        suggestedActions: expect.arrayContaining([PROXY_PROVIDER_HINT]),
      }),
    });
  });

  it("uses the default single-source error when parsing returns no nodes and no errors", async () => {
    mocks.fetchUrlContentInBrowser.mockResolvedValueOnce({
      content: "empty",
      headers: {},
      parseResult: parseResult([]),
    });
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "https://example.com/sub" })],
    });

    await actions.parseSingleSource("s1");

    expect(getState().sources[0]).toMatchObject({
      parsed: false,
      parsing: false,
      error: "未解析到有效节点",
    });
  });

  it("keeps listener ports and dialer groups aligned after a single source parse", async () => {
    mocks.parseSubscription.mockReturnValueOnce(parseResult([node("Fresh"), node("Relay Target")]));
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "yaml", content: "proxies: []" })],
      listenerPorts: {
        Fresh: 41000,
        Stale: 41001,
        "Relay Target": "bad",
      },
      dialerProxyGroups: [
        {
          id: "dialer-1",
          name: "Relay",
          relayNodes: ["DIRECT", "Fresh", "Fresh", "Stale", "Relay Target"],
          targetNodes: ["Fresh", "Stale", "Relay Target"],
        },
      ],
    });

    await actions.parseSingleSource("s1");

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["Fresh", "Relay Target"]);
    expect(getState().listenerPorts).toEqual({ Fresh: 41000 });
    expect(getState().dialerProxyGroups[0]).toMatchObject({
      relayNodes: ["DIRECT", "Fresh", "Relay Target"],
      targetNodes: ["Fresh", "Relay Target"],
    });
    expect(getState().sources[0]).toMatchObject({
      parsing: false,
      parsed: true,
      nodeCount: 2,
      lastParsedContent: "proxies: []",
    });
  });

  it("stores structured import errors when a URL source fails", async () => {
    mocks.fetchUrlContentInBrowser.mockRejectedValueOnce(new Error("network down"));
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "https://example.com/sub" })],
    });

    await actions.parseSingleSource("s1");

    expect(getState().sources[0]).toMatchObject({
      parsing: false,
      parsed: false,
      subscriptionUserInfo: undefined,
      error: "network down",
      errorInfo: expect.objectContaining({
        message: "network down",
        suggestedActions: expect.arrayContaining([PROXY_PROVIDER_HINT]),
      }),
    });
  });

  it("records generic single-source parse errors for non-Error throws", async () => {
    mocks.parseSubscription.mockImplementationOnce(() => {
      throw "bad yaml";
    });
    const { actions, getState } = createHarness({
      sources: [
        source({ id: "s1", type: "yaml", content: "bad yaml" }),
        source({ id: "s2", type: "yaml", content: "other" }),
      ],
    });

    await actions.parseSingleSource("s1");

    expect(getState().sources).toEqual([
      expect.objectContaining({
        id: "s1",
        parsed: false,
        parsing: false,
        error: "解析失败",
      }),
      expect.objectContaining({ id: "s2" }),
    ]);
  });

  it("discards a pending single-source result after its input fingerprint changes", async () => {
    const pending = deferred<DeferredFetchResult>();
    mocks.fetchUrlContentInBrowser.mockReturnValueOnce(pending.promise);
    const original = source({ id: "s1", type: "url", content: "https://example.com/old" });
    const { actions, getState } = createHarness({ sources: [original] });

    const running = actions.parseSingleSource("s1");
    actions.setSources([
      { ...getState().sources[0], content: "https://example.com/new", userinfoUserAgent: "new-agent" },
    ]);
    pending.resolve({ content: "old", headers: {}, parseResult: parseResult([node("Old")]) });
    await running;

    expect(getState().nodes).toEqual([]);
    expect(getState().sources[0]).toMatchObject({
      content: "https://example.com/new",
      userinfoUserAgent: "new-agent",
      parsing: false,
    });
    expect(getState().sources[0].parsed).not.toBe(true);
  });

  it("discards a pending single-source result after the source is deleted", async () => {
    const pending = deferred<DeferredFetchResult>();
    mocks.fetchUrlContentInBrowser.mockReturnValueOnce(pending.promise);
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "https://example.com/sub" })],
    });

    const running = actions.parseSingleSource("s1");
    actions.setSources([]);
    pending.resolve({ content: "old", headers: {}, parseResult: parseResult([node("Deleted")]) });
    await running;

    expect(getState().sources).toEqual([]);
    expect(getState().nodes).toEqual([]);
  });

  it("keeps the newest result when two single-source imports finish in reverse order", async () => {
    const first = deferred<DeferredFetchResult>();
    const second = deferred<DeferredFetchResult>();
    mocks.fetchUrlContentInBrowser.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1", type: "url", content: "https://example.com/sub" })],
    });

    const olderRun = actions.parseSingleSource("s1");
    const newerRun = actions.parseSingleSource("s1");
    second.resolve({ content: "new", headers: {}, parseResult: parseResult([node("New")]) });
    await newerRun;
    first.resolve({ content: "old", headers: {}, parseResult: parseResult([node("Old")]) });
    await olderRun;

    expect(getState().nodes.map((item: ParsedNode) => item.name)).toEqual(["New"]);
    expect(getState().sources[0]).toMatchObject({ parsed: true, parsing: false, nodeCount: 1 });
  });

});
