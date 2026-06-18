import { getBuiltinTemplateId } from "@subboost/core/templates/builtin";
import { TEMPLATES } from "@subboost/core/templates";
import { ensureCustomRulesHaveIds } from "@subboost/core/rules/custom-rule-utils";
import { hasFullRuleOrderKeys, normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { normalizeModuleRuleExclusions } from "@subboost/core/generator/module-rules";
import type {
  ConfigActions,
  ModuleRuleExclusions,
  ModuleRuleOverride,
  SubBoostTemplateConfig,
} from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type TemplateActions = Pick<
  ConfigActions,
  | "setTemplate"
  | "setAppliedTemplateId"
  | "setEnabledProxyGroups"
  | "toggleProxyGroup"
  | "applyTemplateConfig"
  | "importTemplateConfig"
>;

function normalizeHiddenProxyGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const builtinIds = new Set(PROXY_GROUP_MODULES.map((module) => module.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || !builtinIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function createTemplateActions(
  set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): TemplateActions {
  return {
    setTemplate: (template) => {
      const templateConfig = TEMPLATES[template];
      setAndGenerateConfig(() => ({
        template,
        enabledProxyGroups: templateConfig.groups,
        hiddenProxyGroups: [],
        appliedTemplateId: getBuiltinTemplateId(template),
        customRules: [],
        moduleRuleOverrides: {},
        moduleRuleExclusions: {},
        ruleOrder: [],
        allRulesOrderEditingEnabled: false,
        moduleRuleEditWarningAccepted: false,
      }));
    },

    setAppliedTemplateId: (templateId) => {
      set({ appliedTemplateId: templateId });
    },

    setEnabledProxyGroups: (groups) => {
      setAndGenerateConfig(() => ({ enabledProxyGroups: groups }));
    },

    toggleProxyGroup: (groupId) => {
      setAndGenerateConfig((state) => {
        const isEnabled = state.enabledProxyGroups.includes(groupId);
        const groups = isEnabled
          ? state.enabledProxyGroups.filter((g) => g !== groupId)
          : [...state.enabledProxyGroups, groupId];
        return {
          enabledProxyGroups: groups,
          hiddenProxyGroups: isEnabled
            ? state.hiddenProxyGroups
            : state.hiddenProxyGroups.filter((id) => id !== groupId),
        };
      });
    },

    // 应用模板配置（从模板库应用）
    applyTemplateConfig: (config: SubBoostTemplateConfig) => {
      if (!config || typeof config !== "object") return;

      setAndGenerateConfig((state) => {
        const nextCustomProxyGroups = Array.isArray(config.customProxyGroups)
          ? config.customProxyGroups
          : state.customProxyGroups;
        const nextCustomRules = Array.isArray(config.customRules)
          ? ensureCustomRulesHaveIds(config.customRules)
          : state.customRules;
        const nextHiddenProxyGroups = normalizeHiddenProxyGroups(config.hiddenProxyGroups);
        const nextHiddenProxyGroupSet = new Set(nextHiddenProxyGroups);
        const shouldRefreshRuleOrder =
          Array.isArray(config.ruleOrder) ||
          Array.isArray(config.customRules) ||
          Array.isArray(config.customProxyGroups) ||
          Boolean(config.moduleRuleExclusions && typeof config.moduleRuleExclusions === "object");
        const nextEnabledModulesRaw = Array.isArray(config.enabledProxyGroups)
          ? config.enabledProxyGroups
          : state.enabledProxyGroups;
        const nextEnabledModules = nextEnabledModulesRaw.filter(
          (moduleId) => !nextHiddenProxyGroupSet.has(moduleId)
        );
        const nextModuleRuleExclusions =
          config.moduleRuleExclusions && typeof config.moduleRuleExclusions === "object"
            ? normalizeModuleRuleExclusions(config.moduleRuleExclusions)
            : state.moduleRuleExclusions;
        const nextRuleOrder = shouldRefreshRuleOrder
          ? normalizePersistedRuleOrder({
              enabledModules: nextEnabledModules,
              customRules: nextCustomRules,
              customProxyGroups: nextCustomProxyGroups,
              moduleRuleOverrides:
                config.moduleRuleOverrides && typeof config.moduleRuleOverrides === "object"
                  ? (config.moduleRuleOverrides as Record<string, ModuleRuleOverride[]>)
                  : state.moduleRuleOverrides,
              moduleRuleExclusions: nextModuleRuleExclusions,
              proxyGroupNameOverrides:
                config.proxyGroupNameOverrides && typeof config.proxyGroupNameOverrides === "object"
                  ? (config.proxyGroupNameOverrides as Record<string, string>)
                  : state.proxyGroupNameOverrides,
              experimentalCnUseCnRuleSet:
                typeof config.experimentalCnUseCnRuleSet === "boolean"
                  ? config.experimentalCnUseCnRuleSet
                  : state.experimentalCnUseCnRuleSet,
              cnIpNoResolve:
                typeof config.cnIpNoResolve === "boolean" ? config.cnIpNoResolve : state.cnIpNoResolve,
              ruleOrder: config.ruleOrder,
            })
          : state.ruleOrder;

        return {
          // 不触碰 nodes/sources：模板只描述“生成策略”，节点仍由用户导入
          template: config.template ?? state.template,
          enabledProxyGroups: nextEnabledModules,
          hiddenProxyGroups: nextHiddenProxyGroups,
          customProxyGroups: nextCustomProxyGroups,
          filteredProxyGroups: Array.isArray(config.filteredProxyGroups)
            ? config.filteredProxyGroups
            : state.filteredProxyGroups,
          moduleRuleOverrides:
            config.moduleRuleOverrides && typeof config.moduleRuleOverrides === "object"
              ? (config.moduleRuleOverrides as Record<string, ModuleRuleOverride[]>)
              : state.moduleRuleOverrides,
          moduleRuleExclusions: nextModuleRuleExclusions as ModuleRuleExclusions,
          moduleRuleEditWarningAccepted: false,
          customRules: nextCustomRules,
          ruleOrder: nextRuleOrder,
          allRulesOrderEditingEnabled:
            typeof config.allRulesOrderEditingEnabled === "boolean"
              ? config.allRulesOrderEditingEnabled
              : hasFullRuleOrderKeys(nextRuleOrder),
          cnIpNoResolve:
            typeof config.cnIpNoResolve === "boolean" ? config.cnIpNoResolve : state.cnIpNoResolve,
          experimentalCnUseCnRuleSet:
            typeof config.experimentalCnUseCnRuleSet === "boolean"
              ? config.experimentalCnUseCnRuleSet
              : state.experimentalCnUseCnRuleSet,
          dialerProxyGroups: Array.isArray(config.dialerProxyGroups)
            ? config.dialerProxyGroups
            : state.dialerProxyGroups,
          proxyGroupNameOverrides:
            config.proxyGroupNameOverrides && typeof config.proxyGroupNameOverrides === "object"
              ? (config.proxyGroupNameOverrides as Record<string, string>)
              : state.proxyGroupNameOverrides,
          dnsYaml: typeof config.dnsYaml === "string" ? config.dnsYaml : state.dnsYaml,
          mixedPort: typeof config.mixedPort === "number" ? config.mixedPort : state.mixedPort,
          allowLan: typeof config.allowLan === "boolean" ? config.allowLan : state.allowLan,
          testUrl: typeof config.testUrl === "string" ? config.testUrl : state.testUrl,
          testInterval:
            typeof config.testInterval === "number" ? config.testInterval : state.testInterval,
          ruleProviderBaseUrl:
            typeof config.ruleProviderBaseUrl === "string"
              ? config.ruleProviderBaseUrl
              : state.ruleProviderBaseUrl,
        };
      });
    },

    // 导入配置文件时复用同一套应用逻辑
    importTemplateConfig: (config: SubBoostTemplateConfig) => {
      if (!config || typeof config !== "object") return;
      const state = _get();
      state.applyTemplateConfig(config);
      set({ appliedTemplateId: null });
    },
  };
}
