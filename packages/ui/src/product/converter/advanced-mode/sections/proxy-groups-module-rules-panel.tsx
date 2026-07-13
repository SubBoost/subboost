"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { HelpCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { Switch } from "@subboost/ui/components/ui/switch";
import { PROXY_GROUP_MODULES, type ProxyGroupModule, type ProxyGroupRule } from "@subboost/core/generator/proxy-groups";
import {
  type EffectiveModuleRule,
  getEffectiveModuleRuleItems,
  getExcludedModuleRuleIds,
  isModuleRuleMovedFrom,
  type HiddenPresetRuleIds,
} from "@subboost/core/generator/module-rules";
import { EXPERIMENTAL_CN_RULE } from "@subboost/core/generator/rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { cn } from "@subboost/ui/lib/utils";
import { useProductApiAdapter } from "@subboost/ui/product/api-adapter";
import type { CustomProxyGroup, RuleSetDraft } from "@subboost/ui/store/config-store";
import type {
  CustomRuleListItem,
  ProxyGroupRuleTarget,
} from "./proxy-group-rule-targets";
import {
  ProxyGroupManualRuleRow,
  ProxyGroupRuleMoveMenu,
  ProxyGroupRuleSetRow,
  isRuleSetMoveTarget,
  type RuleSetMoveTarget,
} from "./proxy-group-rule-row";
import { CnIpNoResolveHelpButton, ExperimentalCnRuleHelpButton } from "./proxy-groups-module-rules-help";

type MoveTarget = { kind: "module" | "custom"; id: string };
type ActiveRuleRow = EffectiveModuleRule & { state: "active" };
type InactiveRuleRow = ProxyGroupRule & { source: "preset"; state: "removed" | "moved" };
type RuleRow = ActiveRuleRow | InactiveRuleRow;
type CnCandidateRule = {
  id: string;
  name: string;
  behavior: "domain";
  path: string;
  parentRuleId?: string;
  parentModuleId?: string;
};

function isModuleRuleMoveTarget(target: ProxyGroupRuleTarget): target is ProxyGroupRuleTarget & MoveTarget {
  return target.kind === "module" || target.kind === "custom";
}

function isCnCandidateRule(value: unknown): value is CnCandidateRule {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.path === "string" &&
    item.behavior === "domain"
  );
}

function normalizeCnCandidateRules(payload: unknown): CnCandidateRule[] {
  const items =
    payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return items
    .filter(isCnCandidateRule)
    .map((item) => ({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : item.id,
      behavior: "domain" as const,
      path: item.path,
      parentRuleId: typeof item.parentRuleId === "string" ? item.parentRuleId : undefined,
      parentModuleId: typeof item.parentModuleId === "string" ? item.parentModuleId : undefined,
    }));
}

export function ProxyGroupsModuleRulesPanel({
  module,
  enabledProxyGroups,
  hiddenProxyGroups,
  ruleSetsByTarget,
  hiddenPresetRuleIds,
  customProxyGroups,
  manualRules,
  manualRuleTargets,
  proxyGroupNameOverrides,
  moduleRuleEditWarningAccepted,
  acceptModuleRuleEditWarning,
  onAddRules,
  onAddRulesToModule,
  onAddRuleToCustomGroup,
  onRemoveRule,
  onMoveRule,
  onMoveManualRule,
  onRemoveManualRule,
  onRestoreRule,
  onResetRuleTarget,
  cnIpNoResolve,
  onChangeCnIpNoResolve,
  experimentalCnUseCnRuleSet,
  onChangeExperimentalCnUseCnRuleSet,
}: {
  module: ProxyGroupModule;
  enabledProxyGroups: string[];
  hiddenProxyGroups: string[];
  ruleSetsByTarget: Record<string, RuleSetDraft[]>;
  hiddenPresetRuleIds: HiddenPresetRuleIds;
  customProxyGroups: CustomProxyGroup[];
  manualRules: CustomRuleListItem[];
  manualRuleTargets: ProxyGroupRuleTarget[];
  proxyGroupNameOverrides: Record<string, string>;
  moduleRuleEditWarningAccepted: boolean;
  acceptModuleRuleEditWarning: () => void;
  onAddRules: (rules: RuleSetDraft[]) => void;
  onAddRulesToModule: (moduleId: string, rules: RuleSetDraft[]) => void;
  onAddRuleToCustomGroup: (groupId: string, rule: RuleSetDraft) => void;
  onRemoveRule: (ruleId: string) => void;
  onMoveRule: (ruleId: string, target: MoveTarget) => void;
  onMoveManualRule: (ruleId: string, target: ProxyGroupRuleTarget) => void;
  onRemoveManualRule: (index: number) => void;
  onRestoreRule: (ruleId: string) => void;
  onResetRuleTarget: (ruleId: string) => void;
  cnIpNoResolve: boolean;
  onChangeCnIpNoResolve: (value: boolean) => void;
  experimentalCnUseCnRuleSet: boolean;
  onChangeExperimentalCnUseCnRuleSet: (value: boolean) => void;
}) {
  const rulesApi = useProductApiAdapter().rules;
  const enabledProxyGroupsKey = React.useMemo(
    () => enabledProxyGroups.map((id) => id.trim()).filter(Boolean).join(","),
    [enabledProxyGroups]
  );
  const hiddenPresetRuleIdsKey = React.useMemo(
    () =>
      Object.entries(hiddenPresetRuleIds || {})
        .flatMap(([moduleId, ruleIds]) =>
          Array.isArray(ruleIds)
            ? ruleIds.map((ruleId) => `${moduleId.trim()}:${String(ruleId).trim()}`)
            : []
        )
        .map((key) => key.trim())
        .filter((key) => key && !key.endsWith(":"))
        .sort((a, b) => a.localeCompare(b))
        .join(","),
    [hiddenPresetRuleIds]
  );
  const [cnCandidateRules, setCnCandidateRules] = React.useState<CnCandidateRule[]>([]);

  const activeRules = React.useMemo(
    () => getEffectiveModuleRuleItems(module, ruleSetsByTarget, hiddenPresetRuleIds),
    [module, hiddenPresetRuleIds, ruleSetsByTarget]
  );

  const inactiveRules = React.useMemo<InactiveRuleRow[]>(() => {
    const excluded = getExcludedModuleRuleIds(module.id, hiddenPresetRuleIds);
    return module.rules
      .filter((rule) => rule?.id && excluded.has(rule.id))
      .map((rule) => ({
        ...rule,
        source: "preset" as const,
        state: isModuleRuleMovedFrom(module.id, rule.id, ruleSetsByTarget)
          ? "moved" as const
          : "removed" as const,
      }));
  }, [module, hiddenPresetRuleIds, ruleSetsByTarget]);

  const rules = React.useMemo<RuleRow[]>(
    () => [
      ...activeRules.map((rule) => ({ ...rule, state: "active" as const })),
      ...inactiveRules,
    ],
    [activeRules, inactiveRules]
  );

  const activeRuleIds = React.useMemo(() => new Set(activeRules.map((rule) => rule.id)), [activeRules]);
  const availableCnCandidateRules = React.useMemo(
    () => cnCandidateRules.filter((rule) => !activeRuleIds.has(rule.id)),
    [activeRuleIds, cnCandidateRules]
  );
  const visibleProxyGroupModules = React.useMemo(() => {
    const hidden = new Set(hiddenProxyGroups);
    return PROXY_GROUP_MODULES.filter((targetModule) => !hidden.has(targetModule.id));
  }, [hiddenProxyGroups]);
  const moduleDisplayName = React.useMemo(
    () => resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
    [module, proxyGroupNameOverrides],
  );
  const ruleSetMoveTargets = React.useMemo<RuleSetMoveTarget[]>(
    () => [
      ...visibleProxyGroupModules.map((targetModule) => ({
        kind: "module" as const,
        id: targetModule.id,
        name: resolveProxyGroupModuleName(targetModule, proxyGroupNameOverrides?.[targetModule.id]),
      })),
      ...customProxyGroups.filter((group) => group.enabled !== false).map((group) => ({
        kind: "custom" as const,
        id: group.id,
        name: group.name,
      })),
    ],
    [customProxyGroups, proxyGroupNameOverrides, visibleProxyGroupModules],
  );

  React.useEffect(() => {
    if (module.id !== "cn") {
      setCnCandidateRules([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (enabledProxyGroupsKey) params.set("modules", enabledProxyGroupsKey);
    if (hiddenPresetRuleIdsKey) params.set("excluded", hiddenPresetRuleIdsKey);

    if (!rulesApi?.loadCnCandidateRules) {
      setCnCandidateRules([]);
      return () => controller.abort();
    }

    rulesApi.loadCnCandidateRules({
      moduleIds: (params.get("modules") || "").split(",").map((item) => item.trim()).filter(Boolean),
      excludedRuleKeys: (params.get("excluded") || "").split(",").map((item) => item.trim()).filter(Boolean),
      signal: controller.signal,
    })
      .then((items) => {
        if (controller.signal.aborted) return;
        setCnCandidateRules(normalizeCnCandidateRules({ items }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setCnCandidateRules([]);
      });

    return () => controller.abort();
  }, [enabledProxyGroupsKey, module.id, hiddenPresetRuleIdsKey, rulesApi]);

  const ensurePresetEditWarning = React.useCallback(async () => {
    if (moduleRuleEditWarningAccepted) return true;

    const ok = await confirmDialog({
      title: "确认修改预设规则集？",
      description: (
        <span className="block pt-2">
          <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
            <span className="font-medium text-amber-200">警告：</span>
            删除或移动预设规则会改变当前配置的分流命中结果。
          </span>
          <span className="mt-3 block leading-6 text-white/65">
            如果你不知道修改规则集的影响，请不要动它。
          </span>
        </span>
      ),
      cancelText: "保持默认",
      confirmText: "继续修改",
      variant: "warning",
    });
    if (ok) acceptModuleRuleEditWarning();
    return ok;
  }, [acceptModuleRuleEditWarning, moduleRuleEditWarningAccepted]);

  const moveRule = React.useCallback(
    async (rule: EffectiveModuleRule, target: MoveTarget) => {
      if (rule.source === "preset" && !(await ensurePresetEditWarning())) return;
      onMoveRule(rule.id, target);
    },
    [ensurePresetEditWarning, onMoveRule]
  );
  const moveExperimentalCnRule = React.useCallback(
    (target: MoveTarget) => {
      const rule: RuleSetDraft = {
        id: EXPERIMENTAL_CN_RULE.id,
        name: EXPERIMENTAL_CN_RULE.name,
        behavior: EXPERIMENTAL_CN_RULE.behavior,
        path: EXPERIMENTAL_CN_RULE.path,
      };
      if (target.kind === "module") {
        onAddRulesToModule(target.id, [rule]);
      } else {
        onAddRuleToCustomGroup(target.id, rule);
      }
      onChangeExperimentalCnUseCnRuleSet(false);
    },
    [onAddRuleToCustomGroup, onAddRulesToModule, onChangeExperimentalCnUseCnRuleSet]
  );

  return (
    <div className="space-y-1">
      {rules.length === 0 && manualRules.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px] text-white/40">
          当前没有生效的规则集。
        </div>
      ) : (
        <div className="space-y-1">
          {rules.map((rule) => {
            if (rule.state !== "active") {
              const isCnIpRule = module.id === "cn" && rule.id === "cn-ip";
              return (
                <ProxyGroupRuleSetRow
                  key={`${rule.state}:${rule.id}`}
                  name={rule.name}
                  path={rule.path}
                  source="preset"
                  behavior={rule.behavior}
                  noResolve={isCnIpRule ? false : Boolean(rule.noResolve)}
                  state={rule.state}
                  actions={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2",
                        rule.state === "moved"
                          ? "text-orange-300/70 hover:text-orange-200"
                          : "text-red-300/70 hover:text-red-200",
                      )}
                      title={rule.state === "moved" ? "恢复默认目标" : "恢复规则集"}
                      aria-label={`${rule.state === "moved" ? "恢复默认目标" : "恢复"} ${rule.name} 规则集`}
                      onClick={() =>
                        rule.state === "moved"
                          ? onResetRuleTarget(rule.id)
                          : onRestoreRule(rule.id)
                      }
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              );
            }

            const isCnIpRule = module.id === "cn" && rule.id === "cn-ip";
            const ruleNoResolve = isCnIpRule ? cnIpNoResolve : Boolean(rule.noResolve);
            return (
              <ProxyGroupRuleSetRow
                key={`${rule.state}:${rule.id}`}
                name={rule.name}
                path={rule.path}
                source={rule.source}
                behavior={rule.behavior}
                noResolve={ruleNoResolve}
                actions={
                  <>
                    {isCnIpRule && (
                      <div className="flex h-7 shrink-0 items-center gap-1">
                        <CnIpNoResolveHelpButton />
                        <span className="proxy-group-rule-no-resolve-label text-[10px] text-white/50">no-resolve</span>
                        <Switch checked={cnIpNoResolve} onCheckedChange={onChangeCnIpNoResolve} />
                      </div>
                    )}
                    <ProxyGroupRuleMoveMenu
                      title="移动规则集"
                      ariaLabel={`移动 ${rule.name} 规则集`}
                      targets={ruleSetMoveTargets}
                      kinds={["module", "custom"]}
                      currentTarget={{ kind: "module", id: module.id, name: moduleDisplayName }}
                      onMove={(target) => {
                        if (isRuleSetMoveTarget(target) && isModuleRuleMoveTarget(target)) {
                          void moveRule(rule, target);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-white/35 hover:text-red-300"
                      title="删除规则集"
                      onClick={async () => {
                        if (rule.source === "preset" && !(await ensurePresetEditWarning())) return;
                        onRemoveRule(rule.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                }
              />
            );
          })}
          {manualRules.map((item) => (
            <ProxyGroupManualRuleRow
              key={`manual:${item.rule.id}`}
              item={item}
              targets={manualRuleTargets}
              currentTargetName={moduleDisplayName}
              onMove={(nextItem, target) => onMoveManualRule(nextItem.rule.id, target)}
              onRemove={({ index }) => onRemoveManualRule(index)}
            />
          ))}
        </div>
      )}

      {module.id === "cn" && (
        <div>
          <div
            className={cn(
              "proxy-group-rule-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded border border-white/10 bg-white/[0.04] px-2 py-2",
              !experimentalCnUseCnRuleSet && "border-red-500/20 bg-red-500/10"
            )}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "min-w-0 break-words text-xs font-medium leading-5",
                    experimentalCnUseCnRuleSet
                      ? "text-white"
                      : "text-white/50 line-through decoration-red-300/70"
                  )}
                  title={EXPERIMENTAL_CN_RULE.name}
                >
                  {EXPERIMENTAL_CN_RULE.name}
                </span>
                {!experimentalCnUseCnRuleSet && (
                  <Badge variant="outline" className="border-red-500/50 bg-red-500/10 px-1.5 py-0 text-[9px] text-red-300">
                    已移除
                  </Badge>
                )}
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-200">
                  实验性
                </Badge>
                <Badge variant="outline" className="border-white/10 bg-white/5 px-1.5 py-0 text-[9px] text-white/55">
                  域名
                </Badge>
              </div>

              <div
                className={cn(
                  "min-w-0 break-all font-mono text-[10px]",
                  experimentalCnUseCnRuleSet
                    ? "text-white/35"
                    : "text-white/30 line-through decoration-red-300/50"
                )}
                title={`${EXPERIMENTAL_CN_RULE.id} · ${EXPERIMENTAL_CN_RULE.path}`}
              >
                {EXPERIMENTAL_CN_RULE.path}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-1.5">
              {experimentalCnUseCnRuleSet ? (
                <>
                  <ExperimentalCnRuleHelpButton />
                  <ProxyGroupRuleMoveMenu
                    title="移动规则集"
                    ariaLabel={`移动 ${EXPERIMENTAL_CN_RULE.name} 规则集`}
                    targets={ruleSetMoveTargets}
                    kinds={["module", "custom"]}
                    currentTarget={{ kind: "module", id: module.id, name: moduleDisplayName }}
                    onMove={(target) => {
                      if (isRuleSetMoveTarget(target) && isModuleRuleMoveTarget(target)) {
                        moveExperimentalCnRule(target);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-white/35 hover:text-red-300"
                    title="删除规则集"
                    aria-label={`删除 ${EXPERIMENTAL_CN_RULE.name} 规则集`}
                    onClick={() => onChangeExperimentalCnUseCnRuleSet(false)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-300/70 hover:text-red-200"
                  title="恢复规则集"
                  aria-label={`恢复 ${EXPERIMENTAL_CN_RULE.name} 规则集`}
                  onClick={() => onChangeExperimentalCnUseCnRuleSet(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {module.id === "cn" && availableCnCandidateRules.length > 0 && (
        <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="text-xs font-medium text-white">中国相关子规则集</div>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  aria-label="实验性：中国业务子规则集"
                  title="实验性：中国业务子规则集"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="bottom"
                  align="start"
                  sideOffset={8}
                  className="z-50 w-[420px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
                >
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-amber-300" />
                      <div className="text-white font-medium">
                        实验性：中国业务子规则集
                      </div>
                    </div>
                    <div className="text-white/60 leading-relaxed">
                      这些是已启用规则集的中国子集，通常表示对应服务有中国业务；但不代表必然适合分流至
                      <span className="text-white/75"> 🔒 国内服务</span>，请按自身需求启用。
                    </div>
                  </div>
                  <Popover.Arrow className="fill-white/10" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <div className="space-y-1">
            {availableCnCandidateRules.map((rule) => (
              <div
                key={rule.id}
                className="proxy-group-rule-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded border border-white/10 bg-white/[0.03] px-2 py-2"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="min-w-0 break-words text-xs font-medium leading-5 text-white" title={rule.name}>
                      {rule.name}
                    </span>
                    <Badge variant="outline" className="border-white/10 bg-white/5 px-1.5 py-0 text-[9px] text-white/55">
                      域名
                    </Badge>
                    {rule.parentRuleId && (
                      <Badge variant="outline" className="border-white/10 bg-white/5 px-1.5 py-0 text-[9px] text-white/45">
                        {rule.parentRuleId}
                      </Badge>
                    )}
                  </div>
                  <div className="min-w-0 break-all font-mono text-[10px] text-white/35" title={`${rule.id} · ${rule.path}`}>
                    {rule.path}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-white/45 hover:text-emerald-200"
                    title="启用规则集"
                    aria-label={`启用 ${rule.name} 规则集`}
                    onClick={() =>
                      onAddRules([
                        {
                          id: rule.id,
                          name: rule.name,
                          behavior: rule.behavior,
                          path: rule.path,
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
