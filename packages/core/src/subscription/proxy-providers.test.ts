import { describe, expect, it } from "vitest";
import {
  buildProxyProviderPlanFromConfig,
  buildProxyProvidersFromConfig,
  DEFAULT_PROVIDER_GROUP_EMOJI,
  DEFAULT_PROXY_PROVIDER_FILTER,
} from "./proxy-providers";

describe("proxy provider config builder", () => {
  it("returns undefined when no URL source can safely become a provider", () => {
    expect(buildProxyProvidersFromConfig({}, { testUrl: "https://test.example.com", testInterval: 60 })).toBeUndefined();
    expect(
      buildProxyProvidersFromConfig(
        {
          sources: [
            null,
            "bad",
            { type: "text", useProxyProviders: true, content: "https://example.com/sub" },
            { type: "url", useProxyProviders: false, content: "https://example.com/sub" },
            { type: "url", useProxyProviders: true, content: "" },
            { type: "url", useProxyProviders: true, content: "ftp://example.com/sub" },
          ],
        },
        { testUrl: "https://test.example.com", testInterval: 60 }
      )
    ).toBeUndefined();
  });

  it("normalizes safe provider names and skips duplicates", () => {
    const providers = buildProxyProvidersFromConfig(
      {
        sources: [
          { id: " airport one ", type: "url", useProxyProviders: true, content: " https://a.example.com/sub " },
          { id: "airport one", type: "url", useProxyProviders: true, content: "https://duplicate.example.com/sub" },
          { type: "url", useProxyProviders: true, content: "https://b.example.com/sub" },
          { id: "bad/url", type: "url", useProxyProviders: true, content: "https://c.example.com/sub" },
        ],
      },
      { testUrl: "https://test.example.com", testInterval: 120 }
    );

    expect(providers).toMatchObject({
      url_airport_one: {
        type: "http",
        url: "https://a.example.com/sub",
        interval: 43200,
        path: "./proxy_providers/url_airport_one.yaml",
        "health-check": {
          enable: true,
          url: "https://test.example.com",
          interval: 300,
          timeout: 5000,
          lazy: true,
        },
      },
      url_1: {
        type: "http",
        url: "https://b.example.com/sub",
      },
      url_bad_url: {
        type: "http",
        url: "https://c.example.com/sub",
      },
    });
    expect(Object.keys(providers || {})).toEqual(["url_airport_one", "url_1", "url_bad_url"]);
  });

  it("treats legacy sources without providerMode as inline attachments", () => {
    const plan = buildProxyProviderPlanFromConfig(
      {
        sources: [{ id: "s1", type: "url", useProxyProviders: true, content: "https://a.example.com/sub" }],
      },
      { testUrl: "https://test.example.com", testInterval: 60 }
    );

    expect(plan?.attachments).toEqual([{ key: "url_s1", mode: "inline" }]);
  });

  it("honors custom provider keys while keeping the path in sync with the key", () => {
    const plan = buildProxyProviderPlanFromConfig(
      {
        sources: [
          {
            id: "s1",
            type: "url",
            useProxyProviders: true,
            content: "https://a.example.com/sub",
            providerKey: " lxy ",
            providerMode: "bare",
          },
          // 自定义 key 重复时后者被跳过（与默认 key 重复行为一致）
          {
            id: "s2",
            type: "url",
            useProxyProviders: true,
            content: "https://b.example.com/sub",
            providerKey: "lxy",
          },
          // 全中文 key：文件名无安全字符，path 回落源 id 默认名
          {
            id: "s3",
            type: "url",
            useProxyProviders: true,
            content: "https://c.example.com/sub",
            providerKey: "我的机场",
          },
        ],
      },
      { testUrl: "https://test.example.com", testInterval: 60 }
    );

    expect(Object.keys(plan?.providers ?? {})).toEqual(["lxy", "我的机场"]);
    // path 文件名跟随 key（安全化）
    expect(plan?.providers["lxy"]).toMatchObject({
      url: "https://a.example.com/sub",
      path: "./proxy_providers/lxy.yaml",
    });
    // 全非法字符 key 回落源 id 默认名
    expect(plan?.providers["我的机场"]).toMatchObject({
      path: "./proxy_providers/url_s3.yaml",
    });
    expect(plan?.attachments).toEqual([
      { key: "lxy", mode: "bare" },
      { key: "我的机场", mode: "inline" },
    ]);
  });

  it("fills grouped attachments with fallback emoji group name", () => {
    const plan = buildProxyProviderPlanFromConfig(
      {
        sources: [
          {
            id: "s1",
            type: "url",
            useProxyProviders: true,
            content: "https://a.example.com/sub",
            providerMode: "grouped",
          },
          {
            id: "s2",
            type: "url",
            useProxyProviders: true,
            content: "https://b.example.com/sub",
            providerMode: "grouped",
            providerGroupName: " ✈️ 测试机场 ",
          },
        ],
      },
      { testUrl: "https://test.example.com", testInterval: 60 }
    );

    expect(plan?.attachments).toEqual([
      { key: "url_s1", mode: "grouped", groupName: `${DEFAULT_PROVIDER_GROUP_EMOJI} url_s1` },
      { key: "url_s2", mode: "grouped", groupName: "✈️ 测试机场" },
    ]);
    // 未设置 providerFilter → 写入默认过滤正则
    expect(plan?.providers["url_s1"]).toMatchObject({ filter: DEFAULT_PROXY_PROVIDER_FILTER });
  });

  it("treats providerFilter as tri-state: default when unset, omitted when explicitly cleared", () => {
    const plan = buildProxyProviderPlanFromConfig(
      {
        sources: [
          { id: "s1", type: "url", useProxyProviders: true, content: "https://a.example.com/sub" },
          {
            id: "s2",
            type: "url",
            useProxyProviders: true,
            content: "https://b.example.com/sub",
            providerFilter: "",
          },
          {
            id: "s3",
            type: "url",
            useProxyProviders: true,
            content: "https://c.example.com/sub",
            providerFilter: "(?i)hk",
          },
        ],
      },
      { testUrl: "https://test.example.com", testInterval: 60 }
    );

    expect(plan?.providers["url_s1"]).toMatchObject({ filter: DEFAULT_PROXY_PROVIDER_FILTER });
    expect(plan?.providers["url_s2"]).not.toHaveProperty("filter");
    expect(plan?.providers["url_s3"]).toMatchObject({ filter: "(?i)hk" });
  });
});
