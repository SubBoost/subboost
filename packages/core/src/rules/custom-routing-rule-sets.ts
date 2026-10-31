import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { parseProxyGroupTargetValue, resolveProxyGroupTargetContainer, resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import { createPolicyTargetResolver } from "@subboost/core/generator/policy-targets";
import type { CustomProxyGroup, CustomRuleSet, ProxyGroupRuleTarget } from "@subboost/core/types/config";
import {
  buildRuleSetUrlFromPath,
  extractRuleSetPathFromUrl,
  normalizeRuleSetPathInput,
} from "@subboost/core/rules/rule-model";

type RuleSetTargetDetails = {
  id: string;
  name: string;
  value: string;
};
export type CustomRoutingRuleSetTarget = RuleSetTargetDetails &
  ({ kind: "module" | "custom" } | { kind: "literal" });

export type CustomRoutingRuleSetItem = {
  key: string;
  source: {
    kind: "custom-rule-set";
    id: string;
  };
  id: string;
  rawTarget?: ProxyGroupRuleTarget;
  name: string;
  behavior: CustomRuleSet["behavior"];
  format?: CustomRuleSet["format"];
  path: string;
  target: CustomRoutingRuleSetTarget;
  noResolve?: boolean;
};

export function getRuleSetTargetValue(target: {
  kind: "module" | "custom";
  id: string;
}): string {
  return `${target.kind}:${target.id}`;
}

export function parseRuleSetTargetValue(
  value: string,
): { kind: "module" | "custom"; id: string } | null {
  return parseProxyGroupTargetValue(value);
}

export { buildRuleSetUrlFromPath, extractRuleSetPathFromUrl, normalizeRuleSetPathInput };

function resolveRuleSetTarget(
  targetValue: ProxyGroupRuleTarget,
  customProxyGroups: CustomProxyGroup[],
  proxyGroupNameOverrides?: Record<string, string>,
  literalTargetNames?: readonly string[],
  enabledModules?: string[],
  availablePolicyTargets?: string[],
  fallbackPolicyTarget?: string,
): CustomRoutingRuleSetTarget | null {
  const moduleNames = Object.fromEntries(PROXY_GROUP_MODULES.map((module) => [
      module.id, resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
    ]));
  const targetOptions = { moduleNames, customProxyGroups, literalTargetNames, enabledModules, availablePolicyTargets };
  const targetRef = resolveProxyGroupTargetContainer(targetValue, targetOptions);
  if (targetRef?.kind === "module") {
    const proxyModule = PROXY_GROUP_MODULES.find((module) => module.id === targetRef.id);
    if (!proxyModule) return null;
    const name = resolveProxyGroupModuleName(proxyModule, proxyGroupNameOverrides?.[proxyModule.id]);
    return {
      kind: "module",
      id: proxyModule.id,
      name,
      value: getRuleSetTargetValue({ kind: "module", id: proxyModule.id }),
    };
  }
  if (targetRef?.kind === "custom") {
    const group = customProxyGroups.find((item) => item.id === targetRef.id);
    if (!group) return null;
    const name = group.name.trim();
    if (!name) return null;
    return {
      kind: "custom",
      id: group.id,
      name,
      value: getRuleSetTargetValue({ kind: "custom", id: group.id }),
    };
  }

  const name = resolveProxyGroupTargetName(targetValue, { ...targetOptions, fallbackTarget: fallbackPolicyTarget });
  if (!availablePolicyTargets && !["DIRECT", "REJECT"].includes(name)) return null;
  const resolved = createPolicyTargetResolver({ availablePolicyTargets, fallbackPolicyTarget })(name);
  return resolved ? { kind: "literal", id: resolved, name: resolved, value: `literal:${resolved}` } : null;
}

export function collectCustomRoutingRuleSets({
  customRuleSets,
  customProxyGroups,
  proxyGroupNameOverrides,
  literalTargetNames,
  enabledModules,
  availablePolicyTargets,
  fallbackPolicyTarget,
}: {
  customRuleSets: CustomRuleSet[];
  customProxyGroups: CustomProxyGroup[];
  proxyGroupNameOverrides?: Record<string, string>;
  literalTargetNames?: readonly string[];
  enabledModules?: string[];
  availablePolicyTargets?: string[];
  fallbackPolicyTarget?: string;
}): CustomRoutingRuleSetItem[] {
  const items: CustomRoutingRuleSetItem[] = [];

  for (const rule of customRuleSets || []) {
    if (!rule || !rule.id || !rule.path) continue;
    const target = resolveRuleSetTarget(
      rule.target,
      customProxyGroups,
      proxyGroupNameOverrides,
      literalTargetNames,
      enabledModules,
      availablePolicyTargets,
      fallbackPolicyTarget,
    );
    if (!target) continue;
    items.push({
      key: `custom-rule-set:${rule.id}`,
      source: { kind: "custom-rule-set", id: rule.id },
      id: rule.id,
      rawTarget: rule.target,
      name: rule.name || rule.id,
      behavior: rule.behavior,
      ...(rule.format !== undefined ? { format: rule.format } : {}),
      path: normalizeRuleSetPathInput(rule.path),
      target,
      noResolve: Boolean(rule.noResolve),
    });
  }

  return items;
}
