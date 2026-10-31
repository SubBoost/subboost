"use client";

import * as React from "react";
import { ArrowRight, Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
import { FormField } from "@subboost/ui/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@subboost/ui/components/ui/select";
import { Switch } from "@subboost/ui/components/ui/switch";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import {
  createCustomRuleId,
  CUSTOM_RULE_TYPES,
} from "@subboost/core/rules/custom-rule-utils";
import { normalizeCustomRuleValue } from "@subboost/core/rules/custom-rule-value";
import { getCustomRuleDefinition, supportsNoResolve } from "@subboost/core/rules/custom-rule-types";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { getGeneratedPolicyTargetContext } from "@subboost/ui/store/config-store/generated-policy-targets";
import { allocateRuleSetId } from "@subboost/core/rules/rule-model";
import { useProductApiAdapter } from "@subboost/ui/product/api-adapter";
import { resolveRuleSetUrl, useRuleSetOperation } from "./use-rule-set-resolution";
import { toast } from "@subboost/ui/components/ui/toaster";
import type { CustomProxyGroup, CustomRule, ProxyGroupRuleTarget, RuleSetMetadata } from "@subboost/core/types/config";
import {
  useProductInteractionAdapter,
  type ProductRuleKind,
} from "@subboost/ui/product/interactions";
import { ProxyGroupsCustomRulesBatchDialog } from "./proxy-groups-custom-rules-batch-dialog";
import {
  RULE_ADD_ROW_FRAME_CLASS,
  RULE_EDIT_ACTIONS_CLASS,
  RULE_EDIT_PRIMARY_GROUP_CLASS,
  RULE_EDIT_ROW_CLASS,
  RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
  RULE_EDIT_TRAILING_CONTROLS_CLASS,
  RULE_HEADER_ACTION_BUTTON_CLASS,
  RULE_HEADER_ROW_CLASS,
  RULE_TEXT_ACTION_BUTTON_CLASS,
  RULE_TYPE_BADGE_CLASS,
} from "./proxy-groups-rule-editor-layout";

const CUSTOM_RULE_TYPE_OPTIONS = CUSTOM_RULE_TYPES.map((value) => ({
  value,
  label: `${getCustomRuleDefinition(value).label} (${value})`,
}));

function getRuleTypeLabel(type: CustomRule["type"]): string {
  const definition = getCustomRuleDefinition(type);
  return definition.shortLabel ?? definition.label;
}

function getProductRuleKind(type: CustomRule["type"]): ProductRuleKind {
  if (type.startsWith("DOMAIN")) return "domain";
  if (type.includes("GEO")) return "geo";
  if (type.includes("IP-")) return "ipcidr";
  if (type.startsWith("PROCESS-")) return "process";
  if (type.endsWith("-PORT")) return "port";
  return "unknown";
}

function isIpCidrRuleType(type: CustomRule["type"]): boolean {
  return type === "IP-CIDR" || type === "IP-CIDR6";
}

function getRuleValuePlaceholder(type: CustomRule["type"] | "RULE-SET"): string {
  if (type === "RULE-SET") return "规则集链接 (https://…/geosite/udemy.mrs)";
  return `值 (如: ${getCustomRuleDefinition(type).example})`;
}

function RuleValueInput({ type, value, onChange }: {
  type: CustomRule["type"] | "RULE-SET"; value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <FormField label="规则值" className="min-w-0 flex-[1_1_4.5rem] gap-0 [&>label]:sr-only">
      <Input value={value} onChange={onChange} placeholder={getRuleValuePlaceholder(type)} className="h-7 min-w-0 text-xs" />
    </FormField>
  );
}

function RuleTypeHint({ type }: { type: CustomRule["type"] | "RULE-SET" }) {
  if (type === "RULE-SET") return null;
  const hint = getCustomRuleDefinition(type).hint;
  return hint ? <p className="mt-1 text-[10px] text-fg-50">{hint}</p> : null;
}

function getTargetOptions(enabledGroupNames: string[], selected?: string) {
  const options = ["DIRECT", "REJECT", ...enabledGroupNames];
  if (selected && !options.includes(selected)) options.push(selected);
  return Array.from(new Set(options));
}

function toStableRuleTarget(
  targetName: string,
  moduleNames: Record<string, string>,
  customProxyGroups: CustomProxyGroup[],
): ProxyGroupRuleTarget {
  const normalized = targetName.trim();
  for (const [id, name] of Object.entries(moduleNames)) {
    if (name.trim() === normalized) return { kind: "module", id };
  }
  const customGroup = customProxyGroups.find((group) => group.name.trim() === normalized);
  if (customGroup) return { kind: "custom", id: customGroup.id };
  return normalized;
}

export function ProxyGroupsCustomRules() {
  const {
    customRules,
    customRuleSets = [],
    addCustomRule,
    addModuleRules,
    addCustomRules,
    updateCustomRule,
    removeCustomRule,
    enabledProxyGroups,
    customProxyGroups,
    proxyGroupNameOverrides,
    generatedYaml,
  } = useConfigStore();

  const [newRuleType, setNewRuleType] =
    React.useState<CustomRule["type"] | "RULE-SET">("DOMAIN");
  const [newRuleValue, setNewRuleValue] = React.useState("");
  const [newRuleTarget, setNewRuleTarget] = React.useState("🚀 节点选择");
  const [newRuleNoResolve, setNewRuleNoResolve] = React.useState(false);
  const [batchImportOpen, setBatchImportOpen] = React.useState(false);
  const [editingRuleId, setEditingRuleId] = React.useState<string | null>(null);
  const [editingRuleDraft, setEditingRuleDraft] =
    React.useState<CustomRule | null>(null);
  const interactions = useProductInteractionAdapter();
  const api = useProductApiAdapter();
  const runRuleSetOperation = useRuleSetOperation(JSON.stringify([newRuleType, newRuleValue, newRuleTarget, newRuleNoResolve, customRuleSets, customProxyGroups]));

  const enabledGroupNames = React.useMemo(() => {
    const names: string[] = [];
    for (const m of PROXY_GROUP_MODULES) {
      if (!enabledProxyGroups.includes(m.id)) continue;
      names.push(
        resolveProxyGroupModuleName(m, proxyGroupNameOverrides?.[m.id]),
      );
    }
    for (const g of customProxyGroups) {
      names.push(g.name);
    }
    return names;
  }, [
    customProxyGroups,
    enabledProxyGroups,
    proxyGroupNameOverrides,
  ]);

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
  const literalTargetNames = React.useMemo(() => [
    ...customProxyGroups.map((group) => group.name), ...(getGeneratedPolicyTargetContext(generatedYaml)?.availablePolicyTargets || []),
  ], [customProxyGroups, generatedYaml]);

  const resolveTargetName = React.useCallback(
    (target: CustomRule["target"]) =>
      resolveProxyGroupTargetName(target, {
        moduleNames,
        customProxyGroups,
        literalTargetNames,
      }),
    [customProxyGroups, literalTargetNames, moduleNames],
  );

  const targetOptions = React.useMemo(
    () => getTargetOptions(enabledGroupNames),
    [enabledGroupNames],
  );
  const batchTargetOptions = React.useMemo(
    () => getTargetOptions(enabledGroupNames, newRuleTarget),
    [enabledGroupNames, newRuleTarget],
  );

  React.useEffect(() => {
    if (!editingRuleId) return;
    if (customRules.some((rule) => rule.id === editingRuleId)) return;
    setEditingRuleId(null);
    setEditingRuleDraft(null);
  }, [customRules, editingRuleId]);

  const handleAddCustomRule = () => {
    const value = newRuleValue.trim();
    if (!value || !newRuleTarget) return;
    const addedRuleType = newRuleType;

    if (addedRuleType === "RULE-SET") {
      const target = toStableRuleTarget(newRuleTarget, moduleNames, customProxyGroups);
      if (typeof target === "string") {
        toast({ title: "请选择规则集使用的代理组", variant: "warning" });
        return;
      }
      const commit = (ruleSet: RuleSetMetadata) => {
        const id = allocateRuleSetId(ruleSet.name, [
          ...PROXY_GROUP_MODULES.flatMap((module) => module.rules.map((rule) => rule.id)),
          ...customRuleSets.map((rule) => rule.id),
        ]);
        addModuleRules(target, [{ ...ruleSet, id, name: id, noResolve: newRuleNoResolve }]);
        setNewRuleValue("");
      };
      runRuleSetOperation((signal) => {
        const fail = (error: unknown) => { if (!signal.aborted) toast({ title: error instanceof Error ? error.message : "规则集链接无效", variant: "warning" }); };
        try {
          const result = resolveRuleSetUrl(value, api.rules, signal);
          if (result instanceof Promise) return result.then((ruleSet) => { if (!signal.aborted) commit(ruleSet); }).catch(fail);
          commit(result);
        } catch (error) { fail(error); }
      });
      return;
    }

    const normalizedValue = normalizeCustomRuleValue(addedRuleType, value);
    if (!normalizedValue.ok) {
      toast({ title: normalizedValue.error, variant: "warning" });
      return;
    }
    addCustomRule({
      id: createCustomRuleId(),
      type: addedRuleType,
      value: normalizedValue.value,
      target: toStableRuleTarget(newRuleTarget, moduleNames, customProxyGroups),
      noResolve: newRuleNoResolve && supportsNoResolve(addedRuleType),
    });
    interactions.ruleAdded?.({
      source: "manual",
      kind: getProductRuleKind(addedRuleType),
    });
    setNewRuleValue("");
    setNewRuleNoResolve(isIpCidrRuleType(addedRuleType));
  };

  const handleNewRuleTypeChange = (value: string) => {
    const nextType = value as CustomRule["type"] | "RULE-SET";
    setNewRuleType(nextType);
    setNewRuleNoResolve(nextType !== "RULE-SET" && isIpCidrRuleType(nextType));
    if (nextType === "RULE-SET" && ["DIRECT", "REJECT"].includes(newRuleTarget)) {
      setNewRuleTarget(enabledGroupNames[0] ?? "");
    }
  };

  const startEditingRule = (rule: CustomRule) => {
    setEditingRuleId(rule.id);
    setEditingRuleDraft({
      ...rule,
      target: resolveTargetName(rule.target),
      noResolve: Boolean(rule.noResolve),
    });
  };

  const cancelEditingRule = () => {
    setEditingRuleId(null);
    setEditingRuleDraft(null);
  };

  const saveEditingRule = () => {
    if (!editingRuleId || !editingRuleDraft) return;
    const value = editingRuleDraft.value.trim();
    if (!value || !editingRuleDraft.target) return;
    const normalizedValue = normalizeCustomRuleValue(editingRuleDraft.type, value);
    if (!normalizedValue.ok) {
      toast({ title: normalizedValue.error, variant: "warning" });
      return;
    }

    updateCustomRule(editingRuleId, {
      type: editingRuleDraft.type,
      value: normalizedValue.value,
      target: toStableRuleTarget(resolveTargetName(editingRuleDraft.target), moduleNames, customProxyGroups),
      noResolve: Boolean(editingRuleDraft.noResolve) && supportsNoResolve(editingRuleDraft.type),
    });
    cancelEditingRule();
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className={RULE_HEADER_ROW_CLASS}>
        <span className="text-xs font-medium text-fg-80">
          方法二：手动添加规则
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setBatchImportOpen(true)}
          disabled={!newRuleTarget}
          className={RULE_HEADER_ACTION_BUTTON_CLASS}
        >
          批量导入
        </Button>
      </div>

      <ProxyGroupsCustomRulesBatchDialog
        open={batchImportOpen}
        onOpenChange={setBatchImportOpen}
        defaultType={newRuleType}
        defaultTarget={newRuleTarget}
        defaultNoResolve={newRuleNoResolve}
        targetOptions={batchTargetOptions}
        ruleSetTargetOptions={enabledGroupNames}
        existingRules={customRules.map((rule) => ({ ...rule, target: resolveTargetName(rule.target) }))}
        existingRuleSets={customRuleSets.map((rule) => ({ ...rule, target: resolveTargetName(rule.target) }))}
        reservedRuleSetIds={PROXY_GROUP_MODULES.flatMap((module) => module.rules.map((rule) => rule.id))}
        onImportRuleSets={(rules) => {
          for (const rule of rules) {
            const target = toStableRuleTarget(resolveTargetName(rule.target), moduleNames, customProxyGroups);
            if (typeof target !== "string") addModuleRules(target, [rule]);
          }
        }}
        onImport={(rules) =>
          addCustomRules(
            rules.map((rule) => ({
              ...rule,
              target: toStableRuleTarget(resolveTargetName(rule.target), moduleNames, customProxyGroups),
            })),
          )
        }
      />

      <div className={RULE_ADD_ROW_FRAME_CLASS}>
        <div className={RULE_EDIT_ROW_CLASS}>
          <div className={RULE_EDIT_PRIMARY_GROUP_CLASS}>
            <Select
              value={newRuleType}
              onValueChange={handleNewRuleTypeChange}
            >
              <SelectTrigger className="h-7 w-[112px] max-w-full shrink-0 text-xs">
                <span className="whitespace-normal text-left leading-tight">
                  {newRuleType === "RULE-SET" ? "规则集" : getRuleTypeLabel(newRuleType)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RULE-SET" className="text-xs">规则集 (RULE-SET)</SelectItem>
                {CUSTOM_RULE_TYPE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-xs"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RuleValueInput
              type={newRuleType}
              value={newRuleValue}
              onChange={(e) => setNewRuleValue(e.target.value)}
            />
          </div>
          <div className={RULE_EDIT_TRAILING_CONTROLS_CLASS}>
            <Select value={newRuleTarget} onValueChange={setNewRuleTarget}>
              <SelectTrigger className={RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.filter((target) => newRuleType !== "RULE-SET" || !["DIRECT", "REJECT"].includes(target)).map((target) => (
                  <SelectItem key={target} value={target} className="text-xs">
                    {target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-ink/5 px-2">
              <Switch
                aria-label="新规则不解析域名"
                checked={newRuleNoResolve && supportsNoResolve(newRuleType)}
                disabled={!supportsNoResolve(newRuleType)}
                onCheckedChange={setNewRuleNoResolve}
              />
              <span className="proxy-group-rule-no-resolve-label text-[10px] text-fg-50">no-resolve</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddCustomRule}
              disabled={!newRuleValue.trim()}
              className={RULE_TEXT_ACTION_BUTTON_CLASS}
            >
              添加规则
            </Button>
          </div>
        </div>
        <RuleTypeHint type={newRuleType} />
      </div>

      {customRules.length > 0 && (
        <div className="space-y-1 border-t border-ink/10 pt-2">
          <div className="flex min-h-5 items-center gap-2">
            <span className="text-[11px] font-medium text-fg-65">
              已添加规则
            </span>
            <span className="ml-auto text-[10px] text-fg-40">
              已添加 {customRules.length}
            </span>
          </div>
          {customRules.map((rule, index) => {
            const isEditing = editingRuleId === rule.id && editingRuleDraft;

            if (isEditing) {
              const editTargetOptions = getTargetOptions(
                enabledGroupNames,
                resolveTargetName(editingRuleDraft.target),
              );

              return (
                <div
                  key={rule.id}
                  className="rounded-md border border-indigo-400/20 bg-indigo-500/[0.08] p-1.5"
                >
                  <div className={RULE_EDIT_ROW_CLASS}>
                    <div className={RULE_EDIT_PRIMARY_GROUP_CLASS}>
                      <Select
                        value={editingRuleDraft.type}
                        onValueChange={(v) =>
                          setEditingRuleDraft((prev) =>
                            prev
                              ? { ...prev, type: v as CustomRule["type"], noResolve: Boolean(prev.noResolve) && supportsNoResolve(v) }
                              : prev,
                          )
                        }
                      >
                        <SelectTrigger className="h-7 w-[112px] max-w-full shrink-0 text-xs">
                          <span className="whitespace-normal text-left leading-tight">
                            {
                              getRuleTypeLabel(editingRuleDraft.type)
                            }
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {CUSTOM_RULE_TYPE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="text-xs"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <RuleValueInput
                        type={editingRuleDraft.type}
                        value={editingRuleDraft.value}
                        onChange={(e) =>
                          setEditingRuleDraft((prev) =>
                            prev ? { ...prev, value: e.target.value } : prev,
                          )
                        }
                      />
                    </div>
                    <div className={RULE_EDIT_TRAILING_CONTROLS_CLASS}>
                      <Select
                        value={resolveTargetName(editingRuleDraft.target)}
                        onValueChange={(target) =>
                          setEditingRuleDraft((prev) =>
                            prev ? { ...prev, target } : prev,
                          )
                        }
                      >
                        <SelectTrigger
                          className={RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {editTargetOptions.map((target) => (
                            <SelectItem
                              key={target}
                              value={target}
                              className="text-xs"
                            >
                              {target}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-ink/5 px-2">
                        <Switch
                          aria-label="编辑规则时不解析域名"
                          checked={Boolean(editingRuleDraft.noResolve) && supportsNoResolve(editingRuleDraft.type)}
                          disabled={!supportsNoResolve(editingRuleDraft.type)}
                          onCheckedChange={(noResolve) =>
                            setEditingRuleDraft((prev) =>
                              prev ? { ...prev, noResolve } : prev,
                            )
                          }
                        />
                        <span className="proxy-group-rule-no-resolve-label text-[10px] text-fg-50">
                          no-resolve
                        </span>
                      </div>
                      <div className={RULE_EDIT_ACTIONS_CLASS}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={saveEditingRule}
                          disabled={!editingRuleDraft.value.trim()}
                          className="h-7 w-7 shrink-0 p-0 text-emerald-300 hover:text-emerald-200"
                          title="保存规则"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditingRule}
                          className="h-7 w-7 shrink-0 p-0"
                          title="取消编辑"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            removeCustomRule(index);
                            cancelEditingRule();
                          }}
                          className="h-7 w-7 shrink-0 p-0 text-fg-40 hover:text-red-300"
                          title="删除规则"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <RuleTypeHint type={editingRuleDraft.type} />
                </div>
              );
            }
            const ruleTargetName =
              resolveTargetName(rule.target) || "目标分流组不可用";

            return (
              <div
                key={rule.id}
                className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border border-ink/10 bg-ink/[0.04] px-2 py-1 text-[10px]"
              >
                <span className={RULE_TYPE_BADGE_CLASS}>
                  {rule.type}
                </span>
                <span
                  className="min-w-0 break-all text-fg-75"
                  title={rule.value}
                >
                  {rule.value}
                </span>
                {rule.noResolve && supportsNoResolve(rule.type) && (
                  <span className="rounded border border-ink/10 bg-ink/5 px-1.5 py-0.5 text-fg-45">
                    no-resolve
                  </span>
                )}
                <ArrowRight className="h-3 w-3 shrink-0 text-fg-35" />
                <span
                  className="min-w-0 break-words rounded border border-ink/10 bg-ink/5 px-1.5 py-0.5 text-fg-70"
                  title={ruleTargetName}
                >
                  {ruleTargetName}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <IconButton
                    label="编辑规则"
                    variant="ghost"
                    type="button"
                    onClick={() => startEditingRule(rule)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-fg-35 transition-colors hover:bg-ink/10 hover:text-fg-80"
                  >
                    <Pencil className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label="删除规则"
                    variant="ghost"
                    type="button"
                    onClick={() => removeCustomRule(index)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-fg-30 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
