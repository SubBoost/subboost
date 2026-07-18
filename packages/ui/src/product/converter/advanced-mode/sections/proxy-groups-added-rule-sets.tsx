"use client";

import * as React from "react";
import { ArrowRight, Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@subboost/ui/components/ui/select";
import { Switch } from "@subboost/ui/components/ui/switch";
import { toast } from "@subboost/ui/components/ui/toaster";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { getModuleRuleOrderKey } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import {
  collectCustomRoutingRuleSets,
  getRuleSetTargetValue,
  normalizeRuleSetPathInput,
  parseRuleSetTargetValue,
  type CustomRoutingRuleSetItem,
} from "@subboost/core/rules/custom-routing-rule-sets";
import {
  useConfigStore,
  type RuleSetDraft as StoreRuleSetDraft,
} from "@subboost/ui/store/config-store";
import {
  RULE_EDIT_ACTIONS_CLASS,
  RULE_EDIT_PRIMARY_FIELD_CLASS,
  RULE_EDIT_ROW_CLASS,
  RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
  RULE_EDIT_TRAILING_CONTROLS_CLASS,
} from "./proxy-groups-rule-editor-layout";

type RuleSetDraft = {
  path: string;
  targetValue: string;
  noResolve: boolean;
};

function formatRuleSetPathForDisplay(path: string): string {
  const normalized = normalizeRuleSetPathInput(path);
  if (/^(?:geosite|geoip)\/[^/?#\s]+\.mrs$/i.test(normalized)) {
    return normalized.slice(0, -".mrs".length);
  }
  return normalized;
}

function createDraft(item: CustomRoutingRuleSetItem): RuleSetDraft {
  return {
    path: item.path,
    targetValue: item.target.value,
    noResolve: Boolean(item.noResolve),
  };
}

export function ProxyGroupsAddedRuleSets({
  showSearchHint = false,
  totalRules,
}: {
  showSearchHint?: boolean;
  totalRules: number | null;
}) {
  const {
    enabledProxyGroups,
    hiddenProxyGroups,
    customRuleSets = [],
    builtinRuleEdits = {},
    customProxyGroups = [],
    proxyGroupNameOverrides = {},
    toggleProxyGroup,
    updateModuleRule,
    removeModuleRule,
    moveModuleRule,
  } = useConfigStore();

  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<RuleSetDraft | null>(null);

  const addedRuleSets = React.useMemo(
    () =>
      collectCustomRoutingRuleSets({
        customRuleSets,
        customProxyGroups,
        proxyGroupNameOverrides,
      }),
    [customProxyGroups, customRuleSets, proxyGroupNameOverrides],
  );
  const visibleProxyGroupModules = React.useMemo(() => {
    const hidden = new Set(hiddenProxyGroups);
    return PROXY_GROUP_MODULES.filter((module) => !hidden.has(module.id));
  }, [hiddenProxyGroups]);
  const visibleAddedRuleSets = React.useMemo(() => {
    const hidden = new Set(hiddenProxyGroups);
    return addedRuleSets.filter(
      (item) => !(item.target.kind === "module" && hidden.has(item.target.id)),
    );
  }, [addedRuleSets, hiddenProxyGroups]);

  const targetOptions = React.useMemo(
    () => [
      ...visibleProxyGroupModules.map((module) => ({
        value: getRuleSetTargetValue({ kind: "module", id: module.id }),
        label: resolveProxyGroupModuleName(
          module,
          proxyGroupNameOverrides?.[module.id],
        ),
      })),
      ...customProxyGroups.map((group) => ({
        value: getRuleSetTargetValue({ kind: "custom", id: group.id }),
        label: group.name,
      })),
    ],
    [customProxyGroups, proxyGroupNameOverrides, visibleProxyGroupModules],
  );

  const moduleNames = React.useMemo(
    () =>
      Object.fromEntries(
        PROXY_GROUP_MODULES.map((module) => [
          module.id,
          resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
        ]),
      ),
    [proxyGroupNameOverrides],
  );

  React.useEffect(() => {
    if (!editingKey) return;
    if (visibleAddedRuleSets.some((item) => item.key === editingKey)) return;
    setEditingKey(null);
    setDraft(null);
  }, [editingKey, visibleAddedRuleSets]);

  const hasConflict = React.useCallback(
    (
      item: CustomRoutingRuleSetItem,
      target: { kind: "module" | "custom"; id: string },
    ) => {
      if (target.kind === "module") {
        const proxyModule = visibleProxyGroupModules.find(
          (entry) => entry.id === target.id,
        );
        if (!proxyModule) return true;
        const moduleName = resolveProxyGroupModuleName(
          proxyModule,
          proxyGroupNameOverrides?.[proxyModule.id],
        );
        const builtinConflict = (proxyModule.rules ?? []).some((rule) => {
          if (rule.id !== item.id) return false;
          const edit = builtinRuleEdits?.[getModuleRuleOrderKey(proxyModule.id, rule.id)];
          const editTarget = edit?.target
            ? resolveProxyGroupTargetName(edit.target, {
                moduleNames,
                customProxyGroups,
                fallbackTarget: moduleName,
              })
            : moduleName;
          return edit?.enabled !== false && editTarget === moduleName;
        });
        const customConflict = customRuleSets.some(
          (ruleSet) =>
            ruleSet.id === item.id &&
            resolveProxyGroupTargetName(ruleSet.target, {
              moduleNames,
              customProxyGroups,
            }) === moduleName &&
            item.target.value !== getRuleSetTargetValue(target),
        );
        return builtinConflict || customConflict;
      }

      const group = customProxyGroups.find((entry) => entry.id === target.id);
      if (!group) return true;
      const targetName = group.name.trim();
      if (!targetName) return true;
      return customRuleSets.some(
        (ruleSet) =>
          ruleSet.id === item.id &&
          resolveProxyGroupTargetName(ruleSet.target, {
            moduleNames,
            customProxyGroups,
          }) === targetName &&
          item.target.value !== getRuleSetTargetValue(target),
      );
    },
    [
      builtinRuleEdits,
      customProxyGroups,
      customRuleSets,
      moduleNames,
      proxyGroupNameOverrides,
      visibleProxyGroupModules,
    ],
  );

  const startEditing = (item: CustomRoutingRuleSetItem) => {
    setEditingKey(item.key);
    setDraft(createDraft(item));
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setDraft(null);
  };

  const removeRuleSet = (item: CustomRoutingRuleSetItem) => {
    removeModuleRule(item.target.id, item.id);
    if (editingKey === item.key) cancelEditing();
  };

  const saveEditing = (item: CustomRoutingRuleSetItem) => {
    if (!draft) return;

    const target = parseRuleSetTargetValue(draft.targetValue);
    const path = normalizeRuleSetPathInput(draft.path);
    if (!target || !path) return;

    if (hasConflict(item, target)) {
      toast({
        title: "规则集已存在",
        description: "目标分流组里已经有同名规则集，请先移除重复项。",
        variant: "warning",
      });
      return;
    }

    const nextModuleRule: StoreRuleSetDraft = {
      id: item.id,
      name: item.name,
      behavior: item.behavior,
      path,
      ...(draft.noResolve ? { noResolve: true } : {}),
    };

    if (item.target.id === target.id && item.target.kind === target.kind) {
      updateModuleRule(item.target.id, item.id, nextModuleRule);
    } else {
      if (target.kind === "module" && !enabledProxyGroups.includes(target.id)) toggleProxyGroup(target.id);
      moveModuleRule(item.target.id, item.id, target);
      updateModuleRule(target.id, item.id, nextModuleRule);
    }

    cancelEditing();
  };

  if (visibleAddedRuleSets.length === 0) {
    if (!showSearchHint) return null;
    return (
      <p className="py-2 text-center text-xs leading-5 text-white/60">
        {typeof totalRules === "number" ? (
          <>
            从
            <span className="font-semibold tabular-nums text-emerald-300">
              {totalRules}
            </span>
            {"条在线规则集中搜索并添加你需要的规则"}
          </>
        ) : (
          "从在线规则集中搜索并添加你需要的规则"
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1 border-t border-white/10 pt-2">
      <div className="flex min-h-5 items-center gap-2">
        <span className="text-[11px] font-medium text-white/65">
          已添加规则集
        </span>
        <span className="ml-auto text-[10px] text-white/40">
          已添加 {visibleAddedRuleSets.length}
        </span>
      </div>

      <div className="space-y-1">
        {visibleAddedRuleSets.map((item) => {
          const isEditing = editingKey === item.key && draft;

          if (isEditing) {
            const displayPath = formatRuleSetPathForDisplay(draft.path);

            return (
              <div
                key={item.key}
                className="rounded-md border border-indigo-400/20 bg-indigo-500/[0.08] p-1.5"
              >
                <div className={RULE_EDIT_ROW_CLASS}>
                  <div
                    className={`flex h-7 ${RULE_EDIT_PRIMARY_FIELD_CLASS} items-center truncate rounded-md border border-white/10 bg-white/5 px-2 font-mono text-xs text-white/75`}
                    title={displayPath}
                  >
                    {displayPath}
                  </div>
                  <div className={RULE_EDIT_TRAILING_CONTROLS_CLASS}>
                    <Select
                      value={draft.targetValue}
                      onValueChange={(targetValue) =>
                        setDraft((prev) =>
                          prev ? { ...prev, targetValue } : prev,
                        )
                      }
                    >
                      <SelectTrigger
                        className={RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {targetOptions.map((target) => (
                          <SelectItem
                            key={target.value}
                            value={target.value}
                            className="text-xs"
                          >
                            {target.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2">
                      <Switch
                        aria-label={`设置 ${item.name} no-resolve`}
                        checked={draft.noResolve}
                        onCheckedChange={(noResolve) =>
                          setDraft((prev) =>
                            prev ? { ...prev, noResolve } : prev,
                          )
                        }
                      />
                      <span className="proxy-group-rule-no-resolve-label text-[10px] text-white/50">
                        no-resolve
                      </span>
                    </div>
                    <div className={RULE_EDIT_ACTIONS_CLASS}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => saveEditing(item)}
                        disabled={!draft.targetValue}
                        className="h-7 w-7 shrink-0 p-0 text-emerald-300 hover:text-emerald-200"
                        title="保存规则集"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                        className="h-7 w-7 shrink-0 p-0"
                        title="取消编辑"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRuleSet(item)}
                        className="h-7 w-7 shrink-0 p-0 text-white/40 hover:text-red-300"
                        title="删除规则集"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          const displayPath = formatRuleSetPathForDisplay(item.path);

          return (
            <div
              key={item.key}
              className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px]"
            >
              <span className="rounded border border-indigo-400/20 bg-indigo-500/10 px-1.5 py-0.5 font-medium text-indigo-200">
                RULE-SET
              </span>
              <span
                className="min-w-0 max-w-[16rem] truncate font-mono text-white/75"
                title={displayPath}
              >
                {displayPath}
              </span>
              {item.noResolve && (
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/45">
                  no-resolve
                </span>
              )}
              <ArrowRight className="h-3 w-3 shrink-0 text-white/35" />
              <span
                className="max-w-[11rem] truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70"
                title={item.target.name}
              >
                {item.target.name}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <IconButton
                  label="编辑规则集"
                  variant="ghost"
                  type="button"
                  onClick={() => startEditing(item)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  <Pencil className="h-3 w-3" />
                </IconButton>
                <IconButton
                  label="删除规则集"
                  variant="ghost"
                  type="button"
                  onClick={() => removeRuleSet(item)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
