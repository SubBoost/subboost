import type { KnownNodeType } from "@subboost/core/types/node";
import type { ClashConfig } from "@subboost/core/types/config";
import { sanitizeMihomoProxyNode } from "../mihomo/proxy-sanitizer";

export type DnsPolicyValue = string | string[];

const PROXY_FIELD_ORDER_CORE = ["name", "type", "server", "port"];
const PROXY_FIELD_ORDER_PROTOCOL: Partial<Record<KnownNodeType, string[]>> = {
  ss: ["cipher", "password", "udp-over-tcp", "udp-over-tcp-version", "tfo", "plugin", "plugin-opts"],
  ssr: ["cipher", "password", "protocol", "protocol-param", "obfs", "obfs-param"],
  vmess: ["uuid", "alterId", "cipher", "packet-encoding", "authenticated-length", "global-padding"],
  vless: ["uuid", "encryption", "packet-encoding"],
  trojan: ["password"],
  anytls: ["password"],
  hysteria: ["protocol", "auth-str", "obfs", "ports", "up", "down"],
  hysteria2: ["password", "obfs", "obfs-password", "up", "down", "ports", "hop-interval", "fingerprint", "alpn"],
  socks5: ["username", "password"],
  socks4: ["username", "password"],
  http: ["username", "password", "headers"],
  https: ["username", "password", "headers"],
  tuic: [
    "token",
    "uuid",
    "password",
    "congestion-controller",
    "udp-relay-mode",
    "request-timeout",
    "heartbeat-interval",
    "max-open-streams",
    "max-idle-time",
    "tfo",
  ],
  wireguard: [
    "private-key",
    "public-key",
    "pre-shared-key",
    "ip",
    "ipv6",
    "mtu",
    "keepalive",
    "reserved",
    "dns",
    "allowed-ips",
    "peers",
  ],
  snell: ["psk", "version", "obfs-opts", "reuse"],
  direct: ["udp", "ip-version", "interface-name", "routing-mark"],
  dns: ["udp"],
  mieru: ["username", "password", "transport", "port-range", "multiplexing", "handshake-mode"],
  masque: ["username", "password"],
  sudoku: [
    "key",
    "aead-method",
    "padding-min",
    "padding-max",
    "table-type",
    "http-mask",
    "http-mask-host",
    "http-mask-mode",
    "custom-table",
    "custom-tables",
  ],
  relay: ["proxies"],
};
const PROXY_FIELD_ORDER_TLS = ["tls", "sni", "servername", "skip-cert-verify", "ech-opts", "client-fingerprint"];
const PROXY_FIELD_ORDER_TRANSPORT = ["network", "flow", "alpn", "udp"];
const PROXY_FIELD_ORDER_ADVANCED = ["reality-opts", "ws-opts", "grpc-opts", "h2-opts", "http-opts", "xhttp-opts"];
const PROXY_FIELD_CHAIN_LAST = "dialer-proxy";
const PROXY_GROUP_FIELD_ORDER = [
  "name",
  "type",
  "proxies",
  "include-all",
  "include-all-proxies",
  "include-all-providers",
  "use",
  "url",
  "interval",
  "lazy",
  "tolerance",
  "strategy",
  "filter",
  "exclude-filter",
  "exclude-type",
  "expected-status",
  "timeout",
  "max-failed-times",
  "disable-udp",
  "interface-name",
  "routing-mark",
  "hidden",
  "icon",
];
const UDP_SUPPORTED_TYPES = new Set<KnownNodeType>([
  "ss",
  "ssr",
  "vmess",
  "vless",
  "trojan",
  "anytls",
  "hysteria2",
  "tuic",
  "socks5",
]);
function getOrderedProxyKeys(node: Record<string, unknown>): string[] {
  const keys = Object.keys(node).filter((k) => node[k] !== undefined && !k.startsWith("_"));
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    if (!seen.has(k) && Object.prototype.hasOwnProperty.call(node, k) && node[k] !== undefined) {
      out.push(k);
      seen.add(k);
    }
  };

  PROXY_FIELD_ORDER_CORE.forEach(push);
  const nodeType = String(node.type ?? "");
  (((PROXY_FIELD_ORDER_PROTOCOL as unknown as Record<string, string[] | undefined>)[nodeType] ?? []) as string[]).forEach(
    push
  );
  PROXY_FIELD_ORDER_TLS.forEach(push);
  PROXY_FIELD_ORDER_TRANSPORT.forEach(push);
  PROXY_FIELD_ORDER_ADVANCED.forEach(push);

  const rest = keys.filter((k) => !seen.has(k) && k !== PROXY_FIELD_CHAIN_LAST);
  rest.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  rest.forEach(push);

  push(PROXY_FIELD_CHAIN_LAST);
  return out;
}

function canonicalizeProxy(node: Record<string, unknown>): Record<string, unknown> {
  const copy = sanitizeMihomoProxyNode(node);
  const type = typeof copy.type === "string" ? copy.type : "";
  if (copy.udp === undefined && UDP_SUPPORTED_TYPES.has(type as KnownNodeType)) {
    copy.udp = true;
  }
  const keys = getOrderedProxyKeys(copy);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (copy[k] !== undefined) out[k] = copy[k];
  }
  return out;
}

function getOrderedMappingKeys(record: Record<string, unknown>, preferredKeys: readonly string[]): string[] {
  const keys = Object.keys(record).filter((k) => record[k] !== undefined && !k.startsWith("_"));
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (key: string) => {
    if (!seen.has(key) && Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined) {
      out.push(key);
      seen.add(key);
    }
  };

  preferredKeys.forEach(push);
  keys
    .filter((key) => !seen.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach(push);
  return out;
}

/**
 * 转义 YAML 双引号字符串中的特殊字符
 * 防止 YAML 注入和配置破坏
 */
function escapeYamlDoubleQuotedString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

/**
 * 将值转为紧凑的内联 YAML 格式
 */
function toInlineYaml(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const shouldQuoteYamlString = (s: string) => {
      if (s === "") return true;
      // 需要引号的情况：包含特殊字符或空格
      // 注意：在 flow style（{...} / [...]）里，`?` 等字符会触发更严格的 YAML 解析器报错（例如 PyYAML / 部分 Clash 客户端）。
      if (/[+":,\[\]{}#&*!|>'%@`?\n]/.test(s) || s.includes(" ")) return true;

      // YAML 的“易被误判为标量类型”的字符串（布尔/空值/数字）
      // 例如：short-id: 7250（若不加引号，Clash 侧 YAML 解析可能会当成数字）
      const lower = s.toLowerCase();
      if (
        lower === "null" ||
        lower === "~" ||
        lower === "true" ||
        lower === "false" ||
        lower === "yes" ||
        lower === "no" ||
        lower === "on" ||
        lower === "off"
      ) {
        return true;
      }

      // 纯数字 / 浮点 / 科学计数等 —— 统一加引号，避免被解析成 number
      if (/^[+-]?\d+$/.test(s)) return true;
      if (/^[+-]?(?:\d*\.\d+|\d+\.\d*)(?:[eE][+-]?\d+)?$/.test(s)) return true;
      if (/^[+-]?\d+[eE][+-]?\d+$/.test(s)) return true;

      return false;
    };

    if (shouldQuoteYamlString(value)) {
      return `"${escapeYamlDoubleQuotedString(value)}"`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return `[${value.map(toInlineYaml).join(", ")}]`;
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        // 统一为 name 字段加双引号：避免不同节点名的输出格式不一致（也降低下游 YAML 解析器差异风险）
        if (k === "name" && typeof v === "string") {
          return `${k}: "${escapeYamlDoubleQuotedString(v)}"`;
        }
        return `${k}: ${toInlineYaml(v)}`;
      });
    return `{${pairs.join(", ")}}`;
  }
  return String(value);
}

function toBlockSequenceScalar(value: string): string {
  const trimmed = value.trim();
  const ambiguous =
    !value ||
    trimmed !== value ||
    /[\r\n#]/.test(value) ||
    /:\s/.test(value) ||
    /^[\-?:,\[\]{}&*!|>'"%@`]/.test(value) ||
    /^(?:null|~|true|false|yes|no|on|off)$/i.test(value) ||
    /^[+-]?(?:\d+|\d*\.\d+|\d+\.\d*)(?:[eE][+-]?\d+)?$/.test(value);
  return ambiguous ? `"${escapeYamlDoubleQuotedString(value)}"` : value;
}

function normalizeDnsPolicyValue(value: unknown): DnsPolicyValue | null {
  if (Array.isArray(value)) {
    const servers = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return servers.length > 0 ? servers : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

export function collectDnsPolicyEntries(policy: unknown): Array<[string, DnsPolicyValue]> {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return [];

  const entries: Array<[string, DnsPolicyValue]> = [];
  for (const [patternRaw, valueRaw] of Object.entries(policy as Record<string, unknown>)) {
    const pattern = patternRaw.trim();
    const value = normalizeDnsPolicyValue(valueRaw);
    if (!pattern || !value) continue;
    entries.push([pattern, value]);
  }

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function appendYamlField(lines: string[], key: string, value: unknown, indent = "") {
  if (value === undefined) return;

  if (!isPlainObject(value)) {
    lines.push(`${indent}${toInlineYaml(key)}: ${toInlineYaml(value)}`);
    return;
  }

  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    lines.push(`${indent}${toInlineYaml(key)}: {}`);
    return;
  }

  lines.push(`${indent}${toInlineYaml(key)}:`);
  for (const [childKey, childValue] of entries) {
    appendYamlField(lines, childKey, childValue, `${indent}  `);
  }
}

function appendListenersSection(lines: string[], listeners: unknown): boolean {
  if (listeners === undefined) return false;

  if (!Array.isArray(listeners)) {
    appendYamlField(lines, "listeners", listeners);
    return true;
  }

  if (listeners.length === 0) {
    lines.push("listeners: []");
    return true;
  }

  lines.push("listeners:");
  for (const listener of listeners) {
    lines.push(`  - ${toInlineYaml(listener)}`);
  }
  return true;
}

const GENERATED_SECTION_KEYS = new Set(["listeners", "proxies", "proxy-groups", "rule-providers", "rules"]);

/**
 * 将配置对象转换为紧凑的 YAML 字符串
 */
export function configToYaml(config: ClashConfig): string {
  const lines: string[] = [];

  // === 基础配置 patch ===
  const baseTopLevelFields = Object.entries(config as unknown as Record<string, unknown>)
    .filter(([key, value]) => value !== undefined && !GENERATED_SECTION_KEYS.has(key));
  for (const [key, value] of baseTopLevelFields) {
    appendYamlField(lines, key, value);
  }
  if (lines.length > 0) lines.push("");

  // === Listeners ===
  if (appendListenersSection(lines, (config as unknown as Record<string, unknown>).listeners)) {
    lines.push("");
  }

  // === 代理节点（每个节点一行内联）===
  lines.push("proxies:");
  if (config.proxies && config.proxies.length > 0) {
    for (const proxy of config.proxies) {
      const orderedProxy = canonicalizeProxy(proxy as unknown as Record<string, unknown>);
      lines.push(`  - ${toInlineYaml(orderedProxy)}`);
    }
  }
  lines.push("");

  // === 代理组（块样式，但 proxies 数组内联）===
  lines.push("proxy-groups:");
  if (config["proxy-groups"]) {
    for (const group of config["proxy-groups"]) {
      const record = group as unknown as Record<string, unknown>;
      const keys = getOrderedMappingKeys(record, PROXY_GROUP_FIELD_ORDER);
      if (keys.length === 0) continue;
      keys.forEach((key, index) => {
        const prefix = index === 0 ? "  - " : "    ";
        lines.push(`${prefix}${toInlineYaml(key)}: ${toInlineYaml(record[key])}`);
      });
    }
  }
  lines.push("");

  // === 规则提供者（每个一行内联）===
  lines.push("rule-providers:");
  if (config["rule-providers"]) {
    for (const [name, provider] of Object.entries(config["rule-providers"])) {
      lines.push(`  ${name}: ${toInlineYaml(provider)}`);
    }
  }
  lines.push("");

  // === 规则（每条一行）===
  lines.push("rules:");
  if (config.rules) {
    for (const rule of config.rules) {
      lines.push(`  - ${toBlockSequenceScalar(rule)}`);
    }
  }

  return lines.join("\n");
}
