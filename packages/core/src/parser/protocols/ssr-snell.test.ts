import { describe, expect, it } from "vitest";
import { parseSnell } from "./snell";
import { parseSSR } from "./ssr";

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("SSR and Snell parsers", () => {
  it("parses SSR links with decoded params and IPv6 hosts", () => {
    const node = parseSSR(
      `ssr://${b64(`[2001:db8::1]:8388:auth_sha1_v4:aes-256-cfb:tls1.2_ticket_auth:${b64("secret")}/?remarks=${b64("SSR Node")}&protoparam=${b64("proto")}&obfsparam=${b64("plain-host")}`)}`
    );

    expect(node).toMatchObject({
      name: "SSR Node",
      type: "ssr",
      server: "2001:db8::1",
      port: 8388,
      cipher: "aes-256-cfb",
      password: "secret",
      protocol: "auth_sha1_v4",
      "protocol-param": "proto",
      obfs: "tls1.2_ticket_auth",
      "obfs-param": "plain-host",
      udp: true,
    });
  });

  it("parses SSR defaults and alternate query parameter names", () => {
    const node = parseSSR(
      `ssr://${b64(`ssr-default.example.com:8388::::${b64("plain pass")}?remark=${b64("Plain SSR")}&protocol-param=${b64("proto raw")}&obfs-param=${b64("obfs raw")}&flag`)}`
    );

    expect(node).toMatchObject({
      name: "Plain SSR",
      type: "ssr",
      server: "ssr-default.example.com",
      port: 8388,
      cipher: "aes-256-cfb",
      password: "plain pass",
      protocol: "origin",
      obfs: "plain",
      "protocol-param": "proto raw",
      "obfs-param": "obfs raw",
      udp: true,
    });

    expect(parseSSR(`ssr://${b64(`no-query.example.com:8388::::${b64("secret")}`)}`)).toMatchObject({
      name: "SSR-no-query.example.com:8388",
      cipher: "aes-256-cfb",
      protocol: "origin",
      obfs: "plain",
    });
    expect(parseSSR(`ssr://${b64(`empty-query.example.com:8388::::${b64("secret")}?`)}`)).toMatchObject({
      name: "SSR-empty-query.example.com:8388",
      password: "secret",
    });
    expect(
      parseSSR(
        `ssr://${b64(
          `raw-param.example.com:8388:auth:aes-128-gcm:http:${b64("plain secret")}/?remarks=${b64("Raw SSR")}&&=skip&protoparam=${b64("proto raw")}&obfsparam=${b64("obfs raw")}`
        )}`
      )
    ).toMatchObject({
      name: "Raw SSR",
      type: "ssr",
      password: "plain secret",
      protocol: "auth",
      cipher: "aes-128-gcm",
      obfs: "http",
      "protocol-param": "proto raw",
      "obfs-param": "obfs raw",
    });
  });

  it("preserves literal plus and percent sequences after SSR base64 decoding", () => {
    const literal = "A+B%20C";
    const node = parseSSR(
      `ssr://${b64(`literal.example.com:8388:origin:aes-256-cfb:plain:${b64("secret")}/?remarks=${b64(literal)}&protoparam=${b64(literal)}&obfsparam=${b64(literal)}`)}`
    );

    expect(node).toMatchObject({
      name: literal,
      "protocol-param": literal,
      "obfs-param": literal,
    });
  });

  it("keeps SSR validation errors explicit", () => {
    expect(() => parseSSR("http://bad")).toThrow("无效的 SSR 链接");
    expect(() => parseSSR("ssr://")).toThrow("无效的 SSR 链接");
    expect(() => parseSSR(`ssr://${b64("bad")}`)).toThrow("无效的 SSR 链接格式");
    expect(() => parseSSR(`ssr://${b64(":8388:origin:aes-256-cfb:plain:" + b64("secret"))}`)).toThrow("缺少服务器地址");
    expect(() => parseSSR(`ssr://${b64("ssr.example.com:70000:origin:aes-256-cfb:plain:" + b64("secret"))}`)).toThrow("无效的端口号");
  });

  it("parses Snell URL and query credential variants", () => {
    expect(
      parseSnell(
        "snell://psk@snell.example.com:443?version=3&obfs=tls&obfs-host=cdn.example.com&obfs-uri=/obfs&udp-relay=0&reuse=1&fast-open=yes&shadow-tls-version=2&shadow-tls-sni=sni.example.com&shadow-tls-password=shadow#Snell"
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
        path: "/obfs",
      },
      udp: false,
      reuse: true,
      tfo: true,
      "shadow-tls-version": 2,
      "shadow-tls-sni": "sni.example.com",
      "shadow-tls-password": "shadow",
    });
    expect(parseSnell("snell://snell-query.example.com:443?psk=query-secret")).toMatchObject({
      psk: "query-secret",
      server: "snell-query.example.com",
    });
    expect(() => parseSnell("http://bad")).toThrow("无效的 Snell 链接");
    expect(() => parseSnell("snell://@snell.example.com:443")).toThrow("Snell 配置缺少必要字段");
    expect(() => parseSnell("snell://psk@snell.example.com:70000")).toThrow("无效的端口号");
  });
});
