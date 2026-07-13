import { describe, expect, it } from "vitest";
import { looksLikeConfigLine } from "./config-line-parser";
import {
  applyCommonNodeParams,
  applyTransport,
  inferSkipCertVerify,
  isUuidLike,
  parseBooleanish,
  parseIntParam,
  parseStringList,
  parseWsHeaders,
  tokenizeConfigLine,
} from "./config-line-tokenizer";

describe("config line tokenizer helpers", () => {
  it("tokenizes quoted config lines and mirrors dashed/underscored params", () => {
    expect(looksLikeConfigLine("Node = ss, example.com, 8388")).toBe(true);
    expect(looksLikeConfigLine("# Node = ss, example.com, 8388")).toBe(false);

    const tokenized = tokenizeConfigLine(
      '"My Node" = ss, "ss.example.com", 8388, encrypt_method=aes-128-gcm, password=secret, extra'
    );

    expect(tokenized).toMatchObject({
      name: "My Node",
      type: "ss",
      host: "ss.example.com",
      port: 8388,
      params: {
        encrypt_method: "aes-128-gcm",
        "encrypt-method": "aes-128-gcm",
        password: "secret",
      },
      extras: ["extra"],
    });
    expect(() => tokenizeConfigLine("broken")).toThrow("无效的配置行格式");
    expect(() => tokenizeConfigLine("Bad = ss, example.com, 70000")).toThrow("配置行中的地址或端口无效");
    for (const invalidPort of ["1.5", "0x50", "8e3", "+80", "-1"]) {
      expect(() => tokenizeConfigLine(`Bad = ss, example.com, ${invalidPort}`), invalidPort).toThrow(
        "配置行中的地址或端口无效"
      );
    }
    expect(tokenizeConfigLine("Ignored = ss, ignored.example.com, 8388, =empty, flag")).toMatchObject({
      params: {},
      extras: ["flag"],
    });
  });

  it("normalizes common primitive params", () => {
    expect(parseBooleanish("yes")).toBe(true);
    expect(parseBooleanish("off")).toBe(false);
    expect(parseBooleanish("maybe")).toBeUndefined();
    expect(parseStringList(undefined)).toBeUndefined();
    expect(parseStringList(" , ")).toBeUndefined();
    expect(parseStringList("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(parseWsHeaders(undefined)).toBeUndefined();
    expect(parseWsHeaders("bad|also-bad")).toBeUndefined();
    expect(parseWsHeaders("Host:|:missing|Good:yes")).toEqual({ Good: "yes" });
    expect(parseWsHeaders('Host:cdn.example.com|X-Test:"yes"')).toEqual({
      Host: "cdn.example.com",
      "X-Test": "yes",
    });
    expect(parseIntParam(undefined)).toBeUndefined();
    expect(parseIntParam("42ms")).toBe(42);
    expect(parseIntParam("x")).toBeUndefined();
    expect(isUuidLike("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuidLike("not-a-uuid")).toBe(false);
    expect(inferSkipCertVerify({ "skip-cert-verify": "false" })).toBe(false);
    expect(inferSkipCertVerify({ "tls-verification": "false" })).toBe(true);
    expect(inferSkipCertVerify({ "tls-verification": "true" })).toBeUndefined();
    expect(inferSkipCertVerify({ "allow-insecure": "0" })).toBe(false);
  });

  it("applies shared node params to non-VMess protocols and rare TLS aliases", () => {
    const trojan: Record<string, unknown> = { type: "trojan" };
    applyCommonNodeParams(trojan, {
      peer: "trojan-sni.example.com",
      "tls-cert-sha256": "cert",
      "tls_pubkey_sha256": "pub",
      "disable-sni": "true",
      "block-quic": "true",
      "udp-port": "53",
      "fast-open": "false",
      "shadow-tls-version": "3",
      "shadow-tls-sni": "shadow.example.com",
      "shadow-tls-password": "shadow-secret",
    });

    expect(trojan).toMatchObject({
      sni: "trojan-sni.example.com",
      "tls-cert-sha256": "cert",
      "tls-pubkey-sha256": "pub",
      "disable-sni": true,
      "block-quic": true,
      "udp-port": 53,
      tfo: false,
      "shadow-tls-version": 3,
      "shadow-tls-sni": "shadow.example.com",
      "shadow-tls-password": "shadow-secret",
    });

    const hysteria2: Record<string, unknown> = { type: "hysteria2" };
    applyCommonNodeParams(hysteria2, { fingerprint: "chrome" });
    expect(hysteria2).toMatchObject({ fingerprint: "chrome" });
  });

  it("applies transport helpers across default, header, and xHTTP edge branches", () => {
    const defaultWs: Record<string, unknown> = {};
    applyTransport(defaultWs, { "ws-path": "/ws?ed=128", "ws-headers": "Host:from-header.example.com|X-Test:yes" }, {
      defaultTransport: "ws",
    });
    expect(defaultWs).toMatchObject({
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: {
          Host: "from-header.example.com",
          "X-Test": "yes",
        },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 128,
      },
    });

    const plainGrpc: Record<string, unknown> = {};
    applyTransport(plainGrpc, { transport: "grpc", path: "/svc" });
    expect(plainGrpc).toMatchObject({
      network: "grpc",
      "grpc-opts": {
        "grpc-service-name": "svc",
      },
    });

    const blankHttp: Record<string, unknown> = {};
    applyTransport(blankHttp, { transport: "http", method: "   ", path: " , " });
    expect(blankHttp).toMatchObject({
      network: "http",
      "http-opts": {
        method: "GET",
        path: ["/"],
        headers: undefined,
      },
    });

    const xhttp: Record<string, unknown> = {};
    applyTransport(xhttp, {
      transport: "xhttp",
      path: "/x",
      host: "cdn.example.com",
      mode: "packet-up",
      "xhttp-headers": "User-Agent:SubBoost",
      "no-grpc-header": "off",
      "sc-max-each-post-bytes": "bad",
      "download-headers": "Accept:yaml",
    }, {
      allowedTransports: ["tcp", "xhttp"],
    });
    expect(xhttp).toMatchObject({
      network: "xhttp",
      "xhttp-opts": {
        path: "/x",
        host: "cdn.example.com",
        mode: "packet-up",
        headers: { "User-Agent": "SubBoost" },
        "no-grpc-header": false,
        "download-settings": {
          headers: { Accept: "yaml" },
        },
      },
    });

    expect(() => applyTransport({}, { transport: "udp" }, { allowedTransports: ["tcp"], protocolName: "测试" })).toThrow(
      "不支持的 测试 传输层"
    );
    expect(() => applyTransport({}, { transport: " " }, { allowedTransports: ["tcp"] })).toThrow(
      "transport=(empty)"
    );

    const tcp: Record<string, unknown> = {};
    applyTransport(tcp, { transport: "tcp" });
    expect(tcp).toMatchObject({ network: "tcp" });

    const xhttpAliases: Record<string, unknown> = {};
    applyTransport(xhttpAliases, {
      network: "xhttp",
      path: "/alias",
      headers: "Host:edge.example.com",
      "max-connections": "2",
      "c-max-reuse-times": "3",
      "h-max-request-times": "4",
      "h-max-reusable-secs": "5",
      no_grpc_header: "yes",
      sc_max_each_post_bytes: "4096",
      downloadheaders: "Accept:yaml",
    }, {
      allowedTransports: ["tcp", "xhttp"],
    });
    expect(xhttpAliases).toMatchObject({
      network: "xhttp",
      "xhttp-opts": {
        path: "/alias",
        headers: { Host: "edge.example.com" },
        "no-grpc-header": true,
        "sc-max-each-post-bytes": 4096,
        "reuse-settings": {
          "max-connections": "2",
          "c-max-reuse-times": "3",
          "h-max-request-times": "4",
          "h-max-reusable-secs": "5",
        },
        "download-settings": {
          headers: { Accept: "yaml" },
        },
      },
    });
  });
});
