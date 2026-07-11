/**
 * VMess 协议解析器
 *
 * 支持格式:
 * - vmess://base64(json)
 * - vmess://uuid@server:port?params#name
 * - vmess://base64(Quantumult vmess config)
 * - vmess://base64(cipher:uuid@server:port)?remarks=... (Shadowrocket)
 * - vmess://net(+tls)?:uuid-aid@server:port/?... (std vmess)
 * - vmess1://uuid@server:port/path?network=... (Kitsunebi)
 */

import { decodeBase64 } from "../base64";
import { tryParseJson } from "../../json";
import type { VMessNode } from "@subboost/core/types/node";
import { buildMihomoEchOptsFromShareValue } from "@subboost/core/mihomo/ech";
import { splitWsPathEarlyData } from "../ws-early-data";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";

interface VMessConfig {
  v?: string;
  ps?: string;
  add: string;
  port: string | number;
  id: string;
  aid?: string | number;
  scy?: string;
  encryption?: string;
  net?: string;
  type?: string;
  host?: string;
  edge?: string;
  path?: string;
  method?: string;
  headers?: unknown;
  tls?: string;
  sni?: string;
  alpn?: string;
  fp?: string;
  allowInsecure?: string | number | boolean;
  serviceName?: string;
  packetEncoding?: string;
  authenticatedLength?: string | number | boolean;
  globalPadding?: string | number | boolean;
  "packet-encoding"?: string;
  "authenticated-length"?: string | number | boolean;
  "global-padding"?: string | number | boolean;
  mode?: string;
  authority?: string;
  ech?: string;
}

import {
  DINGTALK_USER_AGENT,
  hasDingTalkHost,
  looksLikeShadowrocketStyleVmess,
  looksLikeStandardVmessStyle,
  looksLikeUriStyleVmess,
  normalizeHttpMethod,
  parseBooleanish,
  parseHeaderRecord,
  parseObfsHeaderHost,
  pickQueryParam,
  pickString,
  splitList,
  stripOuterQuotes,
} from "./vmess-utils";

function isAlphaString(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    const lower = char.toLowerCase();
    if (lower < "a" || lower > "z") return false;
  }
  return true;
}

function isDigitString(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    if (char < "0" || char > "9") return false;
  }
  return true;
}

function containsWhitespace(value: string): boolean {
  for (const char of value) {
    if (char.trim() === "") return true;
  }
  return false;
}

function parseStandardVmessParts(value: string): {
  networkRaw: string;
  tlsTag: string;
  uuid: string;
  aid: string;
  server: string;
  port: string;
  query: string;
} | null {
  const queryIndex = value.indexOf("?");
  const query = queryIndex === -1 ? "" : value.slice(queryIndex + 1);
  let base = queryIndex === -1 ? value : value.slice(0, queryIndex);
  if (base.endsWith("/")) base = base.slice(0, -1);

  const schemeIndex = base.indexOf(":");
  if (schemeIndex <= 0) return null;
  const networkTag = base.slice(0, schemeIndex);
  const rest = base.slice(schemeIndex + 1);

  const plusIndex = networkTag.indexOf("+");
  const networkRaw = plusIndex === -1 ? networkTag : networkTag.slice(0, plusIndex);
  const tlsTag = plusIndex === -1 ? "" : networkTag.slice(plusIndex + 1);
  if (!isAlphaString(networkRaw) || (tlsTag && !isAlphaString(tlsTag))) return null;

  const atIndex = rest.indexOf("@");
  if (atIndex <= 0) return null;
  const identity = rest.slice(0, atIndex);
  const hostPort = rest.slice(atIndex + 1);

  const dashIndex = identity.lastIndexOf("-");
  if (dashIndex <= 0) return null;
  const uuid = identity.slice(0, dashIndex);
  const aid = identity.slice(dashIndex + 1);
  if (!uuid || uuid.includes("@") || containsWhitespace(uuid) || !isDigitString(aid)) return null;

  const colonIndex = hostPort.lastIndexOf(":");
  if (colonIndex <= 0) return null;
  const server = hostPort.slice(0, colonIndex);
  const port = hostPort.slice(colonIndex + 1);
  if (!server || !isDigitString(port)) return null;

  return { networkRaw, tlsTag, uuid, aid, server, port, query };
}

function parseKitsunebiBase(value: string): { uuid: string; server: string; portWithMaybePath: string } | null {
  const atIndex = value.indexOf("@");
  if (atIndex <= 0) return null;
  const uuid = value.slice(0, atIndex);
  const hostPort = value.slice(atIndex + 1);
  const colonIndex = hostPort.indexOf(":");
  if (colonIndex <= 0) return null;
  return {
    uuid,
    server: hostPort.slice(0, colonIndex),
    portWithMaybePath: hostPort.slice(colonIndex + 1),
  };
}

function parseShadowrocketStyleConfig(uri: string): VMessConfig {
  const raw = uri.slice(8).trim();
  const hashIndex = raw.indexOf("#");
  const remarksFromHash = hashIndex === -1 ? "" : safeDecodeFormUrlEncoded(raw.slice(hashIndex + 1));
  const withoutHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex === -1) {
    throw new Error("无效的 Shadowrocket VMess 链接");
  }

  const base64Line = withoutHash.slice(0, queryIndex).replace(/\/$/, "");
  const qs = withoutHash.slice(queryIndex + 1);
  const decoded = decodeBase64(base64Line);
  const match = decoded.match(/(^[^:]+?):([^:]+?)@(.+):(\d+)$/);
  if (!match) {
    throw new Error("无效的 Shadowrocket VMess 基础信息");
  }

  const [, cipher, uuid, server, port] = match;
  const params = new URLSearchParams(qs);
  const ech = params.has("ech") ? params.get("ech") || "" : undefined;
  const obfs = pickQueryParam(params, "obfs")?.toLowerCase();
  const network = obfs === "websocket" ? "ws" : pickQueryParam(params, "network", "type", "net") || "tcp";
  const tls =
    obfs === "wss" ||
    parseBooleanish(pickQueryParam(params, "tls")) === true ||
    pickQueryParam(params, "security") === "tls";

  return {
    ps:
      remarksFromHash ||
      safeDecodeFormUrlEncoded(pickQueryParam(params, "remarks", "remark") || "") ||
      `VMess ${server}:${port}`,
    add: server,
    port,
    id: uuid,
    aid: pickQueryParam(params, "aid", "alterId", "alter_id") || "0",
    scy: cipher,
    net: network,
    host: pickQueryParam(params, "host") || pickQueryParam(params, "obfsParam") || undefined,
    path: pickQueryParam(params, "path", "wspath") || (network === "ws" ? "/" : undefined),
    tls: tls ? "tls" : undefined,
    sni: pickQueryParam(params, "sni", "peer") || undefined,
    alpn: pickQueryParam(params, "alpn") || undefined,
    fp: pickQueryParam(params, "fp", "fingerprint", "client-fingerprint", "clientFingerprint") || undefined,
    allowInsecure: pickQueryParam(params, "allowInsecure", "allow_insecure", "allow-insecure", "insecure"),
    ...(ech !== undefined ? { ech } : {}),
  };
}

function parseStandardVmessStyleConfig(uri: string): VMessConfig {
  const raw = uri.slice(8).trim();
  const hashIndex = raw.indexOf("#");
  const remarks = hashIndex === -1 ? "" : safeDecodeFormUrlEncoded(raw.slice(hashIndex + 1));
  const withoutHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const parsed = parseStandardVmessParts(withoutHash);
  if (!parsed) {
    throw new Error("无效的标准 VMess 链接");
  }

  const { networkRaw, tlsTag, uuid, aid, server, port, query } = parsed;
  const params = new URLSearchParams(query);
  const ech = params.has("ech") ? params.get("ech") || "" : undefined;
  const network = networkRaw.toLowerCase();
  const tls = Boolean((tlsTag || "").trim()) || parseBooleanish(pickQueryParam(params, "tls")) === true;
  const queryHost =
    pickQueryParam(params, "host", "wsHost", "ws.host") || parseObfsHeaderHost(pickQueryParam(params, "obfsParam"));
  const queryPath = pickQueryParam(params, "path", "wspath", "ws-path", "serviceName", "service_name");

  return {
    ps: remarks || `${server}:${port}`,
    add: server,
    port,
    id: uuid,
    aid,
    scy: pickQueryParam(params, "scy", "cipher", "encryption") || "auto",
    net: network,
    type:
      network === "tcp" || network === "kcp"
        ? pickQueryParam(params, "type")
        : network === "quic"
          ? pickQueryParam(params, "security")
          : undefined,
    host: network === "quic" ? pickQueryParam(params, "type") || undefined : queryHost || undefined,
    path: network === "quic" ? pickQueryParam(params, "key") || undefined : queryPath || undefined,
    tls: tls ? "tls" : undefined,
    sni: pickQueryParam(params, "sni", "peer") || undefined,
    alpn: pickQueryParam(params, "alpn") || undefined,
    fp: pickQueryParam(params, "fp", "fingerprint", "client-fingerprint", "clientFingerprint") || undefined,
    allowInsecure: pickQueryParam(params, "allowInsecure", "allow_insecure", "allow-insecure", "insecure"),
    mode: pickQueryParam(params, "mode") || undefined,
    authority: pickQueryParam(params, "authority") || undefined,
    ...(ech !== undefined ? { ech } : {}),
  };
}

function parseKitsunebiStyleConfig(uri: string): VMessConfig {
  const raw = uri.slice(9).trim();
  const hashIndex = raw.indexOf("#");
  const remarks = hashIndex === -1 ? "" : safeDecodeFormUrlEncoded(raw.slice(hashIndex + 1));
  const withoutHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const addition = queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1);
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const parsed = parseKitsunebiBase(base);
  if (!parsed) {
    throw new Error("无效的 Kitsunebi VMess 链接");
  }

  const { uuid, server, portWithMaybePath } = parsed;
  let port = portWithMaybePath;
  let path = "";
  const slashIndex = portWithMaybePath.indexOf("/");
  if (slashIndex !== -1) {
    port = portWithMaybePath.slice(0, slashIndex);
    path = portWithMaybePath.slice(slashIndex);
  }

  const params = new URLSearchParams(addition);
  const ech = params.has("ech") ? params.get("ech") || "" : undefined;
  const network = pickQueryParam(params, "network", "type", "net") || "tcp";

  return {
    ps: remarks || `${server}:${port}`,
    add: server,
    port,
    id: uuid,
    aid: "0",
    scy: "auto",
    net: network,
    host: pickQueryParam(params, "ws.host", "host") || undefined,
    path: path || pickQueryParam(params, "path", "wspath") || undefined,
    tls: parseBooleanish(pickQueryParam(params, "tls")) === true ? "tls" : undefined,
    sni: pickQueryParam(params, "sni", "peer") || undefined,
    ...(ech !== undefined ? { ech } : {}),
  };
}

function parseQuantumultVmessConfig(decoded: string): VMessConfig {
  const partitions = decoded.split(",").map((part) => part.trim()).filter(Boolean);
  if (partitions.length < 5) {
    throw new Error("无效的 Quantumult VMess 配置");
  }

  const params = new Map<string, string>();
  for (const part of partitions) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    params.set(key, value);
  }

  const name = partitions[0].split("=")[0]?.trim() || "VMess 节点";
  const obfs = (params.get("obfs") || "").toLowerCase();
  const obfsHeader = params.get("obfs-header") || params.get("obfs_header") || "";
  const obfsHost = parseObfsHeaderHost(obfsHeader) || params.get("obfs-host") || params.get("obfs_host") || undefined;
  const obfsPath = params.get("obfs-path") || params.get("obfs_path") || undefined;

  return {
    ps: name,
    add: partitions[1],
    port: partitions[2],
    scy: partitions[3] || "auto",
    id: stripOuterQuotes(partitions[4]),
    aid: params.get("aid") || params.get("alterId") || params.get("alter_id") || "0",
    net: obfs === "ws" || obfs === "wss" ? "ws" : obfs === "http" ? "http" : "tcp",
    host: obfsHost,
    path: obfsPath ? safeDecodeFormUrlEncoded(stripOuterQuotes(obfsPath)) : undefined,
    tls: obfs === "wss" ? "tls" : undefined,
    allowInsecure:
      params.get("allowInsecure") ||
      params.get("allow_insecure") ||
      (params.get("tls-verification") === "false" ? "true" : undefined),
  };
}

function parseUriStyleConfig(uri: string): VMessConfig {
  const url = parseUrlWithNeutralScheme(uri);
  const params = url.searchParams;
  const ech = params.has("ech") ? params.get("ech") || "" : undefined;

  const networkRaw = pickString(params.get("type") || params.get("net")).toLowerCase() || "tcp";
  const network = networkRaw === "none" ? "tcp" : networkRaw;
  const headerType = pickString(
    params.get("headerType") || params.get("header_type") || params.get("header-type")
  ).toLowerCase();
  const security = pickString(params.get("security")).toLowerCase();
  const tls =
    security === "tls" ||
    security === "reality" ||
    parseBooleanish(params.get("tls")) === true;
  const allowInsecureRaw =
    params.get("allowInsecure") ||
    params.get("allow_insecure") ||
    params.get("allow-insecure") ||
    params.get("insecure");
  const serviceName =
    params.get("serviceName") ||
    params.get("service_name") ||
    params.get("service-name") ||
    "";
  const path = params.get("path") || "/";
  const remark = params.get("remark") || params.get("remarks") || "";

  return {
    ps: safeDecodeFormUrlEncoded(url.hash.slice(1)) || safeDecodeFormUrlEncoded(remark) || "VMess 节点",
    add: url.hostname,
    port: url.port || (tls ? "443" : "80"),
    id: safeDecodeURIComponent(url.username) || pickString(params.get("id")),
    aid: params.get("aid") || params.get("alterId") || params.get("alter_id") || "0",
    scy: params.get("encryption") || params.get("scy") || params.get("cipher") || "auto",
    net: headerType === "http" ? "tcp" : network,
    type: headerType === "http" ? "http" : undefined,
    host: params.get("host") || undefined,
    edge: params.get("edge") || undefined,
    path: network === "grpc" ? serviceName || path.replace(/^\//, "") : path,
    method: params.get("method") || undefined,
    tls: tls ? "tls" : undefined,
    sni: params.get("sni") || params.get("peer") || undefined,
    alpn: params.get("alpn") || undefined,
    fp:
      params.get("fp") ||
      params.get("fingerprint") ||
      params.get("client-fingerprint") ||
      params.get("clientFingerprint") ||
      undefined,
    allowInsecure: allowInsecureRaw || undefined,
    serviceName: serviceName || undefined,
    packetEncoding:
      params.get("packet-encoding") ||
      params.get("packet_encoding") ||
      params.get("packetEncoding") ||
      undefined,
    authenticatedLength:
      params.get("authenticated-length") ||
      params.get("authenticated_length") ||
      params.get("authenticatedLength") ||
      undefined,
    globalPadding:
      params.get("global-padding") ||
      params.get("global_padding") ||
      params.get("globalPadding") ||
      undefined,
    ...(ech !== undefined ? { ech } : {}),
  };
}

function normalizeVmessTransport(rawNet: string): { transport: VMessNode["network"]; isHttpUpgrade: boolean } {
  const raw = (rawNet || "tcp").trim().toLowerCase() || "tcp";
  const normalized = raw === "none" ? "tcp" : raw === "websocket" ? "ws" : raw;
  if (normalized === "httpupgrade") {
    return { transport: "ws", isHttpUpgrade: true };
  }

  const supported = new Set<VMessNode["network"]>(["tcp", "ws", "grpc", "h2", "http"]);
  if (!supported.has(normalized as VMessNode["network"])) {
    throw new Error(`不支持的 VMess 传输层: net=${rawNet || "(empty)"}（仅支持 tcp/ws/http/h2/grpc/httpupgrade）`);
  }

  return { transport: normalized as VMessNode["network"], isHttpUpgrade: false };
}

function buildNodeFromConfig(config: VMessConfig): VMessNode {
  const configRecord = config as unknown as Record<string, unknown>;
  const name = config.ps || "VMess 节点";
  const server = config.add;
  const port = parseInt(String(config.port), 10);
  const uuid = config.id;
  const alterId = parseInt(String(config.aid || 0), 10);
  const cipher = config.scy || config.encryption || "auto";
  const rawNetworkInput = pickString(config.net || "tcp") || "tcp";
  const { transport: transportRaw, isHttpUpgrade } = normalizeVmessTransport(rawNetworkInput);
  const tls = config.tls === "tls";
  const sni = config.sni || (config.host ? config.host.split(",")[0].trim() : "") || "";
  const isDomainFronting = Boolean(tls && sni && sni !== server);

  if (!server || !port || !uuid) {
    throw new Error("VMess 配置缺少必要字段");
  }

  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  const node: VMessNode = {
    name,
    type: "vmess",
    server,
    port,
    uuid,
    alterId,
    cipher,
    udp: true,
    tls,
  };

  if (sni) {
    node.servername = sni;
  }

  const packetEncoding =
    pickString(configRecord["packet-encoding"]) ||
    pickString(configRecord.packetEncoding);
  if (packetEncoding) {
    node["packet-encoding"] = packetEncoding;
  }

  const authenticatedLength = parseBooleanish(
    configRecord["authenticated-length"] ?? configRecord.authenticatedLength
  );
  if (authenticatedLength !== undefined) {
    node["authenticated-length"] = authenticatedLength;
  }

  const globalPadding = parseBooleanish(
    configRecord["global-padding"] ?? configRecord.globalPadding
  );
  if (globalPadding !== undefined) {
    node["global-padding"] = globalPadding;
  }

  const fp = typeof config.fp === "string" ? config.fp.trim() : "";
  if (fp) {
    node["client-fingerprint"] = fp;
  }

  if (config.alpn) {
    const list = config.alpn
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) node.alpn = list;
  }

  const allowInsecure = parseBooleanish(config.allowInsecure);
  if (allowInsecure) {
    node["skip-cert-verify"] = true;
  }

  const echPresent = Object.prototype.hasOwnProperty.call(configRecord, "ech");
  if (echPresent) {
    if (!tls) {
      throw new Error("VMess 启用 ECH 需要 TLS（security=tls）");
    }
    const echValue = pickString(configRecord.ech);
    node["ech-opts"] = buildMihomoEchOptsFromShareValue(echValue);
  }

  // VMess TCP + http 伪装：vmess json 常见为 net=tcp + type=http。
  // 在 Clash/Mihomo 中对应 network=http + http-opts。
  const httpHosts = splitList(config.host) ?? (isDomainFronting ? [sni] : undefined);
  const httpPaths = splitList(config.path) ?? ["/"];
  const isHttpObfs = transportRaw === "tcp" && config.type === "http";
  const ua = hasDingTalkHost(httpHosts) ? DINGTALK_USER_AGENT : undefined;
  const edge = (config.edge ?? "").trim();
  const httpMethod = normalizeHttpMethod(configRecord.method ?? config.method);
  const httpHeadersFromConfig = parseHeaderRecord(configRecord.headers ?? config.headers);
  const grpcServiceName = pickString(configRecord.serviceName) || config.path || "";
  const grpcMode = pickString(configRecord.mode ?? config.mode);
  const grpcAuthority = pickString(configRecord.authority ?? config.authority);

  const transport = (isHttpObfs ? "http" : transportRaw) as VMessNode["network"];

  switch (transport) {
    case "ws": {
      node.network = "ws";
      const { path: wsPath, earlyData } = splitWsPathEarlyData(config.path || "/");
      const wsHost = splitList(config.host)?.[0];
      const wsHeaders =
        wsHost || ua || edge
          ? {
              ...(wsHost ? { Host: wsHost } : {}),
              ...(edge ? { Edge: edge } : {}),
              ...(ua ? { "User-Agent": ua } : {}),
            }
          : undefined;

      if (wsPath !== "/" || wsHeaders || earlyData !== undefined) {
        node["ws-opts"] = {
          path: wsPath,
          headers: wsHeaders,
          ...(earlyData !== undefined
            ? {
                "early-data-header-name": "Sec-WebSocket-Protocol",
                "max-early-data": earlyData,
              }
            : {}),
          ...(isHttpUpgrade ? { "v2ray-http-upgrade": true, "v2ray-http-upgrade-fast-open": true } : {}),
        } as VMessNode["ws-opts"] & Record<string, unknown>;
      }
      break;
    }

    case "h2":
      node.network = "h2";
      node["h2-opts"] = {
        host: splitList(config.host),
        path: config.path || "/",
      };
      break;

    case "grpc":
      node.network = "grpc";
      node["grpc-opts"] = {
        "grpc-service-name": grpcServiceName,
        ...(grpcMode ? { _grpcType: grpcMode } : {}),
        ...(grpcAuthority ? { _grpcAuthority: grpcAuthority } : {}),
      } as VMessNode["grpc-opts"] & Record<string, unknown>;
      break;

    case "http": {
      node.network = "http";
      const mergedHeaders = (() => {
        const base = httpHeadersFromConfig ? { ...httpHeadersFromConfig } : undefined;
        const out = base ?? {};

        if (httpHosts && !("Host" in out)) out.Host = httpHosts;
        if (edge && !("Edge" in out)) out.Edge = [edge];
        if (ua && !("User-Agent" in out)) out["User-Agent"] = [ua];

        return Object.keys(out).length > 0 ? out : undefined;
      })();
      node["http-opts"] = {
        method: httpMethod,
        path: httpPaths,
        ...(mergedHeaders ? { headers: mergedHeaders } : {}),
      };
      break;
    }

    case "tcp":
    default:
      node.network = "tcp";
      break;
  }

  return node;
}

export function parseVMess(uri: string): VMessNode {
  if (!uri.startsWith("vmess://") && !uri.startsWith("vmess1://")) {
    throw new Error("无效的 VMess 链接");
  }

  if (uri.startsWith("vmess1://")) {
    return buildNodeFromConfig(parseKitsunebiStyleConfig(uri));
  }

  const content = uri.slice(8).trim();
  if (looksLikeStandardVmessStyle(content)) {
    return buildNodeFromConfig(parseStandardVmessStyleConfig(uri));
  }
  if (looksLikeShadowrocketStyleVmess(content)) {
    return buildNodeFromConfig(parseShadowrocketStyleConfig(uri));
  }
  if (looksLikeUriStyleVmess(content)) {
    return buildNodeFromConfig(parseUriStyleConfig(uri));
  }

  const hashIndex = content.indexOf("#");
  const contentWithoutHash = hashIndex === -1 ? content : content.slice(0, hashIndex);
  const remarksFromHash = hashIndex === -1 ? "" : safeDecodeFormUrlEncoded(content.slice(hashIndex + 1));

  let decoded: string;
  try {
    decoded = decodeBase64(contentWithoutHash);
  } catch {
    throw new Error("无法解码 VMess 链接");
  }

  const parsedJson = tryParseJson<VMessConfig>(decoded);
  let config: VMessConfig;
  if (parsedJson.ok) {
    config = parsedJson.value;
  } else {
    if (/=\s*vmess/i.test(decoded)) {
      config = parseQuantumultVmessConfig(decoded);
    } else {
      throw new Error("无效的 VMess JSON 格式");
    }
  }

  if (remarksFromHash) {
    config = { ...config, ps: remarksFromHash };
  }

  return buildNodeFromConfig(config);
}
