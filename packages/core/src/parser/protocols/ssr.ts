/**
 * ShadowsocksR (SSR) 协议解析器
 *
 * 格式: ssr://base64(server:port:protocol:method:obfs:base64(password)/?params)
 *
 * 参考格式（非权威，支持常见订阅/分享生成器）：
 * - remarks / group / protoparam / obfsparam 通常为 Base64（URL-safe）
 */

import { decodeBase64 } from "../base64";
import type { SSRNode } from "@subboost/core/types/node";
import { safeDecodeFormUrlEncoded, safeDecodeURIComponent } from "./url-decode";

function safeDecodeSsrBase64(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  try {
    return decodeBase64(v);
  } catch {
    // SSR 参数有时会出现“不是 base64”的变体；尽量不要直接抛错导致整条节点丢失
    return safeDecodeFormUrlEncoded(safeDecodeURIComponent(v));
  }
}

function parseSsrQuery(query: string): Record<string, string> {
  // 不使用 URLSearchParams：其会把 `+` 当成空格，可能破坏部分 base64 值
  const out: Record<string, string> = {};
  const q = (query ?? "").trim().replace(/^\?/, "");
  if (!q) return out;

  for (const part of q.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) {
      const key = part.trim();
      if (key) out[key] = "";
      continue;
    }

    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = part.slice(eq + 1);
  }

  return out;
}

export function parseSSR(uri: string): SSRNode {
  if (!uri.startsWith("ssr://")) {
    throw new Error("无效的 SSR 链接");
  }

  const content = uri.slice(6).trim();
  if (!content) {
    throw new Error("无效的 SSR 链接");
  }

  let decoded: string;
  try {
    decoded = decodeBase64(content);
  } catch {
    throw new Error("无法解码 SSR 链接");
  }

  const slashQueryIndex = decoded.indexOf("/?");
  const queryIndex = decoded.indexOf("?");
  const splitIndex = slashQueryIndex !== -1 ? slashQueryIndex : queryIndex;

  const main = splitIndex === -1 ? decoded : decoded.slice(0, splitIndex);
  const query = splitIndex === -1 ? "" : decoded.slice(splitIndex + (slashQueryIndex !== -1 ? 2 : 1));

  const parts = main.split(":");
  if (parts.length < 6) {
    throw new Error("无效的 SSR 链接格式");
  }

  const passwordBase64 = parts.pop() ?? "";
  const obfs = (parts.pop() ?? "").trim();
  const cipher = (parts.pop() ?? "").trim();
  const protocol = (parts.pop() ?? "").trim();
  const portStr = (parts.pop() ?? "").trim();
  let server = parts.join(":").trim();

  // 处理 IPv6 地址
  if (server.startsWith("[") && server.endsWith("]")) {
    server = server.slice(1, -1);
  }

  const port = Number.parseInt(portStr, 10);
  if (!server) {
    throw new Error("缺少服务器地址");
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error("无效的端口号");
  }

  const password = safeDecodeSsrBase64(passwordBase64);
  const params = parseSsrQuery(query);

  const remarks = safeDecodeSsrBase64(params.remarks || params.remark || "");
  const name = remarks || `SSR-${server}:${port}`;

  const node: SSRNode = {
    name,
    type: "ssr",
    server,
    port,
    cipher: cipher || "aes-256-cfb",
    password,
    protocol: protocol || "origin",
    obfs: obfs || "plain",
    udp: true,
  };

  const protoparam = safeDecodeSsrBase64(params.protoparam || params["protocol-param"] || "");
  if (protoparam) {
    node["protocol-param"] = protoparam;
  }

  const obfsparam = safeDecodeSsrBase64(params.obfsparam || params["obfs-param"] || "");
  if (obfsparam) {
    node["obfs-param"] = obfsparam;
  }

  return node;
}
