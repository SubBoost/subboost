"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ChevronRight, HelpCircle, Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import {
  getEffectiveModuleRuleItems,
  getExcludedModuleRuleIds,
  type HiddenPresetRuleIds,
} from "@subboost/core/generator/module-rules";
import type { ProxyGroupModule } from "@subboost/core/generator/proxy-groups";
import { DEFAULT_LOAD_BALANCE_STRATEGY, type LoadBalanceStrategy } from "@subboost/core/types/config";
import type { CustomProxyGroup, RuleSetDraft } from "@subboost/ui/store/config-store";
import { cn } from "@subboost/ui/lib/utils";
import type {
  CustomRuleListItem,
  ProxyGroupRuleTarget,
} from "./proxy-group-rule-targets";
import { ProxyGroupsModuleRulesPanel } from "./proxy-groups-module-rules-panel";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  ProxyGroupNameEditor,
} from "./proxy-group-name-editor";
import { ProxyGroupSummary } from "./proxy-group-summary";
import {
  ProxyGroupTypeMenu,
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
  type ProxyGroupTypeMenuValue,
} from "./proxy-group-type-menu";

function ModuleHintPopover({ moduleId }: { moduleId: string }) {
  const isGemini = moduleId === "gemini";
  const label = isGemini ? "Gemini 分流说明" : "谷歌学术分流说明";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 w-[340px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
        >
          {isGemini ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-amber-300" />
                <div className="text-white font-medium">Gemini 分流说明</div>
              </div>
              <div className="text-white/60 leading-relaxed">
                由于 Gemini 验证机制调整，Gemini 与 Google 需要分流到同一出口节点，否则可能出现登录/验证失败问题。
              </div>
              <ul className="ml-4 list-disc space-y-1 text-white/60">
                <li>默认：Gemini 位于 AI 服务分流之中</li>
                <li>也提供：单独的 Gemini 分流组供手动选择</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-amber-300" />
                <div className="text-white font-medium">谷歌学术分流说明</div>
              </div>
              <div className="text-white/60 leading-relaxed">
                谷歌学术对 IP 质量要求高于其它 Google 服务，建议使用IP质量更高的节点。
              </div>
              <ul className="ml-4 list-disc space-y-1 text-white/60">
                <li>默认：谷歌学术位于教育资源分流之中</li>
                <li>也提供：单独的谷歌学术分流组供手动选择</li>
              </ul>
            </div>
          )}
          <Popover.Arrow className="fill-white/10" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ProxyGroupsModuleCard({
  module,
  display,
  isCore,
  isEnabled,
  onToggleEnabled,
  isEditing,
  editingName,
  editingDescription,
  onChangeEditingName,
  onChangeEditingDescription,
  onStartEditing,
  onCancelEditing,
  onCommitEditing,
  onHide,
  extraRules,
  ruleSetsByTarget,
  hiddenPresetRuleIds,
  customProxyGroups,
  manualRules,
  manualRuleTargets,
  enabledProxyGroups,
  hiddenProxyGroups,
  proxyGroupNameOverrides,
  moduleRuleEditWarningAccepted,
  acceptModuleRuleEditWarning,
  isRulesExpanded,
  onToggleRulesExpanded,
  onAddRules,
  onAddRulesToModule,
  onAddRuleToCustomGroup,
  onRemoveExtraRule,
  onMoveRule,
  onMoveManualRule,
  onRemoveManualRule,
  onRestoreRule,
  onResetRuleTarget,
  cnIpNoResolve,
  onChangeCnIpNoResolve,
  experimentalCnUseCnRuleSet,
  onChangeExperimentalCnUseCnRuleSet,
  description,
  groupType,
  strategy,
  onChangeGroupType,
  rulesContentOverride,
  rulesCountOverride,
  advancedMode = false,
  nodeCount = 0,
  renderAdvancedContent,
}: {
  module: ProxyGroupModule;
  display: { full: string };
  isCore: boolean;
  isEnabled: boolean;
  onToggleEnabled: () => void;
  isEditing: boolean;
  editingName: string;
  editingDescription?: string;
  onChangeEditingName: (value: string) => void;
  onChangeEditingDescription?: (value: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onCommitEditing: () => void;
  onHide: () => void;
  extraRules: RuleSetDraft[];
  ruleSetsByTarget: Record<string, RuleSetDraft[]>;
  hiddenPresetRuleIds: HiddenPresetRuleIds;
  customProxyGroups: CustomProxyGroup[];
  manualRules: CustomRuleListItem[];
  manualRuleTargets: ProxyGroupRuleTarget[];
  enabledProxyGroups: string[];
  hiddenProxyGroups: string[];
  proxyGroupNameOverrides: Record<string, string>;
  moduleRuleEditWarningAccepted: boolean;
  acceptModuleRuleEditWarning: () => void;
  isRulesExpanded: boolean;
  onToggleRulesExpanded: () => void;
  onAddRules: (rules: RuleSetDraft[]) => void;
  onAddRulesToModule: (moduleId: string, rules: RuleSetDraft[]) => void;
  onAddRuleToCustomGroup: (groupId: string, rule: RuleSetDraft) => void;
  onRemoveExtraRule: (ruleId: string) => void;
  onMoveRule: (ruleId: string, target: { kind: "module" | "custom"; id: string }) => void;
  onMoveManualRule: (ruleId: string, target: ProxyGroupRuleTarget) => void;
  onRemoveManualRule: (index: number) => void;
  onRestoreRule: (ruleId: string) => void;
  onResetRuleTarget: (ruleId: string) => void;
  cnIpNoResolve: boolean;
  onChangeCnIpNoResolve: (value: boolean) => void;
  experimentalCnUseCnRuleSet: boolean;
  onChangeExperimentalCnUseCnRuleSet: (value: boolean) => void;
  description?: string;
  groupType?: ProxyGroupTypeMenuValue;
  strategy?: LoadBalanceStrategy;
  onChangeGroupType?: (next: { groupType: ProxyGroupTypeMenuValue; strategy?: LoadBalanceStrategy }) => void;
  rulesContentOverride?: React.ReactNode;
  rulesCountOverride?: number;
  advancedMode?: boolean;
  nodeCount?: number;
  renderAdvancedContent?: (rulesContent: React.ReactNode, rulesCount: number) => React.ReactNode;
}) {
  const effectiveRules = getEffectiveModuleRuleItems(module, ruleSetsByTarget, hiddenPresetRuleIds);
  const excludedRuleIds = getExcludedModuleRuleIds(module.id, hiddenPresetRuleIds);
  const excludedRules = module.rules.filter((rule) => rule?.id && excludedRuleIds.has(rule.id));
  const excludedCount = excludedRules.length;
  const totalRules = rulesCountOverride ?? (effectiveRules.length + manualRules.length);
  const hasRuleManagement = rulesContentOverride !== undefined
    ? totalRules > 0
    : module.rules.length + extraRules.length + excludedCount + manualRules.length > 0;
  const hasExpandedContent = hasRuleManagement || advancedMode;
  const showGeminiScholarHint = !isEditing && (module.id === "gemini" || module.id === "google-scholar");
  const effectiveGroupType = groupType ?? (module.groupType as ProxyGroupTypeMenuValue);
  const typeLabel =
    effectiveGroupType === "load-balance"
      ? `${getProxyGroupTypeLabel(effectiveGroupType)} / ${getLoadBalanceStrategyLabel(
          strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY,
        )}`
      : getProxyGroupTypeLabel(effectiveGroupType);
  const summaryItems = [
    { label: description ?? module.description ?? "", tone: "accent" as const },
    { label: `${totalRules} 规则`, tone: "success" as const },
    { label: `${nodeCount} 节点`, tone: "muted" as const },
  ];
  const rulesContent = rulesContentOverride !== undefined ? rulesContentOverride : hasRuleManagement ? (
    <ProxyGroupsModuleRulesPanel
      module={module}
      enabledProxyGroups={enabledProxyGroups}
      hiddenProxyGroups={hiddenProxyGroups}
      ruleSetsByTarget={ruleSetsByTarget}
      hiddenPresetRuleIds={hiddenPresetRuleIds}
      customProxyGroups={customProxyGroups}
      manualRules={manualRules}
      manualRuleTargets={manualRuleTargets}
      proxyGroupNameOverrides={proxyGroupNameOverrides}
      moduleRuleEditWarningAccepted={moduleRuleEditWarningAccepted}
      acceptModuleRuleEditWarning={acceptModuleRuleEditWarning}
      onAddRules={onAddRules}
      onAddRulesToModule={onAddRulesToModule}
      onAddRuleToCustomGroup={onAddRuleToCustomGroup}
      onRemoveRule={onRemoveExtraRule}
      onMoveRule={onMoveRule}
      onMoveManualRule={onMoveManualRule}
      onRemoveManualRule={onRemoveManualRule}
      onRestoreRule={onRestoreRule}
      onResetRuleTarget={onResetRuleTarget}
      cnIpNoResolve={cnIpNoResolve}
      onChangeCnIpNoResolve={onChangeCnIpNoResolve}
      experimentalCnUseCnRuleSet={experimentalCnUseCnRuleSet}
      onChangeExperimentalCnUseCnRuleSet={onChangeExperimentalCnUseCnRuleSet}
    />
  ) : null;

  return (
    <div className="overflow-hidden rounded border border-white/10 bg-white/5">
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-2 py-2",
          hasExpandedContent && "cursor-pointer transition-colors hover:bg-white/5"
        )}
        onClick={() => {
          if (hasExpandedContent) onToggleRulesExpanded();
        }}
        title={hasExpandedContent ? (isRulesExpanded ? "收起" : "展开") : undefined}
      >
        {!isEditing && (hasExpandedContent ? (
          isRulesExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-white/50" />
          )
        ) : (
          <span className="h-4 w-4 shrink-0" />
        ))}
        <div className={cn("min-w-0", isEditing && "col-span-3")}>
          {isEditing ? (
            <div
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  "min-w-0",
                  onChangeEditingDescription
                    ? "grid grid-cols-[minmax(5.75rem,1fr)_minmax(0,1.42fr)] gap-1"
                    : "flex-1",
                )}
              >
                <ProxyGroupNameEditor
                  value={parseProxyGroupNameDraft(editingName, module.emoji)}
                  onChange={(draft) => onChangeEditingName(buildProxyGroupName(draft))}
                  namePlaceholder="代理组名称"
                  allowEmptyEmoji={false}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommitEditing();
                    if (e.key === "Escape") onCancelEditing();
                  }}
                />
                {onChangeEditingDescription && (
                  <Input
                    value={editingDescription ?? ""}
                    placeholder="描述文本（默认: 自定义代理组）"
                    className="h-7 min-w-0 border-white/10 bg-white/5 text-xs"
                    onChange={(event) => onChangeEditingDescription(event.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommitEditing();
                      if (e.key === "Escape") onCancelEditing();
                    }}
                  />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCommitEditing}
                className="h-7 px-2"
                title="保存"
                aria-label="保存"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelEditing}
                className="h-7 px-2"
                title="取消"
                aria-label="取消"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="proxy-group-module-header flex min-w-0 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="flex min-w-0 max-w-full items-center gap-2">
                <span className="min-w-0 break-words text-sm font-medium text-white">
                  {display.full}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {!isCore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditing();
                      }}
                      title="改名"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {showGeminiScholarHint && <ModuleHintPopover moduleId={module.id} />}
                </div>
              </div>
              <ProxyGroupSummary
                className="proxy-group-module-summary flex max-w-full shrink-0"
                disabled={!isEnabled}
                items={summaryItems}
              />
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex shrink-0 items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggleEnabled}
              onClick={(e) => e.stopPropagation()}
            />
            {onChangeGroupType && (
              <ProxyGroupTypeMenu
                value={effectiveGroupType}
                strategy={strategy}
                onChange={onChangeGroupType}
                contentAlign="end"
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-white/35 hover:text-indigo-200"
                    title={`类型：${typeLabel}`}
                    aria-label={`修改 ${display.full} 类型`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-white/30 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onHide();
              }}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {isRulesExpanded &&
        (advancedMode && renderAdvancedContent
          ? renderAdvancedContent(rulesContent, totalRules)
          : rulesContent)}
    </div>
  );
}
