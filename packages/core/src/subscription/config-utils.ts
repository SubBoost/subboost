import type { GenerateOptions } from "@subboost/core/generator";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import type { DialerProxyGroup } from "@subboost/core/types/template-config";
import type { ParsedNode } from "@subboost/core/types/node";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  isLoadBalanceStrategy,
  isProxyGroupGroupType,
  type CustomProxyGroup,
  type CustomRule,
  type ProxyGroupRuleTarget,
  type TemplateType,
  type UserConfig,
} from "@subboost/core/types/config";
import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import { buildProxyProvidersFromConfig } from "@subboost/core/subscription/proxy-providers";
import { ensureCustomRuleId } from "@subboost/core/rules/custom-rule-utils";
import { DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import { normalizeRuleModelFromConfig } from "@subboost/core/rules/rule-model";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import { normalizeProxyGroupTargetRef } from "@subboost/core/proxy-group-targets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const str = toTrimmedString(item);
    if (str) out.push(str);
  }
  return out;
}

function normalizeRuleTarget(value: unknown): ProxyGroupRuleTarget | null {
  const ref = normalizeProxyGroupTargetRef(value);
  if (ref) return ref;
  return toTrimmedString(value);
}

function normalizeTemplate(value: unknown, fallback: TemplateType = "standard"): TemplateType {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return fallback;
}

function normalizeNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function normalizePort(value: unknown): number | undefined {
  const n = normalizeNonNegativeInt(value);
  if (n === null) return undefined;
  if (n < 1 || n > 65535) return undefined;
  return n;
}

function normalizeCustomRules(value: unknown): CustomRule[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const allowedTypes = new Set<CustomRule["type"]>([
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "IP-CIDR",
    "IP-CIDR6",
    "GEOIP",
    "GEOSITE",
    "PROCESS-NAME",
    "DST-PORT",
    "SRC-PORT",
  ]);

  const out: CustomRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) continue;
    const type = item.type;
    if (typeof type !== "string" || !allowedTypes.has(type as CustomRule["type"])) continue;

    const ruleValue = toTrimmedString(item.value);
    const target = normalizeRuleTarget(item.target);
    if (!ruleValue || !target) continue;

    const noResolve = typeof item.noResolve === "boolean" ? item.noResolve : undefined;
    out.push(ensureCustomRuleId({
      id: toTrimmedString(item.id) || undefined,
      type: type as CustomRule["type"],
      value: ruleValue,
      target,
      ...(noResolve !== undefined ? { noResolve } : {}),
    }, index));
  }

  return out.length > 0 ? out : undefined;
}

function normalizeProxyGroupNameOverrides(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    const key = typeof k === "string" ? k.trim() : "";
    const val = toTrimmedString(v);
    if (!key || !val) continue;
    out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeListenerPorts(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    const name = typeof k === "string" ? k.trim() : "";
    const port = normalizePort(v);
    if (!name || port === undefined) continue;
    out[name] = port;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeEnabledList(value: unknown): string[] | undefined {
  const list = normalizeStringArray(value);
  return list.length > 0 ? list : undefined;
}

function normalizeDialerProxyGroups(value: unknown): DialerProxyGroup[] {
  if (!Array.isArray(value)) return [];

  const out: DialerProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = toTrimmedString(item.id);
    const name = toTrimmedString(item.name);
    const type = isProxyGroupGroupType(item.type) ? item.type : null;
    if (!id || !name || !type) continue;
    const strategy = isLoadBalanceStrategy(item.strategy) ? item.strategy : undefined;

    const enabled = typeof item.enabled === "boolean" ? item.enabled : undefined;
    const relayNodes = normalizeStringArray(item.relayNodes);
    const targetNodes = normalizeStringArray(item.targetNodes);

    out.push({
      id,
      name,
      type,
      ...(type === "load-balance" ? { strategy: strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY } : {}),
      relayNodes,
      targetNodes,
      ...(enabled !== undefined ? { enabled } : {}),
    });
  }
  return out;
}

function normalizeCustomProxyGroups(value: unknown): CustomProxyGroup[] {
  if (!Array.isArray(value)) return [];

  const out: CustomProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = toTrimmedString(item.id);
    const name = toTrimmedString(item.name);
    const emoji = toTrimmedString(item.emoji) ?? "";
    const groupType =
      item.groupType === "select" ||
      item.groupType === "url-test" ||
      item.groupType === "fallback" ||
      item.groupType === "load-balance" ||
      item.groupType === "direct-first" ||
      item.groupType === "reject-first"
        ? item.groupType
        : null;

    if (!id || !name || !groupType) continue;

    const strategy =
      groupType === "load-balance"
        ? isLoadBalanceStrategy(item.strategy)
          ? item.strategy
          : DEFAULT_LOAD_BALANCE_STRATEGY
        : undefined;

    const enabled = item.enabled === false ? false : undefined;
    const description = toTrimmedString(item.description);
    const memberSource = item.memberSource === "filtered-nodes" ? "filtered-nodes" : undefined;
    const includeInGroupMembers =
      typeof item.includeInGroupMembers === "boolean" ? item.includeInGroupMembers : undefined;
    const advanced = normalizeProxyGroupAdvancedConfig(item.advanced);
    out.push({
      id,
      name,
      emoji,
      ...(enabled === false ? { enabled: false } : {}),
      ...(description ? { description } : {}),
      ...(memberSource ? { memberSource } : {}),
      ...(includeInGroupMembers !== undefined ? { includeInGroupMembers } : {}),
      groupType,
      ...(strategy ? { strategy } : {}),
      ...(Object.keys(advanced).length > 0 ? { advanced } : {}),
    });
  }
  return out;
}

function normalizeProxyGroupOrder(value: unknown): string[] | undefined {
  const list = normalizeStringArray(value);
  return list.length > 0 ? list : undefined;
}

export function getEffectiveTestOptions(config: Record<string, unknown>): { testUrl: string; testInterval: number } {
  const testUrl =
    typeof config.testUrl === "string" && config.testUrl.trim().startsWith("http")
      ? config.testUrl.trim()
      : DEFAULT_SUBBOOST_CONFIG.testUrl;

  const rawInterval = normalizeNonNegativeInt(config.testInterval);
  const testInterval = rawInterval === null ? DEFAULT_SUBBOOST_CONFIG.testInterval : rawInterval;

  return { testUrl, testInterval };
}

export function buildGenerateOptionsFromConfig(
  rawConfig: Record<string, unknown>,
  opts: {
    nodes: ParsedNode[];
    proxyProviders?: Record<string, unknown>;
  }
): GenerateOptions {
  const config = rawConfig;
  const { testUrl, testInterval } = getEffectiveTestOptions(config);
  const proxyProviders =
    opts.proxyProviders ?? buildProxyProvidersFromConfig(config, { testUrl, testInterval });

  const template = normalizeTemplate(config.template, "standard");

  const enabledGroups = normalizeEnabledList(config.enabledGroups);
  const enabledRules = normalizeEnabledList(config.enabledRules);
  const customRules = normalizeCustomRules(config.customRules);
  const ruleModel = normalizeRuleModelFromConfig(config);
  const customProxyGroups = ruleModel.customProxyGroups.length > 0
    ? ruleModel.customProxyGroups
    : normalizeCustomProxyGroups(config.customProxyGroups);
  const customRuleSets = ruleModel.customRuleSets;
  const builtinRuleEdits = ruleModel.builtinRuleEdits;
  const dnsYaml = typeof config.dnsYaml === "string" ? config.dnsYaml : undefined;
  const ruleProviderBaseUrl =
    typeof config.ruleProviderBaseUrl === "string" && config.ruleProviderBaseUrl.trim().startsWith("http")
      ? config.ruleProviderBaseUrl.trim()
      : undefined;
  const autoSelectStrategy =
    config.autoSelectStrategy === "url-test" ||
    config.autoSelectStrategy === "fallback" ||
    config.autoSelectStrategy === "load-balance"
      ? (config.autoSelectStrategy as UserConfig["autoSelectStrategy"])
      : undefined;
  const cnIpNoResolve = typeof config.cnIpNoResolve === "boolean" ? config.cnIpNoResolve : undefined;
  const experimentalCnUseCnRuleSet =
    typeof config.experimentalCnUseCnRuleSet === "boolean" ? config.experimentalCnUseCnRuleSet : undefined;
  const proxyGroupNameOverrides = normalizeProxyGroupNameOverrides(config.proxyGroupNameOverrides);
  const listenerPorts = normalizeListenerPorts(config.listenerPorts);
  const ruleOrder = normalizePersistedRuleOrder({
    enabledModules: enabledGroups || [],
    customProxyGroups,
    customRules: customRules || [],
    customRuleSets,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet,
    cnIpNoResolve,
    ruleOrder: normalizeProxyGroupOrder(config.ruleOrder),
  });

  const userConfig: Partial<UserConfig> = {
    ...(enabledGroups ? { enabledGroups } : {}),
    ...(enabledRules ? { enabledRules } : {}),
    ...(customRules ? { customRules } : {}),
    ...(ruleOrder.length > 0 ? { ruleOrder } : {}),
    ...(dnsYaml !== undefined ? { dnsYaml } : {}),
    ...(ruleProviderBaseUrl ? { ruleProviderBaseUrl } : {}),
    ...(listenerPorts ? { listenerPorts } : {}),
    ...(autoSelectStrategy ? { autoSelectStrategy } : {}),
    testUrl,
    testInterval,
    ...(cnIpNoResolve !== undefined ? { cnIpNoResolve } : {}),
    ...(experimentalCnUseCnRuleSet !== undefined ? { experimentalCnUseCnRuleSet } : {}),
    ...(normalizePort(config.mixedPort) !== undefined ? { mixedPort: normalizePort(config.mixedPort) as number } : {}),
    ...(typeof config.allowLan === "boolean" ? { allowLan: config.allowLan } : {}),
  };

  const dialerProxyGroups = normalizeDialerProxyGroups(config.dialerProxyGroups);
  const proxyGroupOrder = normalizeProxyGroupOrder(config.proxyGroupOrder);
  const sanitizedNodes = stripImportedNodeControlFieldsFromList(opts.nodes);
  const proxyGroupAdvanced = isRecord(config.proxyGroupAdvanced)
    ? Object.fromEntries(
        Object.entries(config.proxyGroupAdvanced)
          .map(([id, value]) => [id.trim(), normalizeProxyGroupAdvancedConfig(value)] as const)
          .filter(([id, advanced]) => id && Object.keys(advanced).length > 0),
      )
    : undefined;

  return {
    nodes: sanitizedNodes,
    ...(proxyProviders ? { proxyProviders } : {}),
    template,
    userConfig,
    ...(dialerProxyGroups.length > 0 ? { dialerProxyGroups } : {}),
    ...(customProxyGroups.length > 0 ? { customProxyGroups } : {}),
    ...(customRuleSets.length > 0 ? { customRuleSets } : {}),
    ...(proxyGroupAdvanced && Object.keys(proxyGroupAdvanced).length > 0 ? { proxyGroupAdvanced } : {}),
    ...(Object.keys(builtinRuleEdits).length > 0 ? { builtinRuleEdits } : {}),
    ...(proxyGroupNameOverrides ? { proxyGroupNameOverrides } : {}),
    ...(proxyGroupOrder ? { proxyGroupOrder } : {}),
  };
}
