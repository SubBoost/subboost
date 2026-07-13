import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../types/node";
import {
  buildGenerateOptionsFromConfig,
  getEffectiveTestOptions,
} from "./config-utils";
import {
  SOURCE_IDS_KEY,
  getNodeOriginName,
  getNodeSourceIds,
  keepOnlyValidNodeSourceIds,
  makeUniqueName,
  normalizeNodeOriginName,
  withNodeSourceId,
  withUniqueNodeNames,
  withoutNodeSourceIds,
} from "./node-source-state";
import {
  hasSubscriptionUserInfo,
  isPlausibleSubscriptionUserInfo,
  mergeSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  parseSubscriptionUserInfo,
  resolveSubscriptionUserInfo,
} from "./subscription-userinfo";
import { normalizeSubscriptionUrlInput, tryNormalizeSubscriptionUrlInput } from "./url-input";
import {
  stripImportedNodeControlFields,
  stripImportedNodeControlFieldsFromList,
} from "./imported-node-controls";

function ssNode(name: string, extra: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: "node.example.com",
    port: 10001,
    cipher: "aes-128-gcm",
    password: "secret",
    ...extra,
  } as ParsedNode;
}

function dateOnlyUtcNoonSeconds(value: string): number {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return Math.floor(Date.UTC(year, month - 1, day, 12, 0, 0) / 1000);
}

describe("subscription user info helpers", () => {
  it("parses numeric and date-like subscription-userinfo headers", () => {
    expect(
      parseSubscriptionUserInfo(
        "upload=1024; download=2048.9; total=1e6; expire=2026-02-19"
      )
    ).toEqual({
      upload: 1024,
      download: 2048,
      total: 1000000,
      expire: dateOnlyUtcNoonSeconds("2026-02-19"),
    });
  });

  it("normalizes and merges plausible subscription-userinfo snapshots", () => {
    expect(hasSubscriptionUserInfo({ total: 2048 })).toBe(true);
    expect(hasSubscriptionUserInfo({})).toBe(false);
    expect(isPlausibleSubscriptionUserInfo({ total: 1025 })).toBe(true);
    expect(isPlausibleSubscriptionUserInfo({ total: 10, upload: 20 })).toBe(false);
    expect(normalizeSubscriptionUserInfo({ upload: -1, download: 2, total: Number.NaN, expire: 1 })).toEqual({
      download: 2,
    });

    expect(
      mergeSubscriptionUserInfo(
        { upload: 1, download: 2, total: 3, expire: dateOnlyUtcNoonSeconds("2026-12-31") },
        { upload: 4, download: 5, total: 6, expire: dateOnlyUtcNoonSeconds("2026-01-01") }
      )
    ).toEqual({
      upload: 5,
      download: 7,
      total: 9,
      expire: dateOnlyUtcNoonSeconds("2026-01-01"),
    });
  });

  it("uses account metadata node hints when header traffic is invalid", () => {
    const resolved = resolveSubscriptionUserInfo(
      { upload: 10, download: 20, total: 30, expire: 0 },
      [
        ssNode("剩余流量：1 GB"),
        ssNode("总流量：2 GB"),
        ssNode("套餐到期：2026-12-31"),
      ]
    );

    expect(resolved).toEqual({
      upload: 1024 ** 3,
      download: 0,
      total: 2 * 1024 ** 3,
      expire: dateOnlyUtcNoonSeconds("2026-12-31"),
    });
  });
});

describe("subscription node source state helpers", () => {
  it("assigns stable unique names", () => {
    const used = new Set(["Node", "Node (2)"]);

    expect(makeUniqueName("Node", used)).toBe("Node (3)");
    expect(makeUniqueName("   ", new Set(["未命名节点"]))).toBe("未命名节点 (2)");

    const unique = ssNode("Unique");
    expect(withUniqueNodeNames([unique], new Set())).toEqual([unique]);
    expect(withUniqueNodeNames([ssNode("Node"), ssNode("Other")], used).map((node) => node.name)).toEqual([
      "Node (3)",
      "Other",
    ]);
  });

  it("tracks original names and source ids without duplicates", () => {
    const node = withNodeSourceId(withNodeSourceId(ssNode("Node"), "source-a"), "source-a");
    const withSecondSource = withNodeSourceId(node, "source-b");

    expect(getNodeOriginName(withSecondSource)).toBe("Node");
    expect(getNodeOriginName(ssNode("Display", { _originName: " Original " }))).toBe(" Original ");
    expect(getNodeSourceIds(withSecondSource)).toEqual(["source-a", "source-b"]);
    expect(getNodeSourceIds({ ...ssNode("Bad"), [SOURCE_IDS_KEY]: ["x", "x", 1, ""] } as ParsedNode)).toEqual([
      "x",
    ]);
    const noSourceId = ssNode("No Source");
    expect(withNodeSourceId(noSourceId, " ")).toBe(noSourceId);
    expect(normalizeNodeOriginName(ssNode("Plain"))).toMatchObject({ _originName: "Plain" });
    const normalized = ssNode("Already", { _originName: "Already" });
    expect(normalizeNodeOriginName(normalized)).toBe(normalized);
    expect(withoutNodeSourceIds(withSecondSource, new Set(["source-a"]))).toMatchObject({
      [SOURCE_IDS_KEY]: ["source-b"],
    });
    const noSources = ssNode("No Sources");
    expect(withoutNodeSourceIds(noSources, new Set(["source-a"]))).toBe(noSources);
    expect(withoutNodeSourceIds(withSecondSource, new Set(["source-a", "source-b"]))).toBeNull();
    expect(keepOnlyValidNodeSourceIds(withSecondSource, new Set(["source-b"]))).toMatchObject({
      [SOURCE_IDS_KEY]: ["source-b"],
    });
    expect(keepOnlyValidNodeSourceIds(withSecondSource, new Set(["source-a", "source-b"]))).toBe(withSecondSource);
    expect(keepOnlyValidNodeSourceIds(noSources, new Set(["source-a"]))).toBe(noSources);
    expect(keepOnlyValidNodeSourceIds(withSecondSource, new Set(["missing"]))).toBeNull();
  });

  it("strips imported-only node control fields only when needed", () => {
    const plain = ssNode("Plain");
    const imported = ssNode("Imported", { "dialer-proxy": "private", dialer_proxy: "private" });

    expect(stripImportedNodeControlFields(null as never)).toBeNull();
    expect(stripImportedNodeControlFields(plain)).toBe(plain);
    expect(stripImportedNodeControlFields(imported)).toEqual(ssNode("Imported"));
    expect(stripImportedNodeControlFieldsFromList([plain, imported])).toEqual([plain, ssNode("Imported")]);
  });
});

describe("subscription URL and config helpers", () => {
  it("repairs dirty subscription URL query params", () => {
    expect(normalizeSubscriptionUrlInput(" ")).toBe("");
    expect(normalizeSubscriptionUrlInput(1 as never)).toBe("");
    expect(normalizeSubscriptionUrlInput(" https://example.com/sub&token=abc&user=ry ")).toBe(
      "https://example.com/sub?token=abc&user=ry"
    );
    expect(normalizeSubscriptionUrlInput("https://example.com/sub&")).toBe("https://example.com/sub&");
    expect(normalizeSubscriptionUrlInput("not a url")).toBe("not a url");
    expect(tryNormalizeSubscriptionUrlInput(" ")).toBeNull();
    expect(tryNormalizeSubscriptionUrlInput("https://example.com/sub")).toBe("https://example.com/sub");
    expect(tryNormalizeSubscriptionUrlInput("not a url")).toBeNull();
  });

  it("builds generate options from persisted config and strips imported-only fields", () => {
    expect(getEffectiveTestOptions({ testUrl: "not-http", testInterval: -1 })).toEqual({
      testUrl: "https://www.gstatic.com/generate_204",
      testInterval: 300,
    });

    const options = buildGenerateOptionsFromConfig(
      {
        template: "minimal",
        testUrl: "https://probe.example.com/204",
        testInterval: 120,
        sources: [
          {
            id: "main source",
            type: "url",
            useProxyProviders: true,
            content: "https://sub.example.com/list&token=abc",
          },
        ],
        enabledGroups: ["auto", ""],
        enabledRules: ["cn"],
        listenerPorts: { mixed: 7890, bad: 70000 },
        proxyGroupNameOverrides: { auto: " Auto " },
      },
      {
        nodes: [ssNode("Node", { "dialer-proxy": "private-only" })],
      }
    );

    expect(options).toMatchObject({
      template: "minimal",
      userConfig: {
        enabledGroups: ["auto"],
        enabledRules: ["cn"],
        listenerPorts: { mixed: 7890 },
        testUrl: "https://probe.example.com/204",
        testInterval: 120,
      },
      proxyGroupNameOverrides: { auto: "Auto" },
      proxyProviders: {
        url_main_source: {
          type: "http",
          url: "https://sub.example.com/list?token=abc",
          interval: 43200,
          path: "./proxy_providers/url_main_source.yaml",
          "health-check": {
            enable: true,
            url: "https://probe.example.com/204",
            interval: 300,
            timeout: 5000,
            lazy: true,
          },
        },
      },
    });
    expect(options.nodes[0]).not.toHaveProperty("dialer-proxy");
  });
});
