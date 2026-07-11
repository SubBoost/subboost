import { describe, expect, it } from "vitest";
import { parseClashYaml } from "./clash-yaml";

const REALITY_PUBLIC_KEY = "A".repeat(43);

describe("parseClashYaml", () => {
  it("parses full Clash YAML with common and newer proxy types", () => {
    const result = parseClashYaml(`
proxy-providers:
  remote:
    type: http
    url: https://example.com/provider.yaml
proxies:
  - name: SS
    type: ss
    server: ss.example.com
    port: 8388
    cipher: aes-128-gcm
    password: secret
    plugin: obfs-local
    plugin-opts:
      obfs: tls
      obfs-host: cdn.example.com
  - name: SSR
    type: ssr
    server: ssr.example.com
    port: 8388
    cipher: aes-256-cfb
    password: secret
    protocol: auth_sha1_v4
    obfs: tls1.2_ticket_auth
  - name: VMess
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    tls: true
    network: ws
    ws-opts:
      path: /ws?ed=256
  - name: VLESS
    type: vless
    server: vless.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    tls: true
    network: xhttp
    reality-opts:
      public-key: ${REALITY_PUBLIC_KEY}
      short-id: 7250
  - name: Trojan
    type: trojan
    server: trojan.example.com
    port: 443
    password: secret
    network: grpc
  - name: AnyTLS
    type: anytls
    server: anytls.example.com
    port: 443
    password: secret
    client-fingerprint: chrome
  - name: HY
    type: hy
    server: hy.example.com
    ports: 20000-20100
    port: 20001
    auth-str: secret
  - name: HY2
    type: hy2
    server: hy2.example.com
    ports: 30000-30100
    password: secret
  - name: SOCKS
    type: socks
    server: socks.example.com
    port: 1080
  - name: HTTPS
    type: https
    server: https.example.com
    port: 443
    username: user
    password: pass
  - name: TUIC
    type: tuic
    server: tuic.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    password: secret
  - name: SSH
    type: ssh
    server: ssh.example.com
    port: 22
    username: root
    password: secret
  - name: DIRECT
    type: direct
  - name: Unknown
    type: new-protocol
    server: unknown.example.com
    port: 1234
`);

    expect(result.totalParsed).toBe(14);
    expect(result.errors).toEqual(["检测到 proxy-providers 配置，由于浏览器限制无法自动拉取，请直接粘贴节点内容"]);
    expect(result.nodes.find((node) => node.name === "SS")).toMatchObject({
      type: "ss",
      plugin: "obfs",
      "plugin-opts": {
        mode: "tls",
        host: "cdn.example.com",
      },
    });
    expect(result.nodes.find((node) => node.name === "VMess")).toMatchObject({
      "ws-opts": {
        path: "/ws",
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 256,
      },
    });
    expect(result.nodes.find((node) => node.name === "VLESS")).toMatchObject({
      type: "vless",
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
        "short-id": "7250",
      },
    });
    expect(result.nodes.find((node) => node.name === "HY2")).toMatchObject({
      type: "hysteria2",
      port: 30000,
      ports: "30000-30100",
    });
    expect(result.nodes.find((node) => node.name === "SOCKS")).toMatchObject({ type: "socks5" });
    expect(result.nodes.find((node) => node.name === "Unknown")).toMatchObject({ type: "new-protocol" });
  });

  it("handles arrays, single proxy objects, empty YAML, bad YAML, and invalid nodes", () => {
    expect(parseClashYaml("- name: Array SS\n  type: ss\n  server: array.example.com\n  port: 8388").nodes[0]).toMatchObject({
      name: "Array SS",
      cipher: "aes-256-gcm",
    });
    expect(parseClashYaml("name: Single\nserver: single.example.com\nport: 443\ntype: trojan").nodes[0]).toMatchObject({
      name: "Single",
      type: "trojan",
    });
    expect(parseClashYaml("").errors).toEqual(["空的配置文件"]);
    expect(parseClashYaml("proxies:\n  - name: Bad\n    type: ss\n    port: bad").errors[0]).toContain("缺少服务器地址");
    expect(parseClashYaml("proxies: [").errors[0]).toContain("YAML 解析错误");
    expect(parseClashYaml("just text").errors[0]).toContain("无法识别为 Clash YAML");
  });

  it("repairs common pasted YAML shape and preserves protocol-specific defaults", () => {
    const repaired = parseClashYaml(`
proxies:
  - name: Repaired
      type: ss
      server: repaired.example.com
      port: 8388
      password: secret
`);
    const mixed = parseClashYaml(`
proxies:
  - name: DNS
    type: dns
  - name: SSR Default
    type: ssr
    server: ssr-default.example.com
    port: 8388
  - name: SOCKS4
    type: socks4
    server: socks4.example.com
    port: 1080
  - name: HTTP
    type: http
    server: http.example.com
    port: 8080
    headers:
      User-Agent: SubBoost
  - name: Mieru
    type: mieru
    server: mieru.example.com
    port: 2999
  - name: Bad
    server: bad.example.com
    port: 443
`);

    expect(repaired.nodes[0]).toMatchObject({
      name: "Repaired",
      type: "ss",
      server: "repaired.example.com",
      cipher: "aes-256-gcm",
      password: "secret",
    });
    expect(mixed.nodes.find((node) => node.name === "DNS")).toMatchObject({ type: "dns" });
    expect(mixed.nodes.find((node) => node.name === "SSR Default")).toMatchObject({
      type: "ssr",
      cipher: "aes-256-cfb",
      protocol: "origin",
      obfs: "plain",
    });
    expect(mixed.nodes.find((node) => node.name === "SOCKS4")).toMatchObject({ type: "socks4" });
    expect(mixed.nodes.find((node) => node.name === "HTTP")).toMatchObject({
      type: "http",
      headers: { "User-Agent": "SubBoost" },
    });
    expect(mixed.nodes.find((node) => node.name === "Mieru")).toMatchObject({ type: "mieru" });
    expect(mixed.errors[0]).toContain('节点 "Bad" 解析失败');
  });

  it("parses consistently indented root flow proxy lists", () => {
    for (const spaces of [0, 1, 2, 4]) {
      const indent = " ".repeat(spaces);
      const result = parseClashYaml([
        "proxies:",
        `${indent}- {name: A, type: vless, server: 2001:db8::1, port: 443, uuid: 11111111-1111-4111-8111-111111111111}`,
        `${indent}- {name: B, type: vless, server: 2001:db8::2, port: 8443, uuid: 22222222-2222-4222-8222-222222222222}`,
      ].join("\n"));

      expect(result.errors).toEqual([]);
      expect(result.nodes.map((node) => node.name)).toEqual(["A", "B"]);
    }
  });

  it("repairs inconsistent root flow proxy list indentation", () => {
    for (const secondIndent of [1, 4]) {
      const result = parseClashYaml([
        "proxies:",
        "  - {name: A, type: vless, server: 2001:db8::1, port: 443, uuid: 11111111-1111-4111-8111-111111111111}",
        `${" ".repeat(secondIndent)}- {name: B, type: vless, server: 2001:db8::2, port: 8443, uuid: 22222222-2222-4222-8222-222222222222, reality-opts: {public-key: test-key}}`,
      ].join("\n"));

      expect(result.errors).toEqual([]);
      expect(result.nodes).toMatchObject([
        { name: "A", server: "2001:db8::1", port: 443, type: "vless" },
        {
          name: "B",
          server: "2001:db8::2",
          port: 8443,
          type: "vless",
          "reality-opts": { "public-key": "test-key" },
        },
      ]);
    }
  });

  it("does not repair nested, mixed, or unclosed flow proxy structures", () => {
    const nested = parseClashYaml([
      "proxy-groups:",
      "  - name: Group",
      "    type: select",
      "    proxies:",
      "      - {name: A, type: vless, server: example.com, port: 443}",
      "       - {name: B, type: vless, server: example.net, port: 443}",
    ].join("\n"));
    const mixed = parseClashYaml([
      "proxies:",
      "  - {name: A, type: vless, server: example.com, port: 443}",
      "    - name: B",
      "      type: vless",
      "      server: example.net",
      "      port: 443",
    ].join("\n"));
    const unclosed = parseClashYaml("proxies:\n  - {name: A, type: vless, server: example.com, port: 443");

    for (const result of [nested, mixed, unclosed]) {
      expect(result.nodes).toEqual([]);
      expect(result.errors[0]).toContain("YAML 解析错误");
    }
  });

  it("keeps YAML backslash-underscore escape semantics in quoted names", () => {
    const result = parseClashYaml(String.raw`proxies:
  - {name: "x1.0\_50M", type: vless, server: example.com, port: 443}`);

    expect(result.errors).toEqual([]);
    expect(result.nodes[0]?.name).toBe("x1.0\u00a050M");
  });

  it("handles provider variants, array noise, and malformed proxy rows", () => {
    expect(parseClashYaml("[]")).toEqual({
      nodes: [],
      errors: [],
      totalParsed: 0,
      totalFailed: 0,
    });
    expect(parseClashYaml("123").errors[0]).toContain("无法识别为 Clash YAML");
    expect(
      parseClashYaml(`
proxy-providers: {}
proxies:
  - name: DIRECT
    type: direct
`).errors
    ).toEqual([]);
    expect(
      parseClashYaml(`
proxy-providers: []
proxies:
  - name: DNS
    type: dns
`).errors
    ).toEqual([]);
    expect(parseClashYaml("proxies: bad").errors[0]).toContain("节点解析失败");

    const arrayResult = parseClashYaml(`
- null
- 1
- type: ss
  server: array-default.example.com
  port: 8388
- name: Bad Array
  type: ss
  port: bad
`);
    expect(arrayResult.nodes).toHaveLength(1);
    expect(arrayResult.nodes[0]).toMatchObject({
      name: "未命名节点",
      server: "array-default.example.com",
    });
    expect(arrayResult.errors[0]).toContain('节点 "Bad Array" 解析失败');
  });

  it("normalizes VLESS reality options and keeps existing WebSocket early-data settings", () => {
    const result = parseClashYaml(`
proxies:
  - name: VLESS Trim
    type: vless
    server: vless-trim.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    reality-opts:
      public-key: "  ${REALITY_PUBLIC_KEY}  "
      short-id: "0x"
      spider-x: /
  - name: VMess Preset ED
    type: vmess
    server: vmess-ed.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    network: ws
    ws-opts:
      path: /ws?ed=128
      max-early-data: 64
  - name: VMess Bad WS
    type: vmess
    server: vmess-bad-ws.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    network: ws
    ws-opts: []
  - name: HY Ports Only
    type: hy
    server: hy-ports.example.com
    ports: 10000-10100
`);

    expect(result.nodes.find((node) => node.name === "VLESS Trim")).toMatchObject({
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
        "spider-x": "/",
      },
    });
    expect(result.nodes.find((node) => node.name === "VLESS Trim")).not.toMatchObject({
      "reality-opts": {
        "short-id": expect.anything(),
      },
    });
    expect(result.nodes.find((node) => node.name === "VMess Preset ED")).toMatchObject({
      "ws-opts": {
        path: "/ws",
        "max-early-data": 64,
      },
    });
    expect(result.nodes.find((node) => node.name === "VMess Preset ED")?.["ws-opts"]).not.toHaveProperty(
      "early-data-header-name"
    );
    expect(result.nodes.find((node) => node.name === "VMess Bad WS")).toMatchObject({
      "ws-opts": [],
    });
    expect(result.errors[0]).toContain('节点 "HY Ports Only" 解析失败');
  });

  it("covers non-mutating YAML normalization branches and protocol defaults", () => {
    const result = parseClashYaml(`
proxies:
  - 1
  - name: VMess TCP
    type: vmess
    server: vmess-tcp.example.com
    port: 80
  - name: VMess WS Empty
    type: vmess
    server: vmess-ws-empty.example.com
    port: 443
    network: ws
  - name: VMess WS Plain
    type: vmess
    server: vmess-ws-plain.example.com
    port: 443
    network: ws
    ws-opts:
      path: /plain
  - name: VLESS No Reality
    type: vless
    server: vless-none.example.com
    port: 443
  - name: VLESS Empty Reality
    type: vless
    server: vless-empty.example.com
    port: 443
    reality-opts:
      short-id: "0x"
  - name: VLESS Numeric Reality
    type: vless
    server: vless-numeric.example.com
    port: 443
    reality-opts:
      public-key: 123
      short-id: 7
  - name: AnyTLS Default
    type: anytls
    server: anytls-default.example.com
    port: 443
  - name: HY2 Default
    type: hysteria2
    server: hy2-default.example.com
    port: 443
  - name: TUIC Default
    type: tuic
    server: tuic-default.example.com
    port: 443
  - name: Masque
    type: masque
    server: masque.example.com
    port: 443
  - name: Sudoku
    type: sudoku
    server: sudoku.example.com
    port: 443
  - name: Bad Unknown
    type: ss
    port: bad
`);

    expect(result.nodes.find((node) => node.name === "VMess TCP")).toMatchObject({
      type: "vmess",
      uuid: "",
      network: undefined,
    });
    expect(result.nodes.find((node) => node.name === "VMess WS Empty")).toMatchObject({
      type: "vmess",
      network: "ws",
    });
    expect(result.nodes.find((node) => node.name === "VMess WS Plain")).toMatchObject({
      "ws-opts": { path: "/plain" },
    });
    expect(result.nodes.find((node) => node.name === "VLESS No Reality")).toMatchObject({
      type: "vless",
      uuid: "",
    });
    expect(result.nodes.find((node) => node.name === "VLESS Empty Reality")?.["reality-opts"]).toBeUndefined();
    expect(result.nodes.find((node) => node.name === "VLESS Numeric Reality")).toMatchObject({
      "reality-opts": {
        "public-key": 123,
        "short-id": "07",
      },
    });
    expect(result.nodes.find((node) => node.name === "AnyTLS Default")).toMatchObject({
      type: "anytls",
      password: "",
    });
    expect(result.nodes.find((node) => node.name === "HY2 Default")).toMatchObject({
      type: "hysteria2",
      password: "",
    });
    expect(result.nodes.find((node) => node.name === "TUIC Default")).toMatchObject({
      type: "tuic",
      uuid: "",
      password: "",
    });
    expect(result.nodes.find((node) => node.name === "Masque")).toMatchObject({ type: "masque" });
    expect(result.nodes.find((node) => node.name === "Sudoku")).toMatchObject({ type: "sudoku" });
    expect(result.errors[0]).toContain('节点 "Bad Unknown" 解析失败');
  });
});
