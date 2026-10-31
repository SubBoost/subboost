import type { BuiltinRuleEdits, CustomProxyGroup, CustomRule } from "@subboost/core/types/config";
import {
  createCustomRuleId,
  ensureCustomRuleId,
} from "@subboost/core/rules/custom-rule-utils";
import { buildGeneratedRuleEntries, hasFullRuleOrderKeys, normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import type { ConfigActions } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";
import { getGeneratedPolicyTargetContext } from "../generated-policy-targets";
import {
  compactBuiltinRuleEdits,
  ruleTargetMatchesContainer,
} from "./proxy-group-rule-set-helpers";

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

type NormalizeRuleOrderState = {
  enabledProxyGroups: string[];
  customProxyGroups: Parameters<typeof normalizePersistedRuleOrder>[0]["customProxyGroups"];
  customRules: Parameters<typeof normalizePersistedRuleOrder>[0]["customRules"];
  customRuleSets: Parameters<typeof normalizePersistedRuleOrder>[0]["customRuleSets"];
  builtinRuleEdits: Parameters<typeof normalizePersistedRuleOrder>[0]["builtinRuleEdits"];
  proxyGroupNameOverrides: Record<string, string>;
  experimentalCnUseCnRuleSet: boolean;
  cnIpNoResolve: boolean;
  ruleOrder: string[];
  generatedYaml?: string;
};

function normalizeRuleOrderForState(state: NormalizeRuleOrderState): string[] {
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
    ...getGeneratedPolicyTargetContext(state.generatedYaml),
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
      setAndGenerateConfig((state) => {
        if (!order.length) return { ruleOrder: [] };
        const active = new Set(buildGeneratedRuleEntries({
          enabledModules: state.enabledProxyGroups, customProxyGroups: state.customProxyGroups,
          customRules: state.customRules, customRuleSets: state.customRuleSets,
          builtinRuleEdits: state.builtinRuleEdits, proxyGroupNameOverrides: state.proxyGroupNameOverrides,
          experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet, cnIpNoResolve: state.cnIpNoResolve,
          ...getGeneratedPolicyTargetContext(state.generatedYaml),
        }).map((entry) => entry.key));
        const wanted = new Set(order);
        const fullOrder = hasFullRuleOrderKeys(order);
        const preserved = new Set(state.ruleOrder.filter((key) => !active.has(key) && !wanted.has(key) &&
          (fullOrder || (!key.startsWith("module:") && !key.startsWith("special:")))));
        let index = 0;
        const merged = state.ruleOrder.flatMap((key) => {
          if (preserved.has(key)) return [key];
          return wanted.has(key) ? [order[index++]] : [];
        });
        merged.push(...order.slice(index));
        return { ruleOrder: normalizeRuleOrderForState({ ...state, ruleOrder: merged }) };
      });
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
        if (!removedGroup) return state;
        const nextCustomProxyGroups = state.customProxyGroups.filter(
          (g) => g.id !== id,
        );
        const removedGroupName = removedGroup?.name?.trim() || "";
        const removedTarget = { kind: "custom" as const, id };
        const nextCustomRules = state.customRules.filter(
          (rule) => !ruleTargetMatchesContainer(rule.target, removedTarget, removedGroupName, state),
        );
        const nextCustomRuleSets = state.customRuleSets.filter(
          (ruleSet) => !ruleTargetMatchesContainer(ruleSet.target, removedTarget, removedGroupName, state),
        );
        const nextBuiltinRuleEdits = compactBuiltinRuleEdits(
          Object.fromEntries(
            Object.entries(state.builtinRuleEdits || {}).map(([key, edit]) => {
              if (!ruleTargetMatchesContainer(edit?.target, removedTarget, removedGroupName, state)) return [key, edit];
              const { target: _removedTarget, ...rest } = edit;
              return [key, rest];
            }),
          ),
        );
        // 分组删除后监听绑定失去目标且无 UI 入口可清理，必须连带移除
        const nextGroupListeners = state.groupListeners.filter(
          (binding) => !(binding && binding.target && binding.target.kind === "custom" && binding.target.id === id),
        );
        return {
          customProxyGroups: nextCustomProxyGroups,
          customRules: nextCustomRules,
          customRuleSets: nextCustomRuleSets,
          builtinRuleEdits: nextBuiltinRuleEdits,
          ...(nextGroupListeners.length !== state.groupListeners.length
            ? { groupListeners: nextGroupListeners }
            : {}),
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customProxyGroups: nextCustomProxyGroups,
            customRules: nextCustomRules,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
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
            customProxyGroups: nextCustomProxyGroups,
            customRules: nextCustomRules,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },
  };
}
