import type { CustomRule, CustomRuleSet } from "@subboost/core/types/config";

export const CUSTOM_RULE_TYPES = [
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
] as const satisfies readonly CustomRule["type"][];

const customRuleTypeSet = new Set<string>(CUSTOM_RULE_TYPES);

export function isCustomRuleType(value: string): value is CustomRule["type"] {
  return customRuleTypeSet.has(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSlug(value: string): string {
  const parts: string[] = [];
  let pendingDash = false;
  for (const char of value.toLowerCase()) {
    const isAsciiLetterOrDigit = (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAsciiLetterOrDigit) {
      if (pendingDash && parts.length > 0) parts.push("-");
      parts.push(char);
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return parts.length > 0 ? parts.join("") : "item";
}

function customRuleTargetToString(target: CustomRule["target"]): string {
  if (typeof target === "string") return target;
  return `${target.kind}:${target.id}`;
}

function buildDeterministicCustomRuleId(rule: Pick<CustomRule, "type" | "value" | "target">, index: number): string {
  return [
    "custom-rule",
    toSlug(rule.type),
    toSlug(rule.value).slice(0, 24),
    toSlug(customRuleTargetToString(rule.target)).slice(0, 24),
    String(index + 1),
  ].join("-");
}

export function createCustomRuleId(): string {
  return `custom-rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureCustomRuleId(
  rule: Omit<CustomRule, "id"> & Partial<Pick<CustomRule, "id">>,
  index = 0
): CustomRule {
  const id = toTrimmedString(rule.id) || buildDeterministicCustomRuleId(rule, index);
  return {
    ...rule,
    id,
  };
}

export function ensureCustomRulesHaveIds(rules: CustomRule[] | Array<Omit<CustomRule, "id"> & Partial<Pick<CustomRule, "id">>>): CustomRule[] {
  return Array.isArray(rules) ? rules.map((rule, index) => ensureCustomRuleId(rule, index)) : [];
}

export function getCustomRuleOrderKey(ruleId: string): string {
  return `custom-rule:${ruleId}`;
}

export function getCustomRuleSetOrderKey(ruleSetId: string): string {
  return `custom-rule-set:${ruleSetId}`;
}

export function listEditableRuleOrderKeys(customRules: CustomRule[], customRuleSets: CustomRuleSet[] = []): string[] {
  const keys: string[] = [];
  for (const rule of ensureCustomRulesHaveIds(customRules)) {
    keys.push(getCustomRuleOrderKey(rule.id));
  }
  for (const ruleSet of customRuleSets) {
    const ruleSetId = toTrimmedString(ruleSet?.id);
    if (!ruleSetId) continue;
    keys.push(getCustomRuleSetOrderKey(ruleSetId));
  }
  return keys;
}
