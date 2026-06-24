import type { BuiltinRuleEdits, CustomProxyGroup, CustomRule } from "@subboost/core/types/config";
import {
  createCustomRuleId,
  ensureCustomRuleId,
} from "@subboost/core/rules/custom-rule-utils";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import type { ConfigActions } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type CustomActions = Pick<
  ConfigActions,
  | "addCustomRule"
  | "addCustomRules"
  | "updateCustomRule"
  | "removeCustomRule"
  | "setRuleOrder"
  | "addCustomProxyGroup"
  | "removeCustomProxyGroup"
  | "updateCustomProxyGroup"
>;

function normalizeRuleOrderForState(state: {
  enabledProxyGroups: string[];
  customProxyGroups: Parameters<typeof normalizePersistedRuleOrder>[0]["customProxyGroups"];
  customRules: Parameters<typeof normalizePersistedRuleOrder>[0]["customRules"];
  customRuleSets: Parameters<typeof normalizePersistedRuleOrder>[0]["customRuleSets"];
  builtinRuleEdits: Parameters<typeof normalizePersistedRuleOrder>[0]["builtinRuleEdits"];
  proxyGroupNameOverrides: Record<string, string>;
  experimentalCnUseCnRuleSet: boolean;
  cnIpNoResolve: boolean;
  ruleOrder: string[];
}): string[] {
  return normalizePersistedRuleOrder({
    enabledModules: state.enabledProxyGroups,
    customProxyGroups: state.customProxyGroups,
    customRules: state.customRules,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    cnIpNoResolve: state.cnIpNoResolve,
    ruleOrder: state.ruleOrder,
  });
}

function retargetBuiltinRuleEdits(edits: BuiltinRuleEdits, from: string, to: string): BuiltinRuleEdits {
  if (!from || from === to) return edits;
  let changed = false;
  const next: BuiltinRuleEdits = {};
  for (const [key, edit] of Object.entries(edits || {})) {
    if (edit?.target === from) {
      next[key] = { ...edit, target: to };
      changed = true;
    } else {
      next[key] = edit;
    }
  }
  return changed ? next : edits;
}

export function createCustomActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig,
): CustomActions {
  return {
    addCustomRule: (rule: CustomRule) => {
      setAndGenerateConfig((state) => {
        const nextCustomRules = [
          ...state.customRules,
          ensureCustomRuleId(
            { ...rule, id: rule.id || createCustomRuleId() },
            state.customRules.length,
          ),
        ];
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizeRuleOrderForState({ ...state, customRules: nextCustomRules }),
        };
      });
    },

    addCustomRules: (rules: CustomRule[]) => {
      setAndGenerateConfig((state) => {
        if (!Array.isArray(rules) || rules.length === 0) return state;

        const nextRules = rules.map((rule, offset) =>
          ensureCustomRuleId(
            { ...rule, id: rule.id || createCustomRuleId() },
            state.customRules.length + offset,
          ),
        );
        const nextCustomRules = [...state.customRules, ...nextRules];
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizeRuleOrderForState({ ...state, customRules: nextCustomRules }),
        };
      });
    },

    updateCustomRule: (id: string, rule: Partial<Omit<CustomRule, "id">>) => {
      setAndGenerateConfig((state) => {
        const nextCustomRules = state.customRules.map((item, index) =>
          item.id === id
            ? ensureCustomRuleId({ ...item, ...rule, id: item.id }, index)
            : item,
        );
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizeRuleOrderForState({ ...state, customRules: nextCustomRules }),
        };
      });
    },

    removeCustomRule: (index: number) => {
      setAndGenerateConfig((state) => {
        const nextCustomRules = state.customRules.filter((_, i) => i !== index);
        return {
          customRules: nextCustomRules,
          ruleOrder: normalizeRuleOrderForState({ ...state, customRules: nextCustomRules }),
        };
      });
    },

    setRuleOrder: (order: string[]) => {
      setAndGenerateConfig((state) => ({
        ruleOrder: normalizeRuleOrderForState({ ...state, ruleOrder: order }),
      }));
    },

    addCustomProxyGroup: (group: Omit<CustomProxyGroup, "id">) => {
      const id = `custom-group-${Date.now()}`;
      setAndGenerateConfig((state) => {
        const nextGroup: CustomProxyGroup = {
          id,
          name: group.name,
          emoji: group.emoji,
          ...(group.enabled === false ? { enabled: false } : {}),
          ...(typeof group.description === "string" ? { description: group.description.trim() } : {}),
          ...(group.memberSource === "filtered-nodes" ? { memberSource: "filtered-nodes" as const } : {}),
          includeInGroupMembers:
            typeof group.includeInGroupMembers === "boolean" ? group.includeInGroupMembers : false,
          groupType: group.groupType,
          ...(group.groupType === "load-balance" && group.strategy ? { strategy: group.strategy } : {}),
          ...(group.advanced ? { advanced: normalizeProxyGroupAdvancedConfig(group.advanced) } : {}),
        };
        const nextCustomProxyGroups = [
          ...state.customProxyGroups,
          nextGroup,
        ];
        return {
          customProxyGroups: nextCustomProxyGroups,
        };
      });
    },

    removeCustomProxyGroup: (id: string) => {
      setAndGenerateConfig((state) => {
        const removedGroup = state.customProxyGroups.find((g) => g.id === id);
        const nextCustomProxyGroups = state.customProxyGroups.filter(
          (g) => g.id !== id,
        );
        const removedTarget = removedGroup?.name?.trim() || "";
        const nextCustomRuleSets = removedTarget
          ? state.customRuleSets.filter((ruleSet) => ruleSet.target !== removedTarget)
          : state.customRuleSets;
        return {
          customProxyGroups: nextCustomProxyGroups,
          customRuleSets: nextCustomRuleSets,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
          }),
        };
      });
    },

    updateCustomProxyGroup: (id: string, group: Partial<CustomProxyGroup>) => {
      setAndGenerateConfig((state) => {
        const prevGroup = state.customProxyGroups.find((g) => g.id === id);
        const prevName = typeof prevGroup?.name === "string" ? prevGroup.name : "";
        const nextName = typeof group.name === "string" ? group.name : prevName;
        const nextCustomRules =
          prevName && nextName && prevName !== nextName
            ? state.customRules.map((rule) =>
                rule.target === prevName ? { ...rule, target: nextName } : rule,
              )
            : state.customRules;
        const nextCustomRuleSets =
          prevName && nextName && prevName !== nextName
            ? state.customRuleSets.map((ruleSet) =>
                ruleSet.target === prevName ? { ...ruleSet, target: nextName } : ruleSet,
              )
            : state.customRuleSets;
        const nextBuiltinRuleEdits =
          prevName && nextName && prevName !== nextName
            ? retargetBuiltinRuleEdits(state.builtinRuleEdits, prevName, nextName)
            : state.builtinRuleEdits;
        const nextCustomProxyGroups = state.customProxyGroups.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g, ...group };
          if (typeof group.enabled === "boolean") next.enabled = group.enabled;
          if (group.advanced) next.advanced = normalizeProxyGroupAdvancedConfig(group.advanced);
          if (typeof group.description === "string") next.description = group.description.trim();
          return next;
        });
        return {
          customRules: nextCustomRules,
          customRuleSets: nextCustomRuleSets,
          builtinRuleEdits: nextBuiltinRuleEdits,
          customProxyGroups: nextCustomProxyGroups,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRules: nextCustomRules,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },
  };
}
