"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Filter, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { toast } from "@subboost/ui/components/ui/toaster";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { cn } from "@subboost/ui/lib/utils";
import { REGION_PRESETS, getFilteredProxyGroupNodeNames } from "@subboost/core/filtered-proxy-groups";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { DEFAULT_LOAD_BALANCE_STRATEGY } from "@subboost/core/types/config";
import { buildSourceDisplayLabel } from "@subboost/ui/product/converter/source-display-label";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import { sourceTypeInfo } from "../constants";
import { SectionHeader } from "../section-header";
import {
  buildManualRuleTargets,
  listCustomRulesForTarget,
  type ProxyGroupRuleTarget,
} from "./proxy-group-rule-targets";
import { ProxyGroupManualRuleRow } from "./proxy-group-rule-row";
import {
  ProxyGroupTypeMenu,
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
  type ProxyGroupTypeMenuValue,
} from "./proxy-group-type-menu";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  pickRandomEmoji,
  ProxyGroupNameEditor,
  toProxyGroupNameDraft,
  type ProxyGroupNameDraft,
} from "./proxy-group-name-editor";
import { ProxyGroupSummary } from "./proxy-group-summary";

const FILTERED_SOURCE_LIST_HEIGHT_CLASS = "flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar pr-1";
const FILTERED_MATCHED_LIST_HEIGHT_CLASS = "max-h-28 overflow-y-auto custom-scrollbar pr-1";
const FILTERED_EXCLUDED_LIST_HEIGHT_CLASS = "max-h-24 overflow-y-auto custom-scrollbar pr-1";

export function FilteredProxyGroupsSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    sources,
    nodes,
    enabledProxyGroups,
    hiddenProxyGroups,
    customRules,
    filteredProxyGroups,
    customProxyGroups,
    dialerProxyGroups,
    proxyGroupNameOverrides,
    addFilteredProxyGroup,
    removeFilteredProxyGroup,
    updateFilteredProxyGroup,
    updateCustomRule,
    removeCustomRule,
  } = useConfigStore();

  const [expandedFilteredGroups, setExpandedFilteredGroups] = React.useState<Set<string>>(new Set());
  const [editingFilteredGroupId, setEditingFilteredGroupId] = React.useState<string | null>(null);
  const [editingFilteredGroupDraft, setEditingFilteredGroupDraft] = React.useState<ProxyGroupNameDraft>({
    emoji: "🧩",
    name: "",
  });
  const interactions = useProductInteractionAdapter();

  const resolveModuleFullName = React.useCallback(
    (module: (typeof PROXY_GROUP_MODULES)[number]) =>
      resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
    [proxyGroupNameOverrides]
  );

  const makeUniqueFilteredGroupName = React.useCallback(
    (baseName: string, excludeId?: string) => {
      const base = baseName.trim() || "筛选组";
      const used = new Set<string>();
      for (const m of PROXY_GROUP_MODULES) {
        used.add(resolveModuleFullName(m));
      }
      for (const g of customProxyGroups) {
        const name = typeof g.name === "string" ? g.name.trim() : "";
        if (name) used.add(name);
      }
      for (const g of dialerProxyGroups) {
        const name = typeof g.name === "string" ? g.name.trim() : "";
        if (name) used.add(name);
      }
      for (const g of filteredProxyGroups) {
        if (!g) continue;
        if (excludeId && g.id === excludeId) continue;
        const name = typeof g.name === "string" ? g.name.trim() : "";
        if (name) used.add(name);
      }

      if (!used.has(base)) return base;
      let i = 2;
      let candidate = `${base} (${i})`;
      while (used.has(candidate)) {
        i += 1;
        candidate = `${base} (${i})`;
      }
      return candidate;
    },
    [customProxyGroups, dialerProxyGroups, filteredProxyGroups, resolveModuleFullName]
  );

  const manualRuleTargets = React.useMemo(
    () =>
      buildManualRuleTargets({
        enabledProxyGroups,
        hiddenProxyGroups,
        customProxyGroups,
        filteredProxyGroups,
        proxyGroupNameOverrides,
      }),
    [customProxyGroups, enabledProxyGroups, filteredProxyGroups, hiddenProxyGroups, proxyGroupNameOverrides],
  );

  const moveManualRule = React.useCallback(
    (item: { rule: { id: string }; index: number }, target: ProxyGroupRuleTarget) => {
      updateCustomRule(item.rule.id, { target: target.name });
    },
    [updateCustomRule],
  );

  const handleAddFilteredGroup = () => {
    const emoji = pickRandomEmoji();
    const fallbackLabel = `筛选组 ${filteredProxyGroups.length + 1}`;
    const name = makeUniqueFilteredGroupName(`${emoji} ${fallbackLabel}`);

    addFilteredProxyGroup({
      emoji,
      name,
      enabled: true,
      groupType: "select",
      strategy: DEFAULT_LOAD_BALANCE_STRATEGY,
      sourceIds: [],
      regions: [],
      includeRegex: "",
      excludeRegex: "",
      excludedNodeNames: [],
    });
    interactions.proxyGroupAdded?.({ groupType: "filtered_select" });
  };

  const toggleFilteredGroupExpand = (groupId: string) => {
    setExpandedFilteredGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div>
      <SectionHeader
        icon={Filter}
        title="筛选代理组"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <Badge
            variant="outline"
            className={cn(
              "ml-auto",
              filteredProxyGroups.length > 0
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                : "border-white/15 bg-white/5 text-white/60"
            )}
          >
            {filteredProxyGroups.length > 0 ? `${filteredProxyGroups.length} 组` : "可选"}
          </Badge>
        }
      />

      {isExpanded && (
        <div className="mt-2 space-y-3 pl-6">
          {filteredProxyGroups.length === 0 ? (
            <div className="text-xs text-white/40 py-4 text-center">
              可在此创建仅包含部分节点的代理组
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProxyGroups.map((group) => {
                const matchedNodes = getFilteredProxyGroupNodeNames(nodes, { ...group, enabled: true });
                const excludedNodeNames = Array.isArray(group.excludedNodeNames)
                  ? Array.from(
                      new Set(
                        group.excludedNodeNames
                          .filter((n): n is string => typeof n === "string" && Boolean(n.trim()))
                          .map((n) => n.trim())
                      )
                    )
                  : [];
                const sourceIdSet = new Set(group.sourceIds);
                const selectedSourceCount = sources.filter((s) => sourceIdSet.has(s.id)).length;
                const isEditing = editingFilteredGroupId === group.id;
                const manualRules = listCustomRulesForTarget(customRules, group.name);

                const commitRename = () => {
                  const currentDraft = toProxyGroupNameDraft(editingFilteredGroupDraft);
                  const fallbackDraft =
                    currentDraft.name.trim()
                      ? currentDraft
                      : { ...currentDraft, name: "筛选组" };
                  const desired = buildProxyGroupName(fallbackDraft);
                  const unique = makeUniqueFilteredGroupName(desired, group.id);
                  const uniqueEmoji = parseProxyGroupNameDraft(unique, fallbackDraft.emoji).emoji;

                  updateFilteredProxyGroup(group.id, { emoji: uniqueEmoji, name: unique });
                  setEditingFilteredGroupId(null);
                  setEditingFilteredGroupDraft({ emoji: "🧩", name: "" });

                  if (unique !== desired) {
                    toast({
                      title: "筛选组名称已自动调整以避免重复",
                      description: `已改为：${unique}`,
                      variant: "warning",
                    });
                  }
                };

                const cancelRename = () => {
                  setEditingFilteredGroupId(null);
                  setEditingFilteredGroupDraft({ emoji: "🧩", name: "" });
                };

                return (
                  <div key={group.id} className="bg-white/5 rounded-lg border border-white/10">
                    <div
                      className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-white/5"
                      onClick={() => {
                        if (isEditing) return;
                        toggleFilteredGroupExpand(group.id);
                      }}
                    >
                      {expandedFilteredGroups.has(group.id) ? (
                        <ChevronDown className="h-4 w-4 text-white/50" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/50" />
                      )}

                      {isEditing ? (
                        <ProxyGroupNameEditor
                          value={editingFilteredGroupDraft}
                          onChange={setEditingFilteredGroupDraft}
                          namePlaceholder="筛选组"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") cancelRename();
                          }}
                        />
                      ) : (
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <div className="flex min-w-0 max-w-full items-center gap-1">
                            <span className="min-w-0 break-words text-sm font-medium text-white">
                              {group.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFilteredGroupId(group.id);
                                setEditingFilteredGroupDraft(parseProxyGroupNameDraft(group.name, group.emoji || ""));
                              }}
                              title="改名"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <ProxyGroupSummary
                            className="flex max-w-full shrink-0 justify-start text-left"
                            disabled={!group.enabled}
                            items={[
                              {
                                label:
                                  getProxyGroupTypeLabel(group.groupType) +
                                  (group.groupType === "load-balance"
                                    ? `/${getLoadBalanceStrategyLabel(group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY)}`
                                    : ""),
                                tone: "warning",
                              },
                              { label: selectedSourceCount > 0 ? `${selectedSourceCount} 源` : "全部源", tone: "info" },
                              {
                                label: group.regions.length > 0 ? `${group.regions.length} 地区` : "全部地区",
                                tone: "accent",
                              },
                              { label: `${matchedNodes.length} 节点`, tone: "success" },
                            ]}
                          />
                        </div>
                      )}

                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={commitRename} title="保存">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={cancelRename} title="取消">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex shrink-0 items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            checked={group.enabled}
                            onCheckedChange={(checked) => {
                              const nextEnabled = Boolean(checked);
                              if (!nextEnabled) {
                                updateFilteredProxyGroup(group.id, { enabled: false });
                                return;
                              }
                              const unique = makeUniqueFilteredGroupName(group.name, group.id);
                              updateFilteredProxyGroup(group.id, { enabled: true, name: unique });
                              if (unique !== group.name) {
                                toast({
                                  title: "筛选组名称已自动调整以避免重复",
                                  description: `已改为：${unique}`,
                                  variant: "warning",
                                });
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFilteredProxyGroup(group.id)}
                            className="h-7 shrink-0 px-2 text-white/30 hover:text-red-400"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {expandedFilteredGroups.has(group.id) && (
                      <div className="px-3 pt-3 pb-3 space-y-3 border-t border-white/10">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs text-white/60">导入源</div>
                            <div className={FILTERED_SOURCE_LIST_HEIGHT_CLASS}>
                              {sources.map((s, index) => {
                                const sourceLabel = buildSourceDisplayLabel({
                                  typeLabel: sourceTypeInfo[s.type]?.label ?? s.type,
                                  tag: s.tag,
                                  order: index + 1,
                                  total: sources.length,
                                  orderPlacement: "prefix",
                                });
                                const checked = sourceIdSet.has(s.id);

                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className={cn(
                                      "flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                                      checked ? "bg-indigo-500/20 text-indigo-200" : "hover:bg-white/5 text-white/70"
                                    )}
                                    onClick={() => {
                                      const next = new Set(sourceIdSet);
                                      if (next.has(s.id)) next.delete(s.id);
                                      else next.add(s.id);
                                      updateFilteredProxyGroup(group.id, { sourceIds: Array.from(next) });
                                    }}
                                  >
                                    <div
                                      className={cn(
                                        "h-3 w-3 rounded border flex items-center justify-center",
                                        checked ? "bg-indigo-500 border-indigo-500" : "border-white/30"
                                      )}
                                    >
                                      {checked && <span className="text-[10px] text-white">✓</span>}
                                    </div>
                                    <span className="truncate">{sourceLabel}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="text-[10px] text-white/40">不选择表示匹配所有导入源</div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs text-white/60">地区</div>
                            <div className="flex flex-wrap gap-1">
                              {REGION_PRESETS.map((region) => {
                                const selected = group.regions.includes(region.id);
                                return (
                                  <button
                                    key={region.id}
                                    type="button"
                                    className={cn(
                                      "px-2 py-1 rounded text-[10px] border transition-colors",
                                      selected
                                        ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-200"
                                        : "border-white/10 text-white/50 hover:bg-white/5"
                                    )}
                                    onClick={() => {
                                      const next = new Set(group.regions);
                                      if (next.has(region.id)) next.delete(region.id);
                                      else next.add(region.id);
                                      updateFilteredProxyGroup(group.id, { regions: Array.from(next) });
                                    }}
                                    title={
                                      region.keywords.length > 0 ? `关键词: ${region.keywords.join(", ")}` : undefined
                                    }
                                  >
                                    {region.emoji} {region.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="text-[10px] text-white/40">
                              不选择表示匹配所有地区
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="text-xs text-white/60">包含正则（可选）</div>
                              <Input
                                value={group.includeRegex ?? ""}
                                onChange={(e) =>
                                  updateFilteredProxyGroup(group.id, { includeRegex: e.target.value })
                                }
                                placeholder="例如: (IEPL|专线|家宽)"
                                className="h-8 text-xs bg-white/10"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs text-white/60">排除正则（可选）</div>
                              <Input
                                value={group.excludeRegex ?? ""}
                                onChange={(e) =>
                                  updateFilteredProxyGroup(group.id, { excludeRegex: e.target.value })
                                }
                                placeholder="例如: (测试|过期)"
                                className="h-8 text-xs bg-white/10"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs text-white/60">类型</div>
                              <ProxyGroupTypeMenu
                                value={(group.groupType || "select") as ProxyGroupTypeMenuValue}
                                strategy={group.strategy}
                                onChange={({ groupType, strategy }) =>
                                  updateFilteredProxyGroup(group.id, {
                                    groupType,
                                    ...(groupType === "load-balance"
                                      ? { strategy: strategy ?? group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY }
                                      : { strategy: undefined }),
                                  })
                                }
                                triggerClassName="h-8 text-xs bg-white/10 border-white/10"
                              />
                            </div>
                          </div>
                        </div>

                        {manualRules.length > 0 && (
                          <div className="space-y-1 border-t border-white/10 pt-2">
                            <div className="flex min-h-5 items-center gap-2">
                              <span className="text-[11px] font-medium text-white/65">
                                手动添加规则
                              </span>
                              <span className="ml-auto text-[10px] text-white/40">
                                已添加 {manualRules.length}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {manualRules.map((item) => (
                                <ProxyGroupManualRuleRow
                                  key={`manual:${item.rule.id}`}
                                  item={item}
                                  targets={manualRuleTargets}
                                  currentTargetName={group.name}
                                  onMove={moveManualRule}
                                  onRemove={({ index }) => removeCustomRule(index)}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-white/60">命中节点预览</div>
                            <div className="text-[10px] text-white/40">
                              {matchedNodes.length} 个
                            </div>
                          </div>
                          {matchedNodes.length === 0 ? (
                            <div className="text-[10px] text-white/40 py-2">暂无命中节点</div>
                          ) : (
                            <div className={FILTERED_MATCHED_LIST_HEIGHT_CLASS}>
                              <div className="flex flex-wrap gap-1">
                                {matchedNodes.map((name) => (
                                  <Badge
                                    key={name}
                                    variant="secondary"
                                    className="h-5 pl-2 pr-1 text-[10px] font-medium text-white/80 bg-white/5 border border-white/10"
                                    title={name}
                                  >
                                    <span className="max-w-[220px] truncate">{name}</span>
                                    <button
                                      type="button"
                                      className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded text-white/50 transition-colors hover:bg-red-500/20 hover:text-red-300"
                                      title="排除该节点"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const next = new Set(excludedNodeNames);
                                        next.add(name);
                                        updateFilteredProxyGroup(group.id, { excludedNodeNames: Array.from(next) });
                                      }}
                                    >
                                      ×
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {excludedNodeNames.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] text-white/40">已排除节点（可恢复）</div>
                                <button
                                  type="button"
                                  className="text-[10px] text-white/40 transition-colors hover:text-white/70"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateFilteredProxyGroup(group.id, { excludedNodeNames: [] });
                                  }}
                                >
                                  全部恢复
                                </button>
                              </div>
                              <div className={FILTERED_EXCLUDED_LIST_HEIGHT_CLASS}>
                                <div className="flex flex-wrap gap-1">
                                  {excludedNodeNames.map((name) => (
                                    <Badge
                                      key={`excluded:${name}`}
                                      variant="secondary"
                                      className="h-5 pl-2 pr-1 text-[10px] font-medium text-white/70 bg-red-500/10 border border-red-500/30"
                                      title={name}
                                    >
                                      <span className="max-w-[220px] truncate">{name}</span>
                                      <button
                                        type="button"
                                        className="ml-1 inline-flex h-3.5 px-1 items-center justify-center rounded text-[10px] text-red-200/80 transition-colors hover:bg-red-500/20 hover:text-red-100"
                                        title="恢复该节点"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateFilteredProxyGroup(group.id, {
                                            excludedNodeNames: excludedNodeNames.filter((item) => item !== name),
                                          });
                                        }}
                                      >
                                        恢复
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs border-dashed border-white/20 text-white/50 hover:text-white/70 hover:border-white/30"
            onClick={handleAddFilteredGroup}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            添加筛选组
          </Button>
        </div>
      )}
    </div>
  );
}
