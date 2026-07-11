/**
 * Trojan 协议解析器
 * 
 * 格式: trojan://password@server:port?params#name
 */

import type { TrojanNode } from "@subboost/core/types/node";
import { buildMihomoEchOptsFromShareValue } from "@subboost/core/mihomo/ech";
import { splitWsPathEarlyData } from "../ws-early-data";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";

function parseBoolish(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function parseTrojan(uri: string): TrojanNode {
  if (!uri.startsWith("trojan://")) {
    throw new Error("无效的 Trojan 链接");
  }

  const url = parseUrlWithNeutralScheme(uri);
  
  // Trojan 的 password 在 URL 里属于 userinfo；未对冒号编码时会被拆分为 username/password。
  const password = (() => {
    const user = safeDecodeURIComponent(url.username);
    const pass = safeDecodeURIComponent(url.password);
    return pass ? `${user}:${pass}` : user;
  })();
  const server = url.hostname;
  const port = parseInt(url.port || "443", 10);
  const name = safeDecodeFormUrlEncoded(url.hash.slice(1)) || "Trojan 节点";

  if (!password || !server) {
    throw new Error("Trojan 配置缺少必要字段");
  }

  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  const params = url.searchParams;
  
  const typeRaw = params.get("type") || ((params.get("ws") === "1" || params.get("ws") === "true") ? "ws" : "tcp");
  const type = typeRaw.trim().toLowerCase();
  const sni = params.get("sni") || params.get("peer") || server;
  const alpn = params.get("alpn") || "";
  const fp =
    (params.get("fp") ||
      params.get("fingerprint") ||
      params.get("client-fingerprint") ||
      params.get("clientFingerprint") ||
      "").trim();
  const path = params.get("path") || params.get("wspath") || params.get("ws-path") || "/";
  const host = params.get("host") || params.get("obfsParam") || params.get("obfs-host") || "";
  const serviceName = params.get("serviceName") || params.get("service_name") || params.get("service-name") || "";
  const grpcMode = params.get("mode") || "";
  const grpcAuthority = params.get("authority") || "";
  const allowInsecure =
    parseBoolish(params.get("allowInsecure")) ||
    parseBoolish(params.get("allow_insecure")) ||
    parseBoolish(params.get("allow-insecure")) ||
    parseBoolish(params.get("insecure"));
  const isHttpUpgrade = type === "httpupgrade";
  const echRaw = params.get("ech");

  const node: TrojanNode = {
    name,
    type: "trojan",
    server,
    port,
    password,
    udp: true,
    sni,
  };

  if (echRaw !== null) {
    const echValue = echRaw.trim();
    (node as unknown as Record<string, unknown>)["ech-opts"] = buildMihomoEchOptsFromShareValue(echValue);
  }

  if (allowInsecure) {
    node["skip-cert-verify"] = true;
  }

  if (fp) {
    node["client-fingerprint"] = fp;
  }

  if (alpn) {
    const list = alpn.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) node.alpn = list;
  }

  // 处理不同的传输层
  switch (type) {
    case "ws":
    case "httpupgrade":
      node.network = "ws";
      const { path: wsPath, earlyData } = splitWsPathEarlyData(path);
      node["ws-opts"] = {
        path: wsPath,
        headers: host ? { Host: host } : undefined,
        ...(earlyData !== undefined
          ? {
              "early-data-header-name": "Sec-WebSocket-Protocol",
              "max-early-data": earlyData,
            }
          : {}),
        ...(isHttpUpgrade ? { "v2ray-http-upgrade": true, "v2ray-http-upgrade-fast-open": true } : {}),
      } as TrojanNode["ws-opts"] & Record<string, unknown>;
      break;

    case "grpc":
      node.network = "grpc";
      node["grpc-opts"] = {
        "grpc-service-name": serviceName || path.replace(/^\//, ""),
        ...(grpcMode ? { _grpcType: grpcMode } : {}),
        ...(grpcAuthority ? { _grpcAuthority: grpcAuthority } : {}),
      } as TrojanNode["grpc-opts"] & Record<string, unknown>;
      break;

    case "tcp":
    default:
      node.network = "tcp";
      break;
  }

  return node;
}
