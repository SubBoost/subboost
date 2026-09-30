import { describe, expect, it } from "vitest";
import {
  formatParseSegmentError,
  isClashYamlContent,
  parseConfigLineSubscriptionContent,
  parseLineBasedSubscriptionContent,
  parseSubscriptionContentByRegistry,
  splitNodeLinkSegments,
} from "./content-parsers";
import { encodeBase64 } from "./base64";
import { parseClashYaml, parseSubscription } from "./index";
import { preprocessSubscriptionContent } from "./preprocess";

function ssLink(name = "SS Node"): string {
  return `ss://${encodeBase64("aes-128-gcm:secret")}@ss.example.com:8388#${encodeURIComponent(name)}`;
}

describe("content parser registry helpers", () => {
  it("splits pipe-separated link lines only when every segment is link-like", () => {
    const first = ssLink("A");
    const second = ssLink("B");

    expect(splitNodeLinkSegments(`# comment\n${first}|${second}\nplain | text`)).toEqual([
      first,
      second,
      "plain | text",
    ]);
  });

  it("detects Clash YAML by sections or inline proxy fields", () => {
    expect(isClashYamlContent("proxy-providers: {}")).toBe(true);
    expect(isClashYamlContent("- type: hysteria2\n  server: hy2.example.com\n  ports: 10000-10100")).toBe(true);
    expect(isClashYamlContent("ss://not-yaml")).toBe(false);
    expect(isClashYamlContent(ssLink("proxies:"))).toBe(false);
  });

  it("does not misclassify a link fragment as YAML and falls through zero-node YAML parsers", () => {
    expect(parseSubscription(ssLink("proxies:")).nodes[0]).toMatchObject({ name: "proxies:", type: "ss" });

    const mixed = parseSubscription(`proxy-providers: {}\n${ssLink("Link after YAML")}`);
    expect(mixed.nodes[0]).toMatchObject({ name: "Link after YAML", type: "ss" });
    expect(mixed.errors.length).toBeGreaterThan(0);
  });

  it("detects and parses top-level inline flow proxy arrays", () => {
    const input = [
      '- {name: "IPv6 A", type: vless, server: 2001:db8::1, port: 443, uuid: 11111111-1111-4111-8111-111111111111}',
      '- {name: "IPv6 B", type: vless, server: 2001:db8::2, port: 8443, uuid: 22222222-2222-4222-8222-222222222222}',
    ].join("\n");

    expect(isClashYamlContent(input)).toBe(true);
    expect(parseSubscription(input)).toMatchObject({
      totalParsed: 2,
      totalFailed: 0,
      nodes: [
        { name: "IPv6 A", server: "2001:db8::1", port: 443, type: "vless" },
        { name: "IPv6 B", server: "2001:db8::2", port: 8443, type: "vless" },
      ],
    });
  });

  it("routes long malformed inline flow arrays to YAML errors without expensive matching", () => {
    const input = `- {name: "${"x".repeat(100_000)}", type: vless, server: example.com, port: 443`;
    const result = parseSubscription(input);

    expect(result.nodes).toEqual([]);
    expect(result.errors[0]).toContain("YAML 解析错误");
  });

  it("recognizes document-prefixed flow mappings and reports malformed large mappings", () => {
    expect(parseSubscription('---\t# subscription\n{"type": reject, name: blocked}')).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    expect(parseSubscription('--- {type : reject, name: blocked}')).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    const malformed = parseSubscription(`# ${"x".repeat(100_000)}\n---\n{type : reject, name: "${"x".repeat(100_000)}`);
    expect(malformed.nodes).toEqual([]);
    expect(malformed.errors[0]).toContain("YAML 解析错误");
  });

  it("keeps flow-looking URI fragments on the link parser path", () => {
    const name = '{"type": reject}#full-fragment';
    const link = `ss://${encodeBase64("aes-128-gcm:secret")}@local.subboost.test:443#${encodeURIComponent(name)}`;
    expect(isClashYamlContent(`# comment\n${link}`)).toBe(false);
    expect(parseSubscription(`# comment\n${link}`)).toMatchObject({ totalParsed: 1, totalFailed: 0, nodes: [{ name, type: "ss" }] });
    expect(isClashYamlContent("# comment\n---\n\n")).toBe(false);
  });

  it.each(["[]", '[1, true, null, "text"]', "---\n- text\n- 12\n- true"])("keeps non-node scalar sequences empty: %s", (content) => {
    expect(parseSubscription(content)).toMatchObject({ nodes: [], errors: [], totalParsed: 0, totalFailed: 0 });
  });

  it.each([
    '[{name: missing-type}]', '- {name: missing-type}',
    '[{"proxy-providers": {remote: {type: http, url: "https://local.subboost.test/nodes"}}}]',
    '{"proxy-providers": {remote: {type: http, url: "https://local.subboost.test/nodes"}}}',
    'proxy-providers:\n  remote: {type: http, url: "https://local.subboost.test/nodes"}',
  ])("keeps the YAML parser's errors for non-node objects and providers: %s", (content) => {
    const direct = parseClashYaml(content);
    expect(direct.nodes).toEqual([]);
    expect(direct.errors.length).toBeGreaterThan(0);
    expect(parseSubscription(content)).toEqual(direct);
  });

  it("keeps platform section headers separate from YAML flow sequences", () => {
    expect(isClashYamlContent("[Proxy]\nDirect = direct")).toBe(false);
    expect(parseSubscription("[Proxy]\nDirect = direct")).toMatchObject({ nodes: [], errors: [] });
    expect(parseSubscription("[Proxy]\nNode = ss, local.subboost.test, 443, encrypt-method=aes-128-gcm, password=secret"))
      .toMatchObject({ totalParsed: 1, totalFailed: 0, nodes: [{ name: "Node", type: "ss", server: "local.subboost.test", port: 443 }] });
  });

  it("keeps platform-like scalar entries inside YAML sequences on the YAML path", () => {
    const inline = "[Proxy, {name: blocked, type: reject}]";
    expect(preprocessSubscriptionContent(inline)).toEqual({ content: inline, errors: [], applied: [] });
    expect(parseSubscription(inline))
      .toMatchObject({ totalParsed: 1, totalFailed: 0, nodes: [{ name: "blocked", type: "reject" }] });
    const nested = "[\n  [Proxy],\n  {name: blocked, type: reject}\n]";
    expect(preprocessSubscriptionContent(nested)).toEqual({ content: nested, errors: [], applied: [] });
    expect(parseClashYaml(nested)).toMatchObject({ totalParsed: 1, totalFailed: 1 });
    expect(parseSubscription(nested)).toMatchObject({ totalParsed: 1, totalFailed: 1, nodes: [{ name: "blocked", type: "reject" }] });
    const scalar = "- |\n  [Proxy]\n  Node = ss, local.subboost.test, 443, encrypt-method=aes-128-gcm, password=secret";
    expect(parseClashYaml(scalar)).toMatchObject({ nodes: [], errors: [] });
    expect(preprocessSubscriptionContent(scalar)).toEqual({ content: scalar, errors: [], applied: [] });
    expect(parseSubscription(scalar)).toMatchObject({ nodes: [], errors: [] });
  });

  it.each([
    "[type: reject]", "[Proxy, {name: blocked, type: reject}]",
    "[WireGuard wg, {name: blocked, type: reject}]",
    "[WireGuard wg: hk, {name: blocked, type: reject}]",
    "[{name: bad, type: reject]]",
  ])("keeps bracket-root YAML authoritative around platform header syntax: %s", (content) => {
    expect(preprocessSubscriptionContent(content)).toEqual({ content, errors: [], applied: [] });
    expect(parseSubscription(content)).toEqual(parseClashYaml(content));
  });

  it.each(["[General]\nskip=true", "[Rule]\nFINAL,DIRECT"])("retains empty non-proxy platform documents: %s", (content) => {
    expect(parseSubscription(content)).toMatchObject({ nodes: [], errors: [] });
  });

  it("keeps URI imports after semicolon comments and reports large malformed bracket roots", () => {
    const link = `ss://${encodeBase64("aes-128-gcm:secret")}@local.subboost.test:443#Node`;
    expect(parseSubscription(`; Profile: generated\n${link}`)).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    const malformed = parseSubscription(`[{name: "${"x".repeat(100_000)}", type: reject]]`);
    expect(malformed.nodes).toEqual([]);
    expect(malformed.errors[0]).toContain("YAML 解析错误");
  });

  it("reports malformed directive-prefixed flow sequences with long fields", () => {
    const result = parseSubscription(`%YAML 1.2\n---\n[{"type": anytls, name: "${"x".repeat(100_000)}`);
    expect(result.nodes).toEqual([]);
    expect(result.errors[0]).toContain("YAML 解析错误");
  });

  it("uses only YAML mapping separators and retains multiline values", () => {
    expect(isClashYamlContent("name:without-whitespace")).toBe(false);
    expect(isClashYamlContent("plain text")).toBe(false);
    expect(parseSubscription("'type':\tanytls\nserver: local.subboost.test\nport: 443\npassword: secret"))
      .toMatchObject({ totalParsed: 1, totalFailed: 0 });
    expect(parseSubscription("type:\n  reject\nname: blocked")).toMatchObject({ totalParsed: 1, totalFailed: 0 });
  });

  it("parses link lines and keeps per-segment errors", () => {
    const result = parseLineBasedSubscriptionContent(`${ssLink()}\nftp://not-supported`);

    expect(result.nodes).toHaveLength(1);
    expect(result.totalParsed).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.errors[0]).toContain("解析失败: ftp://not-supported");
  });

  it("parses config lines and platform proxy lines", () => {
    const result = parseConfigLineSubscriptionContent(`
; comment
Line = ss, ss-line.example.com, 8388, encrypt-method=aes-128-gcm, password=secret
Bad = ss, missing-port
`);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      name: "Line",
      type: "ss",
      server: "ss-line.example.com",
      port: 8388,
    });
    expect(result.errors).toHaveLength(1);
  });

  it("routes through YAML, config-line, and link fallbacks", () => {
    const yaml = parseSubscriptionContentByRegistry(`
proxies:
  - name: YAML
    type: ss
    server: yaml.example.com
    port: 8388
    cipher: aes-128-gcm
    password: secret
`);
    const configLine = parseSubscriptionContentByRegistry(
      "Line = ss, ss-line.example.com, 8388, encrypt-method=aes-128-gcm, password=secret"
    );
    const linkLine = parseSubscriptionContentByRegistry(ssLink("Link"));

    expect(yaml.nodes[0]).toMatchObject({ name: "YAML", type: "ss" });
    expect(configLine.nodes[0]).toMatchObject({ name: "Line", type: "ss" });
    expect(linkLine.nodes[0]).toMatchObject({ name: "Link", type: "ss" });
  });

  it("formats unknown parse errors with a stable fallback reason", () => {
    expect(formatParseSegmentError("x".repeat(60), "bad")).toBe(`${"x".repeat(50)}... - 未知错误`.replace(/^/, "解析失败: "));
  });
});
