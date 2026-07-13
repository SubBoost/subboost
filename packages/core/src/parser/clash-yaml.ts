/**
 * Clash YAML 配置解析器
 */

import yaml from "js-yaml";
import type { ParsedNode, ParseResult, UnknownNodeType, XHttpOpts } from "@subboost/core/types/node";
import { normalizeRealityShortId } from "@subboost/core/mihomo/reality";
import { canonicalizeParsedNode } from "./canonical-fields";
import { normalizePortsSpecValue, parsePortNumber, pickStablePortFromPorts } from "./port-spec";
import { normalizeSsPlugin } from "./protocols/ss";
import { splitWsPathEarlyData } from "./ws-early-data";

interface ClashConfig {
  proxies?: Record<string, unknown>[];
  "proxy-providers"?: Record<string, unknown>;
  "proxy-groups"?: unknown[];
  rules?: string[];
  dns?: unknown;
  [key: string]: unknown;
}

function applyWsEarlyDataInPlace(node: Record<string, unknown>) {
  if (String(node.network ?? "") !== "ws") return;
  const wsOpts = node["ws-opts"];
  if (!wsOpts || typeof wsOpts !== "object" || Array.isArray(wsOpts)) return;

  const record = wsOpts as Record<string, unknown>;
  const path = typeof record.path === "string" ? record.path.trim() : "";
  if (!path) return;

  const { path: wsPath, earlyData } = splitWsPathEarlyData(path);
  if (earlyData === undefined) return;

  record.path = wsPath;
  if (record["max-early-data"] !== undefined || record["early-data-header-name"] !== undefined) return;
  record["early-data-header-name"] = "Sec-WebSocket-Protocol";
  record["max-early-data"] = earlyData;
}

function normalizeClashYamlScalarText(content: string): string {
  return content.replace(
    /^(\s*short-id\s*:\s*)([0-9]+)(\s*(?:#.*)?)$/gm,
    (_match, prefix: string, value: string, suffix: string) => `${prefix}"${value}"${suffix || ""}`
  );
}

function countLeadingSpaces(line: string): number {
  let count = 0;
  while (count < line.length && line.charCodeAt(count) === 32) count += 1;
  return count;
}

function isRootProxiesKey(trimmed: string): boolean {
  if (trimmed === "proxies:") return true;
  if (!trimmed.startsWith("proxies:")) return false;
  return trimmed.slice("proxies:".length).trimStart().startsWith("#");
}

function isSingleLineFlowSequenceItem(trimmed: string): boolean {
  if (!trimmed.startsWith("- {")) return false;
  const closingBrace = trimmed.lastIndexOf("}");
  if (closingBrace < 3) return false;
  const trailing = trimmed.slice(closingBrace + 1).trim();
  return !trailing || trailing.startsWith("#");
}

function repairRootFlowProxyListIndent(input: string): string {
  const lines = input.split(/\r?\n/);
  let rootMappingIndent = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) continue;
    rootMappingIndent = Math.min(rootMappingIndent, countLeadingSpaces(line));
  }

  if (rootMappingIndent === Number.POSITIVE_INFINITY) return input;

  const proxiesLineIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return countLeadingSpaces(line) === rootMappingIndent && isRootProxiesKey(trimmed);
  });
  if (proxiesLineIndex < 0) return input;

  const itemIndexes: number[] = [];
  for (let index = proxiesLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = countLeadingSpaces(line);
    if (!trimmed.startsWith("-") && indent <= rootMappingIndent) break;
    if (indent < rootMappingIndent || !isSingleLineFlowSequenceItem(trimmed)) return input;
    itemIndexes.push(index);
  }

  if (itemIndexes.length < 2) return input;
  const canonicalIndent = countLeadingSpaces(lines[itemIndexes[0]]);
  if (itemIndexes.every((index) => countLeadingSpaces(lines[index]) === canonicalIndent)) return input;

  for (const index of itemIndexes) {
    lines[index] = `${" ".repeat(canonicalIndent)}${lines[index].trimStart()}`;
  }
  return lines.join("\n");
}

function repairInlineListIndent(input: string): string {
  // 修复常见的“列表项首行内联 key（- name: xxx）但后续 key 又多缩进”的不合法 YAML。
  // 逐个列表项消费其后续块，确保每一行最多检查一次，避免大型订阅退化为 O(n²)。
  const lines = input.split(/\r?\n/);
  const out: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const match = line.match(/^(\s*)-\s*(name\s*:\s*.+)$/);
    if (!match) {
      out.push(line);
      index += 1;
      continue;
    }

    const dashIndent = match[1].length;
    const keyIndent = dashIndent + 2;
    let minIndent = Number.POSITIVE_INFINITY;
    let blockEnd = index + 1;

    while (blockEnd < lines.length) {
      const nextLine = lines[blockEnd];
      const trimmed = nextLine.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        blockEnd += 1;
        continue;
      }

      const indent = countLeadingSpaces(nextLine);
      if (indent <= dashIndent) break;
      minIndent = Math.min(minIndent, indent);
      blockEnd += 1;
    }

    if (minIndent !== Number.POSITIVE_INFINITY && minIndent > keyIndent) {
      out.push(`${" ".repeat(dashIndent)}-`);
      out.push(`${" ".repeat(minIndent)}${match[2]}`);
    } else {
      out.push(line);
    }
    out.push(...lines.slice(index + 1, blockEnd));
    index = blockEnd;
  }

  return out.join("\n");
}

/**
 * 解析 Clash YAML 配置
 */
export function parseClashYaml(content: string): ParseResult {
  const nodes: ParsedNode[] = [];
  const errors: string[] = [];

  try {
    const normalizeTabs = (s: string) => s.replace(/\t/g, "  ");

    const tryLoad = (raw: string): unknown => yaml.load(raw) as unknown;
    const normalizedContent = normalizeClashYamlScalarText(normalizeTabs(content));

    let parsed: unknown;
    try {
      parsed = tryLoad(normalizedContent);
    } catch (e) {
      // 尝试修复缩进后再解析一次
      const repaired = repairRootFlowProxyListIndent(repairInlineListIndent(normalizedContent));
      parsed = tryLoad(repaired);
    }

    if (!parsed) {
      return {
        nodes: [],
        errors: ["空的配置文件"],
        totalParsed: 0,
        totalFailed: 1,
      };
    }

    // 1) 完整 Clash 配置对象：{ proxies: [...] }
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      const config = parsed as ClashConfig;

      if (config.proxies && Array.isArray(config.proxies)) {
        for (const proxy of config.proxies) {
          try {
            const node = normalizeNode(proxy);
            if (node) nodes.push(canonicalizeParsedNode(node));
          } catch (e) {
            errors.push(
              `节点 "${(proxy as any)?.name || "未知"}" 解析失败: ${e instanceof Error ? e.message : "未知错误"}`
            );
          }
        }
      } else {
        // 2) 单个 proxy 对象（用户直接粘贴了一条节点 YAML）
        try {
          const node = normalizeNode(config as unknown as Record<string, unknown>);
          if (node) nodes.push(canonicalizeParsedNode(node));
        } catch (e) {
          errors.push(`节点解析失败: ${e instanceof Error ? e.message : "未知错误"}`);
        }
      }

      const proxyProviders = config["proxy-providers"];
      const hasProxyProviders =
        proxyProviders &&
        typeof proxyProviders === "object" &&
        !Array.isArray(proxyProviders) &&
        Object.keys(proxyProviders).length > 0;

      // 注意：proxy-providers 需要在服务器端拉取，浏览器端无法直接获取
      if (hasProxyProviders) {
        errors.push(
          "检测到 proxy-providers 配置，由于浏览器限制无法自动拉取，请直接粘贴节点内容"
        );
      }
    } else if (Array.isArray(parsed)) {
      // 3) 仅粘贴了 proxies 列表（YAML 顶层为数组）
      for (const proxy of parsed) {
        if (!proxy || typeof proxy !== "object") continue;
        try {
          const node = normalizeNode(proxy as Record<string, unknown>);
          if (node) nodes.push(canonicalizeParsedNode(node));
        } catch (e) {
          const name = (proxy as any)?.name || "未知";
          errors.push(`节点 "${name}" 解析失败: ${e instanceof Error ? e.message : "未知错误"}`);
        }
      }
    } else {
      // 其他：无法识别为 Clash YAML
      errors.push("无法识别为 Clash YAML（缺少 proxies 或节点字段）");
    }

    return {
      nodes,
      errors,
      totalParsed: nodes.length,
      totalFailed: errors.length,
    };
  } catch (e) {
    return {
      nodes: [],
      errors: [`YAML 解析错误: ${e instanceof Error ? e.message : "未知错误"}`],
      totalParsed: 0,
      totalFailed: 1,
    };
  }
}

/**
 * 标准化节点对象
 */
function normalizeNode(proxy: Record<string, unknown>): ParsedNode | null {
  if (!proxy || typeof proxy !== "object") {
    return null;
  }

  const typeRaw = typeof proxy.type === "string" ? proxy.type : String(proxy.type ?? "");
  const type = typeRaw.trim().toLowerCase();
  if (!type) {
    throw new Error("缺少节点类型");
  }

  const name = (proxy.name as string) || "未命名节点";
  if (type === "direct" || type === "dns") {
    return { ...proxy, name, type } as unknown as ParsedNode;
  }

  const server = proxy.server as string;
  const ports = normalizePortsSpecValue(proxy.ports);
  const isHysteria2 = type === "hysteria2" || type === "hy2";
  const isHysteria = type === "hysteria" || type === "hy";
  const supportsPortsOnly = isHysteria2;
  const shouldNormalizePorts = (isHysteria2 || isHysteria) && ports;
  const port = parsePortNumber(proxy.port) ?? (supportsPortsOnly && ports ? pickStablePortFromPorts(ports) : undefined);

  if (!server || port === undefined) {
    throw new Error("缺少服务器地址或端口无效");
  }

  // 透传上游字段：避免因字段映射表不完整而丢失协议关键参数（如 hy2 ports / vless client-fingerprint 等）
  const baseNode = {
    ...proxy,
    name,
    type,
    server,
    port,
    ...(shouldNormalizePorts ? { ports } : {}),
  };
  applyWsEarlyDataInPlace(baseNode as unknown as Record<string, unknown>);

  switch (type) {
    case "ss": {
      const normalizedSsPlugin = normalizeSsPlugin(proxy.plugin as string, proxy["plugin-opts"] as Record<string, unknown>);
      return {
        ...baseNode,
        type: "ss",
        cipher: (proxy.cipher as string) || "aes-256-gcm",
        password: (proxy.password as string) || "",
        udp: proxy.udp as boolean,
        plugin: normalizedSsPlugin.plugin,
        "plugin-opts": normalizedSsPlugin.pluginOpts,
      };
    }

    case "ssr":
      return {
        ...baseNode,
        type: "ssr",
        cipher: (proxy.cipher as string) || "aes-256-cfb",
        password: (proxy.password as string) || "",
        protocol: (proxy.protocol as string) || "origin",
        "protocol-param": proxy["protocol-param"] as string,
        obfs: (proxy.obfs as string) || "plain",
        "obfs-param": proxy["obfs-param"] as string,
        udp: proxy.udp as boolean,
      };

    case "vmess":
      return {
        ...baseNode,
        type: "vmess",
        uuid: (proxy.uuid as string) || "",
        alterId: Number(proxy.alterId) || 0,
        cipher: (proxy.cipher as string) || "auto",
        udp: proxy.udp as boolean,
        tls: proxy.tls as boolean,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        servername: proxy.servername as string,
        network: proxy.network as "tcp" | "ws" | "h2" | "grpc" | "http",
        "http-opts": proxy["http-opts"] as {
          method?: string;
          path?: string[];
          headers?: Record<string, string[]>;
        },
        "ws-opts": proxy["ws-opts"] as { path?: string; headers?: Record<string, string> },
        "h2-opts": proxy["h2-opts"] as { host?: string[]; path?: string },
        "grpc-opts": proxy["grpc-opts"] as { "grpc-service-name"?: string },
      };

    case "vless": {
      const realityRaw = proxy["reality-opts"];
      const realityOpts = (() => {
        if (!realityRaw || typeof realityRaw !== "object") return undefined;
        const ro = realityRaw as Record<string, unknown>;
        // 保留所有 reality-opts 里的字段，仅对 public-key/short-id 做轻量规范化，避免丢失 spider-x 等上游参数
        const out: Record<string, unknown> = { ...ro };

        const publicKeyRaw = out["public-key"];
        if (typeof publicKeyRaw === "string") {
          out["public-key"] = publicKeyRaw.trim();
        }

        const shortIdStr = normalizeRealityShortId(out["short-id"]);
        if (shortIdStr) out["short-id"] = shortIdStr;
        else delete out["short-id"];

        return Object.keys(out).length > 0 ? out : undefined;
      })();

      return {
        ...baseNode,
        type: "vless",
        uuid: (proxy.uuid as string) || "",
        udp: proxy.udp as boolean,
        tls: proxy.tls as boolean,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        servername: proxy.servername as string,
        network: proxy.network as "tcp" | "ws" | "h2" | "grpc" | "http" | "xhttp",
        flow: proxy.flow as string,
        "http-opts": proxy["http-opts"] as {
          method?: string;
          path?: string[];
          headers?: Record<string, string[]>;
        },
        "h2-opts": proxy["h2-opts"] as { host?: string[]; path?: string },
        "ws-opts": proxy["ws-opts"] as { path?: string; headers?: Record<string, string> },
        "grpc-opts": proxy["grpc-opts"] as { "grpc-service-name"?: string },
        "xhttp-opts": proxy["xhttp-opts"] as XHttpOpts,
        "reality-opts": realityOpts,
      };
    }

    case "trojan":
      return {
        ...baseNode,
        type: "trojan",
        password: (proxy.password as string) || "",
        udp: proxy.udp as boolean,
        sni: proxy.sni as string,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        alpn: proxy.alpn as string[],
        network: proxy.network as "tcp" | "ws" | "grpc",
        "ws-opts": proxy["ws-opts"] as { path?: string; headers?: Record<string, string> },
        "grpc-opts": proxy["grpc-opts"] as { "grpc-service-name"?: string },
      };

    case "anytls":
      return {
        ...baseNode,
        type: "anytls",
        password: (proxy.password as string) || "",
        udp: proxy.udp as boolean,
        sni: proxy.sni as string,
        alpn: proxy.alpn as string[],
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        "client-fingerprint": proxy["client-fingerprint"] as string,
      };

    case "hysteria2":
    case "hy2":
      return {
        ...baseNode,
        type: "hysteria2",
        password: (proxy.password as string) || "",
        sni: proxy.sni as string,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        obfs: proxy.obfs as string,
        "obfs-password": proxy["obfs-password"] as string,
        up: proxy.up as string,
        down: proxy.down as string,
        ports: ports as string,
      };

    case "hysteria":
    case "hy":
      return {
        ...baseNode,
        type: "hysteria",
        protocol: (proxy.protocol as string) || "udp",
        "auth-str": proxy["auth-str"] as string,
        sni: proxy.sni as string,
        alpn: proxy.alpn as string[],
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        up: proxy.up as string,
        down: proxy.down as string,
        ports: ports as string,
        obfs: proxy.obfs as string,
        _obfs: proxy._obfs as string,
        tfo: proxy.tfo as boolean,
      };

    case "socks":
    case "socks5":
    case "socks4":
      return {
        ...baseNode,
        type: (type === "socks" ? "socks5" : type) as "socks5" | "socks4",
        username: proxy.username as string,
        password: proxy.password as string,
        udp: proxy.udp as boolean,
        tls: proxy.tls as boolean,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        sni: proxy.sni as string,
      };

    case "http":
    case "https":
      return {
        ...baseNode,
        type: type as "http" | "https",
        username: proxy.username as string,
        password: proxy.password as string,
        tls: proxy.tls as boolean,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        sni: proxy.sni as string,
        headers: proxy.headers as Record<string, string>,
      };

    case "tuic":
      return {
        ...baseNode,
        type: "tuic",
        uuid: (proxy.uuid as string) || "",
        password: (proxy.password as string) || "",
        sni: proxy.sni as string,
        alpn: proxy.alpn as string[],
        "congestion-controller": proxy["congestion-controller"] as string,
        "udp-relay-mode": proxy["udp-relay-mode"] as string,
        "reduce-rtt": proxy["reduce-rtt"] as boolean,
        "skip-cert-verify": proxy["skip-cert-verify"] as boolean,
        "disable-sni": proxy["disable-sni"] as boolean,
      };

    case "ssh":
      return {
        ...baseNode,
        type: "ssh",
        username: proxy.username as string,
        password: proxy.password as string,
        "private-key": proxy["private-key"] as string,
        "private-key-passphrase": proxy["private-key-passphrase"] as string,
        "host-key": proxy["host-key"] as string[],
      };

    case "mieru":
    case "masque":
    case "sudoku":
      return { ...(baseNode as Record<string, unknown>), type } as unknown as ParsedNode;

    default:
      // 支持 Mihomo/Clash 新增类型：只要具备 server/port/name，即作为“未知节点”透传导入。
      // 这样新增协议/字段不会导致整个订阅/YAML 导入失败（后续生成时也会原样输出字段）。
      return { ...(baseNode as Record<string, unknown>), type: type as UnknownNodeType } as unknown as ParsedNode;
  }
}
