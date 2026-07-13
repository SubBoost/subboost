import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import type { CustomProxyGroup, CustomRule } from "@subboost/core/types/config";

export type ProxyGroupRuleTargetKind = "module" | "custom";

export type ProxyGroupRuleTargetOption = {
  kind: ProxyGroupRuleTargetKind;
  id: string;
  name: string;
};

export type CustomRuleListItem = {
  rule: CustomRule;
  index: number;
};

export function listCustomRulesForTarget(
  customRules: CustomRule[],
  targetName: string,
  options?: {
    moduleNames?: Record<string, string>;
    customProxyGroups?: CustomProxyGroup[];
  },
): CustomRuleListItem[] {
  const normalizedTarget = targetName.trim();
  if (!normalizedTarget) return [];

  return customRules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => {
      const target = resolveProxyGroupTargetName(rule.target, {
        moduleNames: options?.moduleNames || {},
        customProxyGroups: options?.customProxyGroups || [],
      });
      return target === normalizedTarget;
    });
}

export function buildManualRuleTargets({
  enabledProxyGroups,
  hiddenProxyGroups,
  customProxyGroups,
  proxyGroupNameOverrides,
}: {
  enabledProxyGroups: string[];
  hiddenProxyGroups?: string[];
  customProxyGroups: CustomProxyGroup[];
  proxyGroupNameOverrides?: Record<string, string>;
}): ProxyGroupRuleTargetOption[] {
  const hidden = new Set(hiddenProxyGroups || []);
  const enabled = new Set(enabledProxyGroups);
  const targets: ProxyGroupRuleTargetOption[] = [];

  for (const proxyModule of PROXY_GROUP_MODULES) {
    if (!enabled.has(proxyModule.id) || hidden.has(proxyModule.id)) continue;
    targets.push({
      kind: "module",
      id: proxyModule.id,
      name: resolveProxyGroupModuleName(proxyModule, proxyGroupNameOverrides?.[proxyModule.id]),
    });
  }

  for (const group of customProxyGroups.filter((item) => item.enabled !== false)) {
    const name = typeof group.name === "string" ? group.name.trim() : "";
    if (!group.id || !name) continue;
    targets.push({ kind: "custom", id: group.id, name });
  }

  return targets;
}
