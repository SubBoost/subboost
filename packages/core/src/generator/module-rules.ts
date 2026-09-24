import type { ProxyGroupModule, ProxyGroupRule } from "./proxy-group-modules";

export type HiddenPresetRuleIds = Record<string, string[]>;

export type EffectiveModuleRuleSource = "preset" | "custom";

export type EffectiveModuleRule = ProxyGroupRule & {
  source: EffectiveModuleRuleSource;
};

type RuleIdLike = { id?: unknown };

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeHiddenPresetRuleIds(value: unknown): HiddenPresetRuleIds {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: HiddenPresetRuleIds = {};
  for (const [moduleIdRaw, ruleIdsRaw] of Object.entries(value as Record<string, unknown>)) {
    const moduleId = normalizeString(moduleIdRaw);
    if (!moduleId || !Array.isArray(ruleIdsRaw)) continue;

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of ruleIdsRaw) {
      const id = normalizeString(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length > 0) out[moduleId] = ids;
  }

  return out;
}

export function getExcludedModuleRuleIds(
  moduleId: string,
  hiddenPresetRuleIds?: HiddenPresetRuleIds
): Set<string> {
  const id = normalizeString(moduleId);
  if (!id) return new Set();
  return new Set((hiddenPresetRuleIds?.[id] || []).map(normalizeString).filter(Boolean));
}

export function getModuleRuleOrderKey(moduleId: string, ruleId: string): string {
  return `module:${moduleId}:${ruleId}`;
}

export function isPresetModuleRule(module: ProxyGroupModule, ruleId: string): boolean {
  const id = normalizeString(ruleId);
  if (!id) return false;
  return module.rules.some((rule) => rule.id === id);
}

export function isModuleRuleMovedFrom(
  moduleId: string,
  ruleId: string,
  ruleSetsByTarget?: Record<string, RuleIdLike[]>
): boolean {
  const sourceId = normalizeString(moduleId);
  const id = normalizeString(ruleId);
  if (!sourceId || !id) return false;

  for (const [targetModuleIdRaw, rules] of Object.entries(ruleSetsByTarget || {})) {
    const targetModuleId = normalizeString(targetModuleIdRaw);
    if (!targetModuleId || targetModuleId === sourceId || !Array.isArray(rules)) continue;
    if (rules.some((rule) => normalizeString(rule?.id) === id)) return true;
  }

  return false;
}

export function getModuleRuleById(
  module: ProxyGroupModule,
  ruleId: string,
  ruleSetsByTarget?: Record<string, ProxyGroupRule[]>
): ProxyGroupRule | null {
  const id = normalizeString(ruleId);
  if (!id) return null;

  const preset = module.rules.find((rule) => rule.id === id);
  if (preset) return preset;

  const extra = Array.isArray(ruleSetsByTarget?.[module.id]) ? ruleSetsByTarget?.[module.id] || [] : [];
  return extra.find((rule) => rule.id === id) || null;
}

export function getEffectiveModuleRuleItems(
  module: ProxyGroupModule,
  ruleSetsByTarget?: Record<string, (ProxyGroupRule & { source?: EffectiveModuleRuleSource })[]>,
  hiddenPresetRuleIds?: HiddenPresetRuleIds
): EffectiveModuleRule[] {
  const excluded = getExcludedModuleRuleIds(module.id, hiddenPresetRuleIds);
  const seen = new Set<string>();
  const out: EffectiveModuleRule[] = [];

  for (const rule of module.rules) {
    if (!rule?.id || excluded.has(rule.id) || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({ ...rule, source: "preset" });
  }

  const extraRules = Array.isArray(ruleSetsByTarget?.[module.id]) ? ruleSetsByTarget?.[module.id] || [] : [];
  for (const rule of extraRules) {
    if (!rule?.id || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({ ...rule, source: rule.source ?? "custom" });
  }

  return out;
}

export function getEffectiveModuleRules(
  module: ProxyGroupModule,
  ruleSetsByTarget?: Record<string, ProxyGroupRule[]>,
  hiddenPresetRuleIds?: HiddenPresetRuleIds
): ProxyGroupRule[] {
  return getEffectiveModuleRuleItems(module, ruleSetsByTarget, hiddenPresetRuleIds).map(({ source: _source, ...rule }) => rule);
}
