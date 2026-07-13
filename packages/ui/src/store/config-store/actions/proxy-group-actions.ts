import {
  type CustomProxyGroup,
  type CustomRuleSet,
  type ProxyGroupTargetRef,
} from "@subboost/core/types/config";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { getModuleRuleOrderKey, isPresetModuleRule } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import type { ConfigActions, RuleSetDraft } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";
import {
  appendUniqueCustomRuleSets,
  findBuiltinRuleEditKeyByTarget,
  normalizeRuleOrderForState,
  normalizeRuleSetDraft,
  resolveMoveTargetName,
  resolveRuleSetContainerTargetName,
  retargetBuiltinRuleEdits,
  ruleTargetMatchesContainer,
  updateBuiltinRuleEdit,
} from "./proxy-group-rule-set-helpers";

type ProxyGroupActions = Pick<
  ConfigActions,
  | "setProxyGroupOrder"
  | "hideProxyGroup"
  | "restoreHiddenProxyGroup"
  | "updateProxyGroupAdvanced"
  | "addModuleRules"
  | "updateModuleRule"
  | "removeModuleRule"
  | "moveModuleRule"
  | "restoreModuleRule"
  | "resetModuleRuleTarget"
  | "restoreModuleDefaultRules"
  | "acceptModuleRuleEditWarning"
  | "setProxyGroupNameOverride"
  | "clearProxyGroupNameOverride"
>;

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function isBuiltinProxyGroup(moduleId: string): boolean {
  return PROXY_GROUP_MODULES.some((proxyModule) => proxyModule.id === moduleId);
}

function isSupportedProxyGroupOrderKey(key: string): boolean {
  return (
    key.startsWith("module:") ||
    key.startsWith("custom:") ||
    key.startsWith("dialer:") ||
    key.startsWith("name:")
  );
}

function resolveRuleSetContainerTargetRef(
  id: string,
  customProxyGroups: CustomProxyGroup[],
): ProxyGroupTargetRef | null {
  if (isBuiltinProxyGroup(id)) return { kind: "module", id };
  return customProxyGroups.some((group) => group.id === id) ? { kind: "custom", id } : null;
}

export function createProxyGroupActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): ProxyGroupActions {
  return {
    setProxyGroupOrder: (order: string[]) => {
      const normalized = Array.isArray(order)
        ? order
            .filter((k) => typeof k === "string")
            .map((k) => k.trim())
            .filter(Boolean)
            .filter(isSupportedProxyGroupOrderKey)
        : [];

      const seen = new Set<string>();
      const unique: string[] = [];
      for (const key of normalized) {
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(key);
      }

      setAndGenerateConfig(() => ({ proxyGroupOrder: unique }));
    },

    hideProxyGroup: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id || !isBuiltinProxyGroup(id)) return;

      setAndGenerateConfig((state) => {
        const hidden = normalizeStringList(state.hiddenProxyGroups);
        const nextHiddenProxyGroups = hidden.includes(id) ? hidden : [...hidden, id];
        const nextEnabledProxyGroups = state.enabledProxyGroups.filter((groupId) => groupId !== id);

        if (
          nextHiddenProxyGroups === state.hiddenProxyGroups &&
          nextEnabledProxyGroups.length === state.enabledProxyGroups.length
        ) {
          return state;
        }

        return {
          hiddenProxyGroups: nextHiddenProxyGroups,
          enabledProxyGroups: nextEnabledProxyGroups,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
          }),
        };
      });
    },

    restoreHiddenProxyGroup: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id || !isBuiltinProxyGroup(id)) return;

      setAndGenerateConfig((state) => {
        const nextHiddenProxyGroups = normalizeStringList(state.hiddenProxyGroups).filter(
          (groupId) => groupId !== id
        );
        const nextEnabledProxyGroups = state.enabledProxyGroups.includes(id)
          ? state.enabledProxyGroups
          : [...state.enabledProxyGroups, id];

        if (
          nextHiddenProxyGroups.length === state.hiddenProxyGroups.length &&
          nextEnabledProxyGroups === state.enabledProxyGroups
        ) {
          return state;
        }

        return {
          hiddenProxyGroups: nextHiddenProxyGroups,
          enabledProxyGroups: nextEnabledProxyGroups,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
          }),
        };
      });
    },

    updateProxyGroupAdvanced: (moduleId, patch) => {
      const id = (moduleId || "").trim();
      if (!id || !isBuiltinProxyGroup(id)) return;
      setAndGenerateConfig((state) => {
        const prev = normalizeProxyGroupAdvancedConfig(state.proxyGroupAdvanced?.[id]);
        const next = normalizeProxyGroupAdvancedConfig({ ...prev, ...(patch || {}) });
        return {
          proxyGroupAdvanced: {
            ...(state.proxyGroupAdvanced || {}),
            [id]: next,
          },
        };
      });
    },

    addModuleRules: (moduleId: string, rules: RuleSetDraft[]) => {
      const id = (moduleId || "").trim();
      if (!id) return;
      if (!Array.isArray(rules) || rules.length === 0) return;

      setAndGenerateConfig((state) => {
        const target = resolveRuleSetContainerTargetName(
          id,
          state.customProxyGroups,
          state.proxyGroupNameOverrides,
        );
        const targetRef = resolveRuleSetContainerTargetRef(id, state.customProxyGroups);
        if (!target || !targetRef) return state;
        const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === id);
        let nextBuiltinRuleEdits = state.builtinRuleEdits;
        const customDrafts: RuleSetDraft[] = [];
        for (const draft of rules) {
          const normalized = normalizeRuleSetDraft(draft);
          if (!normalized) continue;
          if (proxyModule && isPresetModuleRule(proxyModule, normalized.id)) {
            const key = getModuleRuleOrderKey(proxyModule.id, normalized.id);
            nextBuiltinRuleEdits = updateBuiltinRuleEdit(nextBuiltinRuleEdits, key, {
              enabled: true,
              target: null,
            });
            continue;
          }
          customDrafts.push(normalized);
        }
        const nextCustomRuleSets = appendUniqueCustomRuleSets(state.customRuleSets, customDrafts, targetRef);
        if (
          nextCustomRuleSets.length === state.customRuleSets.length &&
          nextBuiltinRuleEdits === state.builtinRuleEdits
        ) return state;

        return {
          customRuleSets: nextCustomRuleSets,
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    updateModuleRule: (
      moduleId: string,
      ruleId: string,
      rule: Partial<Omit<RuleSetDraft, "id">>
    ) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const target = resolveRuleSetContainerTargetName(
          id,
          state.customProxyGroups,
          state.proxyGroupNameOverrides,
        );
        const targetRef = resolveRuleSetContainerTargetRef(id, state.customProxyGroups);
        if (!target || !targetRef) return state;
        const index = state.customRuleSets.findIndex(
          (item) => item.id === rid && ruleTargetMatchesContainer(item.target, targetRef, target),
        );
        if (index < 0) return state;

        const normalized = normalizeRuleSetDraft({
          ...state.customRuleSets[index],
          ...rule,
          id: rid,
        });
        if (!normalized) return state;

        const nextCustomRuleSets = state.customRuleSets.map((item, itemIndex) =>
          itemIndex === index ? { ...normalized, target: targetRef } : item
        );

        return {
          customRuleSets: nextCustomRuleSets,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
          }),
        };
      });
    },

    removeModuleRule: (moduleId: string, ruleId: string) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        if (mod && isPresetModuleRule(mod, rid)) {
          const key = getModuleRuleOrderKey(id, rid);
          const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, { enabled: false });
          return {
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }

        const target = resolveRuleSetContainerTargetName(
          id,
          state.customProxyGroups,
          state.proxyGroupNameOverrides,
        );
        const targetRef = resolveRuleSetContainerTargetRef(id, state.customProxyGroups);
        if (!target || !targetRef) return state;
        const movedBuiltinKey = findBuiltinRuleEditKeyByTarget(state.builtinRuleEdits, targetRef, target, rid);
        if (movedBuiltinKey) {
          const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, movedBuiltinKey, { enabled: false });
          return {
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }
        const nextCustomRuleSets = state.customRuleSets.filter(
          (ruleSet) => !(ruleSet.id === rid && ruleTargetMatchesContainer(ruleSet.target, targetRef, target))
        );
        if (nextCustomRuleSets.length === state.customRuleSets.length) return state;
        return {
          customRuleSets: nextCustomRuleSets,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            customRuleSets: nextCustomRuleSets,
          }),
        };
      });
    },

    moveModuleRule: (moduleId, ruleId, target) => {
      const sourceId = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      const targetId = (target?.id || "").trim();
      if (!sourceId || !rid || !targetId) return;
      if (target.kind !== "module" && target.kind !== "custom") return;

      setAndGenerateConfig((state) => {
        const sourceModule = PROXY_GROUP_MODULES.find((m) => m.id === sourceId);
        const targetName = resolveMoveTargetName(
          target,
          state.customProxyGroups,
          state.proxyGroupNameOverrides,
        );
        if (!targetName) return state;
        const sourceTarget = resolveRuleSetContainerTargetName(
          sourceId,
          state.customProxyGroups,
          state.proxyGroupNameOverrides,
        );
        const sourceTargetRef = resolveRuleSetContainerTargetRef(sourceId, state.customProxyGroups);
        if (!sourceTarget || !sourceTargetRef) return state;
        if (sourceTarget === targetName) return state;
        if (target.kind === "module" && targetId === sourceId) return state;

        let nextEnabledProxyGroups = state.enabledProxyGroups;

        if (target.kind === "module") {
          if (!nextEnabledProxyGroups.includes(targetId)) {
            nextEnabledProxyGroups = [...nextEnabledProxyGroups, targetId];
          }
        }

        const customRuleSetIndex = state.customRuleSets.findIndex(
          (ruleSet) =>
            ruleSet.id === rid && ruleTargetMatchesContainer(ruleSet.target, sourceTargetRef, sourceTarget)
        );
        if (customRuleSetIndex >= 0) {
          const targetModule = target.kind === "module"
            ? PROXY_GROUP_MODULES.find((proxyModule) => proxyModule.id === targetId)
            : undefined;
          let nextBuiltinRuleEdits = state.builtinRuleEdits;
          let nextCustomRuleSets: CustomRuleSet[];
          if (targetModule && isPresetModuleRule(targetModule, rid)) {
            const targetKey = getModuleRuleOrderKey(targetModule.id, rid);
            nextBuiltinRuleEdits = updateBuiltinRuleEdit(nextBuiltinRuleEdits, targetKey, {
              enabled: true,
              target: null,
            });
            nextCustomRuleSets = state.customRuleSets.filter((_, index) => index !== customRuleSetIndex);
          } else if (
            state.customRuleSets.some(
              (ruleSet, index) =>
                index !== customRuleSetIndex &&
                ruleSet.id === rid &&
                ruleTargetMatchesContainer(ruleSet.target, target, targetName)
            )
          ) {
            nextCustomRuleSets = state.customRuleSets.filter((_, index) => index !== customRuleSetIndex);
          } else {
            nextCustomRuleSets = state.customRuleSets.map((ruleSet, index) =>
              index === customRuleSetIndex ? { ...ruleSet, target } : ruleSet
            );
          }
          return {
            enabledProxyGroups: nextEnabledProxyGroups,
            customRuleSets: nextCustomRuleSets,
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              enabledProxyGroups: nextEnabledProxyGroups,
              customRuleSets: nextCustomRuleSets,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }

        const movedBuiltinKey = findBuiltinRuleEditKeyByTarget(
          state.builtinRuleEdits,
          sourceTargetRef,
          sourceTarget,
          rid,
        );
        if (movedBuiltinKey) {
          const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, movedBuiltinKey, {
            target,
            enabled: true,
          });
          return {
            enabledProxyGroups: nextEnabledProxyGroups,
            builtinRuleEdits: nextBuiltinRuleEdits,
            ruleOrder: normalizeRuleOrderForState({
              ...state,
              enabledProxyGroups: nextEnabledProxyGroups,
              builtinRuleEdits: nextBuiltinRuleEdits,
            }),
          };
        }

        if (!sourceModule || !isPresetModuleRule(sourceModule, rid)) return state;
        const key = getModuleRuleOrderKey(sourceId, rid);
        const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, {
          target,
          enabled: true,
        });
        return {
          enabledProxyGroups: nextEnabledProxyGroups,
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            enabledProxyGroups: nextEnabledProxyGroups,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    restoreModuleRule: (moduleId: string, ruleId: string) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;

      setAndGenerateConfig((state) => {
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        if (!mod || !isPresetModuleRule(mod, rid)) return state;

        const key = getModuleRuleOrderKey(id, rid);
        const currentEdit = state.builtinRuleEdits?.[key];
        if (currentEdit?.enabled !== false) return state;
        const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, {
          enabled: true,
        });
        return {
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    resetModuleRuleTarget: (moduleId: string, ruleId: string) => {
      const id = (moduleId || "").trim();
      const rid = (ruleId || "").trim();
      if (!id || !rid) return;
      setAndGenerateConfig((state) => {
        const mod = PROXY_GROUP_MODULES.find((m) => m.id === id);
        if (!mod || !isPresetModuleRule(mod, rid)) return state;
        const key = getModuleRuleOrderKey(id, rid);
        if (!state.builtinRuleEdits?.[key]?.target) return state;
        const nextBuiltinRuleEdits = updateBuiltinRuleEdit(state.builtinRuleEdits, key, { target: null });
        return {
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    restoreModuleDefaultRules: (moduleId: string) => {
      const id = (moduleId || "").trim();
      if (!id) return;
      setAndGenerateConfig((state) => {
        const proxyModule = PROXY_GROUP_MODULES.find((item) => item.id === id);
        if (!proxyModule) return state;
        let nextBuiltinRuleEdits = state.builtinRuleEdits;
        for (const rule of proxyModule.rules) {
          const key = getModuleRuleOrderKey(id, rule.id);
          if (nextBuiltinRuleEdits?.[key]?.enabled === false) {
            nextBuiltinRuleEdits = updateBuiltinRuleEdit(nextBuiltinRuleEdits, key, {
              enabled: true,
            });
          }
        }
        if (nextBuiltinRuleEdits === state.builtinRuleEdits) return state;
        return {
          builtinRuleEdits: nextBuiltinRuleEdits,
          ruleOrder: normalizeRuleOrderForState({
            ...state,
            builtinRuleEdits: nextBuiltinRuleEdits,
          }),
        };
      });
    },

    acceptModuleRuleEditWarning: () => {
      setAndGenerateConfig(() => ({ moduleRuleEditWarningAccepted: true }));
    },

    setProxyGroupNameOverride: (moduleId: string, displayName: string) => {
      const key = (moduleId || "").trim();
      if (!key) return;
      const value = (displayName || "").trim();
      const mod = PROXY_GROUP_MODULES.find((m) => m.id === key);
      if (!mod || mod.category === "core") return;

      setAndGenerateConfig((state) => ({
        proxyGroupNameOverrides: (() => {
          const prev = state.proxyGroupNameOverrides || {};
          const next = { ...prev, [key]: value };
          return next;
        })(),
        customRules: (() => {
          const prev = state.proxyGroupNameOverrides?.[key];
          const oldFull = resolveProxyGroupModuleName(mod, prev);
          const newFull = value ? resolveProxyGroupModuleName(mod, value) : mod.name;
          return state.customRules.map((r) =>
            r.target === oldFull ? { ...r, target: newFull } : r
          );
        })(),
        customRuleSets: (() => {
          const prev = state.proxyGroupNameOverrides?.[key];
          const oldFull = resolveProxyGroupModuleName(mod, prev);
          const newFull = value ? resolveProxyGroupModuleName(mod, value) : mod.name;
          return state.customRuleSets.map((ruleSet) =>
            ruleSet.target === oldFull ? { ...ruleSet, target: newFull } : ruleSet
          );
        })(),
        builtinRuleEdits: (() => {
          const prev = state.proxyGroupNameOverrides?.[key];
          const oldFull = resolveProxyGroupModuleName(mod, prev);
          const newFull = value ? resolveProxyGroupModuleName(mod, value) : mod.name;
          return retargetBuiltinRuleEdits(state.builtinRuleEdits, oldFull, newFull);
        })(),
      }));
    },

    clearProxyGroupNameOverride: (moduleId: string) => {
      const key = (moduleId || "").trim();
      if (!key) return;
      const mod = PROXY_GROUP_MODULES.find((m) => m.id === key);
      if (!mod || mod.category === "core") return;

      setAndGenerateConfig((state) => {
        const prevLabel = state.proxyGroupNameOverrides?.[key];
        const oldFull = resolveProxyGroupModuleName(mod, prevLabel);
        const newFull = mod.name;

        const next = { ...(state.proxyGroupNameOverrides || {}) };
        delete next[key];
        return {
          proxyGroupNameOverrides: next,
          customRules: state.customRules.map((r) =>
            r.target === oldFull ? { ...r, target: newFull } : r
          ),
          customRuleSets: state.customRuleSets.map((ruleSet) =>
            ruleSet.target === oldFull ? { ...ruleSet, target: newFull } : ruleSet
          ),
          builtinRuleEdits: retargetBuiltinRuleEdits(state.builtinRuleEdits, oldFull, newFull),
        };
      });
    },
  };
}
