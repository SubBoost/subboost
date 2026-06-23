/**
 * Clash 配置类型定义
 */

import type { ParsedNode } from "./node";

export const LOAD_BALANCE_STRATEGIES = ["consistent-hashing", "round-robin", "sticky-sessions"] as const;
export type LoadBalanceStrategy = (typeof LOAD_BALANCE_STRATEGIES)[number];
export const DEFAULT_LOAD_BALANCE_STRATEGY: LoadBalanceStrategy = "consistent-hashing";

export function isLoadBalanceStrategy(value: unknown): value is LoadBalanceStrategy {
  return typeof value === "string" && (LOAD_BALANCE_STRATEGIES as readonly string[]).includes(value);
}

export interface ProxyGroup {
  name: string;
  type: string;
  proxies?: string[];
  use?: string[];
  url?: string;
  interval?: number;
  lazy?: boolean;
  "include-all"?: boolean;
  "include-all-proxies"?: boolean;
  "include-all-providers"?: boolean;
  tolerance?: number;
  strategy?: LoadBalanceStrategy;
  filter?: string;
  "exclude-filter"?: string;
  "exclude-type"?: string;
  "expected-status"?: string;
  hidden?: boolean;
  icon?: string;
  "max-failed-times"?: number;
  timeout?: number;
  "disable-udp"?: boolean;
  "interface-name"?: string;
  "routing-mark"?: number;
  [key: string]: unknown;
}

export interface RuleProvider {
  type: string;
  behavior: string;
  url?: string;
  path?: string;
  interval?: number;
  format?: string;
  [key: string]: unknown;
}

export interface DNSConfig {
  enable?: boolean;
  "cache-algorithm"?: string;
  "prefer-h3"?: boolean;
  "respect-rules"?: boolean;
  listen?: string;
  ipv6?: boolean;
  "enhanced-mode"?: "fake-ip" | "redir-host";
  "fake-ip-range"?: string;
  "fake-ip-range6"?: string;
  "use-hosts"?: boolean;
  "use-system-hosts"?: boolean;
  "default-nameserver"?: string[];
  nameserver?: string[];
  "nameserver-policy"?: Record<string, string[] | string>;
  "proxy-server-nameserver"?: string[];
  "direct-nameserver"?: string[];
  "direct-nameserver-follow-policy"?: boolean;
  fallback?: string[];
  "fallback-direct"?: boolean;
  "fallback-filter"?: {
    geoip?: boolean;
    "geoip-code"?: string;
    geosite?: string[];
    ipcidr?: string[];
    domain?: string[];
    [key: string]: unknown;
  };
  "fake-ip-filter-mode"?: string;
  "fake-ip-filter"?: string[];
  "fake-ip-ttl"?: number;
  [key: string]: unknown;
}

export interface ListenerConfig {
  name: string;
  type: string;
  port: number;
  proxy?: string;
  listen?: string;
  udp?: boolean;
  users?: Array<{ username: string; password: string }>;
  rule?: string;
  [key: string]: unknown;
}

export interface SnifferConfig {
  enable?: boolean;
  "parse-pure-ip"?: boolean;
  sniff?: Record<string, { ports?: (number | string)[]; "override-destination"?: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface ProfileConfig {
  "store-selected"?: boolean;
  "store-fake-ip"?: boolean;
  [key: string]: unknown;
}

export interface GeodataConfig {
  mode?: boolean;
  "auto-update"?: boolean;
  loader?: string;
  "update-interval"?: number;
  [key: string]: unknown;
}

export interface GeoxUrlConfig {
  geoip?: string;
  geosite?: string;
  mmdb?: string;
  asn?: string;
  [key: string]: unknown;
}

export interface ClashConfig {
  "mixed-port"?: number;
  port?: number;
  "socks-port"?: number;
  "allow-lan"?: boolean;
  mode?: string;
  "log-level"?: string;
  "unified-delay"?: boolean;
  "tcp-concurrent"?: boolean;
  "find-process-mode"?: string;
  ipv6?: boolean;
  
  dns?: DNSConfig;
  
  proxies?: ParsedNode[];
  "proxy-providers"?: Record<string, unknown>;
  "proxy-groups"?: ProxyGroup[];
  "rule-providers"?: Record<string, RuleProvider>;
  rules?: string[];
  listeners?: ListenerConfig[];
  
  sniffer?: SnifferConfig;
  
  profile?: ProfileConfig;
  
  geodata?: GeodataConfig;
  
  "geox-url"?: GeoxUrlConfig;
  [key: string]: unknown;
}

/**
 * 用户配置选项
 */
export interface UserConfig {
  // 代理组设置
  enabledGroups: string[];
  autoSelectStrategy: "url-test" | "fallback" | "load-balance";
  testUrl: string;
  testInterval: number;
  
  // 规则设置
  ruleProviderBaseUrl: string;
  enabledRules: string[];
  customRules: CustomRule[];
  ruleOrder?: string[];
  // 国内服务 GeoIP 规则是否使用 no-resolve（默认 true；关闭可提升命中率但可能造成 DNS 泄露）
  cnIpNoResolve?: boolean;
  // 实验性：为“国内服务”额外启用 cn（geosite/cn.mrs），并将其规则后置（放到 global 之后）
  experimentalCnUseCnRuleSet?: boolean;
  
  // DNS 设置 (YAML 文本)
  dnsYaml: string;
  
  // 其他
  mixedPort: number;
  allowLan: boolean;

  // 为指定节点生成 listeners（key=节点名，value=端口）
  listenerPorts?: Record<string, number>;
}

export interface CustomRule {
  id: string;
  type: "DOMAIN" | "DOMAIN-SUFFIX" | "DOMAIN-KEYWORD" | "IP-CIDR" | "IP-CIDR6" | "GEOIP" | "GEOSITE" | "PROCESS-NAME" | "DST-PORT" | "SRC-PORT";
  value: string;
  target: ProxyGroupRuleTarget;
  noResolve?: boolean;
}

export type RuleSetBehavior = "domain" | "ipcidr";

export type NodeRegion =
  | "us"
  | "hk"
  | "jp"
  | "sg"
  | "tw"
  | "kr"
  | "uk"
  | "de"
  | "fr"
  | "ca"
  | "au"
  | "other";

export type ProxyGroupTargetRef =
  | { kind: "module"; id: string }
  | { kind: "custom"; id: string };

export type ProxyGroupRuleTarget = ProxyGroupTargetRef | string;

export type ProxyGroupMemberRef =
  | { kind: "node"; name: string }
  | { kind: "module"; id: string }
  | { kind: "custom"; id: string }
  | { kind: "direct" }
  | { kind: "reject" };

export const PROXY_GROUP_GROUP_TYPES = [
  "select",
  "url-test",
  "fallback",
  "load-balance",
  "direct-first",
  "reject-first",
] as const;

export type ProxyGroupGroupType = (typeof PROXY_GROUP_GROUP_TYPES)[number];

export function isProxyGroupGroupType(value: unknown): value is ProxyGroupGroupType {
  return typeof value === "string" && (PROXY_GROUP_GROUP_TYPES as readonly string[]).includes(value);
}

export interface ProxyGroupAdvancedConfig {
  sourceIds?: string[];
  regions?: NodeRegion[];
  includeRegex?: string;
  excludeRegex?: string;
  groupType?: ProxyGroupGroupType;
  strategy?: LoadBalanceStrategy;
  extraMembers?: ProxyGroupMemberRef[];
  excludedMembers?: ProxyGroupMemberRef[];
  memberOrder?: ProxyGroupMemberRef[];
}

export interface CustomRuleSet {
  id: string;
  name: string;
  behavior: RuleSetBehavior;
  path: string;
  target: ProxyGroupRuleTarget;
  noResolve?: boolean;
}

export type BuiltinRuleEdit = {
  target?: ProxyGroupRuleTarget;
  enabled?: false;
};

export type BuiltinRuleEdits = Record<string, BuiltinRuleEdit>;

/**
 * 自定义代理组
 */
export interface CustomProxyGroup {
  id: string;
  name: string;
  emoji: string;
  enabled?: boolean;
  description?: string;
  memberSource?: "filtered-nodes";
  includeInGroupMembers?: boolean;
  groupType: ProxyGroupGroupType;
  strategy?: LoadBalanceStrategy;
  advanced?: ProxyGroupAdvancedConfig;
}

/**
 * 预设模板类型
 */
export type TemplateType = "minimal" | "standard" | "full";

export interface TemplateConfig {
  id: TemplateType;
  name: string;
  description: string;
  groups: string[];
  rules: string[];
  dns: Partial<DNSConfig>;
}
