/**
 * VLESS 协议解析器
 *
 * 支持格式:
 * - vless://uuid@server:port?params#name
 * - vless://BASE64(userinfo@server:port)?params#name (Shadowrocket 风格)
 */

import { decodeBase64 } from "../base64";
import type { VLESSNode, XHttpDownloadSettings, XHttpOpts, XHttpReuseSettings } from "@subboost/core/types/node";
import { buildMihomoEchOptsFromShareValue } from "@subboost/core/mihomo/ech";
import { normalizeRealityShortId } from "@subboost/core/mihomo/reality";
import { splitWsPathEarlyData } from "../ws-early-data";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";
import { parseJsonObject, parseJsonStringMap } from "../json-utils";

function parseBoolish(value: string | null | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function splitList(value: string): string[] | undefined {
  const v = (value ?? "").trim();
  if (!v) return undefined;
  const list = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function pickQueryValue(params: URLSearchParams, keys: string[]): string {
  for (const key of keys) {
    const value = params.get(key);
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function parseHeaderMap(raw: string): Record<string, string> | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  const jsonHeaders = parseJsonStringMap(value);
  if (jsonHeaders) return jsonHeaders;
  if (parseJsonObject(value)) return undefined;

  const out: Record<string, string> = {};
  for (const part of value.split("|")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const item = part.slice(idx + 1).trim();
    if (!key || !item) continue;
    out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildXhttpOptsFromQuery(params: URLSearchParams, fallbackPath: string, fallbackHost: string): XHttpOpts {
  const path = pickQueryValue(params, ["xhttp-path", "xhttp_path", "xhttpPath", "path"]) || fallbackPath || "/";
  const host = pickQueryValue(params, ["xhttp-host", "xhttp_host", "xhttpHost", "host"]) || fallbackHost;
  const mode = pickQueryValue(params, ["xhttp-mode", "xhttp_mode", "xhttpMode", "mode"]);
  const headers = parseHeaderMap(
    pickQueryValue(params, ["xhttp-headers", "xhttp_headers", "xhttpHeaders", "headers"])
  );
  const noGrpcHeader = parseBoolish(
    pickQueryValue(params, ["no-grpc-header", "no_grpc_header", "noGrpcHeader"])
  );
  const xPaddingBytes = pickQueryValue(params, ["x-padding-bytes", "x_padding_bytes", "xPaddingBytes"]);
  const scMaxEachPostBytesRaw = pickQueryValue(
    params,
    ["sc-max-each-post-bytes", "sc_max_each_post_bytes", "scMaxEachPostBytes"]
  );
  const scMaxEachPostBytes = scMaxEachPostBytesRaw ? Number.parseInt(scMaxEachPostBytesRaw, 10) : undefined;

  const reuseSettings: XHttpReuseSettings = {};
  const reuseSettingKeys: Array<[keyof XHttpReuseSettings, string[]]> = [
    ["max-concurrency", ["max-concurrency", "max_concurrency", "maxConcurrency"]],
    ["max-connections", ["max-connections", "max_connections", "maxConnections"]],
    ["c-max-reuse-times", ["c-max-reuse-times", "c_max_reuse_times", "cMaxReuseTimes"]],
    ["h-max-request-times", ["h-max-request-times", "h_max_request_times", "hMaxRequestTimes"]],
    ["h-max-reusable-secs", ["h-max-reusable-secs", "h_max_reusable_secs", "hMaxReusableSecs"]],
  ];
  for (const [key, aliases] of reuseSettingKeys) {
    const value = pickQueryValue(params, aliases);
    if (value) reuseSettings[key] = value;
  }

  const downloadSettings: XHttpDownloadSettings = {};
  const downloadPath = pickQueryValue(params, ["download-path", "download_path", "downloadPath"]);
  if (downloadPath) downloadSettings.path = downloadPath;
  const downloadHost = pickQueryValue(params, ["download-host", "download_host", "downloadHost"]);
  if (downloadHost) downloadSettings.host = downloadHost;
  const downloadHeaders = parseHeaderMap(
    pickQueryValue(params, ["download-headers", "download_headers", "downloadHeaders"])
  );
  if (downloadHeaders) downloadSettings.headers = downloadHeaders;

  return {
    path,
    ...(host ? { host } : {}),
    ...(mode ? { mode } : {}),
    ...(headers ? { headers } : {}),
    ...(noGrpcHeader !== undefined ? { "no-grpc-header": noGrpcHeader } : {}),
    ...(xPaddingBytes ? { "x-padding-bytes": xPaddingBytes } : {}),
    ...(Number.isFinite(scMaxEachPostBytes) ? { "sc-max-each-post-bytes": scMaxEachPostBytes } : {}),
    ...(Object.keys(reuseSettings).length > 0 ? { "reuse-settings": reuseSettings } : {}),
    ...(Object.keys(downloadSettings).length > 0 ? { "download-settings": downloadSettings } : {}),
  };
}

function isDigitString(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    if (char < "0" || char > "9") return false;
  }
  return true;
}

function splitAtFirstQuery(raw: string): { token: string; suffix: string } | null {
  const queryIndex = raw.indexOf("?");
  if (queryIndex === -1) return null;
  return { token: raw.slice(0, queryIndex), suffix: raw.slice(queryIndex) };
}

function hasStandardVlessAuthority(raw: string): boolean {
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  let authority = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  if (authority.endsWith("/")) authority = authority.slice(0, -1);

  const atIndex = authority.lastIndexOf("@");
  if (atIndex <= 0) return false;
  const hostPort = authority.slice(atIndex + 1);
  if (!hostPort) return false;

  if (hostPort.startsWith("[")) {
    const bracketEnd = hostPort.indexOf("]");
    if (bracketEnd === -1) return false;
    const afterBracket = hostPort.slice(bracketEnd + 1);
    return afterBracket.startsWith(":") && isDigitString(afterBracket.slice(1));
  }

  const colonIndex = hostPort.lastIndexOf(":");
  return colonIndex > 0 && isDigitString(hostPort.slice(colonIndex + 1));
}

function stripThroughLastColon(value: string): string {
  const colonIndex = value.lastIndexOf(":");
  return colonIndex === -1 ? value : value.slice(colonIndex + 1);
}

function normalizeShadowrocketUri(uri: string): { uri: string; isShadowrocket: boolean } {
  const raw = uri.slice("vless://".length).trim();
  if (hasStandardVlessAuthority(raw)) {
    return { uri, isShadowrocket: false };
  }

  const parts = splitAtFirstQuery(raw);
  if (!parts) {
    return { uri, isShadowrocket: false };
  }

  const decoded = decodeBase64(parts.token.trim());
  return { uri: `vless://${decoded}${parts.suffix}`, isShadowrocket: true };
}

function parseShadowrocketHeaderValue(raw: string): Record<string, string> | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const jsonHeaders = parseJsonStringMap(value);
  if (jsonHeaders) return jsonHeaders;
  if (parseJsonObject(value)) return undefined;
  return { Host: value };
}

export function parseVLESS(uri: string): VLESSNode {
  if (!uri.startsWith("vless://")) {
    throw new Error("无效的 VLESS 链接");
  }

  const normalized = normalizeShadowrocketUri(uri);
  const url = parseUrlWithNeutralScheme(normalized.uri);
  const params = url.searchParams;

  const uuidRaw = (() => {
    const user = safeDecodeURIComponent(url.username);
    const pass = safeDecodeURIComponent(url.password);
    if (normalized.isShadowrocket) {
      return pass ? `${user}:${pass}` : user;
    }
    return user;
  })();
  const uuid = normalized.isShadowrocket ? stripThroughLastColon(uuidRaw) : uuidRaw;
  const server = url.hostname;
  const port = parseInt(url.port || "443", 10);
  const name =
    safeDecodeFormUrlEncoded(url.hash.slice(1)) ||
    safeDecodeFormUrlEncoded(params.get("remarks") || params.get("remark") || "") ||
    "VLESS 节点";

  if (!uuid || !server) {
    throw new Error("VLESS 配置缺少必要字段");
  }
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  const headerType = (params.get("headerType") || params.get("header_type") || params.get("header-type") || "").trim().toLowerCase();
  const shadowrocketObfs = normalized.isShadowrocket ? (params.get("obfs") || "").trim().toLowerCase() : "";
  const typeInput =
    (params.get("type") || (parseBoolish(params.get("h2")) ? "h2" : "") || shadowrocketObfs || "tcp").trim();
  const typeNormalized = (() => {
    const raw = typeInput.toLowerCase();
    if (raw === "none") return "tcp";
    if (raw === "websocket") return "ws";
    if (raw === "httpupgrade") return "ws";
    if (raw === "tcp" && headerType === "http") return "http";
    return raw;
  })();
  const security = (params.get("security") || (normalized.isShadowrocket && parseBoolish(params.get("tls")) ? "reality" : "none")).trim().toLowerCase();
  const flow = (() => {
    const direct = params.get("flow") || "";
    if (direct.trim()) return direct.trim();
    if (normalized.isShadowrocket) {
      const xtls = params.get("xtls") || "";
      if (xtls === "1") return "xtls-rprx-direct";
      if (xtls === "2") return "xtls-rprx-vision";
    }
    return undefined;
  })();
  const sni = params.get("sni") || params.get("peer") || "";
  const alpn = params.get("alpn") || "";
  const clientFingerprint = pickQueryValue(params, ["fp", "fingerprint", "client-fingerprint", "clientFingerprint"]);
  const encryption = (params.get("encryption") || params.get("flow-encryption") || "").trim();
  const packetEncoding =
    (params.get("packet-encoding") || params.get("packet_encoding") || params.get("packetEncoding") || "").trim();
  const pbk = pickQueryValue(params, ["pbk", "public-key", "public_key", "publicKey"]);
  const sid = pickQueryValue(params, ["sid", "short-id", "short_id", "shortId"]);
  const spiderX = params.get("spx") || "";
  const echRaw = params.get("ech");
  const path = params.get("path") || "/";
  const host = params.get("host") || params.get("obfsParam") || params.get("obfs-host") || "";
  const serviceName = params.get("serviceName") || params.get("service_name") || params.get("service-name") || "";
  const grpcMode = params.get("mode") || "";
  const grpcAuthority = params.get("authority") || "";
  const httpMethod = (params.get("method") || "GET").trim() || "GET";
  const tlsVerification = parseBoolish(params.get("tls-verification"));
  const allowInsecure =
    parseBoolish(params.get("allowInsecure")) === true ||
    parseBoolish(params.get("allow_insecure")) === true ||
    parseBoolish(params.get("allow-insecure")) === true ||
    parseBoolish(params.get("insecure")) === true ||
    tlsVerification === false;
  const isHttpUpgrade = (params.get("type") || "").trim().toLowerCase() === "httpupgrade";

  const supportedTransports = new Set(["tcp", "ws", "grpc", "h2", "http", "xhttp"]);
  if (!supportedTransports.has(typeNormalized)) {
    throw new Error(`不支持的 VLESS 传输层: type=${typeInput || "(empty)"}（仅支持 tcp/ws/http/h2/grpc/xhttp）`);
  }

  const node: VLESSNode = {
    name,
    type: "vless",
    server,
    port,
    uuid,
    udp: true,
    tls: security === "tls" || security === "reality",
  };

  if (echRaw !== null) {
    if (security !== "tls") {
      throw new Error("VLESS 启用 ECH 需要 security=tls（不支持 Reality）");
    }
    const echValue = echRaw.trim();
    (node as unknown as Record<string, unknown>)["ech-opts"] = buildMihomoEchOptsFromShareValue(echValue);
  }

  if (allowInsecure) node["skip-cert-verify"] = true;
  if (sni) node.servername = sni;
  if (flow) node.flow = flow;
  if (encryption) node.encryption = encryption;
  if (packetEncoding) node["packet-encoding"] = packetEncoding;
  if (alpn) {
    const list = splitList(alpn);
    if (list && list.length > 0) node.alpn = list;
  }
  if (clientFingerprint) node["client-fingerprint"] = clientFingerprint;

  if (params.get("pcs")) {
    (node as unknown as Record<string, unknown>).pcs = params.get("pcs");
  }
  if (params.get("pqv")) {
    (node as unknown as Record<string, unknown>).pqv = params.get("pqv");
  }

  if (security === "reality") {
    const normalizedShortId = normalizeRealityShortId(sid);
    const realityOpts: Record<string, unknown> = {
      ...(pbk ? { "public-key": pbk } : {}),
      ...(normalizedShortId ? { "short-id": normalizedShortId } : {}),
      ...(spiderX ? { "_spider-x": spiderX } : {}),
    };
    if (Object.keys(realityOpts).length > 0) {
      node["reality-opts"] = realityOpts;
    }
    node["client-fingerprint"] = clientFingerprint || "chrome";
  }

  const isDomainFronting = Boolean(node.tls && sni && sni !== server);

  switch (typeNormalized) {
    case "ws": {
      node.network = "ws";
      const { path: wsPath, earlyData } = splitWsPathEarlyData(path || "/");
      const directHost = splitList(host)?.[0];
      const srHeaders = normalized.isShadowrocket && params.get("obfsParam") ? parseShadowrocketHeaderValue(params.get("obfsParam") || "") : undefined;
      const wsHeaders = srHeaders || (directHost ? { Host: directHost } : undefined);
      node["ws-opts"] = {
        path: wsPath || "/",
        headers: wsHeaders,
        ...(earlyData !== undefined
          ? {
              "early-data-header-name": "Sec-WebSocket-Protocol",
              "max-early-data": earlyData,
            }
          : {}),
        ...(isHttpUpgrade ? { "v2ray-http-upgrade": true, "v2ray-http-upgrade-fast-open": true } : {}),
      } as VLESSNode["ws-opts"] & Record<string, unknown>;
      break;
    }
    case "grpc":
      node.network = "grpc";
      node["grpc-opts"] = {
        "grpc-service-name": serviceName || path.replace(/^\//, ""),
        ...(grpcMode ? { _grpcType: grpcMode } : {}),
        ...(grpcAuthority ? { _grpcAuthority: grpcAuthority } : {}),
      } as VLESSNode["grpc-opts"] & Record<string, unknown>;
      break;
    case "http": {
      node.network = "http";
      const httpHosts = splitList(host) ?? (isDomainFronting ? [sni] : undefined);
      const httpPaths = splitList(path) ?? ["/"];
      node["http-opts"] = {
        method: httpMethod.toUpperCase(),
        path: httpPaths,
        headers: httpHosts ? { Host: httpHosts } : undefined,
      };
      break;
    }
    case "h2":
      node.network = "h2";
      node["h2-opts"] = {
        host: splitList(host) ?? (isDomainFronting ? [sni] : undefined),
        path: path || "/",
      };
      break;
    case "xhttp":
      node.network = "xhttp";
      node["xhttp-opts"] = buildXhttpOptsFromQuery(params, path || "/", host);
      break;
    case "tcp":
    default:
      node.network = "tcp";
      break;
  }

  return node;
}


