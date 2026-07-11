/**
 * AnyTLS 协议解析器
 *
 * 格式:
 * - anytls://password@server:port?params#name
 * - anytls://BASE64(userinfo@server:port)?params#name (base64 userinfo variant)
 */

import { decodeBase64 } from "../base64";
import type { AnyTLSNode } from "@subboost/core/types/node";
import { buildMihomoEchOptsFromShareValue } from "@subboost/core/mihomo/ech";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";

function parseBool(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return undefined;
}

function parseIntParam(params: URLSearchParams, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = params.get(key);
    if (!raw) continue;
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function hasUserInfoAuthority(raw: string): boolean {
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  let authority = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  if (authority.endsWith("/")) authority = authority.slice(0, -1);
  return authority.includes("@");
}

function splitAtFirstQuery(raw: string): { token: string; suffix: string } | null {
  const queryIndex = raw.indexOf("?");
  if (queryIndex === -1) return null;
  return { token: raw.slice(0, queryIndex), suffix: raw.slice(queryIndex) };
}

function isBase64UrlToken(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    const ok =
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      (char >= "0" && char <= "9") ||
      char === "+" ||
      char === "/" ||
      char === "=" ||
      char === "_" ||
      char === "-";
    if (!ok) return false;
  }
  return true;
}

function stripThroughLastColon(value: string): string {
  const colonIndex = value.lastIndexOf(":");
  return colonIndex === -1 ? value : value.slice(colonIndex + 1);
}

function normalizeEncodedUserinfoUri(uri: string): { uri: string; usedEncodedUserinfo: boolean } {
  const raw = uri.slice("anytls://".length).trim();
  if (hasUserInfoAuthority(raw)) {
    return { uri, usedEncodedUserinfo: false };
  }
  const parts = splitAtFirstQuery(raw);
  if (!parts) return { uri, usedEncodedUserinfo: false };
  const token = parts.token.trim();
  if (!isBase64UrlToken(token) || token.includes(".") || token.includes(":")) {
    return { uri, usedEncodedUserinfo: false };
  }
  const decoded = decodeBase64(token);
  return { uri: `anytls://${decoded}${parts.suffix}`, usedEncodedUserinfo: true };
}

function normalizeAnyTlsSecurity(raw: string | null): "tls" {
  const value = (raw || "").trim().toLowerCase();
  if (!value || value === "tls" || value === "none") return "tls";
  if (value === "reality") {
    throw new Error("AnyTLS 不支持 security=reality / reality-opts（Mihomo 不支持）");
  }
  throw new Error(`AnyTLS 不支持 security=${raw}`);
}

function normalizeAnyTlsTransport(params: URLSearchParams): "tcp" {
  const typeRaw = (params.get("type") || params.get("network") || params.get("transport") || "").trim();
  const normalized = typeRaw.toLowerCase();
  if (!normalized || normalized === "tcp" || normalized === "none") {
    const headerType = (params.get("headerType") || params.get("header_type") || params.get("header-type") || "")
      .trim()
      .toLowerCase();
    if (headerType && headerType !== "none") {
      throw new Error(`AnyTLS 不支持 headerType=${headerType}（仅支持纯 TCP）`);
    }
    return "tcp";
  }
  throw new Error(`AnyTLS 不支持 type=${typeRaw}（Mihomo 仅支持纯 TCP）`);
}

function rejectUnsupportedAnyTlsAdvancedParams(params: URLSearchParams): void {
  const unsupportedRealityParams = [
    "pbk",
    "sid",
    "spx",
    "public-key",
    "public_key",
    "publicKey",
    "short-id",
    "short_id",
    "shortId",
  ];
  const unsupportedTransportParams = [
    "serviceName",
    "service_name",
    "service-name",
    "authority",
    "host",
    "path",
    "seed",
    "mode",
  ];

  const foundReality = unsupportedRealityParams.filter((key) => params.has(key));
  if (foundReality.length > 0) {
    throw new Error(`AnyTLS 不支持 Reality 参数: ${foundReality.join(", ")}`);
  }

  const foundTransport = unsupportedTransportParams.filter((key) => params.has(key));
  if (foundTransport.length > 0) {
    throw new Error(`AnyTLS 不支持传输层参数: ${foundTransport.join(", ")}（Mihomo 仅支持纯 TCP）`);
  }
}

export function parseAnyTLS(uri: string): AnyTLSNode {
  if (!uri.startsWith("anytls://")) {
    throw new Error("无效的 AnyTLS 链接");
  }

  const normalized = normalizeEncodedUserinfoUri(uri);
  const url = parseUrlWithNeutralScheme(normalized.uri);
  const params = url.searchParams;

  const password = (() => {
    const user = safeDecodeURIComponent(url.username);
    const pass = safeDecodeURIComponent(url.password);
    if (user || pass) {
      const merged = pass ? `${user}:${pass}` : user;
      return normalized.usedEncodedUserinfo ? stripThroughLastColon(merged) : merged;
    }

    return (
      params.get("password") ||
      params.get("auth") ||
      params.get("auth_str") ||
      params.get("auth-str") ||
      ""
    ).trim();
  })();
  const server = url.hostname;
  const port = Number.parseInt(url.port || "443", 10);
  const name =
    safeDecodeFormUrlEncoded(url.hash.slice(1)) ||
    safeDecodeFormUrlEncoded(params.get("remarks") || params.get("remark") || "") ||
    `AnyTLS-${server}:${port}`;

  if (!password || !server) {
    throw new Error("AnyTLS 配置缺少必要字段");
  }

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  normalizeAnyTlsSecurity(params.get("security"));
  normalizeAnyTlsTransport(params);
  rejectUnsupportedAnyTlsAdvancedParams(params);

  const sni =
    params.get("sni") ||
    params.get("peer") ||
    params.get("serverName") ||
    params.get("servername") ||
    server;
  const alpnRaw = params.get("alpn") || "";
  const fp =
    (params.get("fp") ||
      params.get("fingerprint") ||
      params.get("client-fingerprint") ||
      params.get("clientFingerprint") ||
      "").trim();
  const echPresent = params.has("ech");
  const echValue = echPresent ? (params.get("ech") || "").trim() : "";

  const insecure =
    params.get("allowInsecure") === "1" ||
    params.get("allowInsecure") === "true" ||
    params.get("allow_insecure") === "1" ||
    params.get("allow_insecure") === "true" ||
    params.get("insecure") === "1" ||
    params.get("insecure") === "true";

  const udp = (() => {
    const raw = params.get("udp");
    if (!raw) return true;
    return parseBool(raw) ?? true;
  })();

  const node: AnyTLSNode = {
    name,
    type: "anytls",
    server,
    port,
    password,
    udp,
  };

  if (echPresent) {
    (node as unknown as Record<string, unknown>)["ech-opts"] = buildMihomoEchOptsFromShareValue(echValue);
  }

  if (sni) node.sni = sni;
  if (insecure) node["skip-cert-verify"] = true;
  if (fp) node["client-fingerprint"] = fp;
  if (alpnRaw) {
    const list = alpnRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) node.alpn = list;
  }

  if (params.get("pcs")) {
    (node as unknown as Record<string, unknown>).pcs = params.get("pcs");
  }
  if (params.get("pqv")) {
    (node as unknown as Record<string, unknown>).pqv = params.get("pqv");
  }

  const idleSessionCheckInterval = parseIntParam(params, [
    "idle-session-check-interval",
    "idleSessionCheckInterval",
  ]);
  if (idleSessionCheckInterval !== undefined) {
    node["idle-session-check-interval"] = idleSessionCheckInterval;
  }

  const idleSessionTimeout = parseIntParam(params, ["idle-session-timeout", "idleSessionTimeout"]);
  if (idleSessionTimeout !== undefined) {
    node["idle-session-timeout"] = idleSessionTimeout;
  }

  const minIdleSession = parseIntParam(params, ["min-idle-session", "minIdleSession"]);
  if (minIdleSession !== undefined) {
    node["min-idle-session"] = minIdleSession;
  }

  const paddingScheme =
    (params.get("padding-scheme") || params.get("paddingScheme") || params.get("padding_scheme") || "").trim();
  if (paddingScheme) {
    node["padding-scheme"] = paddingScheme;
  }

  return node;
}
