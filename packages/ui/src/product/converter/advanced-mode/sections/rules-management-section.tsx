"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ListOrdered } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import {
  buildGeneratedRuleEntries,
  hasFullRuleOrderKeys,
  type GeneratedRuleEntry,
} from "@subboost/core/generator/rules";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { SectionHeader } from "../section-header";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripTrailingSegment(value: string, segment: string): string {
  return segment && value.endsWith(segment)
    ? value.slice(0, -segment.length)
    : value;
}

function getRuleDisplayDetail(entry: GeneratedRuleEntry): string {
  let detail = entry.text;
  if (entry.noResolve) {
    detail = stripTrailingSegment(detail, ",no-resolve");
  }
  detail = stripTrailingSegment(detail, `,${entry.target.trim()}`);
  return detail || entry.text;
}

export function RulesManagementSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    enabledProxyGroups,
    customRules,
    customRuleSets,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    cnIpNoResolve,
    experimentalCnUseCnRuleSet,
    ruleOrder,
    setRuleOrder,
  } = useConfigStore();
  const [orderDrafts, setOrderDrafts] = React.useState<Record<string, string>>({});
  const allRulesMode = ruleOrder.length === 0 || hasFullRuleOrderKeys(ruleOrder);

  const entries = React.useMemo(
    () =>
      buildGeneratedRuleEntries({
        enabledModules: enabledProxyGroups,
        customRules,
        customRuleSets,
        builtinRuleEdits,
        proxyGroupNameOverrides,
        cnIpNoResolve,
        experimentalCnUseCnRuleSet,
        ruleOrder,
      }),
    [
      cnIpNoResolve,
      customRuleSets,
      customRules,
      enabledProxyGroups,
      experimentalCnUseCnRuleSet,
      builtinRuleEdits,
      proxyGroupNameOverrides,
      ruleOrder,
    ]
  );

  const preMatchEntries = React.useMemo(
    () => entries.filter((entry) => entry.key !== "special:match"),
    [entries]
  );
  const preMatchKeys = React.useMemo(() => preMatchEntries.map((entry) => entry.key), [preMatchEntries]);
  const editableEntries = React.useMemo(() => entries.filter((entry) => entry.editable), [entries]);
  const editableKeys = React.useMemo(() => editableEntries.map((entry) => entry.key), [editableEntries]);
  const movableKeys = allRulesMode ? preMatchKeys : editableKeys;

  const applyRuleOrder = React.useCallback(
    (nextRuleOrder: string[]) => {
      setRuleOrder(nextRuleOrder);
      setOrderDrafts((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (!editableKeys.includes(key)) delete next[key];
        }
        return next;
      });
    },
    [editableKeys, setRuleOrder]
  );

  const moveRule = React.useCallback(
    (key: string, direction: "up" | "down") => {
      const from = movableKeys.indexOf(key);
      if (from < 0) return;
      const to = clamp(direction === "up" ? from - 1 : from + 1, 0, movableKeys.length - 1);
      if (to === from) return;
      const next = movableKeys.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      applyRuleOrder(next);
    },
    [applyRuleOrder, movableKeys]
  );

  const setRuleAbsoluteOrder = React.useCallback(
    (key: string, absoluteOrder: number) => {
      const from = movableKeys.indexOf(key);
      if (from < 0 || !Number.isFinite(absoluteOrder)) return;
      const to = clamp(Math.floor(absoluteOrder) - 1, 0, movableKeys.length - 1);
      if (to === from) return;
      const next = movableKeys.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      applyRuleOrder(next);
    },
    [applyRuleOrder, movableKeys]
  );

  const handleToggleAllRulesMode = React.useCallback(
    async (checked: boolean) => {
      if (!checked) {
        applyRuleOrder(editableKeys);
        return;
      }

      const ok = await confirmDialog({
        title: "开启“调整所有规则顺序”？",
        description: (
          <span className="block pt-2">
            <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
              <span className="font-medium text-amber-200">警告：</span>
              开启后，你可以移动任意规则到任意位置，这会改变分流优先级与命中结果。
            </span>
            <span className="mt-3 block leading-6 text-white/65">
              如果你不知道调整规则顺序的影响，请不要动它。
            </span>
          </span>
        ),
        cancelText: "保持默认",
        confirmText: "继续开启",
        variant: "warning",
      });
      if (!ok) return;
      applyRuleOrder(preMatchKeys);
    },
    [applyRuleOrder, editableKeys, preMatchKeys]
  );

  return (
    <div>
      <SectionHeader
        icon={ListOrdered}
        title="规则管理"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <Badge variant="outline" className="ml-auto shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            可调 {allRulesMode ? preMatchEntries.length : editableEntries.length} / 全部 {entries.length}
          </Badge>
        }
      />

      {isExpanded && (
        <div className="mt-2 pl-6 space-y-2">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-[1_1_13rem] text-[11px] leading-5 text-white/60">
                {allRulesMode
                  ? "已开启全规则排序：可移动任意规则，但 MATCH 固定最后。"
                  : "默认只能调整自定义规则顺序。"}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="text-[11px] whitespace-nowrap text-white/55">调整所有规则顺序</span>
                <Switch
                  checked={allRulesMode}
                  onCheckedChange={handleToggleAllRulesMode}
                  disabled={preMatchEntries.length <= 1}
                />
              </div>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-black/10 pr-1 custom-scrollbar">
            {entries.map((entry, index) => {
              const movableIndex = movableKeys.indexOf(entry.key);
              const canEditOrder = entry.key !== "special:match" && (allRulesMode || entry.editable);
              const canMoveUp = canEditOrder && movableIndex > 0;
              const canMoveDown = canEditOrder && movableIndex >= 0 && movableIndex < movableKeys.length - 1;
              const absoluteOrder = allRulesMode ? index + 1 : movableIndex + 1;
              const displayDetail = getRuleDisplayDetail(entry);
              const shouldShowSourceLabel =
                entry.sourceLabel.trim() !== entry.target.trim() &&
                entry.sourceLabel.trim() !== "系统规则";

              return (
                <div
                  key={entry.key}
                  className="border-b border-white/10 bg-white/5 px-3 py-1.5 last:border-b-0"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <div className="w-4 shrink-0 pt-1 text-right text-[10px] tabular-nums text-white/35">
                        {absoluteOrder}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-0 max-w-full break-words text-xs font-medium leading-5 text-white">{entry.summary}</span>
                          {shouldShowSourceLabel && (
                            <Badge variant="outline" className="max-w-full border-white/10 bg-white/5 text-white/60">
                              {entry.sourceLabel}
                            </Badge>
                          )}
                          <Badge variant="outline" className="max-w-full border-indigo-500/30 bg-indigo-500/10 text-indigo-200">
                            {entry.target}
                          </Badge>
                          {entry.noResolve && (
                            <Badge variant="outline" className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-200">
                              no-resolve
                            </Badge>
                          )}
                        </div>

                        <div className="rule-management-entry-detail font-mono text-[11px] break-all text-white/45" title={entry.text}>
                          {displayDetail}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-h-10 min-w-[8.75rem] shrink-0 items-center justify-end gap-1.5">
                      <span className="text-[11px] whitespace-nowrap text-white/45">顺序:</span>
                      <Input
                        value={
                          Object.prototype.hasOwnProperty.call(orderDrafts, entry.key)
                            ? orderDrafts[entry.key]
                            : String(absoluteOrder)
                        }
                        onChange={(e) => {
                          if (!canEditOrder) return;
                          setOrderDrafts((prev) => ({ ...prev, [entry.key]: e.target.value }));
                        }}
                        onBlur={() => {
                          if (!canEditOrder) return;
                          const value = Number.parseInt(orderDrafts[entry.key] ?? "", 10);
                          if (Number.isFinite(value)) {
                            setRuleAbsoluteOrder(entry.key, value);
                          }
                          setOrderDrafts((prev) => {
                            const { [entry.key]: _removed, ...rest } = prev;
                            return rest;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setOrderDrafts((prev) => {
                              const { [entry.key]: _removed, ...rest } = prev;
                              return rest;
                            });
                            return;
                          }
                          if (!canEditOrder) return;
                          if (e.key === "Enter") {
                            const value = Number.parseInt(orderDrafts[entry.key] ?? "", 10);
                            if (Number.isFinite(value)) {
                              setRuleAbsoluteOrder(entry.key, value);
                            }
                            setOrderDrafts((prev) => {
                              const { [entry.key]: _removed, ...rest } = prev;
                              return rest;
                            });
                          }
                        }}
                        inputMode="numeric"
                        title="最终规则行号（1=最前）"
                        disabled={!canEditOrder}
                        className="h-8 w-16 shrink-0 rounded-lg border-white/10 bg-white/10 px-1 text-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveRule(entry.key, "up")}
                          disabled={!canMoveUp}
                          className="flex h-4 w-5 items-center justify-center text-white/30 transition-colors hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                          title="上移"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveRule(entry.key, "down")}
                          disabled={!canMoveDown}
                          className="flex h-4 w-5 items-center justify-center text-white/30 transition-colors hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                          title="下移"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
