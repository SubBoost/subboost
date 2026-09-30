import { describe, expect, it } from "vitest";
import { canonicalizeParsedNode, pickAliasValue } from "../../../packages/core/src/parser/canonical-fields";
import { parseClashYaml } from "../../../packages/core/src/parser/clash-yaml";
import { parseConfigLine } from "../../../packages/core/src/parser/config-line-parser";
import {
  isClashYamlContent,
  parseConfigLineSubscriptionContent,
  parseLineBasedSubscriptionContent,
  parseSubscriptionContentByRegistry,
} from "../../../packages/core/src/parser/content-parsers";
import { parseJsonStringMap } from "../../../packages/core/src/parser/json-utils";
import { parsePlatformConfigContent } from "../../../packages/core/src/parser/platform/parse-platform-config";
import { parsePlatformProxyLine } from "../../../packages/core/src/parser/platform/parse-platform-proxy-line";
import { preprocessSubscriptionContent } from "../../../packages/core/src/parser/preprocess";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("core parser registry edge regressions", () => {
  it("recognizes sparse inline Clash proxy lists and comments", () => {
    expect(
      isClashYamlContent([
        "# exported by a client",
        "",
        "- {name: A, type: hysteria2, server: a.example.com, ports: 1000-1002}",
      ].join("\n")),
    ).toBe(true);
    const missingPort = "# comment\n- {name: A, type: ss, server: local.subboost.test}";
    expect(isClashYamlContent(missingPort)).toBe(true);
    expect(parseSubscriptionContentByRegistry(missingPort)).toMatchObject({
      nodes: [], totalFailed: 1, errors: [expect.stringContaining("端口")],
    });
  });

  it("keeps flow-list repair bounded to valid root proxy arrays", () => {
    const single = parseClashYaml(
      "proxies:\n  - {name: One, type: anytls, server: one.example.com, port: 443, password: secret}",
    );
    expect(single.nodes[0]).toMatchObject({ name: "One", type: "anytls" });

    const consistent = parseClashYaml([
      "proxies:",
      "  # keep this comment",
      "  - {name: A, type: ss, server: a.example.com, port: 8388}",
      "",
      "  - {name: B, type: ssr, server: b.example.com, port: 8389} # trailing",
    ].join("\n"));
    expect(consistent.nodes.map((node) => node.name)).toEqual(["A", "B"]);

    const nestedBoundary = parseClashYaml([
      "proxies:",
      "  - {name: A, type: ss, server: a.example.com, port: 8388}",
      "rules:",
      "  - MATCH,DIRECT",
    ].join("\n"));
    expect(nestedBoundary.nodes).toHaveLength(1);
  });

  it("preserves non-string WebSocket paths and newer Clash protocol types", () => {
    const result = parseClashYaml([
      "proxies:",
      "  - name: VMess Numeric Path",
      "    type: vmess",
      "    server: vmess.example.com",
      "    port: 443",
      `    uuid: ${UUID}`,
      "    network: ws",
      "    ws-opts:",
      "      path: 7",
      "  - name: AnyTLS",
      "    type: anytls",
      "    server: anytls.example.com",
      "    port: 443",
      "    password: secret",
      "  - name: Sudoku",
      "    type: sudoku",
      "    server: sudoku.example.com",
      "    port: 443",
    ].join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.nodes.find((node) => node.name === "VMess Numeric Path")?.["ws-opts"]).toMatchObject({ path: 7 });
    expect(result.nodes.find((node) => node.name === "AnyTLS")).toMatchObject({ type: "anytls" });
    expect(result.nodes.find((node) => node.name === "Sudoku")).toMatchObject({ type: "sudoku" });
  });

  it("reports invalid array, object, and scalar Clash rows independently", () => {
    const array = parseClashYaml([
      "- null",
      "- 1",
      "- type: ss",
      "  server: valid.example.com",
      "  port: 8388",
      "- name: Invalid",
      "  type: ss",
      "  port: bad",
    ].join("\n"));
    expect(array.nodes).toEqual([expect.objectContaining({ name: "未命名节点" })]);
    expect(array.errors[0]).toContain("Invalid");

    expect(parseClashYaml("proxies: invalid")).toMatchObject({ nodes: [], totalFailed: 1 });
    expect(parseClashYaml("proxies: [").errors[0]).toContain("YAML 解析错误");
  });

  it("keeps link and config-line registries tolerant of blank and null parses", () => {
    const lineResult = parseLineBasedSubscriptionContent([
      "# comment",
      "",
      "not-a-node",
      "http://proxy.example.com:80#HTTP",
    ].join("\n"));
    expect(lineResult.nodes).toEqual([expect.objectContaining({ name: "HTTP" })]);

    const configResult = parseConfigLineSubscriptionContent([
      "# ignored",
      "not = a-real-protocol, bad",
      "HTTP = http, config.example.com, 80",
    ].join("\n"));
    expect(configResult.nodes).toEqual([expect.objectContaining({ name: "HTTP" })]);

    expect(parseSubscriptionContentByRegistry("proxies:\n  - name: [")).toMatchObject({
      nodes: [],
      totalFailed: 1,
    });
  });

  it("preprocesses empty, HTML, base64, and empty full-config sections conservatively", () => {
    expect(preprocessSubscriptionContent("   ")).toMatchObject({ content: "", applied: [] });
    expect(preprocessSubscriptionContent("<html><body>blocked</body></html>")).toMatchObject({
      content: "",
      errors: [expect.stringContaining("HTML")],
    });
    expect(preprocessSubscriptionContent("[Proxy]\n[Rule]\nMATCH,DIRECT")).toMatchObject({
      content: "[Proxy]",
      errors: [],
    });
    expect(preprocessSubscriptionContent(Buffer.from("http://decoded.example.com:80#Decoded").toString("base64"))).toMatchObject({
      applied: ["base64"],
      content: "http://decoded.example.com:80#Decoded",
    });
  });

  it("parses sparse config-line aliases without manufacturing credentials", () => {
    expect(parseConfigLine("Trojan = trojan, trojan.example.com, 443, fp=chrome")).toMatchObject({
      name: "Trojan",
      password: "",
      "client-fingerprint": "chrome",
    });
    expect(parseConfigLine("Snell = snell, snell.example.com, 443, password=secret")).toMatchObject({
      psk: "secret",
    });
    expect(
      parseConfigLine(
        "HY = hysteria, hy.example.com, 443, auth=secret, peer=sni.example.com, fingerprint=firefox, obfsparam=mask",
      ),
    ).toMatchObject({
      sni: "sni.example.com",
      obfs: "mask",
    });
    expect(
      parseConfigLine(
        `TUIC = tuic, tuic.example.com, 443, uuid=${UUID}, password=secret, tls-name=sni.example.com`,
      ),
    ).toMatchObject({ sni: "sni.example.com" });
  });

  it("normalizes platform parser scalar fallbacks and WireGuard peers", () => {
    expect(
      parsePlatformProxyLine(
        "WG = wireguard, section-name=wg",
        {
          sections: new Map([
            [
              "WireGuard wg",
              [
                "private-key = private",
                "self-ip = 10.0.0.2",
                'peer = (public-key = public, endpoint = "wg.example.com:51820")',
              ],
            ],
          ]),
        },
      ),
    ).toMatchObject({ type: "wireguard", server: "wg.example.com" });
    expect(parsePlatformProxyLine("Bad = custom, server.example.com, 443")).toBeNull();
    expect(parsePlatformConfigContent("[Proxy]\nBad = http, missing-port.example.com, bad")).toMatchObject({
      nodes: [],
      totalFailed: 1,
    });
  });

  it("canonicalizes aliases only when their parent records are valid", () => {
    expect(pickAliasValue({ outer: null }, [["outer", "value"]])).toBeUndefined();
    expect(pickAliasValue({ outer: { nested: 1 } }, [["outer", "nested", "value"]])).toBeUndefined();

    const node = canonicalizeParsedNode({
      name: "Aliases",
      type: "vmess",
      server: "alias.example.com",
      port: 443,
      uuid: UUID,
      allowInsecure: true,
    } as never);
    expect(node).toMatchObject({ "skip-cert-verify": true });
    expect(node).not.toHaveProperty("allowInsecure");
    expect(canonicalizeParsedNode({ type: "vmess", "tls-verification": "on" } as never)).toMatchObject({
      "skip-cert-verify": false,
    });

    expect(parseJsonStringMap('{" ":"skip"," good ":" value ","bad":1}')).toEqual({
      good: " value ",
      bad: "1",
    });
  });
});
