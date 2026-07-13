import { describe, expect, it } from "vitest";
import { normalizeSavedSourcesForPersistence } from "./saved-sources";

describe("normalizeSavedSourcesForPersistence", () => {
  it("normalizes URL sources and preserves supported source metadata", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        {
          id: " src-1 ",
          type: "url",
          content: " https://example.com/sub&token=abc ",
          useProxyProviders: true,
          userinfoUrl: " https://info.example/user&token=abc ",
          userinfoUserAgent: " LocalAgent/1.0 ",
          subscriptionUserInfo: {
            upload: 1024,
            download: -1,
            total: 4096,
            expire: 1893456000,
          },
          tag: " premium ",
          nameTemplate: " {name} ",
          lastParsedContent: " https://old.example/sub&token=old ",
          lastParsedTag: " old-tag ",
          lastParsedNameTemplate: " old-{name} ",
        },
      ])
    ).toEqual([
      {
        id: "src-1",
        type: "url",
        content: "https://example.com/sub?token=abc",
        useProxyProviders: true,
        userinfoUrl: "https://info.example/user?token=abc",
        userinfoUserAgent: "LocalAgent/1.0",
        subscriptionUserInfo: {
          upload: 1024,
          total: 4096,
          expire: 1893456000,
        },
        tag: "premium",
        nameTemplate: "{name}",
        lastParsedContent: "https://old.example/sub?token=old",
        lastParsedTag: "old-tag",
        lastParsedNameTemplate: "old-{name}",
      },
    ]);
  });

  it("creates fallback URL sources when no saved sources are valid", () => {
    expect(
      normalizeSavedSourcesForPersistence([{ id: "bad", type: "url", content: "   " }], {
        fallbackUrls: [" https://fallback.example/sub ", "", 42],
      })
    ).toEqual([
      {
        id: "source_1",
        type: "url",
        content: "https://fallback.example/sub",
        lastParsedContent: "https://fallback.example/sub",
      },
    ]);
  });

  it("splits multi-line URL sources while keeping stable preferred ids", () => {
    expect(
      normalizeSavedSourcesForPersistence(
        [
          {
            id: "src-1",
            type: "url",
            content: "https://a.example/sub\n\n https://b.example/sub ",
            userinfoUserAgent: "Agent/1.0",
            tag: "tag-a",
            nameTemplate: "{name}",
          },
        ],
        {
          idFactory: () => "generated-id",
          splitUrlLines: true,
        }
      )
    ).toEqual([
      {
        id: "src-1",
        type: "url",
        content: "https://a.example/sub",
        userinfoUserAgent: "Agent/1.0",
        tag: "tag-a",
        nameTemplate: "{name}",
      },
      {
        id: "src-1-2",
        type: "url",
        content: "https://b.example/sub",
        userinfoUserAgent: "Agent/1.0",
        tag: "tag-a",
        nameTemplate: "{name}",
      },
    ]);
  });

  it("deduplicates repeated preferred ids across valid sources", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        { id: "same", type: "yaml", content: "proxies: []" },
        { id: "same", type: "nodes", content: "[]" },
      ]).map((source) => source.id)
    ).toEqual(["same", "same-2"]);
  });

  it("drops empty or invalid source subscription userinfo", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        {
          id: "empty",
          type: "yaml",
          content: "proxies: []",
          subscriptionUserInfo: { upload: -1, expire: 1 },
        },
        {
          id: "bad",
          type: "nodes",
          content: "trojan://secret@example.com:443#Node",
          subscriptionUserInfo: "upload=1",
        },
      ])
    ).toEqual([
      {
        id: "empty",
        type: "yaml",
        content: "proxies: []",
      },
      {
        id: "bad",
        type: "nodes",
        content: "trojan://secret@example.com:443#Node",
      },
    ]);
  });

  it("preserves provider settings on url sources", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        {
          id: "src-1",
          type: "url",
          content: "https://example.com/sub",
          useProxyProviders: true,
          providerKey: " my_key ",
          providerMode: "grouped",
          providerGroupName: " ✈️ 机场A ",
          providerFilter: "(?i)^(?!.*到期).*",
        },
      ])
    ).toEqual([
      {
        id: "src-1",
        type: "url",
        content: "https://example.com/sub",
        useProxyProviders: true,
        providerKey: "my_key",
        providerMode: "grouped",
        providerGroupName: "✈️ 机场A",
        providerFilter: "(?i)^(?!.*到期).*",
      },
    ]);
  });

  it("keeps empty-string providerFilter (explicit no-filter) but drops empty providerKey/providerGroupName", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        {
          id: "src-1",
          type: "url",
          content: "https://example.com/sub",
          useProxyProviders: true,
          providerKey: "   ",
          providerMode: "bare",
          providerGroupName: "",
          providerFilter: "",
        },
      ])
    ).toEqual([
      {
        id: "src-1",
        type: "url",
        content: "https://example.com/sub",
        useProxyProviders: true,
        providerMode: "bare",
        providerFilter: "",
      },
    ]);
  });

  it("drops invalid providerMode values and provider settings on non-url sources", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        {
          id: "src-1",
          type: "url",
          content: "https://example.com/sub",
          providerMode: "unknown",
          providerFilter: 42,
        },
        {
          id: "src-2",
          type: "yaml",
          content: "proxies: []",
          providerKey: "my_key",
          providerMode: "grouped",
          providerGroupName: "✈️ 机场A",
          providerFilter: "",
        },
      ])
    ).toEqual([
      {
        id: "src-1",
        type: "url",
        content: "https://example.com/sub",
      },
      {
        id: "src-2",
        type: "yaml",
        content: "proxies: []",
      },
    ]);
  });

  it("preserves provider settings even when useProxyProviders is off", () => {
    expect(
      normalizeSavedSourcesForPersistence([
        {
          id: "src-1",
          type: "url",
          content: "https://example.com/sub",
          providerKey: "my_key",
          providerMode: "grouped",
          providerGroupName: "✈️ 机场A",
        },
      ])
    ).toEqual([
      {
        id: "src-1",
        type: "url",
        content: "https://example.com/sub",
        providerKey: "my_key",
        providerMode: "grouped",
        providerGroupName: "✈️ 机场A",
      },
    ]);
  });
});
