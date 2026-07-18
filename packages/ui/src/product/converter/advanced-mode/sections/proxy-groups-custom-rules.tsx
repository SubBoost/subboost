"use client";

import * as React from "react";
import { ArrowRight, Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
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
import { useConfigStore } from "@subboost/ui/store/config-store";
import type { CustomProxyGroup, CustomRule, ProxyGroupRuleTarget } from "@subboost/core/types/config";
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
} from "./proxy-groups-rule-editor-layout";

const CUSTOM_RULE_TYPE_LABELS: Record<CustomRule["type"], string> = {
  DOMAIN: "域名 (DOMAIN)",
  "DOMAIN-SUFFIX": "域名后缀 (DOMAIN-SUFFIX)",
  "DOMAIN-KEYWORD": "域名关键词 (DOMAIN-KEYWORD)",
  "IP-CIDR": "IP 段 (IP-CIDR)",
  "IP-CIDR6": "IPv6 段 (IP-CIDR6)",
  GEOIP: "GeoIP (GEOIP)",
  GEOSITE: "GeoSite (GEOSITE)",
  "PROCESS-NAME": "进程名 (PROCESS-NAME)",
  "DST-PORT": "目标端口 (DST-PORT)",
  "SRC-PORT": "源端口 (SRC-PORT)",
};

const CUSTOM_RULE_TYPE_SHORT_LABELS: Record<CustomRule["type"], string> = {
  DOMAIN: "域名",
  "DOMAIN-SUFFIX": "域名后缀",
  "DOMAIN-KEYWORD": "域名关键词",
  "IP-CIDR": "IP 段",
  "IP-CIDR6": "IPv6 段",
  GEOIP: "GeoIP",
  GEOSITE: "GeoSite",
  "PROCESS-NAME": "进程名",
  "DST-PORT": "目标端口",
  "SRC-PORT": "源端口",
};

const CUSTOM_RULE_TYPE_OPTIONS = CUSTOM_RULE_TYPES.map((value) => ({
  value,
  label: CUSTOM_RULE_TYPE_LABELS[value],
}));

function getProductRuleKind(type: CustomRule["type"]): ProductRuleKind {
  if (type.startsWith("DOMAIN")) return "domain";
  if (type.startsWith("IP-CIDR")) return "ipcidr";
  if (type === "GEOIP" || type === "GEOSITE") return "geo";
  if (type === "PROCESS-NAME") return "process";
  if (type === "DST-PORT" || type === "SRC-PORT") return "port";
  return "unknown";
}

function isIpCidrRuleType(type: CustomRule["type"]): boolean {
  return type === "IP-CIDR" || type === "IP-CIDR6";
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
    addCustomRule,
    addCustomRules,
    updateCustomRule,
    removeCustomRule,
    enabledProxyGroups,
    customProxyGroups,
    proxyGroupNameOverrides,
  } = useConfigStore();

  const [newRuleType, setNewRuleType] =
    React.useState<CustomRule["type"]>("DOMAIN");
  const [newRuleValue, setNewRuleValue] = React.useState("");
  const [newRuleTarget, setNewRuleTarget] = React.useState("🚀 节点选择");
  const [newRuleNoResolve, setNewRuleNoResolve] = React.useState(false);
  const [batchImportOpen, setBatchImportOpen] = React.useState(false);
  const [editingRuleId, setEditingRuleId] = React.useState<string | null>(null);
  const [editingRuleDraft, setEditingRuleDraft] =
    React.useState<CustomRule | null>(null);
  const interactions = useProductInteractionAdapter();

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

  const resolveTargetName = React.useCallback(
    (target: CustomRule["target"]) =>
      resolveProxyGroupTargetName(target, {
        moduleNames,
        customProxyGroups,
      }),
    [customProxyGroups, moduleNames],
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

    addCustomRule({
      id: createCustomRuleId(),
      type: addedRuleType,
      value,
      target: toStableRuleTarget(newRuleTarget, moduleNames, customProxyGroups),
      noResolve: newRuleNoResolve,
    });
    interactions.ruleAdded?.({
      source: "manual",
      kind: getProductRuleKind(addedRuleType),
    });
    setNewRuleValue("");
    setNewRuleNoResolve(isIpCidrRuleType(addedRuleType));
  };

  const handleNewRuleTypeChange = (value: string) => {
    const nextType = value as CustomRule["type"];
    setNewRuleType(nextType);
    setNewRuleNoResolve(isIpCidrRuleType(nextType));
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

    updateCustomRule(editingRuleId, {
      type: editingRuleDraft.type,
      value,
      target: toStableRuleTarget(resolveTargetName(editingRuleDraft.target), moduleNames, customProxyGroups),
      noResolve: Boolean(editingRuleDraft.noResolve),
    });
    cancelEditingRule();
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className={RULE_HEADER_ROW_CLASS}>
        <span className="text-xs font-medium text-white/80">
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
        existingRules={customRules}
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
                <span className="truncate">
                  {CUSTOM_RULE_TYPE_SHORT_LABELS[newRuleType]}
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
            <Input
              value={newRuleValue}
              onChange={(e) => setNewRuleValue(e.target.value)}
              placeholder="值 (如: google.com)"
              className="h-7 min-w-0 flex-[1_1_4.5rem] text-xs"
            />
          </div>
          <div className={RULE_EDIT_TRAILING_CONTROLS_CLASS}>
            <Select value={newRuleTarget} onValueChange={setNewRuleTarget}>
              <SelectTrigger className={RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((target) => (
                  <SelectItem key={target} value={target} className="text-xs">
                    {target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2">
              <Switch
                aria-label="新规则不解析域名"
                checked={newRuleNoResolve}
                onCheckedChange={setNewRuleNoResolve}
              />
              <span className="proxy-group-rule-no-resolve-label text-[10px] text-white/50">no-resolve</span>
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
      </div>

      {customRules.length > 0 && (
        <div className="space-y-1 border-t border-white/10 pt-2">
          <div className="flex min-h-5 items-center gap-2">
            <span className="text-[11px] font-medium text-white/65">
              已添加规则
            </span>
            <span className="ml-auto text-[10px] text-white/40">
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
                              ? { ...prev, type: v as CustomRule["type"] }
                              : prev,
                          )
                        }
                      >
                        <SelectTrigger className="h-7 w-[112px] max-w-full shrink-0 text-xs">
                          <span className="truncate">
                            {
                              CUSTOM_RULE_TYPE_SHORT_LABELS[
                                editingRuleDraft.type
                              ]
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
                      <Input
                        value={editingRuleDraft.value}
                        onChange={(e) =>
                          setEditingRuleDraft((prev) =>
                            prev ? { ...prev, value: e.target.value } : prev,
                          )
                        }
                        className="h-7 min-w-0 flex-[1_1_4.5rem] text-xs"
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
                      <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2">
                        <Switch
                          aria-label="编辑规则时不解析域名"
                          checked={Boolean(editingRuleDraft.noResolve)}
                          onCheckedChange={(noResolve) =>
                            setEditingRuleDraft((prev) =>
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
                          className="h-7 w-7 shrink-0 p-0 text-white/40 hover:text-red-300"
                          title="删除规则"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            const ruleTargetName = resolveTargetName(rule.target);

            return (
              <div
                key={rule.id}
                className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px]"
              >
                <span className="rounded border border-indigo-400/20 bg-indigo-500/10 px-1.5 py-0.5 font-medium text-indigo-200">
                  自定义
                </span>
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-medium text-white/55">
                  {rule.type}
                </span>
                <span
                  className="min-w-0 max-w-[16rem] truncate text-white/75"
                  title={rule.value}
                >
                  {rule.value}
                </span>
                {rule.noResolve && (
                  <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/45">
                    no-resolve
                  </span>
                )}
                <ArrowRight className="h-3 w-3 shrink-0 text-white/35" />
                <span
                  className="max-w-[11rem] truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70"
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
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/10 hover:text-white/80"
                  >
                    <Pencil className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label="删除规则"
                    variant="ghost"
                    type="button"
                    onClick={() => removeCustomRule(index)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-300"
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
