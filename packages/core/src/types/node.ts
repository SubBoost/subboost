/**
 * 节点类型定义
 */

export type KnownNodeType =
  | "ss"
  | "ssr"
  | "vmess"
  | "vless"
  | "trojan"
  | "anytls"
  | "hysteria"
  | "hysteria2"
  | "tuic"
  | "wireguard"
  | "snell"
  | "socks5"
  | "socks4"
  | "http"
  | "https"
  | "ssh"
  | "direct"
  | "reject"
  | "dns"
  | "mieru"
  | "masque"
  | "sudoku"
  | "trusttunnel"
  | "relay";

// 支持上游 Clash/Mihomo 新增的代理类型：例如 wireguard / snell / mieru ...
// 通过 “brand string” 避免破坏已建模类型的 discriminated union 推断（type === "vless" 等仍能精确收敛）。
export type UnknownNodeType = string & { readonly __unknownNodeType: "UnknownNodeType" };
export type NodeType = KnownNodeType | UnknownNodeType;

export interface BaseNode {
  name: string;
  type: NodeType;
  server: string;
  port: number;
  // 为保持对上游订阅/YAML 的忠实性：允许携带未显式建模的额外字段（生成时会原样输出）
  [key: string]: unknown;
}

export interface EndpointOptionalNode {
  name: string;
  type: NodeType;
  server?: string;
  port?: number;
  [key: string]: unknown;
}

export interface SSNode extends BaseNode {
  type: "ss";
  cipher: string;
  password: string;
  udp?: boolean;
  "udp-over-tcp"?: boolean;
  "udp-over-tcp-version"?: number;
  tfo?: boolean;
  plugin?: string;
  "plugin-opts"?: Record<string, unknown>;
}

export interface SSRNode extends BaseNode {
  type: "ssr";
  cipher: string;
  password: string;
  protocol: string;
  "protocol-param"?: string;
  obfs: string;
  "obfs-param"?: string;
  udp?: boolean;
}

export interface VMessNode extends BaseNode {
  type: "vmess";
  uuid: string;
  alterId: number;
  cipher: string;
  "packet-encoding"?: string;
  "authenticated-length"?: boolean;
  "global-padding"?: boolean;
  udp?: boolean;
  tls?: boolean;
  "skip-cert-verify"?: boolean;
  servername?: string;
  "client-fingerprint"?: string;
  alpn?: string[];
  network?: "tcp" | "ws" | "h2" | "grpc" | "http";
  "http-opts"?: {
    method?: string;
    path?: string[];
    headers?: Record<string, string[]>;
  };
  "ws-opts"?: {
    path?: string;
    headers?: Record<string, string>;
  };
  "h2-opts"?: {
    host?: string[];
    path?: string;
  };
  "grpc-opts"?: {
    "grpc-service-name"?: string;
  };
}

export interface XHttpDownloadSettings {
  path?: string;
  host?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface XHttpReuseSettings {
  "max-concurrency"?: string;
  "max-connections"?: string;
  "c-max-reuse-times"?: string;
  "h-max-request-times"?: string;
  "h-max-reusable-secs"?: string;
  [key: string]: unknown;
}

export interface XHttpOpts {
  path?: string;
  host?: string;
  mode?: string;
  headers?: Record<string, string>;
  "no-grpc-header"?: boolean;
  "x-padding-bytes"?: string;
  "sc-max-each-post-bytes"?: number;
  "reuse-settings"?: XHttpReuseSettings;
  "download-settings"?: XHttpDownloadSettings;
  [key: string]: unknown;
}

export interface VLESSNode extends BaseNode {
  type: "vless";
  uuid: string;
  udp?: boolean;
  tls?: boolean;
  "skip-cert-verify"?: boolean;
  servername?: string;
  // REALITY/UTLS 指纹（vless reality 必需）
  "client-fingerprint"?: string;
  alpn?: string[];
  encryption?: string;
  "packet-encoding"?: string;
  network?: "tcp" | "ws" | "h2" | "grpc" | "http" | "xhttp";
  flow?: string;
  "http-opts"?: {
    method?: string;
    path?: string[];
    headers?: Record<string, string[]>;
  };
  "ws-opts"?: {
    path?: string;
    headers?: Record<string, string>;
  };
  "h2-opts"?: {
    host?: string[];
    path?: string;
  };
  "grpc-opts"?: {
    "grpc-service-name"?: string;
  };
  "xhttp-opts"?: XHttpOpts;
  "reality-opts"?: {
    "public-key"?: string;
    "short-id"?: string;
    [key: string]: unknown;
  };
}

export interface TrojanNode extends BaseNode {
  type: "trojan";
  password: string;
  udp?: boolean;
  sni?: string;
  "skip-cert-verify"?: boolean;
  alpn?: string[];
  network?: "tcp" | "ws" | "grpc";
  "ws-opts"?: {
    path?: string;
    headers?: Record<string, string>;
  };
  "grpc-opts"?: {
    "grpc-service-name"?: string;
  };
}

export interface AnyTLSNode extends BaseNode {
  type: "anytls";
  password: string;
  udp?: boolean;
  sni?: string;
  alpn?: string[];
  "skip-cert-verify"?: boolean;
  "client-fingerprint"?: string;
  "idle-session-check-interval"?: number;
  "idle-session-timeout"?: number;
  "min-idle-session"?: number;
  "padding-scheme"?: string;
}

export interface HysteriaNode extends BaseNode {
  type: "hysteria";
  protocol?: string;
  "auth-str"?: string;
  sni?: string;
  alpn?: string[];
  "skip-cert-verify"?: boolean;
  up?: string;
  down?: string;
  ports?: string;
  obfs?: string;
  _obfs?: string;
  tfo?: boolean;
}

export interface Hysteria2Node extends BaseNode {
  type: "hysteria2";
  password: string;
  sni?: string;
  "skip-cert-verify"?: boolean;
  alpn?: string[];
  fingerprint?: string;
  obfs?: string;
  "obfs-password"?: string;
  up?: string;
  down?: string;
  ports?: string;
  "hop-interval"?: number | string;
}

export interface TuicNode extends BaseNode {
  type: "tuic";
  uuid?: string;
  password?: string;
  token?: string;
  sni?: string;
  alpn?: string[];
  "congestion-controller"?: string;
  "udp-relay-mode"?: string;
  "request-timeout"?: number;
  "heartbeat-interval"?: number;
  "max-open-streams"?: number;
  "max-idle-time"?: number;
  tfo?: boolean;
  "reduce-rtt"?: boolean;
  "skip-cert-verify"?: boolean;
  "disable-sni"?: boolean;
}

export interface SocksNode extends BaseNode {
  type: "socks5" | "socks4";
  username?: string;
  password?: string;
  udp?: boolean;
  tls?: boolean;
  "skip-cert-verify"?: boolean;
  sni?: string;
}

export interface HttpNode extends BaseNode {
  type: "http" | "https";
  username?: string;
  password?: string;
  tls?: boolean;
  "skip-cert-verify"?: boolean;
  sni?: string;
  headers?: Record<string, string>;
}

export interface SshNode extends BaseNode {
  type: "ssh";
  username?: string;
  password?: string;
  "private-key"?: string;
  "private-key-passphrase"?: string;
  "host-key"?: string[];
}

export interface WireGuardNode extends EndpointOptionalNode {
  type: "wireguard";
  "private-key": string;
  "public-key"?: string;
  "pre-shared-key"?: string;
  ip?: string;
  ipv6?: string;
  mtu?: number;
  keepalive?: number;
  reserved?: number[] | string;
  dns?: string[];
  peers?: Array<Record<string, unknown>>;
  "allowed-ips"?: string[];
  udp?: boolean;
}

export interface SnellNode extends BaseNode {
  type: "snell";
  psk: string;
  version?: number;
  "obfs-opts"?: {
    mode?: "http" | "tls";
    host?: string;
    path?: string;
    [key: string]: unknown;
  };
  udp?: boolean;
  reuse?: boolean;
  tfo?: boolean;
  "shadow-tls-version"?: number;
  "shadow-tls-sni"?: string;
  "shadow-tls-password"?: string;
}

export interface DirectNode extends EndpointOptionalNode {
  type: "direct";
  udp?: boolean;
}

export interface DnsNode extends EndpointOptionalNode {
  type: "dns";
  udp?: boolean;
}

export interface RejectNode extends EndpointOptionalNode {
  type: "reject";
}

export interface MieruNode extends EndpointOptionalNode {
  type: "mieru";
  server: string;
  username?: string;
  password?: string;
  transport?: string;
  "port-range"?: string;
}

export interface TrustTunnelNode extends BaseNode {
  type: "trusttunnel";
  username?: string;
  password?: string;
  sni?: string;
  alpn?: string[];
  "client-fingerprint"?: string;
  "skip-cert-verify"?: boolean;
  "health-check"?: boolean;
  quic?: boolean;
}

export interface MasqueNode extends BaseNode {
  type: "masque";
  username?: string;
  password?: string;
  tls?: boolean;
  "skip-cert-verify"?: boolean;
  sni?: string;
  alpn?: string[];
}

export interface SudokuNode extends BaseNode {
  type: "sudoku";
}

export interface RelayNode extends BaseNode {
  type: "relay";
  proxies: string[];
}

export type ParsedNode =
  | SSNode
  | SSRNode
  | VMessNode
  | VLESSNode
  | TrojanNode
  | AnyTLSNode
  | HysteriaNode
  | Hysteria2Node
  | TuicNode
  | WireGuardNode
  | SnellNode
  | DirectNode
  | DnsNode
  | RejectNode
  | MieruNode
  | MasqueNode
  | SudokuNode
  | TrustTunnelNode
  | SocksNode
  | HttpNode
  | SshNode
  | RelayNode
  | (BaseNode & { type: UnknownNodeType });

export interface ParseResult {
  sourceConfig?: Record<string, unknown>;
  resolvedHosts?: Record<string, string[]>;
  nodes: ParsedNode[];
  errors: string[];
  totalParsed: number;
  totalFailed: number;
}

/**
 * 节点元信息（用于 UI 显示）
 */
export interface NodeMeta {
  region?: string;
  tags?: string[];
  latency?: number;
  isAvailable?: boolean;
}

export type NodeWithMeta = ParsedNode & {
  _meta?: NodeMeta;
};
