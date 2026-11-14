import { describe, expect, it } from "vitest";
import { parseClashYaml, parseSubscription } from "@subboost/core/parser";
import { parseConfigLineSubscriptionContent, parseSubscriptionContentByRegistry } from "@subboost/core/parser/content-parsers";
import { inferParseErrorCategory, normalizeParseErrors, normalizeParseResult } from "@subboost/core/parser/normalize";
import { CLIENT_UPDATE_PLACEHOLDER_ERROR } from "@subboost/core/parser/placeholder";
import { MAX_SUBSCRIPTION_ERRORS, MAX_SUBSCRIPTION_ITEMS } from "@subboost/core/parser/limits";
import type { ParsedNode } from "@subboost/core/types/node";

function ssd(payload: unknown): string {
  return `ssd://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

describe("subscription resource and compatibility contracts", () => {
  it("keeps Unicode credentials and remarks while converting SSD server defaults", () => {
    const content = ssd({
      port: 443, encryption: "aes-128-gcm", password: "pé汉🔑",
      servers: [{ server: "local.subboost.test", remarks: "节点 🚀" }],
    });
    const result = parseSubscription(content);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toMatchObject([{ name: "节点 🚀", password: "pé汉🔑" }]);
  });

  it("rejects an invalid Unicode SSD remark instead of returning partial links", () => {
    const content = ssd({
      port: 443, encryption: "aes-128-gcm", password: "demo",
      servers: [{ server: "local.subboost.test", remarks: "valid" }, { server: "local.subboost.test", remarks: "\ud800" }],
    });
    const result = parseSubscription(content);
    expect(result.nodes).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("SSD 订阅预处理失败");
  });

  it("ignores inherited properties when reading SSD server entries", () => {
    const key = "__subboost_inherited_server_test__";
    const content = ssd({ port: 443, encryption: "aes-128-gcm", password: "demo", servers: {
      first: { server: "local.subboost.test", remarks: "real" },
    } });
    Object.defineProperty(Object.prototype, key, {
      configurable: true, enumerable: true, writable: true,
      value: { server: "local.subboost.test", remarks: "inherited" },
    });
    let result: ReturnType<typeof parseSubscription>;
    try {
      result = parseSubscription(content);
    } finally {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
    expect(result.errors).toEqual([]);
    expect(result.nodes).toMatchObject([{ name: "real" }]);
  });

  it("bounds UTF-8 expansion of a Netch entry before building its encoded link", () => {
    const content = JSON.stringify({ ModeFileNameType: 1, Server: [{ Type: "SS", Remark: "汉".repeat(4_300_000) }] });
    expect(content.length).toBeLessThan(10 * 1024 * 1024);
    expect(parseSubscription(content)).toMatchObject({
      nodes: [], errors: [expect.stringContaining("预处理展开后的内容超过大小上限")],
    });
  });

  it("retains a valid node at the error limit and fails the whole result above it", () => {
    const link = "http://local.subboost.test:443#valid";
    const bad = Array.from({ length: MAX_SUBSCRIPTION_ERRORS }, (_, index) => `ftp://n${index}.local.subboost.test`);
    const atLimit = parseSubscription([link, ...bad].join("\n"));
    expect(atLimit.nodes).toMatchObject([{ name: "valid" }]);
    expect(atLimit.errors).toHaveLength(MAX_SUBSCRIPTION_ERRORS);
    const overLimit = parseSubscription([link, ...bad, "ftp://extra.local.subboost.test"].join("\n"));
    expect(overLimit).toMatchObject({ nodes: [], errors: [expect.stringContaining("解析错误数量超过上限")] });
  });

  it("shares the error budget when YAML falls back to parsing lines", () => {
    const invalidNodes = Array.from({ length: 99 }, (_, index) => `  - {name: bad${index}}`).join("\n");
    const source = `proxies:\n${invalidNodes}\nnotes: |\n  ftp://first.local.subboost.test\n  ftp://second.local.subboost.test`;
    expect(parseSubscriptionContentByRegistry(source)).toMatchObject({
      nodes: [], errors: [expect.stringContaining("解析错误数量超过上限")],
    });
  });

  it("deduplicates bounded errors, rejects excess distinct errors and preserves placeholder diagnostics", () => {
    const errors = Array.from({ length: MAX_SUBSCRIPTION_ERRORS }, (_, index) => `error ${index}`);
    expect(normalizeParseErrors([...errors, errors[0], " ", null as unknown as string])).toEqual(errors);
    expect(() => normalizeParseErrors([...errors, "one more"])).toThrow("解析错误数量超过上限");
    const placeholder = { name: "请更新客户端", type: "ss", server: "127.0.0.1", port: 1, cipher: "aes-128-gcm", password: "demo" } as ParsedNode;
    expect(normalizeParseResult({ nodes: [placeholder], errors: [], totalParsed: 1, totalFailed: 0 }))
      .toMatchObject({ nodes: [], errors: [CLIENT_UPDATE_PLACEHOLDER_ERROR] });
    expect(inferParseErrorCategory("订阅格式异常")).toBe("unsupported-format");
    expect(inferParseErrorCategory("其他异常")).toBe("unknown");
  });

  it("keeps valid legacy config lines when the platform parser does not recognize them", () => {
    const result = parseConfigLineSubscriptionContent([
      "Hy = hysteria, local.subboost.test, 443, auth=demo",
      "V = vless, local.subboost.test, 443, uuid=11111111-1111-4111-8111-111111111111",
    ].join("\n"));
    expect(result.errors).toEqual([]);
    expect(result.nodes).toMatchObject([{ name: "Hy", type: "hysteria" }, { name: "V", type: "vless" }]);
  });

  it("rejects malformed YAML without widening indentation repair", () => {
    const trailing = "proxies:\n  - {name: a, type: reject}\n   - {name: b, type: reject}junk";
    const otherSection = "proxies:\n  - {name: a, type: reject}\n  - {name: b, type: reject}\nrules: [";
    for (const source of [trailing, otherSection, "proxies: []\n---\nproxies: []"]) {
      const result = parseClashYaml(source);
      expect(result.nodes).toEqual([]);
      expect(result.errors[0]).toContain("YAML 解析错误");
    }
  });

  it("preserves native Hysteria fields and identifies malformed YAML rows safely", () => {
    const good = parseClashYaml("proxies: [{name: hy, type: hysteria, server: local.subboost.test, port: 443, auth-str: demo, ports: 8000-8002}]");
    expect(good.errors).toEqual([]);
    expect(good.nodes).toMatchObject([{ name: "hy", type: "hysteria", "auth-str": "demo", ports: "8000-8002" }]);
    const inputs = [
      "proxies: [{type: ss, server: local.subboost.test, port: -1}]",
      "- {type: ss, server: local.subboost.test, port: -1}",
      "proxies: [{name: bad, type: trojan, server: local.subboost.test, port: 443, password: []}]",
      "proxies: [{name: bad, type: wireguard, peers: [false]}]",
    ];
    for (const input of inputs) {
      const result = parseClashYaml(input);
      expect(result.nodes).toEqual([]);
      expect(result.errors).toHaveLength(1);
    }
  });

  it("bounds tab expansion and indentation-repair output before allocating oversized text", () => {
    expect(parseClashYaml(`proxies:\n${"\t".repeat(8_400_000)}`)).toMatchObject({
      nodes: [], errors: [expect.stringContaining("制表符展开后的内容超过大小上限")],
    });
    const item = `- name: a\n${" ".repeat(1_000)}type: reject\n`;
    const source = `proxies:\n${item.repeat(9_000)}`;
    expect(source.length).toBeLessThan(10 * 1024 * 1024);
    expect(parseClashYaml(source)).toMatchObject({
      nodes: [], errors: [expect.stringContaining("YAML 缩进修复后的内容超过大小上限")],
    });
  });

  it("bounds config-line batches before returning any partial result", () => {
    const line = "node = http, local.subboost.test, 443";
    expect(() => parseConfigLineSubscriptionContent(Array(MAX_SUBSCRIPTION_ITEMS + 1).fill(line).join("\n")))
      .toThrow("节点或分段数量超过上限");
  });
});
