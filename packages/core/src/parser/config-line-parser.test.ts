import { describe, expect, it } from "vitest";
import { mustParseConfigLine } from "./config-line-parser.test-helpers";

describe("config line parser", () => {
  it("builds VMess and VLESS transport options", () => {
    expect(
      mustParseConfigLine(
        "VMess = vmess, vmess-line.example.com, 443, auto, 11111111-1111-4111-8111-111111111111, tls=true, transport=ws, ws-path=/ws?ed=512, ws-host=cdn.example.com, skip-cert-verify=true, alter-id=2"
      )
    ).toMatchObject({
      name: "VMess",
      type: "vmess",
      server: "vmess-line.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      alterId: 2,
      cipher: "auto",
      tls: true,
      "skip-cert-verify": true,
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 512,
      },
    });

    expect(
      mustParseConfigLine(
        "VLESS = vless, vless-line.example.com, 443, uuid=11111111-1111-4111-8111-111111111111, pbk=public-key, sid=1234, transport=xhttp, path=/x, host=cdn.example.com, xhttp-headers=User-Agent:SubBoost, no-grpc-header=true, sc-max-each-post-bytes=2048"
      )
    ).toMatchObject({
      name: "VLESS",
      type: "vless",
      server: "vless-line.example.com",
      port: 443,
      tls: true,
      uuid: "11111111-1111-4111-8111-111111111111",
      "client-fingerprint": "chrome",
      "reality-opts": {
        "public-key": "public-key",
        "short-id": "1234",
      },
      network: "xhttp",
      "xhttp-opts": {
        path: "/x",
        host: "cdn.example.com",
        headers: { "User-Agent": "SubBoost" },
        "no-grpc-header": true,
        "sc-max-each-post-bytes": 2048,
      },
    });
  });

  it("builds common protocol nodes from config lines", () => {
    expect(
      mustParseConfigLine(
        "SS = ss, ss-line.example.com, 8388, encrypt-method=chacha20-ietf-poly1305, password=secret, obfs=http, obfs-host=cdn.example.com, obfs-uri=/front, udp-relay=false"
      )
    ).toMatchObject({
      name: "SS",
      type: "ss",
      server: "ss-line.example.com",
      port: 8388,
      cipher: "chacha20-ietf-poly1305",
      password: "secret",
      udp: false,
      plugin: "obfs",
      "plugin-opts": {
        mode: "http",
        host: "cdn.example.com",
        path: "/front",
      },
    });

    expect(mustParseConfigLine("SS Default = ss, ss-default.example.com, 8388")).toMatchObject({
      name: "SS Default",
      type: "ss",
      cipher: "aes-256-gcm",
      password: "",
    });

    expect(
      mustParseConfigLine(
        "SOCKS = socks, socks-line.example.com, 1080, username=user, password=pass, tls-cert-sha256=cert, block-quic=true, udp-port=53"
      )
    ).toMatchObject({
      name: "SOCKS",
      type: "socks5",
      server: "socks-line.example.com",
      port: 1080,
      username: "user",
      password: "pass",
      udp: true,
      "tls-cert-sha256": "cert",
      "block-quic": true,
      "udp-port": 53,
    });

    expect(mustParseConfigLine("SOCKS TLS = socks5+tls, socks-tls.example.com, 1080")).toMatchObject({
      name: "SOCKS TLS",
      type: "socks5",
      server: "socks-tls.example.com",
      port: 1080,
      tls: true,
    });

    expect(mustParseConfigLine("SOCKS4 = socks4, socks4-line.example.com, 1080")).toMatchObject({
      name: "SOCKS4",
      type: "socks4",
      server: "socks4-line.example.com",
      port: 1080,
      udp: false,
    });

    expect(mustParseConfigLine("HTTPS = https, https-line.example.com, 443, over-tls=false")).toMatchObject({
      name: "HTTPS",
      type: "https",
      server: "https-line.example.com",
      port: 443,
      tls: true,
    });

    expect(
      mustParseConfigLine(
        "SSH = ssh, ssh-line.example.com, 22, username=user, password=pass, server-name=ssh-sni.example.com, server-fingerprint=sha256:abc, fast-open=on"
      )
    ).toMatchObject({
      name: "SSH",
      type: "ssh",
      server: "ssh-line.example.com",
      port: 22,
      username: "user",
      password: "pass",
      sni: "ssh-sni.example.com",
      "tls-fingerprint": "sha256:abc",
      tfo: true,
    });

    expect(
      mustParseConfigLine(
        "HTTP = http, http-line.example.com, 8080, username=user, password=pass, headers=User-Agent:SubBoost|X-Test:yes, tls=true"
      )
    ).toMatchObject({
      name: "HTTP",
      type: "http",
      server: "http-line.example.com",
      port: 8080,
      username: "user",
      password: "pass",
      tls: true,
      headers: { "User-Agent": "SubBoost", "X-Test": "yes" },
    });

    expect(
      mustParseConfigLine(
        "Trojan = trojan, trojan-line.example.com, 443, password=secret, transport=grpc, service-name=svc, mode=gun, authority=authority.example.com, fp=chrome"
      )
    ).toMatchObject({
      name: "Trojan",
      type: "trojan",
      server: "trojan-line.example.com",
      port: 443,
      password: "secret",
      "client-fingerprint": "chrome",
      network: "grpc",
      "grpc-opts": {
        "grpc-service-name": "svc",
        _grpcType: "gun",
        _grpcAuthority: "authority.example.com",
      },
    });

    expect(
      mustParseConfigLine(
        "Trojan TCP = trojan, trojan-tcp.example.com, 443, password=secret, peer=tls.example.com, fingerprint=firefox, alpn=h2/http1"
      )
    ).toMatchObject({
      name: "Trojan TCP",
      type: "trojan",
      server: "trojan-tcp.example.com",
      port: 443,
      password: "secret",
      sni: "tls.example.com",
      "client-fingerprint": "firefox",
      alpn: ["h2/http1"],
    });

    expect(
      mustParseConfigLine(
        "AnyTLS = anytls, anytls-line.example.com, 443, password=secret, alpn=h2, fp=chrome, udp-relay=false, allow-insecure=true"
      )
    ).toMatchObject({
      name: "AnyTLS",
      type: "anytls",
      server: "anytls-line.example.com",
      port: 443,
      password: "secret",
      udp: false,
      alpn: ["h2"],
      "client-fingerprint": "chrome",
      "skip-cert-verify": true,
    });
    expect(() =>
      mustParseConfigLine("BadAnyTLS = anytls, anytls-line.example.com, 443")
    ).toThrow("anytls 配置行缺少 password");
    expect(() =>
      mustParseConfigLine("BadAnyTLSTransport = anytls, anytls-line.example.com, 443, password=secret, transport=ws")
    ).toThrow("anytls 配置行不支持 transport=ws");
    expect(() =>
      mustParseConfigLine("BadAnyTLS = anytls, anytls-line.example.com, 443, password=secret, pbk=public-key")
    ).toThrow("anytls 配置行不支持 Reality 参数（Mihomo 不支持）");
  });

  it("builds WireGuard, Hysteria2, TUIC, and Snell config lines", () => {
    expect(
      mustParseConfigLine(
        "WG = wireguard, wg-line.example.com, 51820, private-key=private, public-key=public, pre-shared-key=pre, ip=10.0.0.2, mtu=1420, udp=false"
      )
    ).toMatchObject({
      name: "WG",
      type: "wireguard",
      server: "wg-line.example.com",
      port: 51820,
      "private-key": "private",
      "public-key": "public",
      "pre-shared-key": "pre",
      ip: "10.0.0.2",
      mtu: 1420,
      udp: false,
    });

    expect(
      mustParseConfigLine(
        "HY2 = hysteria2, hy2-line.example.com, 443, password=secret, salamander-password=mask, port-hopping-interval=10, tls-fingerprint=chrome"
      )
    ).toMatchObject({
      name: "HY2",
      type: "hysteria2",
      server: "hy2-line.example.com",
      port: 443,
      password: "secret",
      obfs: "salamander",
      "obfs-password": "mask",
      "hop-interval": 10,
      fingerprint: "chrome",
    });

    expect(
      mustParseConfigLine(
        "HY2 Extra = hysteria2, hy2-extra.example.com, 443, extra-secret, download-bandwidth=50 mbps, server-cert-fingerprint-sha256=abc"
      )
    ).toMatchObject({
      name: "HY2 Extra",
      type: "hysteria2",
      server: "hy2-extra.example.com",
      port: 443,
      password: "extra-secret",
      down: "50 mbps",
      fingerprint: "abc",
    });

    expect(
      mustParseConfigLine(
        "TUIC = tuic-v5, tuic-line.example.com, 443, uuid=11111111-1111-4111-8111-111111111111, password=secret, disable-sni=true, congestion-controller=bbr, udp-relay-mode=native"
      )
    ).toMatchObject({
      name: "TUIC",
      type: "tuic",
      server: "tuic-line.example.com",
      port: 443,
      version: 5,
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "secret",
      "disable-sni": true,
      "congestion-controller": "bbr",
      "udp-relay-mode": "native",
    });

    expect(
      mustParseConfigLine(
        "TUIC Extra = tuic, tuic-extra.example.com, 443, token-extra, sni=tuic.example.com, alpn=h3, allow-insecure=true"
      )
    ).toMatchObject({
      name: "TUIC Extra",
      type: "tuic",
      server: "tuic-extra.example.com",
      port: 443,
      token: "token-extra",
      sni: "tuic.example.com",
      alpn: ["h3"],
      "skip-cert-verify": true,
    });

    expect(mustParseConfigLine("TUIC Token = tuic, tuic-token.example.com, 443, token=secret-token")).toMatchObject({
      name: "TUIC Token",
      type: "tuic",
      server: "tuic-token.example.com",
      port: 443,
      token: "secret-token",
    });
    expect(() => mustParseConfigLine("BadTUIC = tuic, tuic-line.example.com, 443")).toThrow(
      "tuic 配置行缺少 token 或 uuid/password"
    );

    expect(
      mustParseConfigLine(
        "Snell = snell, snell-line.example.com, 443, psk=secret, version=3, obfs=tls, obfs-host=cdn.example.com, obfs-uri=/front, udp-relay=true"
      )
    ).toMatchObject({
      name: "Snell",
      type: "snell",
      server: "snell-line.example.com",
      port: 443,
      psk: "secret",
      version: 3,
      "obfs-opts": {
        mode: "tls",
        host: "cdn.example.com",
        path: "/front",
      },
      udp: true,
    });
    expect(mustParseConfigLine("Snell Plain = snell, snell-plain.example.com, 443, password=secret")).toMatchObject({
      name: "Snell Plain",
      type: "snell",
      server: "snell-plain.example.com",
      port: 443,
      psk: "secret",
    });

    expect(
      mustParseConfigLine(
        "HY = hy, hy-line.example.com, 443, auth-secret, protocol=wechat-video, sni=hy.example.com, alpn=h3, upmbps=20, downmbps=100, ports=20000-30000, obfs-param=mask, obfs=salamander"
      )
    ).toMatchObject({
      name: "HY",
      type: "hysteria",
      server: "hy-line.example.com",
      port: 443,
      protocol: "wechat-video",
      "auth-str": "auth-secret",
      sni: "hy.example.com",
      alpn: ["h3"],
      up: "20",
      down: "100",
      ports: "20000-30000",
      obfs: "mask",
      _obfs: "salamander",
    });

    expect(
      mustParseConfigLine(
        "WG Alias = wireguard, wg-alias.example.com, 51820, privatekey=private, publickey=public, presharedkey=pre, interface-ip=10.0.0.2, interface-ipv6=fd00::2, section-name=peer, mtu=1420"
      )
    ).toMatchObject({
      name: "WG Alias",
      type: "wireguard",
      server: "wg-alias.example.com",
      port: 51820,
      "private-key": "private",
      "public-key": "public",
      "pre-shared-key": "pre",
      ip: "10.0.0.2",
      ipv6: "fd00::2",
      "section-name": "peer",
      mtu: 1420,
    });
    expect(() => mustParseConfigLine("BadWG = wireguard, wg-line.example.com, 51820")).toThrow(
      "wireguard 配置行缺少 private-key"
    );
  });

  it("builds remaining transport variants and rejects unsupported transports", () => {
    expect(
      mustParseConfigLine(
        "VMess HTTPUpgrade = vmess, vmess-upgrade.example.com, 443, 11111111-1111-4111-8111-111111111111, transport=httpupgrade, ws-host=cdn.example.com, ws-path=/upgrade, tls=true"
      )
    ).toMatchObject({
      name: "VMess HTTPUpgrade",
      type: "vmess",
      network: "ws",
      "ws-opts": {
        path: "/upgrade",
        headers: { Host: "cdn.example.com" },
        "v2ray-http-upgrade": true,
        "v2ray-http-upgrade-fast-open": true,
      },
    });

    expect(
      mustParseConfigLine(
        "VMess ID = vmess, vmess-id.example.com, 443, id=11111111-1111-4111-8111-111111111111, scy=auto, ws=true, host=cdn.example.com, path=/ws, over-tls=true, server-cert-fingerprint-sha256=chrome"
      )
    ).toMatchObject({
      name: "VMess ID",
      type: "vmess",
      server: "vmess-id.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      cipher: "auto",
      tls: true,
      "client-fingerprint": "chrome",
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
      },
    });

    expect(
      mustParseConfigLine(
        "VLESS Extra = vless, vless-extra.example.com, 443, 11111111-1111-4111-8111-111111111111, encryption=none, packet_encoding=xudp, client-fingerprint=edge"
      )
    ).toMatchObject({
      name: "VLESS Extra",
      type: "vless",
      server: "vless-extra.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      encryption: "none",
      "packet-encoding": "xudp",
      "client-fingerprint": "edge",
    });

    expect(
      mustParseConfigLine(
        "VLESS HTTP = vless, vless-http.example.com, 443, uuid=11111111-1111-4111-8111-111111111111, transport=http, host=cdn.example.com, path=/front"
      )
    ).toMatchObject({
      name: "VLESS HTTP",
      type: "vless",
      network: "http",
      "http-opts": {
        method: "GET",
        path: ["/front"],
        headers: { Host: ["cdn.example.com"] },
      },
    });

    expect(
      mustParseConfigLine(
        "VLESS H2 = vless, vless-h2.example.com, 443, uuid=11111111-1111-4111-8111-111111111111, transport=h2, host=h2.example.com, path=/h2"
      )
    ).toMatchObject({
      name: "VLESS H2",
      type: "vless",
      network: "h2",
      "h2-opts": {
        host: ["h2.example.com"],
        path: "/h2",
      },
    });

    expect(
      mustParseConfigLine(
        "VLESS XHTTP Rich = vless, vless-xhttp.example.com, 443, uuid=11111111-1111-4111-8111-111111111111, transport=xhttp, path=/x, host=cdn.example.com, mode=packet-up, max-concurrency=4, download-path=/down, download-host=download.example.com, download-headers=User-Agent:SubBoost, x-padding-bytes=100-200"
      )
    ).toMatchObject({
      name: "VLESS XHTTP Rich",
      type: "vless",
      network: "xhttp",
      "xhttp-opts": {
        path: "/x",
        host: "cdn.example.com",
        mode: "packet-up",
        "x-padding-bytes": "100-200",
        "reuse-settings": {
          "max-concurrency": "4",
        },
        "download-settings": {
          path: "/down",
          host: "download.example.com",
          headers: {
            "User-Agent": "SubBoost",
          },
        },
      },
    });

    expect(() =>
      mustParseConfigLine(
        "BadVMess = vmess, vmess-bad.example.com, 443, 11111111-1111-4111-8111-111111111111, transport=quic"
      )
    ).toThrow("不支持的 vmess 传输层");
    expect(() => mustParseConfigLine("BadVMessUuid = vmess, vmess-bad.example.com, 443")).toThrow(
      "vmess 配置行缺少 uuid"
    );
    expect(() => mustParseConfigLine("BadType = unknown, unknown.example.com, 443")).toThrow(
      "不支持的配置行协议: unknown"
    );
  });

  it("builds rare config-line aliases and conservative defaults", () => {
    expect(mustParseConfigLine("SOCKS5 TLS Alias = socks5-tls, socks-tls-alias.example.com, 1080, over-tls=false")).toMatchObject({
      name: "SOCKS5 TLS Alias",
      type: "socks5",
      tls: false,
    });

    const httpNoHeaders = mustParseConfigLine("HTTP No Headers = http, http-no-headers.example.com, 8080, headers=bad|Host:");
    expect(httpNoHeaders).toMatchObject({
      name: "HTTP No Headers",
      type: "http",
      server: "http-no-headers.example.com",
    });
    expect(httpNoHeaders.headers).toBeUndefined();

    expect(
      mustParseConfigLine(
        "VMess Username = vmess, vmess-user.example.com, 443, username=11111111-1111-4111-8111-111111111111, encryption=auto, udp-relay=false, tls-verification=false, fp=chrome"
      )
    ).toMatchObject({
      name: "VMess Username",
      type: "vmess",
      uuid: "11111111-1111-4111-8111-111111111111",
      cipher: "auto",
      udp: false,
      "skip-cert-verify": true,
      "client-fingerprint": "chrome",
    });

    expect(
      mustParseConfigLine(
        "VLESS Alias = vless, vless-alias.example.com, 443, username=11111111-1111-4111-8111-111111111111, public_key=pub, short_id=sid, packetencoding=xudp, fingerprint=edge, udp-relay=false"
      )
    ).toMatchObject({
      name: "VLESS Alias",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      udp: false,
      "packet-encoding": "xudp",
      "client-fingerprint": "edge",
      "reality-opts": {
        "public-key": "pub",
        "short-id": "sid",
      },
    });

    expect(
      mustParseConfigLine("AnyTLS None = anytls, anytls-none.example.com, 443, auth=secret, transport=none, server-name=sni.example.com")
    ).toMatchObject({
      name: "AnyTLS None",
      type: "anytls",
      password: "secret",
      sni: "sni.example.com",
    });

    expect(
      mustParseConfigLine(
        "TUIC Alias = tuic, tuic-alias.example.com, 443, uuid=11111111-1111-4111-8111-111111111111, password=secret, congestioncontrol=cubic, udprelaymode=quic, tfo=false"
      )
    ).toMatchObject({
      name: "TUIC Alias",
      type: "tuic",
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "secret",
      "congestion-controller": "cubic",
      "udp-relay-mode": "quic",
      tfo: false,
    });

    expect(mustParseConfigLine("Snell Loose = snell, snell-loose.example.com, 443, psk=secret, version=bad")).toMatchObject({
      name: "Snell Loose",
      type: "snell",
      psk: "secret",
    });
  });
});
