import type { BuiltinRuleEdits, CustomProxyGroup, ProxyGroupRuleTarget } from "@subboost/core/types/config";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { normalizeProxyGroupRuleTarget } from "@subboost/core/proxy-group-targets";
import { PROXY_GROUP_MODULES } from "./proxy-group-modules";
import { getModuleRuleOrderKey } from "./module-rules";

type ActivationOptions = {
  enabledModules: string[];
  builtinRuleEdits?: BuiltinRuleEdits;
  customProxyGroups?: CustomProxyGroup[];
  proxyGroupNameOverrides?: Record<string, string>;
  availablePolicyTargets?: string[];
};

export function createRuleTargetActivation(options: ActivationOptions) {
  const enabled = new Set(options.enabledModules);
  const customGroups = options.customProxyGroups || [];
  const moduleNames = Object.fromEntries(PROXY_GROUP_MODULES.map((module) => [
    module.id, resolveProxyGroupModuleName(module, options.proxyGroupNameOverrides?.[module.id]),
  ]));
  const policyTargets = new Set(["DIRECT", "REJECT", ...(options.availablePolicyTargets || [])]);
  const targetOptions = { moduleNames, customProxyGroups: customGroups, literalTargetNames: [...policyTargets] };

  const targetState = (target: ProxyGroupRuleTarget): "active" | "inactive" | "unknown" => {
    const normalized = normalizeProxyGroupRuleTarget(target, targetOptions);
    if (!normalized) return "unknown";
    if (typeof normalized === "string") {
      const matchingModules = PROXY_GROUP_MODULES.filter((item) => moduleNames[item.id] === normalized);
      const matchingGroups = customGroups.filter((item) => item.name.trim() === normalized);
      if (policyTargets.has(normalized) || matchingModules.some((item) => enabled.has(item.id)) || matchingGroups.some((item) => item.enabled !== false)) return "active";
      if (matchingModules.length || matchingGroups.length) return "inactive";
      return "unknown";
    }
    if (normalized.kind === "module") {
      if (!Object.prototype.hasOwnProperty.call(moduleNames, normalized.id)) return "unknown";
      return enabled.has(normalized.id) ? "active" : "inactive";
    }
    const group = customGroups.find((item) => item.id === normalized.id);
    return group ? (group.enabled === false ? "inactive" : "active") : "unknown";
  };

  return {
    builtinRuleActive(moduleId: string, ruleId: string): boolean {
      const edit = options.builtinRuleEdits?.[getModuleRuleOrderKey(moduleId, ruleId)];
      if (edit?.enabled === false) return false;
      if (!edit?.target) return enabled.has(moduleId);
      const state = targetState(edit.target);
      return state === "active" || (state === "unknown" && enabled.has(moduleId));
    },
    customTargetActive(target: ProxyGroupRuleTarget): boolean {
      // Unknown custom targets keep the existing policy fallback behavior.
      return targetState(target) !== "inactive";
    },
  };
}
