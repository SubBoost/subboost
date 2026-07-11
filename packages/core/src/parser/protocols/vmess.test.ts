import { describe, expect, it } from "vitest";
import { parseVMess } from "./vmess";

function toVmessPayload(config: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(config)).toString("base64");
}

const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseVMess", () => {
  it("parses base64 JSON VMess links and lets the outer fragment override ps", () => {
    const node = parseVMess(
      `vmess://${toVmessPayload({
        v: "2",
        ps: "Inner",
        add: "vmess-json.example.com",
        port: "443",
        id: "11111111-1111-1111-1111-111111111111",
        aid: "0",
        scy: "auto",
        net: "ws",
        tls: "tls",
        path: "/graphql",
      })}#Outer%20VMess#Remark`
    );

    expect(node).toMatchObject({
      name: "Outer VMess#Remark",
      type: "vmess",
      server: "vmess-json.example.com",
      port: 443,
      uuid: "11111111-1111-1111-1111-111111111111",
      network: "ws",
      tls: true,
    });
    expect(node["ws-opts"]).toMatchObject({ path: "/graphql" });
  });

  it("keeps Quantumult VMess fallback when decoded payload is not JSON", () => {
    const quantumultPayload = Buffer.from(
      'QX-VMess = vmess, qx-vmess.example.com, 443, auto, "11111111-1111-1111-1111-111111111111", obfs=wss, obfs-host=qx.example.com, obfs-path="/qx", tls-verification=false'
    ).toString("base64");

    expect(parseVMess(`vmess://${quantumultPayload}`)).toMatchObject({
      name: "QX-VMess",
      type: "vmess",
      server: "qx-vmess.example.com",
      port: 443,
      network: "ws",
      tls: true,
      servername: "qx.example.com",
    });
  });

  it("throws the existing invalid JSON message for non-Quantumult payloads", () => {
    const payload = Buffer.from("not json").toString("base64");

    expect(() => parseVMess(`vmess://${payload}`)).toThrow("无效的 VMess JSON 格式");
  });

  it("parses URI-style gRPC links with TLS, ALPN, and packet flags", () => {
    const node = parseVMess(
      `vmess://${UUID}@uri.example.com:443?type=grpc&security=tls&serviceName=svc&sni=edge.example.com&fp=chrome&alpn=h2,http/1.1&allowInsecure=1&packet-encoding=xudp&authenticated-length=1&global-padding=0#URI`
    );

    expect(node).toMatchObject({
      name: "URI",
      type: "vmess",
      server: "uri.example.com",
      port: 443,
      uuid: UUID,
      tls: true,
      servername: "edge.example.com",
      "client-fingerprint": "chrome",
      "skip-cert-verify": true,
      "packet-encoding": "xudp",
      "authenticated-length": true,
      "global-padding": false,
      alpn: ["h2", "http/1.1"],
      network: "grpc",
      "grpc-opts": {
        "grpc-service-name": "svc",
      },
    });

    expect(
      parseVMess(`vmess://tcp.example.com:80?id=${UUID}&type=none&remark=TCP&allowInsecure=0`)
    ).toMatchObject({
      name: "TCP",
      type: "vmess",
      server: "tcp.example.com",
      port: 80,
      uuid: UUID,
      network: "tcp",
    });
  });

  it("parses standard and Kitsunebi VMess variants", () => {
    const standard = parseVMess(
      `vmess://ws+tls:${UUID}-0@standard.example.com:443/?host=cdn.example.com&path=%2Fws%3Fed%3D1024#Standard`
    );
    const kitsunebi = parseVMess(
      `vmess1://${UUID}@kitsunebi.example.com:443/app?network=ws&host=kit.example.com&tls=1&sni=edge.example.com#Kit`
    );

    expect(standard).toMatchObject({
      name: "Standard",
      network: "ws",
      tls: true,
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
        "early-data-header-name": "Sec-WebSocket-Protocol",
        "max-early-data": 1024,
      },
    });
    expect(kitsunebi).toMatchObject({
      name: "Kit",
      network: "ws",
      tls: true,
      servername: "edge.example.com",
      "ws-opts": {
        path: "/app",
        headers: { Host: "kit.example.com" },
      },
    });

    expect(
      parseVMess(
        `vmess://${UUID}@h2.example.com:443?type=h2&security=tls&host=h2-a.example.com,h2-b.example.com&path=/h2#H2`
      )
    ).toMatchObject({
      name: "H2",
      network: "h2",
      tls: true,
      "h2-opts": {
        host: ["h2-a.example.com", "h2-b.example.com"],
        path: "/h2",
      },
    });

    expect(parseVMess(`vmess://tcp:${UUID}-0@standard-default.example.com:80`)).toMatchObject({
      name: "standard-default.example.com:80",
      server: "standard-default.example.com",
      port: 80,
      tls: false,
      network: "tcp",
    });

    expect(
      parseVMess(
        `vmess://grpc+tls:${UUID}-0@standard-grpc.example.com:443/?serviceName=svc&mode=gun&authority=grpc.example.com#StdGrpc`
      )
    ).toMatchObject({
      name: "StdGrpc",
      network: "grpc",
      "grpc-opts": {
        "grpc-service-name": "svc",
        _grpcType: "gun",
        _grpcAuthority: "grpc.example.com",
      },
    });
  });

  it("parses Shadowrocket, httpupgrade, and HTTP-obfs VMess variants", () => {
    const shadowrocketBase = Buffer.from(`auto:${UUID}@shadowrocket.example.com:443`).toString("base64url");
    const shadowrocket = parseVMess(
      `vmess://${shadowrocketBase}?obfs=websocket&host=cdn.example.com&path=/sr%3Fed%3D256&sni=sni.example.com&allowInsecure=1#Shadowrocket`
    );
    const upgrade = parseVMess(
      `vmess://${UUID}@upgrade.example.com:443?type=httpupgrade&security=tls&path=/upgrade#Upgrade`
    );
    const httpObfs = parseVMess(
      `vmess://${toVmessPayload({
        ps: "HTTP",
        add: "http-obfs.example.com",
        port: 80,
        id: UUID,
        aid: 0,
        scy: "auto",
        net: "tcp",
        type: "http",
        host: "api.dingtalk.com",
        path: "/a,/b",
        method: "post",
        headers: {
          Connection: "keep-alive",
        },
      })}`
    );

    expect(shadowrocket).toMatchObject({
      name: "Shadowrocket",
      server: "shadowrocket.example.com",
      network: "ws",
      "skip-cert-verify": true,
      "ws-opts": {
        path: "/sr",
        headers: { Host: "cdn.example.com" },
        "max-early-data": 256,
      },
    });
    expect(upgrade).toMatchObject({
      name: "Upgrade",
      network: "ws",
      "ws-opts": {
        path: "/upgrade",
        "v2ray-http-upgrade": true,
        "v2ray-http-upgrade-fast-open": true,
      },
    });
    expect(httpObfs).toMatchObject({
      name: "HTTP",
      network: "http",
      "http-opts": {
        method: "POST",
        path: ["/a", "/b"],
        headers: {
          Host: ["api.dingtalk.com"],
          Connection: ["keep-alive"],
          "User-Agent": ["DingTalk/50636215 CFNetwork/3826.600.41 Darwin/24.6.0"],
        },
      },
    });

    expect(
      parseVMess(
        `vmess://${toVmessPayload({
          ps: "HTTP Edge",
          add: "edge-obfs.example.com",
          port: 80,
          id: UUID,
          aid: 0,
          net: "tcp",
          type: "http",
          host: "edge.example.com",
          edge: "edge-header",
          path: "/edge",
          method: "m-search",
          headers: {
            Host: ["custom.example.com"],
            "User-Agent": 1,
          },
        })}`
      )
    ).toMatchObject({
      name: "HTTP Edge",
      network: "http",
      "http-opts": {
        method: "M-SEARCH",
        path: ["/edge"],
        headers: {
          Host: ["custom.example.com"],
          Edge: ["edge-header"],
          "User-Agent": ["1"],
        },
      },
    });
  });

  it("parses alternate VMess field spellings and URI HTTP obfs", () => {
    const camel = parseVMess(
      `vmess://${toVmessPayload({
        ps: "Camel",
        add: "camel.example.com",
        port: 443,
        id: UUID,
        aid: 0,
        net: "websocket",
        path: "/",
        tls: "tls",
        ech: "",
        packetEncoding: "xudp",
        authenticatedLength: "false",
        globalPadding: "true",
      })}`
    );
    const uriHttp = parseVMess(
      `vmess://${UUID}@uri-http.example.com:80?headerType=http&host=front.example.com&path=/a,/b&method=put&remark=URI%20HTTP`
    );

    expect(camel).toMatchObject({
      name: "Camel",
      network: "ws",
      "packet-encoding": "xudp",
      "authenticated-length": false,
      "global-padding": true,
      "ech-opts": { enable: true },
    });
    expect(camel).not.toHaveProperty("ws-opts");
    expect(uriHttp).toMatchObject({
      name: "URI HTTP",
      network: "http",
      "http-opts": {
        method: "PUT",
        path: ["/a", "/b"],
        headers: {
          Host: ["front.example.com"],
        },
      },
    });
  });

  it("parses sparse URI, H2, HTTP, and Kitsunebi defaults", () => {
    expect(parseVMess(`vmess://uri-default.example.com?id=${UUID}&security=tls&ech=Y29uZmln&alpn=,,`))
      .toMatchObject({
        name: "VMess 节点",
        server: "uri-default.example.com",
        port: 443,
        uuid: UUID,
        tls: true,
        network: "tcp",
        "ech-opts": { enable: true, config: "Y29uZmln" },
      });
    expect(parseVMess(`vmess://${UUID}@h2-empty.example.com:443?type=h2&security=tls`)).toMatchObject({
      network: "h2",
      "h2-opts": {
        host: undefined,
        path: "/",
      },
    });
    expect(parseVMess(`vmess://${UUID}@http-empty.example.com:80?headerType=http`)).toMatchObject({
      network: "http",
      "http-opts": {
        method: "GET",
        path: ["/"],
      },
    });
    expect(parseVMess(`vmess1://${UUID}@kit-default.example.com:80?tls=0`)).toMatchObject({
      name: "kit-default.example.com:80",
      server: "kit-default.example.com",
      port: 80,
      tls: false,
      network: "tcp",
    });
  });

  it("parses Quantumult HTTP obfs and Shadowrocket query remarks", () => {
    const quantumultPayload = Buffer.from(
      "QX HTTP = vmess, qx-http.example.com, 80, auto, " +
        `"${UUID}", obfs=http, obfs-header=Host:front.example.com, obfs-path=/front, aid=2, allowInsecure=true`
    ).toString("base64");
    const shadowrocketBase = Buffer.from(`auto:${UUID}@shadow-remark.example.com:443`).toString("base64url");

    expect(parseVMess(`vmess://${quantumultPayload}`)).toMatchObject({
      name: "QX HTTP",
      server: "qx-http.example.com",
      alterId: 2,
      network: "http",
      "skip-cert-verify": true,
      "http-opts": {
        path: ["/front"],
        headers: {
          Host: ["front.example.com"],
        },
      },
    });
    expect(parseVMess(`vmess://${shadowrocketBase}?obfs=wss&remarks=Query%20Name&allow_insecure=0`)).toMatchObject({
      name: "Query Name",
      server: "shadow-remark.example.com",
      network: "tcp",
      tls: true,
    });
  });

  it("parses remaining real-world VMess link variants without changing unsupported transport behavior", () => {
    const quantumultPayload = Buffer.from(
      `QX TLS Verify = vmess, qx-verify.example.com, 443, auto, "${UUID}", obfs=wss, tls-verification=true`
    ).toString("base64");
    const dingtalkWs = parseVMess(
      `vmess://${toVmessPayload({
        ps: "DingTalk WS",
        add: "dingtalk-ws.example.com",
        port: 443,
        id: UUID,
        aid: 0,
        scy: "auto",
        net: "ws",
        tls: "tls",
        host: "api.dingtalk.com",
        path: "/",
      })}`
    );

    expect(parseVMess(`vmess://${quantumultPayload}`)).toMatchObject({
      name: "QX TLS Verify",
      server: "qx-verify.example.com",
      network: "ws",
      tls: true,
    });
    expect(parseVMess(`vmess1://${UUID}@kit-ech.example.com:443?network=ws&tls=1&ech=#KitECH`)).toMatchObject({
      name: "KitECH",
      tls: true,
      network: "ws",
      "ech-opts": { enable: true },
    });
    expect(dingtalkWs).toMatchObject({
      name: "DingTalk WS",
      network: "ws",
      "ws-opts": {
        path: "/",
        headers: {
          Host: "api.dingtalk.com",
          "User-Agent": "DingTalk/50636215 CFNetwork/3826.600.41 Darwin/24.6.0",
        },
      },
    });
    expect(dingtalkWs).not.toHaveProperty("skip-cert-verify");
    expect(() => parseVMess(`vmess://quic:${UUID}-0@quic-no-type.example.com:443/?security=aes-128-gcm#Quic`))
      .toThrow("不支持的 VMess 传输层");
  });

  it("covers malformed VMess style probes without accepting invalid authorities", () => {
    const badShadowrocketNoQuery = Buffer.from(`auto:${UUID}@shadow-no-query.example.com:443`).toString("base64url");
    const badShadowrocketBase = Buffer.from(`auto:${UUID}@shadow-bad.example.com:not-a-port`).toString("base64url");

    expect(() => parseVMess(`vmess://${badShadowrocketNoQuery}`)).toThrow("无效的 VMess JSON 格式");
    expect(() => parseVMess(`vmess://${badShadowrocketBase}?obfs=websocket`)).toThrow("VMess 配置缺少必要字段");
  });

  it("keeps sparse VMess defaults explicit across URI, JSON, and Shadowrocket forms", () => {
    const shadowrocketBase = Buffer.from(`auto:${UUID}@shadow-default.example.com:443`).toString("base64url");
    expect(parseVMess(`vmess://${shadowrocketBase}?network=grpc&tls=1&ech=&remarks=`)).toMatchObject({
      name: "VMess shadow-default.example.com:443",
      server: "shadow-default.example.com",
      tls: true,
      network: "grpc",
      "grpc-opts": {
        "grpc-service-name": "",
      },
    });

    expect(
      parseVMess(
        `vmess://${UUID}@uri-grpc-path.example.com:443?type=grpc&security=tls&path=%2Ffrom-path&ech=#UriGrpcPath`
      )
    ).toMatchObject({
      name: "UriGrpcPath",
      network: "grpc",
      "grpc-opts": {
        "grpc-service-name": "from-path",
      },
      "ech-opts": { enable: true },
    });

    expect(
      parseVMess(
        `vmess://${toVmessPayload({
          ps: "",
          add: "json-none.example.com",
          port: 80,
          id: UUID,
          aid: "",
          net: "none",
          scy: "",
        })}`
      )
    ).toMatchObject({
      name: "VMess 节点",
      server: "json-none.example.com",
      alterId: 0,
      cipher: "auto",
      network: "tcp",
    });

    expect(
      parseVMess(
        `vmess://${toVmessPayload({
          ps: "Edge WS",
          add: "edge-ws.example.com",
          port: 443,
          id: UUID,
          aid: 0,
          net: "ws",
          tls: "tls",
          edge: "edge-header",
          path: "/",
        })}`
      )
    ).toMatchObject({
      name: "Edge WS",
      network: "ws",
      "ws-opts": {
        path: "/",
        headers: { Edge: "edge-header" },
      },
    });
  });

  it("rejects unsupported transports and ECH without TLS", () => {
    const badShadowrocket = Buffer.from("bad").toString("base64url");

    expect(() => parseVMess("http://bad")).toThrow("无效的 VMess 链接");
    expect(() => parseVMess(`vmess://${badShadowrocket}?obfs=websocket`)).toThrow("VMess 配置缺少必要字段");
    expect(() => parseVMess("vmess://not-base64!")).toThrow("无效的 VMess JSON 格式");
    expect(() => parseVMess(`vmess://${Buffer.from("Bad = vmess, only").toString("base64")}`)).toThrow(
      "无效的 Quantumult VMess 配置"
    );
    expect(() => parseVMess(`vmess://${toVmessPayload({ ps: "Missing", port: 443, id: UUID })}`)).toThrow(
      "VMess 配置缺少必要字段"
    );
    expect(() => parseVMess(`vmess://${toVmessPayload({ ps: "BadPort", add: "bad.example.com", port: 70000, id: UUID })}`)).toThrow(
      "无效的端口号"
    );
    expect(() => parseVMess(`vmess://${UUID}@bad.example.com:443?type=kcp#Bad`)).toThrow("不支持的 VMess 传输层");
    expect(() => parseVMess(`vmess://${UUID}@bad.example.com:80?ech=config#Bad`)).toThrow("VMess 启用 ECH 需要 TLS");
    expect(() => parseVMess("vmess1://broken")).toThrow("无效的 Kitsunebi VMess 链接");
    expect(() => parseVMess(`vmess://quic:${UUID}-0@quic.example.com:443/?security=aes-128-gcm&type=video#Quic`)).toThrow(
      "不支持的 VMess 传输层"
    );
  });
});
