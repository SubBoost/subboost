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
import { parseSubscription } from "./index";

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
