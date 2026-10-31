import type { ProxyGroupModule } from "@subboost/core/generator/proxy-groups";
import type { EffectiveModuleRuleSource, HiddenPresetRuleIds } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetContainer, resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import type { BuiltinRuleEdits, CustomProxyGroup, CustomRuleSet } from "@subboost/core/types/config";
import type { RuleSetDraft } from "@subboost/ui/store/config-store";

export function buildTargetRuleView(options: {
  modules: ProxyGroupModule[];
  enabledModules: string[];
  customProxyGroups: CustomProxyGroup[];
  customRuleSets: CustomRuleSet[];
  builtinRuleEdits: BuiltinRuleEdits;
  proxyGroupNameOverrides: Record<string, string>;
  cnIpNoResolve: boolean;
  literalTargetNames: string[];
  availablePolicyTargets?: string[];
}) {
  const { modules, customProxyGroups, customRuleSets, builtinRuleEdits, proxyGroupNameOverrides, cnIpNoResolve } = options;
  const ruleSetsByTarget: Record<string, RuleSetDraft[]> = {};
  const hiddenPresetRuleIds: HiddenPresetRuleIds = {};
  const moduleNames = Object.fromEntries(modules.map((module) => [module.id, resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id])]));
  const targetOptions = { moduleNames, customProxyGroups, enabledModules: options.enabledModules,
    literalTargetNames: options.literalTargetNames, availablePolicyTargets: options.availablePolicyTargets };
  const add = (id: string, rule: RuleSetDraft & { source?: EffectiveModuleRuleSource }) => {
    ruleSetsByTarget[id] = [...(ruleSetsByTarget[id] || []), rule];
  };
  const hide = (id: string, ruleId: string) => {
    const previous = hiddenPresetRuleIds[id] || [];
    if (!previous.includes(ruleId)) hiddenPresetRuleIds[id] = [...previous, ruleId];
  };
  for (const ruleSet of customRuleSets) {
    const target = resolveProxyGroupTargetContainer(ruleSet.target, targetOptions);
    if (target?.kind !== "module") continue;
    const { target: _target, ...rule } = ruleSet;
    add(target.id, rule);
  }
  for (const [key, edit] of Object.entries(builtinRuleEdits || {})) {
    const match = key.match(/^module:([^:]+):(.+)$/);
    if (!match) continue;
    const [, sourceId, ruleId] = match;
    const source = modules.find((module) => module.id === sourceId);
    const rule = source?.rules?.find((item) => item.id === ruleId);
    if (!source || !rule) continue;
    if (edit.enabled === false) { hide(sourceId, ruleId); continue; }
    if (!edit.target) continue;
    const target = resolveProxyGroupTargetContainer(edit.target, targetOptions);
    const defaultName = moduleNames[sourceId];
    const targetName = resolveProxyGroupTargetName(edit.target, { ...targetOptions, fallbackTarget: defaultName });
    const moved = target ? target.kind !== "module" || target.id !== sourceId : targetName !== defaultName;
    if (!moved) continue;
    hide(sourceId, ruleId);
    const targetKey = target ? (target.kind === "custom" ? `custom:${target.id}` : target.id) : `literal:${targetName}`;
    add(targetKey, { ...rule, source: "preset", noResolve: sourceId === "cn" && ruleId === "cn-ip"
      ? cnIpNoResolve : rule.noResolve });
  }
  return { ruleSetsByTarget, hiddenPresetRuleIds };
}
