import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { ensureCustomRuleId, isCustomRuleType } from "@subboost/core/rules/custom-rule-utils";
import { resolveProxyGroupAdvancedModeEnabled } from "@subboost/core/proxy-group-advanced-mode";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import {
  isValidRuleSetPathOrUrl,
  normalizeRuleModelFromConfig,
  normalizeRuleSetPathInput,
} from "@subboost/core/rules/rule-model";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  isProxyGroupGroupType,
  isLoadBalanceStrategy,
  type CustomProxyGroup,
  type CustomRule,
  type LoadBalanceStrategy,
  type ProxyGroupGroupType,
  type TemplateType,
} from "@subboost/core/types/config";
import type { DialerProxyGroup, SubBoostTemplateConfig } from "@subboost/core/types/template-config";

export const SUBBOOST_TEMPLATE_CONFIG_SCHEMA = "subboost-template-config/v1";

type ValidationResult =
  | { ok: true; config: SubBoostTemplateConfig }
  | { ok: false; error: string };

const BUILTIN_MODULE_IDS = new Set(PROXY_GROUP_MODULES.map((module) => module.id));
const BUILTIN_RULE_KEYS = new Set(
  PROXY_GROUP_MODULES.flatMap((module) => module.rules.map((rule) => `module:${module.id}:${rule.id}`))
);
const REMOVED_TEMPLATE_FIELDS = new Set([
  "moduleRuleOverrides",
  "moduleRuleExclusions",
  "allRulesOrderEditingEnabled",
  "filteredProxyGroups",
]);

export function validateSubBoostTemplateConfig(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("模板配置必须是对象");
  if (value.schema !== SUBBOOST_TEMPLATE_CONFIG_SCHEMA) {
    return invalid("模板配置 schema 无效");
  }
  const removedField = findRemovedTemplateField(value);
  if (removedField) return invalid(`模板配置包含已移除字段: ${removedField}`);

  const template = parseTemplateType(value.template);
  if (!template) return invalid("模板类型无效");

  const enabledProxyGroups = parseModuleIdArray(value.enabledProxyGroups, "enabledProxyGroups", { required: true });
  if (!enabledProxyGroups.ok) return enabledProxyGroups;
  if (enabledProxyGroups.value.length === 0) return invalid("至少需要一个代理组");

  const hiddenProxyGroups = parseModuleIdArray(value.hiddenProxyGroups, "hiddenProxyGroups", { required: false });
  if (!hiddenProxyGroups.ok) return hiddenProxyGroups;
  const hiddenSet = new Set(hiddenProxyGroups.value);
  if (enabledProxyGroups.value.every((id) => hiddenSet.has(id))) {
    return invalid("至少需要一个可见代理组");
  }

  const customProxyGroups = parseCustomProxyGroups(value.customProxyGroups);
  if (!customProxyGroups.ok) return customProxyGroups;
  const proxyGroupAdvanced = parseProxyGroupAdvanced(value.proxyGroupAdvanced);
  if (!proxyGroupAdvanced.ok) return proxyGroupAdvanced;
  const proxyGroupAdvancedModeEnabled = parseOptionalBoolean(
    value.proxyGroupAdvancedModeEnabled,
    "proxyGroupAdvancedModeEnabled"
  );
  if (!proxyGroupAdvancedModeEnabled.ok) return proxyGroupAdvancedModeEnabled;
  const customRuleSets = parseCustomRuleSets(value.customRuleSets);
  if (!customRuleSets.ok) return customRuleSets;
  const builtinRuleEdits = parseBuiltinRuleEdits(value.builtinRuleEdits);
  if (!builtinRuleEdits.ok) return builtinRuleEdits;
  const ruleModel = normalizeRuleModelFromConfig(value);
  const customRules = parseCustomRules(value.customRules);
  if (!customRules.ok) return customRules;
  const dialerProxyGroups = parseDialerProxyGroups(value.dialerProxyGroups);
  if (!dialerProxyGroups.ok) return dialerProxyGroups;
  const proxyGroupNameOverrides = parseStringRecord(value.proxyGroupNameOverrides, "proxyGroupNameOverrides");
  if (!proxyGroupNameOverrides.ok) return proxyGroupNameOverrides;
  const ruleOrder = parseOptionalStringArray(value.ruleOrder, "ruleOrder");
  if (!ruleOrder.ok) return ruleOrder;

  const dnsYaml = parseRequiredString(value.dnsYaml, "dnsYaml", { allowEmpty: true });
  if (!dnsYaml.ok) return dnsYaml;
  const mixedPort = parsePort(value.mixedPort, "mixedPort");
  if (!mixedPort.ok) return mixedPort;
  const allowLan = parseBoolean(value.allowLan, "allowLan");
  if (!allowLan.ok) return allowLan;
  const testUrl = parseHttpUrlString(value.testUrl, "testUrl");
  if (!testUrl.ok) return testUrl;
  const testInterval = parsePositiveInteger(value.testInterval, "testInterval");
  if (!testInterval.ok) return testInterval;
  const ruleProviderBaseUrl = parseHttpUrlString(value.ruleProviderBaseUrl, "ruleProviderBaseUrl");
  if (!ruleProviderBaseUrl.ok) return ruleProviderBaseUrl;
  const cnIpNoResolve = parseOptionalBoolean(value.cnIpNoResolve, "cnIpNoResolve");
  if (!cnIpNoResolve.ok) return cnIpNoResolve;
  const experimentalCnUseCnRuleSet = parseOptionalBoolean(
    value.experimentalCnUseCnRuleSet,
    "experimentalCnUseCnRuleSet"
  );
  if (!experimentalCnUseCnRuleSet.ok) return experimentalCnUseCnRuleSet;

  const normalizedRuleOrder = normalizePersistedRuleOrder({
    enabledModules: enabledProxyGroups.value.filter((id) => !hiddenSet.has(id)),
    customRules: customRules.value,
    customRuleSets: ruleModel.customRuleSets,
    builtinRuleEdits: ruleModel.builtinRuleEdits,
    proxyGroupNameOverrides: proxyGroupNameOverrides.value,
    experimentalCnUseCnRuleSet: experimentalCnUseCnRuleSet.value,
    cnIpNoResolve: cnIpNoResolve.value,
    ruleOrder: ruleOrder.value,
  });

  return {
    ok: true,
    config: {
      schema: SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
      template,
      enabledProxyGroups: enabledProxyGroups.value,
      hiddenProxyGroups: hiddenProxyGroups.value,
      customProxyGroups: customProxyGroups.value,
      proxyGroupAdvanced: proxyGroupAdvanced.value,
      proxyGroupAdvancedModeEnabled: resolveProxyGroupAdvancedModeEnabled({
        proxyGroupAdvancedModeEnabled: proxyGroupAdvancedModeEnabled.value,
        customProxyGroups: customProxyGroups.value,
        proxyGroupAdvanced: proxyGroupAdvanced.value,
      }),
      customRuleSets: ruleModel.customRuleSets,
      builtinRuleEdits: ruleModel.builtinRuleEdits,
      customRules: customRules.value,
      ruleOrder: normalizedRuleOrder,
      ...(cnIpNoResolve.value !== undefined ? { cnIpNoResolve: cnIpNoResolve.value } : {}),
      ...(experimentalCnUseCnRuleSet.value !== undefined
        ? { experimentalCnUseCnRuleSet: experimentalCnUseCnRuleSet.value }
        : {}),
      dialerProxyGroups: dialerProxyGroups.value,
      proxyGroupNameOverrides: proxyGroupNameOverrides.value,
      dnsYaml: dnsYaml.value,
      mixedPort: mixedPort.value,
      allowLan: allowLan.value,
      testUrl: testUrl.value,
      testInterval: testInterval.value,
      ruleProviderBaseUrl: ruleProviderBaseUrl.value,
    },
  };
}

function invalid(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findRemovedTemplateField(value: Record<string, unknown>): string | null {
  for (const field of REMOVED_TEMPLATE_FIELDS) {
    if (field in value) return field;
  }

  if (!Array.isArray(value.customProxyGroups)) return null;
  for (let index = 0; index < value.customProxyGroups.length; index += 1) {
    const group = value.customProxyGroups[index];
    if (isRecord(group) && "rules" in group) return `customProxyGroups[${index}].rules`;
  }

  return null;
}

function parseTemplateType(value: unknown): TemplateType | null {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return null;
}

function parseRequiredString(
  value: unknown,
  field: string,
  opts: { allowEmpty?: boolean } = {}
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return invalid(`${field} 必须是字符串`);
  const trimmed = value.trim();
  if (!opts.allowEmpty && !trimmed) return invalid(`${field} 不能为空`);
  return { ok: true, value: opts.allowEmpty ? value : trimmed };
}

function parseBoolean(value: unknown, field: string): { ok: true; value: boolean } | { ok: false; error: string } {
  if (typeof value !== "boolean") return invalid(`${field} 必须是布尔值`);
  return { ok: true, value };
}

function parseOptionalBoolean(
  value: unknown,
  field: string
): { ok: true; value?: boolean } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "boolean") return invalid(`${field} 必须是布尔值`);
  return { ok: true, value };
}

function parsePositiveInteger(
  value: unknown,
  field: string
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return invalid(`${field} 必须是正整数`);
  }
  return { ok: true, value };
}

function parsePort(value: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parsePositiveInteger(value, field);
  if (!parsed.ok) return parsed;
  if (parsed.value > 65535) return invalid(`${field} 必须在 1 到 65535 之间`);
  return parsed;
}

function parseHttpUrlString(
  value: unknown,
  field: string
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = parseRequiredString(value, field);
  if (!parsed.ok) return parsed;
  if (!/^https?:\/\//i.test(parsed.value)) return invalid(`${field} 必须是 http(s) URL`);
  return parsed;
}

function parseOptionalStringArray(
  value: unknown,
  field: string
): { ok: true; value?: string[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  const parsed = parseStringArray(value, field);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

function parseStringArray(value: unknown, field: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid(`${field} 必须是数组`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return invalid(`${field} 只能包含字符串`);
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return { ok: true, value: out };
}

function parseModuleIdArray(
  value: unknown,
  field: string,
  opts: { required: boolean }
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined && !opts.required) return { ok: true, value: [] };
  const parsed = parseStringArray(value, field);
  if (!parsed.ok) return parsed;
  for (const id of parsed.value) {
    if (!BUILTIN_MODULE_IDS.has(id)) return invalid(`${field} 包含未知代理组`);
  }
  return parsed;
}

function parseStringRecord(
  value: unknown,
  field: string
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return invalid(`${field} 必须是对象`);
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") return invalid(`${field} 的值必须是字符串`);
    const trimmedKey = key.trim();
    const trimmedValue = rawValue.trim();
    if (trimmedKey && trimmedValue) out[trimmedKey] = trimmedValue;
  }
  return { ok: true, value: out };
}

function parseCustomRules(value: unknown): { ok: true; value: CustomRule[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("customRules 必须是数组");
  const out: CustomRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) return invalid("customRules 只能包含对象");
    if (typeof item.type !== "string" || !isCustomRuleType(item.type)) return invalid("customRules 包含无效类型");
    const ruleValue = parseRequiredString(item.value, "customRules.value");
    if (!ruleValue.ok) return ruleValue;
    const target = parseRequiredString(item.target, "customRules.target");
    if (!target.ok) return target;
    const noResolve = parseOptionalBoolean(item.noResolve, "customRules.noResolve");
    if (!noResolve.ok) return noResolve;
    out.push(
      ensureCustomRuleId(
        {
          id: typeof item.id === "string" ? item.id : undefined,
          type: item.type,
          value: ruleValue.value,
          target: target.value,
          ...(noResolve.value !== undefined ? { noResolve: noResolve.value } : {}),
        },
        index
      )
    );
  }
  return { ok: true, value: out };
}

function parseCustomProxyGroups(value: unknown): { ok: true; value: CustomProxyGroup[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("customProxyGroups 必须是数组");
  const out: CustomProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) return invalid("customProxyGroups 只能包含对象");
    const id = parseRequiredString(item.id, "customProxyGroups.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "customProxyGroups.name");
    if (!name.ok) return name;
    const emoji = parseRequiredString(item.emoji, "customProxyGroups.emoji", { allowEmpty: true });
    if (!emoji.ok) return emoji;
    const groupType = parseProxyGroupType(item.groupType, "customProxyGroups.groupType");
    if (!groupType.ok) return groupType;
    const strategy = parseOptionalLoadBalanceStrategy(item.strategy, "customProxyGroups.strategy");
    if (!strategy.ok) return strategy;
    if (item.memberSource !== undefined && item.memberSource !== "filtered-nodes") {
      return invalid("customProxyGroups.memberSource 无效");
    }
    if (item.includeInGroupMembers !== undefined && typeof item.includeInGroupMembers !== "boolean") {
      return invalid("customProxyGroups.includeInGroupMembers 必须是布尔值");
    }
    const description = typeof item.description === "string" ? item.description.trim() : "";
    out.push({
      id: id.value,
      name: name.value,
      emoji: emoji.value,
      ...(description ? { description } : {}),
      ...(item.memberSource === "filtered-nodes" ? { memberSource: "filtered-nodes" as const } : {}),
      ...(typeof item.includeInGroupMembers === "boolean"
        ? { includeInGroupMembers: item.includeInGroupMembers }
        : {}),
      groupType: groupType.value,
      ...(groupType.value === "load-balance"
        ? { strategy: strategy.value ?? DEFAULT_LOAD_BALANCE_STRATEGY }
        : {}),
      advanced: normalizeProxyGroupAdvancedConfig(item.advanced),
    });
  }
  return { ok: true, value: out };
}

function parseProxyGroupAdvanced(
  value: unknown
): { ok: true; value: NonNullable<SubBoostTemplateConfig["proxyGroupAdvanced"]> } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return invalid("proxyGroupAdvanced 必须是对象");
  const out: NonNullable<SubBoostTemplateConfig["proxyGroupAdvanced"]> = {};
  for (const [moduleId, rawConfig] of Object.entries(value)) {
    const id = moduleId.trim();
    if (!BUILTIN_MODULE_IDS.has(id)) return invalid("proxyGroupAdvanced 包含未知代理组");
    out[id] = normalizeProxyGroupAdvancedConfig(rawConfig);
  }
  return { ok: true, value: out };
}

function parseCustomRuleSets(value: unknown): { ok: true; value: true } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: true };
  if (!Array.isArray(value)) return invalid("customRuleSets 必须是数组");
  for (const item of value) {
    if (!isRecord(item)) return invalid("customRuleSets 只能包含对象");
    const id = parseRequiredString(item.id, "customRuleSets.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "customRuleSets.name");
    if (!name.ok) return name;
    if (item.behavior !== "domain" && item.behavior !== "ipcidr") return invalid("customRuleSets.behavior 无效");
    const path = parseRequiredString(item.path, "customRuleSets.path");
    if (!path.ok) return path;
    const normalizedPath = normalizeRuleSetPathInput(path.value);
    if (!isValidRuleSetPathOrUrl(normalizedPath)) return invalid("customRuleSets.path 无效");
    const target = parseRequiredString(item.target, "customRuleSets.target");
    if (!target.ok) return target;
    const noResolve = parseOptionalBoolean(item.noResolve, "customRuleSets.noResolve");
    if (!noResolve.ok) return noResolve;
  }
  return { ok: true, value: true };
}

function parseBuiltinRuleEdits(value: unknown): { ok: true; value: true } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: true };
  if (!isRecord(value)) return invalid("builtinRuleEdits 必须是对象");
  for (const [rawKey, rawEdit] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!BUILTIN_RULE_KEYS.has(key)) return invalid("builtinRuleEdits 包含未知内置规则");
    if (!isRecord(rawEdit)) return invalid("builtinRuleEdits 的值必须是对象");
    if ("target" in rawEdit && typeof rawEdit.target !== "string") {
      return invalid("builtinRuleEdits.target 必须是字符串");
    }
    if ("enabled" in rawEdit && rawEdit.enabled !== false) {
      return invalid("builtinRuleEdits.enabled 只能是 false");
    }
  }
  return { ok: true, value: true };
}

function parseDialerProxyGroups(value: unknown): { ok: true; value: DialerProxyGroup[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return invalid("dialerProxyGroups 必须是数组");
  const out: DialerProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) return invalid("dialerProxyGroups 只能包含对象");
    const id = parseRequiredString(item.id, "dialerProxyGroups.id");
    if (!id.ok) return id;
    const name = parseRequiredString(item.name, "dialerProxyGroups.name");
    if (!name.ok) return name;
    const groupType = parseProxyGroupType(item.type, "dialerProxyGroups.type");
    if (!groupType.ok) return groupType;
    const strategy = parseOptionalLoadBalanceStrategy(item.strategy, "dialerProxyGroups.strategy");
    if (!strategy.ok) return strategy;
    const relayNodes = parseStringArray(item.relayNodes, "dialerProxyGroups.relayNodes");
    if (!relayNodes.ok) return relayNodes;
    const targetNodes = parseStringArray(item.targetNodes, "dialerProxyGroups.targetNodes");
    if (!targetNodes.ok) return targetNodes;
    const enabled = parseOptionalBoolean(item.enabled, "dialerProxyGroups.enabled");
    if (!enabled.ok) return enabled;
    out.push({
      id: id.value,
      name: name.value,
      type: groupType.value,
      ...(groupType.value === "load-balance"
        ? { strategy: strategy.value ?? DEFAULT_LOAD_BALANCE_STRATEGY }
        : {}),
      relayNodes: relayNodes.value,
      targetNodes: targetNodes.value,
      ...(enabled.value !== undefined ? { enabled: enabled.value } : {}),
    });
  }
  return { ok: true, value: out };
}

function parseProxyGroupType(
  value: unknown,
  field: string
): { ok: true; value: ProxyGroupGroupType } | { ok: false; error: string } {
  if (isProxyGroupGroupType(value)) {
    return { ok: true, value };
  }
  return invalid(`${field} 无效`);
}

function parseOptionalLoadBalanceStrategy(
  value: unknown,
  field: string
): { ok: true; value?: LoadBalanceStrategy } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isLoadBalanceStrategy(value)) return invalid(`${field} 无效`);
  return { ok: true, value };
}
