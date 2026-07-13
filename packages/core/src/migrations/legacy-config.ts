import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-group-modules";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import { normalizeProxyGroupTargetRef } from "@subboost/core/proxy-group-targets";
import {
  isValidRuleSetPathOrUrl,
  normalizeRuleSetPathInput,
} from "@subboost/core/rules/rule-model";
import type {
  CustomRuleSet,
  ProxyGroupAdvancedConfig,
  ProxyGroupRuleTarget,
  RuleSetBehavior,
} from "@subboost/core/types/config";

type MutableRecord = Record<string, unknown>;

const LEGACY_GROUP_TYPES = new Set([
  "select",
  "url-test",
  "fallback",
  "load-balance",
  "direct-first",
  "reject-first",
]);
const BUILTIN_MODULE_IDS = new Set(PROXY_GROUP_MODULES.map((module) => module.id));
const BUILTIN_RULE_SOURCE_BY_ID = new Map(
  PROXY_GROUP_MODULES.flatMap((module) => module.rules.map((rule) => [rule.id, module.id] as const))
);

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: MutableRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = stringValue(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function makeUniqueValue(base: string, used: Set<string>, fallback: string): string {
  const normalized = base.trim() || fallback;
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  let index = 2;
  let candidate = `${normalized}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${normalized}-${index}`;
  }
  used.add(candidate);
  return candidate;
}

function makeUniqueName(base: string, used: Set<string>): string {
  const normalized = base.trim() || "自定义代理组";
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  let index = 2;
  let candidate = `${normalized} (${index})`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${normalized} (${index})`;
  }
  used.add(candidate);
  return candidate;
}

function migrateFilteredAdvanced(group: MutableRecord): ProxyGroupAdvancedConfig {
  return normalizeProxyGroupAdvancedConfig({
    sourceIds: uniqueStringArray(group.sourceIds),
    regions: uniqueStringArray(group.regions),
    includeRegex: stringValue(group.includeRegex),
    excludeRegex: stringValue(group.excludeRegex),
    excludedMembers: uniqueStringArray(group.excludedNodeNames).map((name) => ({
      kind: "node" as const,
      name,
    })),
  });
}

function retargetRuleTarget(
  value: unknown,
  nameMap: Map<string, { id: string; name: string }>,
  idMap: Map<string, { id: string; name: string }>
): unknown {
  const ref = normalizeProxyGroupTargetRef(value);
  if (ref?.kind === "custom" && idMap.has(ref.id)) {
    return { kind: "custom" as const, id: idMap.get(ref.id)!.id };
  }
  const text = stringValue(value);
  const migrated = text ? nameMap.get(text) : undefined;
  return migrated ? { kind: "custom" as const, id: migrated.id } : value;
}

function retargetStringArray(value: unknown, nameMap: Map<string, { id: string; name: string }>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (typeof item !== "string") return item;
    return nameMap.get(item.trim())?.name ?? item;
  });
}

function migrateFilteredProxyGroups(record: MutableRecord): MutableRecord {
  if (!hasOwn(record, "filteredProxyGroups")) return record;

  const next = { ...record };
  const existingCustomGroups = Array.isArray(next.customProxyGroups) ? [...next.customProxyGroups] : [];
  const validExistingGroups = existingCustomGroups.filter(isRecord);
  const usedIds = new Set(validExistingGroups.map((group) => stringValue(group.id)).filter(Boolean));
  const usedNames = new Set(validExistingGroups.map((group) => stringValue(group.name)).filter(Boolean));
  const nameMap = new Map<string, { id: string; name: string }>();
  const idMap = new Map<string, { id: string; name: string }>();
  const migratedGroups: MutableRecord[] = [];

  if (Array.isArray(record.filteredProxyGroups)) {
    for (const rawGroup of record.filteredProxyGroups) {
      if (!isRecord(rawGroup) || rawGroup.enabled === false) continue;
      const oldId = stringValue(rawGroup.id);
      const oldName = stringValue(rawGroup.name);
      if (!oldId || !oldName) continue;

      const id = makeUniqueValue(`migrated-filtered-${oldId}`, usedIds, "migrated-filtered-group");
      const name = makeUniqueName(oldName, usedNames);
      const mapped = { id, name };
      idMap.set(oldId, mapped);
      nameMap.set(oldName, mapped);

      const rawGroupType = stringValue(rawGroup.groupType) || "select";
      const groupType = LEGACY_GROUP_TYPES.has(rawGroupType) ? rawGroupType : "select";
      migratedGroups.push({
        id,
        name,
        emoji: stringValue(rawGroup.emoji),
        description: "自定义代理组",
        memberSource: "filtered-nodes",
        groupType,
        ...(groupType === "load-balance" && stringValue(rawGroup.strategy)
          ? { strategy: stringValue(rawGroup.strategy) }
          : {}),
        advanced: migrateFilteredAdvanced(rawGroup),
      });
    }
  }

  next.customProxyGroups = [...existingCustomGroups, ...migratedGroups];
  if (migratedGroups.length > 0) next.proxyGroupAdvancedModeEnabled = true;
  delete next.filteredProxyGroups;

  if (Array.isArray(next.customRules)) {
    next.customRules = next.customRules.map((rule) =>
      isRecord(rule) && hasOwn(rule, "target")
        ? { ...rule, target: retargetRuleTarget(rule.target, nameMap, idMap) }
        : rule
    );
  }
  if (Array.isArray(next.customRuleSets)) {
    next.customRuleSets = next.customRuleSets.map((ruleSet) =>
      isRecord(ruleSet) && hasOwn(ruleSet, "target")
        ? { ...ruleSet, target: retargetRuleTarget(ruleSet.target, nameMap, idMap) }
        : ruleSet
    );
  }
  if (isRecord(next.builtinRuleEdits)) {
    next.builtinRuleEdits = Object.fromEntries(
      Object.entries(next.builtinRuleEdits).map(([key, edit]) => [
        key,
        isRecord(edit) && hasOwn(edit, "target")
          ? { ...edit, target: retargetRuleTarget(edit.target, nameMap, idMap) }
          : edit,
      ])
    );
  }
  if (Array.isArray(next.dialerProxyGroups)) {
    next.dialerProxyGroups = next.dialerProxyGroups.map((group) =>
      isRecord(group) && hasOwn(group, "relayNodes")
        ? { ...group, relayNodes: retargetStringArray(group.relayNodes, nameMap) }
        : group
    );
  }
  if (Array.isArray(next.proxyGroupOrder)) {
    next.proxyGroupOrder = next.proxyGroupOrder.map((key) => {
      const text = stringValue(key);
      if (!text.startsWith("filtered:")) return key;
      const mapped = idMap.get(text.slice("filtered:".length));
      return mapped ? `custom:${mapped.id}` : key;
    });
  }

  return next;
}

type LegacyRuleProvider = Omit<CustomRuleSet, "target"> & { legacyIndex: number };

function normalizeBehavior(value: unknown, path: string): RuleSetBehavior | null {
  if (value === "domain" || value === "ipcidr") return value;
  if (path.toLowerCase().startsWith("geoip/")) return "ipcidr";
  if (path.toLowerCase().startsWith("geosite/")) return "domain";
  return null;
}

function parseLegacyRuleProvider(
  value: unknown,
  legacyIndex: number,
  pathFields: string[] = ["path"]
): LegacyRuleProvider | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  let rawPath = "";
  for (const field of pathFields) {
    rawPath = stringValue(value[field]);
    if (rawPath) break;
  }
  const path = normalizeRuleSetPathInput(rawPath);
  const behavior = normalizeBehavior(value.behavior, path);
  if (!id || !behavior || !path || !isValidRuleSetPathOrUrl(path)) return null;
  const noResolve = typeof value.noResolve === "boolean" ? value.noResolve : behavior === "ipcidr";
  return {
    id,
    name: stringValue(value.name) || id,
    behavior,
    path,
    ...(noResolve ? { noResolve: true } : {}),
    legacyIndex,
  };
}

function parseLegacyOverrides(value: unknown): Record<string, LegacyRuleProvider[]> {
  if (!isRecord(value)) return {};
  const out: Record<string, LegacyRuleProvider[]> = {};
  for (const [rawModuleId, rawRules] of Object.entries(value)) {
    const moduleId = rawModuleId.trim();
    if (!moduleId || !Array.isArray(rawRules)) continue;
    const rules = rawRules
      .map((rule, index) => parseLegacyRuleProvider(rule, index))
      .filter((rule): rule is LegacyRuleProvider => Boolean(rule));
    if (rules.length > 0) out[moduleId] = rules;
  }
  return out;
}

function moduleRuleKey(moduleId: string, ruleId: string): string {
  return `module:${moduleId}:${ruleId}`;
}

function targetForModule(moduleId: string, config: MutableRecord): ProxyGroupRuleTarget {
  if (BUILTIN_MODULE_IDS.has(moduleId)) return { kind: "module", id: moduleId };
  const overrides = isRecord(config.proxyGroupNameOverrides) ? config.proxyGroupNameOverrides : {};
  return stringValue(overrides[moduleId]) || moduleId;
}

function addUniqueRuleSet(ruleSets: unknown[], ruleSet: CustomRuleSet): string {
  const existing = new Set(
    ruleSets.filter(isRecord).map((item) => stringValue(item.id)).filter(Boolean)
  );
  const id = makeUniqueValue(ruleSet.id, existing, "migrated-rule-set");
  ruleSets.push(id === ruleSet.id ? ruleSet : { ...ruleSet, id });
  return id;
}

function migrateLegacyRuleFields(record: MutableRecord): MutableRecord {
  const groupsHaveLegacyRules = Array.isArray(record.customProxyGroups)
    && record.customProxyGroups.some((group) => isRecord(group) && hasOwn(group, "rules"));
  const customRulesHaveRuleSet = Array.isArray(record.customRules)
    && record.customRules.some((rule) => isRecord(rule) && rule.type === "RULE-SET");
  const hasLegacyFields = hasOwn(record, "moduleRuleOverrides")
    || hasOwn(record, "moduleRuleExclusions")
    || hasOwn(record, "allRulesOrderEditingEnabled")
    || groupsHaveLegacyRules
    || customRulesHaveRuleSet;
  if (!hasLegacyFields) return record;

  const next = { ...record };
  const ruleSets = Array.isArray(record.customRuleSets) ? [...record.customRuleSets] : [];
  const edits: MutableRecord = isRecord(record.builtinRuleEdits) ? { ...record.builtinRuleEdits } : {};
  const orderMoves = new Map<string, string | null>();

  if (Array.isArray(record.customRules)) {
    const rules: unknown[] = [];
    record.customRules.forEach((rule, index) => {
      if (!isRecord(rule) || rule.type !== "RULE-SET") {
        rules.push(rule);
        return;
      }
      const parsed = parseLegacyRuleProvider(rule, index, ["value", "path"]);
      const target = normalizeProxyGroupTargetRef(rule.target) ?? stringValue(rule.target);
      if (!parsed || !target) {
        rules.push(rule);
        return;
      }
      const { legacyIndex: _legacyIndex, ...provider } = parsed;
      const id = addUniqueRuleSet(ruleSets, { ...provider, target });
      orderMoves.set(`custom-rule:${parsed.id}`, `custom-rule-set:${id}`);
    });
    next.customRules = rules;
  }

  if (Array.isArray(record.customProxyGroups)) {
    next.customProxyGroups = record.customProxyGroups.map((group) => {
      if (!isRecord(group) || !hasOwn(group, "rules")) return group;
      const { rules, ...rest } = group;
      const target = stringValue(group.id)
        ? { kind: "custom" as const, id: stringValue(group.id) }
        : stringValue(group.name);
      if (Array.isArray(rules) && target) {
        rules.forEach((rule, index) => {
          const parsed = parseLegacyRuleProvider(rule, index, ["path", "url"]);
          if (!parsed) return;
          const { legacyIndex: _legacyIndex, ...provider } = parsed;
          const id = addUniqueRuleSet(ruleSets, { ...provider, target });
          orderMoves.set(`custom-group:${stringValue(group.id)}:${parsed.id}`, `custom-rule-set:${id}`);
        });
      }
      return rest;
    });
  }

  const overrides = parseLegacyOverrides(record.moduleRuleOverrides);
  const consumedOverrides = new Set<string>();
  if (isRecord(record.moduleRuleExclusions)) {
    for (const [rawSourceId, rawRuleIds] of Object.entries(record.moduleRuleExclusions)) {
      const sourceId = rawSourceId.trim();
      if (!sourceId || !Array.isArray(rawRuleIds)) continue;
      for (const ruleId of uniqueStringArray(rawRuleIds)) {
        const canonicalSourceId = BUILTIN_RULE_SOURCE_BY_ID.get(ruleId) ?? sourceId;
        const key = moduleRuleKey(canonicalSourceId, ruleId);
        let legacyEdit: MutableRecord = { enabled: false };
        for (const [targetModuleId, rules] of Object.entries(overrides)) {
          const moved = rules.find((rule) => rule.id === ruleId);
          if (!moved) continue;
          legacyEdit = { target: targetForModule(targetModuleId, record) };
          consumedOverrides.add(`${targetModuleId}:${moved.legacyIndex}`);
          break;
        }
        edits[key] = isRecord(edits[key]) ? { ...legacyEdit, ...edits[key] } : legacyEdit;
      }
    }
  }

  for (const [targetModuleId, rules] of Object.entries(overrides)) {
    const target = targetForModule(targetModuleId, record);
    for (const rule of rules) {
      if (consumedOverrides.has(`${targetModuleId}:${rule.legacyIndex}`)) continue;
      const sourceId = BUILTIN_RULE_SOURCE_BY_ID.get(rule.id);
      if (sourceId === targetModuleId) continue;
      const { legacyIndex: _legacyIndex, ...provider } = rule;
      const id = addUniqueRuleSet(ruleSets, { ...provider, target });
      orderMoves.set(moduleRuleKey(targetModuleId, rule.id), `custom-rule-set:${id}`);
    }
  }

  if (Array.isArray(record.ruleOrder)) {
    next.ruleOrder = record.ruleOrder.flatMap((item) => {
      if (typeof item !== "string") return [];
      if (orderMoves.has(item)) {
        const moved = orderMoves.get(item);
        return moved ? [moved] : [];
      }
      return item.startsWith("custom-group:") ? [] : [item];
    });
  }

  delete next.moduleRuleOverrides;
  delete next.moduleRuleExclusions;
  delete next.allRulesOrderEditingEnabled;
  next.customRuleSets = ruleSets;
  next.builtinRuleEdits = edits;
  return next;
}

/**
 * Converts accepted pre-v3 configuration fields at trust-boundary entry points.
 * Runtime state and newly persisted data must only use the current rule model.
 */
export function migrateLegacyConfig<T>(config: T): T {
  if (!isRecord(config)) return config;
  return migrateLegacyRuleFields(migrateFilteredProxyGroups(config)) as T;
}
