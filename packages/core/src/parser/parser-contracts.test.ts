import { describe, expect, it } from "vitest";
import { parseNodeLink, parseSubscription } from "./index";

function toBase64(value: string): string {
  return Buffer.from(value).toString("base64");
}

function mustParseNode(link: string) {
  const node = parseNodeLink(link);
  if (!node) throw new Error(`Expected node link to parse: ${link}`);
  return node;
}

describe("parser public contracts", () => {
  it("returns an empty parse result for blank subscriptions", () => {
    expect(parseSubscription("   ")).toEqual({
      nodes: [],
      errors: [],
      totalParsed: 0,
      totalFailed: 0,
    });
  });

  it("keeps naked proxy and unsupported scheme errors explicit", () => {
    expect(() => parseNodeLink("example.com:443:user:pass")).toThrow("无法识别的代理格式");
    expect(() => parseNodeLink("user:pass@example.com:443")).toThrow("无法识别的代理格式");
    expect(() => parseNodeLink("ftp://example.com/proxy")).toThrow("不支持的协议: ftp");
    expect(parseNodeLink("plain text")).toBeNull();
  });

  it("keeps VLESS Reality aliases, # remarks, and WebSocket early data", () => {
    const publicKey = "A".repeat(43);
    const node = mustParseNode(
      `vless://11111111-1111-4111-8111-111111111111@vless.example.com:443?security=reality&type=ws&path=%2Fws%3Fa%3D1%26ed%3D1024%26b%3D2&host=cdn.example.com&pbk=${publicKey}&sid=0x7250&fp=firefox#VLESS%23Remark`
    );

    expect(node).toMatchObject({
      name: "VLESS#Remark",
      type: "vless",
      server: "vless.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      tls: true,
      network: "ws",
      "client-fingerprint": "firefox",
      "reality-opts": {
        "public-key": publicKey,
        "short-id": "7250",
      },
      "ws-opts": {
        path: "/ws?a=1&b=2",
        headers: { Host: "cdn.example.com" },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 1024,
      },
    });
  });

  it("parses Hysteria2 multi-port links and rejects salamander without password", () => {
    const node = mustParseNode(
      "hy2://secret@hy2.example.com?ports=8443,9443-9449&hop-interval=15-30&obfs=salamander&obfs-password=mask#HY2"
    );

    expect(node).toMatchObject({
      name: "HY2",
      type: "hysteria2",
      server: "hy2.example.com",
      port: 8443,
      password: "secret",
      ports: "8443,9443-9449",
      "hop-interval": "15-30",
      obfs: "salamander",
      "obfs-password": "mask",
    });

    expect(() => mustParseNode("hy2://secret@hy2.example.com:443?obfs=salamander#Bad")).toThrow(
      "Hysteria2 salamander obfs 缺少 obfs-password"
    );
  });

  it("parses TUIC aliases for transport knobs", () => {
    const node = mustParseNode(
      "tuic://11111111-1111-4111-8111-111111111111:secret@tuic.example.com:443?fast-open=1&reduce-rtt=true&congestion-control=bbr&udp-relay-mode=native&request-timeout=5000&heartbeat-interval=9000&max-open-streams=16&max-idle-time=30#TUIC"
    );

    expect(node).toMatchObject({
      name: "TUIC",
      type: "tuic",
      server: "tuic.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "secret",
      tfo: true,
      "reduce-rtt": true,
      "congestion-controller": "bbr",
      "udp-relay-mode": "native",
      "request-timeout": 5000,
      "heartbeat-interval": 9000,
      "max-open-streams": 16,
      "max-idle-time": 30,
    });
  });

  it("accepts Clash YAML direct nodes, ports-only Hysteria2, and empty proxy providers", () => {
    const result = parseSubscription(`
proxies:
  - name: DIRECT
    type: direct
  - name: HY2 Ports
    type: hysteria2
    server: hy2-yaml.example.com
    ports: 50100-50199
    password: yaml-secret
proxy-providers: {}
`);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      name: "DIRECT",
      type: "direct",
    });
    expect(result.nodes[0]).not.toHaveProperty("server");
    expect(result.nodes[1]).toMatchObject({
      name: "HY2 Ports",
      type: "hysteria2",
      server: "hy2-yaml.example.com",
      port: 50100,
      ports: "50100-50199",
      password: "yaml-secret",
    });
  });

  it("keeps distinct account metadata nodes with identical endpoints", () => {
    const result = parseSubscription(`
proxies:
  - name: 余额 | 10 GB
    type: ss
    server: metadata.example.com
    port: 10001
    cipher: aes-128-gcm
    password: same-secret
  - name: 会员 | 2026-12-31
    type: ss
    server: metadata.example.com
    port: 10001
    cipher: aes-128-gcm
    password: same-secret
  - name: Regular Proxy
    type: ss
    server: metadata.example.com
    port: 10001
    cipher: aes-128-gcm
    password: same-secret
`);

    expect(result.errors).toEqual([]);
    expect(result.nodes.map((node) => node.name)).toEqual([
      "余额 | 10 GB",
      "会员 | 2026-12-31",
      "Regular Proxy",
    ]);
  });

  it("skips platform direct policy lines without turning them into parse failures", () => {
    const result = parseSubscription(`
[Proxy]
Shadowsocks = ss, platform.example.com, 8388, encrypt-method=aes-128-gcm, password=secret
Direct Policy = direct
`);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      name: "Shadowsocks",
      type: "ss",
      server: "platform.example.com",
      port: 8388,
    });
  });

  it("parses Shadowsocks SIP002 plugins and boolean aliases", () => {
    const credential = toBase64("aes-128-gcm:p@ss");
    const plugin = encodeURIComponent("obfs-local;obfs=tls;obfs-host=cdn.example.com");
    const node = mustParseNode(
      `ss://${credential}@ss.example.com:8388?plugin=${plugin}&uot=1&tfo=true#SS%20Plugin`
    );

    expect(node).toMatchObject({
      name: "SS Plugin",
      type: "ss",
      server: "ss.example.com",
      port: 8388,
      cipher: "aes-128-gcm",
      password: "p@ss",
      udp: true,
      "udp-over-tcp": true,
      tfo: true,
      plugin: "obfs",
      "plugin-opts": {
        mode: "tls",
        host: "cdn.example.com",
      },
    });
  });

  it("parses SSR links with decoded remarks and params", () => {
    const payload = [
      "ssr.example.com:443:auth_chain_a:aes-128-gcm:tls1.2_ticket_auth:",
      toBase64("secret"),
      "/?remarks=",
      toBase64("SSR Node"),
      "&protoparam=",
      toBase64("32"),
      "&obfsparam=",
      toBase64("cdn.example.com"),
    ].join("");
    const node = mustParseNode(`ssr://${toBase64(payload)}`);

    expect(node).toMatchObject({
      name: "SSR Node",
      type: "ssr",
      server: "ssr.example.com",
      port: 443,
      protocol: "auth_chain_a",
      cipher: "aes-128-gcm",
      obfs: "tls1.2_ticket_auth",
      password: "secret",
      "protocol-param": "32",
      "obfs-param": "cdn.example.com",
      udp: true,
    });
  });

  it("parses Trojan WebSocket upgrade fields and early data", () => {
    const node = mustParseNode(
      "trojan://pa%3Ass@trojan.example.com:443?type=httpupgrade&path=%2Ftrojan%3Fed%3D2048&host=cdn.example.com&allow-insecure=true&fp=chrome#Trojan"
    );

    expect(node).toMatchObject({
      name: "Trojan",
      type: "trojan",
      server: "trojan.example.com",
      port: 443,
      password: "pa:ss",
      udp: true,
      sni: "trojan.example.com",
      network: "ws",
      "skip-cert-verify": true,
      "client-fingerprint": "chrome",
      "ws-opts": {
        path: "/trojan",
        headers: { Host: "cdn.example.com" },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 2048,
        "v2ray-http-upgrade": true,
        "v2ray-http-upgrade-fast-open": true,
      },
    });
  });

  it("parses AnyTLS TCP-safe options and rejects Reality params", () => {
    const node = mustParseNode(
      "anytls://secret@anytls.example.com:443?alpn=h2,http%2F1.1&allowInsecure=true&fp=chrome&idle-session-check-interval=60&idle-session-timeout=120&min-idle-session=2&padding-scheme=100-200&ech=Y29uZmln#AnyTLS"
    );

    expect(node).toMatchObject({
      name: "AnyTLS",
      type: "anytls",
      server: "anytls.example.com",
      port: 443,
      password: "secret",
      udp: true,
      sni: "anytls.example.com",
      alpn: ["h2", "http/1.1"],
      "skip-cert-verify": true,
      "client-fingerprint": "chrome",
      "idle-session-check-interval": 60,
      "idle-session-timeout": 120,
      "min-idle-session": 2,
      "padding-scheme": "100-200",
      "ech-opts": {
        enable: true,
        config: "Y29uZmln",
      },
    });
    expect(() => mustParseNode("anytls://secret@anytls.example.com:443?security=reality#Bad")).toThrow(
      "AnyTLS 不支持 security=reality / reality-opts（Mihomo 不支持）"
    );
  });

  it("parses WireGuard address and peer fields", () => {
    const node = mustParseNode(
      "wg://private-key@wg.example.com:51820?public-key=public-key&pre-shared-key=pre-shared&reserved=1,2,3&address=10.0.0.2%2F32,%5Bfd00%3A%3A2%5D%2F128&mtu=1420&udp=false#WG"
    );

    expect(node).toMatchObject({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": "private-key",
      "public-key": "public-key",
      "pre-shared-key": "pre-shared",
      reserved: [1, 2, 3],
      ip: "10.0.0.2",
      ipv6: "fd00::2",
      mtu: 1420,
      udp: false,
    });
  });

  it("parses Snell and Hysteria v1 optional fields", () => {
    expect(
      mustParseNode(
        "snell://psk@snell.example.com:443?version=3&obfs=tls&obfs-host=cdn.example.com&obfs-uri=%2Ffront&udp-relay=true&fast-open=1#Snell"
      )
    ).toMatchObject({
      name: "Snell",
      type: "snell",
      server: "snell.example.com",
      port: 443,
      psk: "psk",
      version: 3,
      "obfs-opts": {
        mode: "tls",
        host: "cdn.example.com",
        path: "/front",
      },
      udp: true,
      tfo: true,
    });

    expect(
      mustParseNode(
        "hy://hy.example.com:443?auth=secret&protocol=wechat-video&sni=cdn.example.com&insecure=1&alpn=h3,h2&upmbps=50&down=100mbps&mport=1000-2000&obfsParam=mask&obfs=salamander&fast-open=true#HY1"
      )
    ).toMatchObject({
      name: "HY1",
      type: "hysteria",
      server: "hy.example.com",
      port: 443,
      protocol: "wechat-video",
      "auth-str": "secret",
      sni: "cdn.example.com",
      "skip-cert-verify": true,
      alpn: ["h3", "h2"],
      up: "50",
      down: "100mbps",
      ports: "1000-2000",
      obfs: "mask",
      _obfs: "salamander",
      tfo: true,
    });
  });

  it("parses simple proxy URL variants", () => {
    expect(
      mustParseNode("socks5+tls://user:pass@socks.example.com:1080?udp=0&sni=sni.example.com#SOCKS%20TLS")
    ).toMatchObject({
      name: "SOCKS TLS",
      type: "socks5",
      server: "socks.example.com",
      port: 1080,
      username: "user",
      password: "pass",
      udp: false,
      tls: true,
      sni: "sni.example.com",
    });

    expect(
      mustParseNode("tg://http?server=http.example.com&port=8080&user=u&pass=p&remark=TG%20HTTP")
    ).toMatchObject({
      name: "TG HTTP",
      type: "http",
      server: "http.example.com",
      port: 8080,
      username: "u",
      password: "p",
      tls: false,
    });
  });
});
