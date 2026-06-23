import type { BuiltinRuleEdit, BuiltinRuleEdits, CustomProxyGroup, CustomRuleSet, RuleSetBehavior } from "@subboost/core/types/config";
import { DEFAULT_LOAD_BALANCE_STRATEGY, isLoadBalanceStrategy } from "@subboost/core/types/config";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import { normalizeProxyGroupTargetRef } from "@subboost/core/proxy-group-targets";

export const RULE_SET_PATH_RE = /^(geosite|geoip)\/[^/?#\s]+\.mrs$/i;

export type NormalizedRuleModel = {
  customProxyGroups: CustomProxyGroup[];
  customRuleSets: CustomRuleSet[];
  builtinRuleEdits: BuiltinRuleEdits;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function extractRuleSetPathFromUrl(url: string): string {
  const trimmed = url.trim();
  const match = trimmed.match(/(?:^|\/)(geosite|geoip)\/[^/?#\s]+\.mrs/i);
  if (!match) return trimmed;
  return match[0].replace(/^\/+/, "");
}

export function normalizeRuleSetPathInput(input: string): string {
  return extractRuleSetPathFromUrl(input).replace(/^\/+/, "").trim();
}

export function isValidRuleSetPathOrUrl(value: string): boolean {
  const trimmed = value.trim();
  return RULE_SET_PATH_RE.test(trimmed) || /^https?:\/\//i.test(trimmed);
}

export function buildRuleSetUrlFromPath(path: string, baseUrl: string): string {
  const normalizedPath = normalizeRuleSetPathInput(path);
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${baseUrl.replace(/\/+$/, "")}/${normalizedPath}`;
}

function normalizeBehavior(value: unknown): RuleSetBehavior | null {
  if (value === "domain" || value === "ipcidr") return value;
  return null;
}

function normalizeCustomRuleSet(item: unknown): CustomRuleSet | null {
  if (!isRecord(item)) return null;
  const id = toTrimmedString(item.id);
  const rawPath = toTrimmedString(item.path);
  const path = normalizeRuleSetPathInput(rawPath);
  const target = normalizeProxyGroupTargetRef(item.target) ?? toTrimmedString(item.target);
  const behavior = normalizeBehavior(item.behavior);
  if (!id || !behavior || !path || !target || !isValidRuleSetPathOrUrl(path)) return null;
  const name = toTrimmedString(item.name) || id;
  const noResolve = typeof item.noResolve === "boolean" ? item.noResolve : undefined;
  return {
    id,
    name,
    behavior,
    path,
    target,
    ...(noResolve !== undefined ? { noResolve } : {}),
  };
}

function normalizeBuiltinRuleEdit(item: unknown): BuiltinRuleEdit | null {
  if (!isRecord(item)) return null;
  const target = normalizeProxyGroupTargetRef(item.target) ?? toTrimmedString(item.target);
  const enabled = item.enabled === false ? false : undefined;
  if (!target && enabled !== false) return null;
  return {
    ...(target ? { target } : {}),
    ...(enabled === false ? { enabled: false } : {}),
  };
}

export function normalizeBuiltinRuleEdits(value: unknown): BuiltinRuleEdits {
  if (!isRecord(value)) return {};
  const out: BuiltinRuleEdits = {};
  for (const [rawKey, rawEdit] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key) continue;
    const edit = normalizeBuiltinRuleEdit(rawEdit);
    if (!edit) continue;
    out[key] = edit;
  }
  return out;
}

function normalizeCustomProxyGroups(value: unknown): CustomProxyGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: CustomProxyGroup[] = [];

  for (const rawGroup of value) {
    if (!isRecord(rawGroup)) continue;
    const id = toTrimmedString(rawGroup.id);
    const name = toTrimmedString(rawGroup.name);
    const emoji = toTrimmedString(rawGroup.emoji);
    const enabled = rawGroup.enabled === false ? false : undefined;
    const description = toTrimmedString(rawGroup.description);
    const memberSource = rawGroup.memberSource === "filtered-nodes" ? "filtered-nodes" : undefined;
    const includeInGroupMembers =
      typeof rawGroup.includeInGroupMembers === "boolean" ? rawGroup.includeInGroupMembers : undefined;
    const groupType = toTrimmedString(rawGroup.groupType);
    if (!id || !name) continue;
    if (
      groupType !== "select" &&
      groupType !== "url-test" &&
      groupType !== "fallback" &&
      groupType !== "load-balance" &&
      groupType !== "direct-first" &&
      groupType !== "reject-first"
    ) {
      continue;
    }

    groups.push({
      id,
      name,
      emoji,
      ...(enabled === false ? { enabled: false } : {}),
      ...(description ? { description } : {}),
      ...(memberSource ? { memberSource } : {}),
      ...(includeInGroupMembers !== undefined ? { includeInGroupMembers } : {}),
      groupType,
      ...(groupType === "load-balance"
        ? {
            strategy: isLoadBalanceStrategy(rawGroup.strategy)
              ? rawGroup.strategy
              : DEFAULT_LOAD_BALANCE_STRATEGY,
          }
        : {}),
      advanced: normalizeProxyGroupAdvancedConfig(rawGroup.advanced),
    });
  }

  return groups;
}

function normalizeCustomRuleSets(value: unknown): CustomRuleSet[] {
  if (!Array.isArray(value)) return [];
  const ruleSets: CustomRuleSet[] = [];
  const seen = new Set<string>();

  for (const rawRuleSet of value) {
    const normalized = normalizeCustomRuleSet(rawRuleSet);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    ruleSets.push(normalized);
  }

  return ruleSets;
}

export function normalizeRuleModelFromConfig(value: unknown): NormalizedRuleModel {
  const record = isRecord(value) ? value : {};
  return {
    customProxyGroups: normalizeCustomProxyGroups(record.customProxyGroups),
    customRuleSets: normalizeCustomRuleSets(record.customRuleSets),
    builtinRuleEdits: normalizeBuiltinRuleEdits(record.builtinRuleEdits),
  };
}
