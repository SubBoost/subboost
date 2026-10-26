// Mihomo v1.19.33 rules/parser.go and rules/common/base.go.
const processHint = "需要客户端与系统支持进程识别，且未关闭进程查找。";
const geoHint = "需要客户端已安装对应的地理数据文件。";
const regexHint = "使用 Mihomo 正则语法，复杂表达式请在目标客户端校验。";

export const CUSTOM_RULE_DEFINITIONS = {
  DOMAIN: { label: "域名", example: "local.subboost.test" },
  "DOMAIN-SUFFIX": { label: "域名后缀", example: "subboost.test" },
  "DOMAIN-KEYWORD": { label: "域名关键词", example: "subboost" },
  "DOMAIN-WILDCARD": { label: "域名通配符", example: "*.subboost.test" },
  "DOMAIN-REGEX": { label: "域名正则", example: "^local\\d{1,3}\\.subboost\\.test$", commaPayload: true, hint: regexHint },
  GEOSITE: { label: "GeoSite", example: "cn", hint: geoHint },
  "IP-CIDR": { label: "IP 段", example: "203.0.113.0/24", noResolve: true, sourceType: "SRC-IP-CIDR" },
  "IP-CIDR6": { label: "IPv6 段", example: "::1/128", noResolve: true, sourceType: "SRC-IP-CIDR", hint: "IP-CIDR 的别名；两者都支持 IPv4 和 IPv6。" },
  "IP-SUFFIX": { label: "IP 后缀", example: "203.0.113.1/24", noResolve: true, sourceType: "SRC-IP-SUFFIX" },
  "IP-ASN": { label: "目标 ASN", example: "64512", noResolve: true, sourceType: "SRC-IP-ASN", hint: geoHint },
  GEOIP: { label: "GeoIP", example: "cn", noResolve: true, sourceType: "SRC-GEOIP", hint: geoHint },
  "SRC-GEOIP": { label: "来源 GeoIP", example: "cn", hint: geoHint },
  "SRC-IP-ASN": { label: "来源 ASN", example: "64512", hint: geoHint },
  "SRC-IP-CIDR": { label: "来源 IP 段", shortLabel: "源 IP 段", example: "203.0.113.0/24" },
  "SRC-IP-SUFFIX": { label: "来源 IP 后缀", shortLabel: "源 IP 后缀", example: "203.0.113.1/24" },
  "DST-PORT": { label: "目标端口", example: "80/443/8000-9000" },
  "SRC-PORT": { label: "源端口", example: "30000-39999" },
  "IN-PORT": { label: "入站端口", example: "7890", hint: "匹配客户端实际接收连接的监听端口。" },
  "IN-TYPE": { label: "入站类型", example: "SOCKS/HTTP" },
  "IN-USER": { label: "入站用户", example: "user1/user2", hint: "需要入站连接提供已认证的用户名。" },
  "IN-NAME": { label: "入站名称", example: "mixed-in", hint: "需要配置同名的 listeners 入站。" },
  "REMATCH-NAME": { label: "重匹配名称", example: "rematch1", hint: "需要对应的 rematch 出站写入该名称。" },
  "PROCESS-NAME": { label: "进程名", example: "curl", hint: processHint },
  "PROCESS-PATH": { label: "进程路径", example: "/usr/bin/curl", hint: processHint },
  "PROCESS-NAME-WILDCARD": { label: "进程名通配符", shortLabel: "进程通配符", example: "*curl*", hint: processHint },
  "PROCESS-PATH-WILDCARD": { label: "进程路径通配符", shortLabel: "路径通配符", example: "/usr/*/curl", hint: processHint },
  "PROCESS-NAME-REGEX": { label: "进程名正则", example: "(?i)curl$", hint: processHint + regexHint, commaPayload: true },
  "PROCESS-PATH-REGEX": { label: "进程路径正则", shortLabel: "路径正则", example: "(?i).*[/\\\\]curl$", hint: processHint + regexHint, commaPayload: true },
  UID: { label: "用户 UID", example: "1000-1002", hint: "仅支持 Linux / Android，需要客户端能识别连接所属用户。" },
  NETWORK: { label: "网络协议", example: "tcp" },
  DSCP: { label: "DSCP 标记", example: "4/8-12", hint: "仅在支持 DSCP 的 tproxy UDP 入站生效，范围为 0–63。" },
  AND: { label: "AND (与)", example: "((PROCESS-NAME,curl),(NETWORK,UDP))", commaPayload: true, hint: "子条件用括号包裹；RULE-SET 子条件需引用已配置的 provider。" },
  OR: { label: "OR (或)", example: "((DOMAIN,local.subboost.test),(NETWORK,UDP))", commaPayload: true },
  NOT: { label: "NOT (非)", example: "((DOMAIN,local.subboost.test))", commaPayload: true },
} as const;

export type CustomRuleType = keyof typeof CUSTOM_RULE_DEFINITIONS;
export const CUSTOM_RULE_TYPES = Object.keys(CUSTOM_RULE_DEFINITIONS) as CustomRuleType[];
export function isCustomRuleType(value: string): value is CustomRuleType {
  return Object.hasOwn(CUSTOM_RULE_DEFINITIONS, value);
}
export function supportsNoResolve(type: string): boolean {
  return type === "RULE-SET" || (isCustomRuleType(type) && "noResolve" in CUSTOM_RULE_DEFINITIONS[type]);
}
export function hasCommaPayload(type: string): boolean {
  return isCustomRuleType(type) && "commaPayload" in CUSTOM_RULE_DEFINITIONS[type];
}
export function getSourceIpRuleType(type: string): CustomRuleType | undefined {
  const definition = isCustomRuleType(type) ? CUSTOM_RULE_DEFINITIONS[type] : undefined;
  if (definition && "sourceType" in definition) {
    return definition.sourceType;
  }
}
export function getCustomRuleDefinition(type: CustomRuleType): {
  label: string; shortLabel?: string; example: string; hint?: string;
} {
  return CUSTOM_RULE_DEFINITIONS[type];
}
