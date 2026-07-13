/**
 * 统一简单代理解析器
 *
 * 支持协议: HTTP, HTTPS, SOCKS4, SOCKS5, SOCKS5+TLS, SSH
 *
 * 支持格式:
 * - 标准 URL: http://user:pass@server:port#name
 * - 简易格式: server:port{name}
 * - 冒号分隔: server:port:user:pass
 * - 完整格式: server:port:user:pass[refresh_url]{name}
 * - Auth 前缀: user:pass@server:port
 */

import type { SocksNode, HttpNode, SshNode } from "@subboost/core/types/node";
import { parseUrlWithNeutralScheme, safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";
import { decodeBase64 } from "../base64";
import { parseJsonObject, parseJsonStringMap } from "../json-utils";

type SimpleProxyType = "http" | "https" | "socks5" | "socks4" | "ssh";
type SimpleProxyNode = SocksNode | HttpNode | SshNode;

function takeTerminalEnclosedValue(input: string, open: string, close: string): { value: string; enclosed?: string } {
  if (!input.endsWith(close)) return { value: input };
  const openIndex = input.lastIndexOf(open);
  if (openIndex === -1) return { value: input };
  const enclosed = input.slice(openIndex + open.length, input.length - close.length);
  if (enclosed.includes(close)) return { value: input };
  return {
    value: input.slice(0, openIndex),
    enclosed,
  };
}

function stripMetaSuffix(input: string): { value: string; name?: string } {
  let remaining = input.trim();
  let name: string | undefined;

  const brace = takeTerminalEnclosedValue(remaining, "{", "}");
  if (brace.enclosed !== undefined) {
    name = brace.enclosed;
    remaining = brace.value;
  }

  const bracket = takeTerminalEnclosedValue(remaining, "[", "]");
  const bracketIsIpv6Host =
    bracket.enclosed?.includes(":") &&
    (remaining.startsWith("[") || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^/?#@]+@)?\[[^\]]+\]$/.test(remaining));
  if (bracket.enclosed !== undefined && !bracketIsIpv6Host) {
    remaining = bracket.value;
  }

  return { value: remaining, name };
}

const DEFAULT_PORTS: Record<SimpleProxyType, number> = {
  http: 80,
  https: 443,
  socks4: 1080,
  socks5: 1080,
  ssh: 22,
};

const SCHEME_MAP: Record<string, SimpleProxyType> = {
  http: "http",
  https: "https",
  socks: "socks5",
  socks4: "socks4",
  socks5: "socks5",
  "socks5+tls": "socks5",
  ssh: "ssh",
};

export function parseSimpleProxy(input: string, defaultType: SimpleProxyType = "http"): SimpleProxyNode {
  const trimmed = input.trim();

  // 1. 标准 URL 格式检测
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    const proxyType = SCHEME_MAP[scheme];
    if (!proxyType) {
      throw new Error(`不支持的协议: ${scheme}`);
    }
    return parseStandardUrl(trimmed, proxyType, { forceTls: scheme === "socks5+tls" });
  }

  // 2. 非标准格式解析
  return parseNakedFormat(trimmed, defaultType);
}

function looksLikeBase64Token(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // URL-safe base64: a-zA-Z0-9 + / = - _
  return /^[A-Za-z0-9+/=_-]+$/.test(v);
}

function tryDecodeBase64Token(value: string): string | null {
  const v = value.trim();
  if (!looksLikeBase64Token(v)) return null;

  try {
    const decoded = decodeBase64(v);
    // 粗略过滤非文本（避免误把常见域名/短串当作 base64 成功解码后产生控制字符）
    if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseUserPassAuth(auth: string): { username?: string; password?: string } {
  const raw = auth.trim();
  if (!raw) return {};
  const idx = raw.indexOf(":");
  if (idx === -1) return { username: raw };
  return { username: raw.slice(0, idx), password: raw.slice(idx + 1) };
}

function parseBoolish(value: string | null): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return undefined;
}

function parseHeadersParam(value: string): Record<string, string> | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  // 优先尝试 JSON（例如 {"User-Agent":"x","X-Key":"y"}）
  const jsonHeaders = parseJsonStringMap(raw);
  if (jsonHeaders) return jsonHeaders;
  if (parseJsonObject(raw)) return undefined;

  // 支持：Key:Value|Key2:Value2
  const out: Record<string, string> = {};
  for (const part of raw.split("|")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf(":");
    if (idx === -1) continue;
    const key = p.slice(0, idx).trim();
    const val = p.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function applyStandardUrlQueryParams(node: SimpleProxyNode, params: URLSearchParams): void {
  const sni = (params.get("sni") || params.get("peer") || params.get("tls-name") || params.get("tls_name") || "")
    .trim();
  const allowInsecure =
    parseBoolish(params.get("skip-cert-verify")) ??
    parseBoolish(params.get("skip_cert_verify")) ??
    parseBoolish(params.get("allowInsecure")) ??
    parseBoolish(params.get("allow_insecure")) ??
    parseBoolish(params.get("allow-insecure")) ??
    parseBoolish(params.get("insecure"));

  const tlsVerification = (() => {
    const raw = params.get("tls-verification");
    const parsed = parseBoolish(raw);
    return parsed !== undefined ? parsed : undefined;
  })();

  const hostKeyRaw = (params.get("host-key") || params.get("host_key") || params.get("hostKey") || "").trim();
  const privateKeyRaw = (params.get("private-key") || params.get("private_key") || params.get("privateKey") || "").trim();

  if (node.type === "http" || node.type === "https") {
    if (sni) node.sni = sni;
    if (allowInsecure !== undefined) node["skip-cert-verify"] = allowInsecure;
    if (tlsVerification !== undefined) node["skip-cert-verify"] = !tlsVerification;

    const headers = parseHeadersParam(params.get("headers") || params.get("header") || "");
    if (headers) node.headers = headers;
  }

  if (node.type === "socks4" || node.type === "socks5") {
    if (sni) node.sni = sni;
    if (allowInsecure !== undefined) node["skip-cert-verify"] = allowInsecure;
    if (tlsVerification !== undefined) node["skip-cert-verify"] = !tlsVerification;

    const udp = parseBoolish(params.get("udp") || params.get("udp-relay") || params.get("udp_relay"));
    if (udp !== undefined) node.udp = udp;
  }

  if (node.type === "ssh") {
    if (privateKeyRaw) node["private-key"] = privateKeyRaw;
    if (hostKeyRaw) {
      const list = hostKeyRaw
        .split(/[|,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length > 0) node["host-key"] = list;
    }
    const serverFingerprint = (params.get("server-fingerprint") || params.get("server_fingerprint") || "").trim();
    const idleTimeout = (params.get("idle-timeout") || params.get("idle_timeout") || "").trim();
    const hostKeyAlgorithms = (params.get("host-key-algorithms") || params.get("host_key_algorithms") || "").trim();
    if (serverFingerprint) (node as unknown as Record<string, unknown>)["server-fingerprint"] = serverFingerprint;
    if (/^\d+$/.test(idleTimeout)) (node as unknown as Record<string, unknown>)["idle-timeout"] = Number.parseInt(idleTimeout, 10);
    if (hostKeyAlgorithms) {
      (node as unknown as Record<string, unknown>)["host-key-algorithms"] = hostKeyAlgorithms
        .split(/[|,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (allowInsecure !== undefined) (node as unknown as Record<string, unknown>)["skip-cert-verify"] = allowInsecure;
  }
}

function parseStandardUrl(
  uri: string,
  proxyType: SimpleProxyType,
  options?: { forceTls?: boolean }
): SimpleProxyNode {
  const { value: normalizedUri, name: rawSuffixName } = stripMetaSuffix(uri);
  const suffixName = rawSuffixName ? safeDecodeFormUrlEncoded(rawSuffixName) : "";

  // 提取 authority 部分（scheme 之后，?/# 之前）
  const authority = normalizedUri
    .replace(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//, "")
    .split(/[/?#]/)[0];

  // v2rayN/Telegram-like base64 格式（subconverter 风格）：
  // - socks://BASE64(user:pass@server:port)#name
  // - http(s)://BASE64(user:pass@server:port)?remarks=...
  // 这类链接的 authority 往往不含 ':'/'@'，直接按标准 URL 解析会把 BASE64 当成 hostname 导致“静默错误”。
  if (!authority.startsWith("[") && !authority.includes("@") && !authority.includes(":")) {
    const decoded = tryDecodeBase64Token(authority);
    if (decoded) {
      const atIndex = decoded.lastIndexOf("@");
      const authPart = atIndex === -1 ? "" : decoded.slice(0, atIndex);
      const serverPart = atIndex === -1 ? decoded : decoded.slice(atIndex + 1);

      const parsed = parseServerPort(serverPart.trim());
      const server = parsed.server;
      const port = parsed.port;
      if (server && port !== undefined) {
        const queryName = (() => {
          const qIndex = normalizedUri.indexOf("?");
          if (qIndex === -1) return "";
          const hashIndex = normalizedUri.indexOf("#", qIndex);
          const queryString = normalizedUri.slice(qIndex + 1, hashIndex === -1 ? undefined : hashIndex);
          const params = new URLSearchParams(queryString);
          const remark = params.get("remark") || params.get("remarks") || "";
          return safeDecodeFormUrlEncoded(remark);
        })();
        const hashIdx = normalizedUri.indexOf("#");
        const hashName = hashIdx === -1 ? "" : safeDecodeFormUrlEncoded(normalizedUri.slice(hashIdx + 1));
        const name = suffixName || hashName || queryName || `${proxyType.toUpperCase()}-${server}:${port}`;

        const auth = parseUserPassAuth(authPart);
        const node = buildNode(proxyType, {
          name,
          server,
          port,
          username: auth.username,
          password: auth.password,
          tls: options?.forceTls,
        });

        const qIndex = normalizedUri.indexOf("?");
        if (qIndex !== -1) {
          const hashIndex = normalizedUri.indexOf("#", qIndex);
          const queryString = normalizedUri.slice(qIndex + 1, hashIndex === -1 ? undefined : hashIndex);
          applyStandardUrlQueryParams(node, new URLSearchParams(queryString));
        }

        return node;
      }
    }
  }

  // 支持 scheme://server:port:user:pass 格式
  if (!authority.startsWith("[") && !authority.includes("@")) {
    const parts = authority.split(":");
    if (parts.length >= 4) {
      const server = parts[0];
      const port = parseInt(parts[1], 10);
      const username = parts[2] ? safeDecodeURIComponent(parts[2]) : undefined;
      const password = parts.slice(3).join(":") ? safeDecodeURIComponent(parts.slice(3).join(":")) : undefined;

      if (!server) throw new Error("缺少服务器地址");
      if (isNaN(port) || port <= 0 || port > 65535) throw new Error("无效的端口号");

      const hashIdx = normalizedUri.indexOf("#");
      const hashName =
        hashIdx === -1 ? "" : safeDecodeFormUrlEncoded(normalizedUri.slice(hashIdx + 1));
      const name = suffixName || hashName || `${proxyType.toUpperCase()}-${server}:${port}`;

      return buildNode(proxyType, { name, server, port, username, password, tls: options?.forceTls });
    }
  }

  // 标准 URL 格式
  const url = parseUrlWithNeutralScheme(normalizedUri);

  const server = url.hostname;
  const port = parseInt(url.port || String(options?.forceTls ? 443 : DEFAULT_PORTS[proxyType]), 10);
  const hashName = safeDecodeFormUrlEncoded(url.hash.slice(1));
  const name = suffixName || hashName || `${proxyType.toUpperCase()}-${server}:${port}`;

  if (!server) {
    throw new Error("缺少服务器地址");
  }
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  const rawUsername = url.username ? safeDecodeURIComponent(url.username) : undefined;
  const rawPassword = url.password ? safeDecodeURIComponent(url.password) : undefined;
  const decodedAuth =
    rawUsername && !rawPassword && (proxyType === "socks4" || proxyType === "socks5")
      ? tryDecodeBase64Token(rawUsername)
      : null;
  const authFromDecoded =
    decodedAuth && decodedAuth.includes(":") && !decodedAuth.includes("@")
      ? parseUserPassAuth(decodedAuth)
      : undefined;
  const username = authFromDecoded?.username ?? rawUsername;
  const password = authFromDecoded?.password ?? rawPassword;

  const node = buildNode(proxyType, { name, server, port, username, password, tls: options?.forceTls });
  applyStandardUrlQueryParams(node, url.searchParams);
  return node;
}

function parseNakedFormat(input: string, defaultType: SimpleProxyType): SimpleProxyNode {
  const { value: remaining, name: rawName } = stripMetaSuffix(input);
  const name = rawName ? safeDecodeURIComponent(rawName) : undefined;

  let server: string;
  let port: number;
  let username: string | undefined;
  let password: string | undefined;

  // 格式: user:pass@server:port
  if (remaining.includes("@")) {
    const atIndex = remaining.lastIndexOf("@");
    const authPart = remaining.slice(0, atIndex);
    const serverPart = remaining.slice(atIndex + 1);

    const authColonIndex = authPart.indexOf(":");
    if (authColonIndex !== -1) {
      username = authPart.slice(0, authColonIndex);
      password = authPart.slice(authColonIndex + 1);
    } else {
      username = authPart;
    }

    const parsed = parseServerPort(serverPart);
    server = parsed.server;
    port = parsed.port ?? DEFAULT_PORTS[defaultType];
  } else {
    // 格式: server:port 或 server:port:user:pass
    const parts = remaining.split(":");

    if (parts.length >= 4) {
      // server:port:user:pass
      server = parts[0];
      port = parseInt(parts[1], 10);
      username = parts[2];
      password = parts.slice(3).join(":");
    } else if (parts.length >= 2) {
      // server:port
      server = parts[0];
      port = parseInt(parts[1], 10);
    } else {
      throw new Error("无效的代理格式");
    }
  }

  if (!server) {
    throw new Error("缺少服务器地址");
  }
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  const finalName = name || `${defaultType.toUpperCase()}-${server}:${port}`;

  return buildNode(defaultType, { name: finalName, server, port, username, password });
}

function parseServerPort(input: string): { server: string; port?: number } {
  // 处理 IPv6 地址 [::1]:port
  if (input.startsWith("[")) {
    const bracketEnd = input.indexOf("]");
    if (bracketEnd !== -1) {
      const server = input.slice(1, bracketEnd);
      const afterBracket = input.slice(bracketEnd + 1);
      if (afterBracket.startsWith(":")) {
        const port = parseInt(afterBracket.slice(1), 10);
        return { server, port: isNaN(port) ? undefined : port };
      }
      return { server };
    }
  }
  const colonIndex = input.lastIndexOf(":");
  if (colonIndex === -1) {
    return { server: input };
  }
  const server = input.slice(0, colonIndex);
  const port = parseInt(input.slice(colonIndex + 1), 10);
  return { server, port: isNaN(port) ? undefined : port };
}

function buildNode(
  type: SimpleProxyType,
  opts: { name: string; server: string; port: number; username?: string; password?: string; tls?: boolean }
): SimpleProxyNode {
  const { name, server, port, username, password, tls } = opts;

  if (type === "socks4" || type === "socks5") {
    const node: SocksNode = {
      name,
      type,
      server,
      port,
      udp: type === "socks5",
    };
    if (username) node.username = username;
    if (password) node.password = password;
    if (tls) node.tls = true;
    return node;
  }

  if (type === "ssh") {
    const node: SshNode = {
      name,
      type: "ssh",
      server,
      port,
    };
    if (username) node.username = username;
    if (password) node.password = password;
    return node;
  }

  // http / https
  const node: HttpNode = {
    name,
    type,
    server,
    port,
    tls: type === "https",
  };
  if (username) node.username = username;
  if (password) node.password = password;
  return node;
}

export function parseSocks(uri: string): SocksNode {
  const trimmed = uri.trim();
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  const scheme = schemeMatch?.[1]?.toLowerCase() || "";
  if (scheme !== "socks5" && scheme !== "socks4" && scheme !== "socks" && scheme !== "socks5+tls") {
    throw new Error("无效的 SOCKS 链接");
  }

  const node = parseSimpleProxy(trimmed, "socks5") as SocksNode;

  // 保持 SOCKS- 前缀输出稳定性（而非 SOCKS5-）
  const defaultName = `${node.type.toUpperCase()}-${node.server}:${node.port}`;
  if (node.name === defaultName) {
    return { ...node, name: `SOCKS-${node.server}:${node.port}` };
  }
  return node;
}

export function parseHttp(uri: string): HttpNode {
  return parseSimpleProxy(uri, "http") as HttpNode;
}

export function parseSsh(uri: string): SshNode {
  return parseSimpleProxy(uri, "ssh") as SshNode;
}

function isTelegramProxyKind(kind: string): kind is "socks" | "http" | "https" {
  return kind === "socks" || kind === "http" || kind === "https";
}

/**
 * Telegram-like 代理链接（subconverter 支持）
 * - tg://socks?server=1.2.3.4&port=233&user=u&pass=p&remark=Example
 * - https://t.me/socks?server=...
 * - tg://http?... / https://t.me/http?...
 * - tg://https?... / https://t.me/https?...
 */
export function parseTelegramProxyLink(uri: string): SocksNode | HttpNode {
  const url = new URL(uri);

  const kind = (() => {
    if (url.protocol === "tg:") {
      return url.hostname.toLowerCase();
    }
    if (url.hostname.toLowerCase() === "t.me") {
      const p = url.pathname.replace(/^\/+/, "").split("/")[0]?.toLowerCase() || "";
      return p;
    }
    return "";
  })();

  if (!isTelegramProxyKind(kind)) {
    throw new Error("无效的 Telegram 代理链接");
  }

  const server = (url.searchParams.get("server") || "").trim();
  const portStr = (url.searchParams.get("port") || "").trim();
  const port = Number.parseInt(portStr, 10);

  if (!server) throw new Error("缺少服务器地址");
  if (!Number.isFinite(port) || port <= 0 || port > 65535) throw new Error("无效的端口号");

  const username = (() => {
    const u = url.searchParams.get("user");
    return u ? safeDecodeURIComponent(u) : undefined;
  })();
  const password = (() => {
    const p = url.searchParams.get("pass");
    return p ? safeDecodeURIComponent(p) : undefined;
  })();

  const remarkRaw = url.searchParams.get("remark") || url.searchParams.get("remarks") || "";
  const name = safeDecodeFormUrlEncoded(remarkRaw) || `${kind.toUpperCase()}-${server}:${port}`;

  if (kind === "socks") {
    return buildNode("socks5", { name, server, port, username, password }) as SocksNode;
  }

  return buildNode(kind, { name, server, port, username, password }) as HttpNode;
}
