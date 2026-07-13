"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Link as LinkIcon, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { toast } from "@subboost/ui/components/ui/toaster";
import { DEFAULT_LOAD_BALANCE_STRATEGY, type ProxyGroupGroupType } from "@subboost/core/types/config";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { cn } from "@subboost/ui/lib/utils";
import { useConfigStore, PRESET_RELAY_NAMES } from "@subboost/ui/store/config-store";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import { SectionHeader } from "../section-header";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  ProxyGroupNameEditor,
  type ProxyGroupNameDraft,
} from "./proxy-group-name-editor";
import { ProxyGroupSummary } from "./proxy-group-summary";
import { GroupListenerPortBadge } from "./proxy-groups-group-listeners";
import {
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
  ProxyGroupTypeMenu,
} from "./proxy-group-type-menu";

type DialerSelectableNode = {
  name: string;
  type: string;
};

const DIRECT_RELAY_OPTION: DialerSelectableNode = { name: "DIRECT", type: "DIRECT" };
const DIALER_NODE_LIST_HEIGHT_CLASS = "max-h-56 overflow-y-auto custom-scrollbar space-y-1";

export function DialerProxyGroupsSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    nodes,
    dialerProxyGroups,
    customProxyGroups,
    proxyGroupNameOverrides,
    addDialerProxyGroup,
    removeDialerProxyGroup,
    updateDialerProxyGroup,
    addNodeToDialerGroup,
    removeNodeFromDialerGroup,
  } = useConfigStore();

  const [expandedDialerGroups, setExpandedDialerGroups] = React.useState<Set<string>>(new Set());
  const [showDialerMenu, setShowDialerMenu] = React.useState(false);
  const [customDialerDraft, setCustomDialerDraft] = React.useState<ProxyGroupNameDraft>({
    emoji: "🔗",
    name: "",
  });
  const [editingDialerGroupId, setEditingDialerGroupId] = React.useState<string | null>(null);
  const [editingDialerGroupDraft, setEditingDialerGroupDraft] = React.useState<ProxyGroupNameDraft>({
    emoji: "🔗",
    name: "",
  });
  const [relaySearchByGroupId, setRelaySearchByGroupId] = React.useState<Record<string, string>>({});
  const [targetSearchByGroupId, setTargetSearchByGroupId] = React.useState<Record<string, string>>({});
  const interactions = useProductInteractionAdapter();

  const toggleDialerGroupExpand = (groupId: string) => {
    setExpandedDialerGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const resolveModuleFullName = React.useCallback(
    (module: (typeof PROXY_GROUP_MODULES)[number]) =>
      resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
    [proxyGroupNameOverrides]
  );

  const getAllGroupNamesForUniqCheck = React.useCallback(() => {
    const names: string[] = [];
    for (const m of PROXY_GROUP_MODULES) names.push(resolveModuleFullName(m));
    for (const g of customProxyGroups) {
      const name = typeof g.name === "string" ? g.name.trim() : "";
      if (name) names.push(name);
    }
    for (const g of dialerProxyGroups) {
      const name = g && typeof g.name === "string" ? g.name.trim() : "";
      if (name) names.push(name);
    }
    return names;
  }, [customProxyGroups, dialerProxyGroups, resolveModuleFullName]);

  const handleAddDialerGroup = (name: string) => {
    const nextName = name.trim();
    if (nextName) {
      const all = new Set(getAllGroupNamesForUniqCheck());
      if (all.has(nextName)) {
        toast({ title: "代理组名称已存在，请换一个名称。", variant: "warning" });
        return;
      }
      addDialerProxyGroup({
        name: nextName,
        enabled: true,
        relayNodes: [],
        targetNodes: [],
        type: "select", // 默认手动
      });
      interactions.proxyGroupAdded?.({ groupType: "dialer_select" });
      setShowDialerMenu(false);
      setCustomDialerDraft({ emoji: "🔗", name: "" });
    }
  };

  // 获取可用于中转的节点（未被用作目标节点）
  const getAvailableRelayNodes = (excludeGroupId?: string) => {
    const usedTargets = new Set<string>();
    for (const group of dialerProxyGroups) {
      const isEnabled = group.enabled !== false;
      if (!isEnabled && group.id !== excludeGroupId) continue;
      for (const node of group.targetNodes) {
        usedTargets.add(node);
      }
    }

    const available = nodes
      .filter((n) => !usedTargets.has(n.name))
      .map((n) => ({
        name: n.name,
        type: n.type,
      })) as DialerSelectableNode[];

    const availableProxyGroups = [
      ...PROXY_GROUP_MODULES.map(
        (module) =>
          ({
            name: resolveModuleFullName(module),
            type: "内置组",
          }) as DialerSelectableNode,
      ),
      ...customProxyGroups
        .filter((group) => group.enabled !== false)
        .map((group) => ({
          name: typeof group.name === "string" ? group.name.trim() : "",
          type: "自定义组",
        }))
        .filter((group) => group.name),
    ];

    // 中转组允许选择 DIRECT（直连）作为“入口”
    // 注意：这里只用于 dialer-proxy 的代理组 proxies 字段，Clash/Mihomo 支持 DIRECT。
    // excludeGroupId 用于在该组停用时仍保留“自身 targetNodes 不可作为中转节点”的约束
    return [DIRECT_RELAY_OPTION, ...available, ...availableProxyGroups];
  };

  return (
    <div>
      <SectionHeader
        icon={LinkIcon}
        title="中转代理组"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <Badge
            variant="outline"
            className={cn(
              "ml-auto",
              dialerProxyGroups.length > 0
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                : "border-white/15 bg-white/5 text-white/60"
            )}
          >
            {dialerProxyGroups.length > 0 ? `${dialerProxyGroups.length} 组` : "可选"}
          </Badge>
        }
      />

      {isExpanded && (
        <div className="mt-2 space-y-3 pl-6">
          {/* 已有的中转组 */}
          {dialerProxyGroups.map((group) => {
            const isEnabled = group.enabled !== false;
            const isEditing = editingDialerGroupId === group.id;
            const dialerGroupType: ProxyGroupGroupType = group.type;
            const dialerStrategy = group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY;
            const dialerTypeLabel =
              dialerGroupType === "load-balance"
                ? `${getProxyGroupTypeLabel(dialerGroupType)} / ${getLoadBalanceStrategyLabel(dialerStrategy)}`
                : getProxyGroupTypeLabel(dialerGroupType);
            const relaySearchKeyword = (relaySearchByGroupId[group.id] ?? "").trim().toLowerCase();
            const targetSearchKeyword = (targetSearchByGroupId[group.id] ?? "").trim().toLowerCase();
            const availableRelayNodes = getAvailableRelayNodes(group.id);
            const visibleRelayNodes = relaySearchKeyword
              ? availableRelayNodes.filter((node) => {
                  const displayName = node.name === "DIRECT" ? "DIRECT（直连）" : node.name;
                  return displayName.toLowerCase().includes(relaySearchKeyword);
                })
              : availableRelayNodes;
            const availableTargetNodes = nodes.filter((node) => !group.relayNodes.includes(node.name));
            const visibleTargetNodes = targetSearchKeyword
              ? availableTargetNodes.filter((node) => node.name.toLowerCase().includes(targetSearchKeyword))
              : availableTargetNodes;

            const commitRename = () => {
              const nextName = buildProxyGroupName(editingDialerGroupDraft);
              if (!nextName) return;

              const all = new Set(getAllGroupNamesForUniqCheck());
              all.delete(group.name.trim());
              if (all.has(nextName)) {
                toast({ title: "代理组名称已存在，请换一个名称。", variant: "warning" });
                return;
              }

              updateDialerProxyGroup(group.id, { name: nextName });
              setEditingDialerGroupId(null);
              setEditingDialerGroupDraft({ emoji: "🔗", name: "" });
            };

            const cancelRename = () => {
              setEditingDialerGroupId(null);
              setEditingDialerGroupDraft({ emoji: "🔗", name: "" });
            };

            return (
              <div key={group.id} className="bg-white/5 rounded-lg border border-white/10">
              {/* 组标题 */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5"
                onClick={() => {
                  if (isEditing) return;
                  toggleDialerGroupExpand(group.id);
                }}
              >
                {expandedDialerGroups.has(group.id) ? (
                  <ChevronDown className="h-4 w-4 text-white/50" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-white/50" />
                )}

                {isEditing ? (
                  <ProxyGroupNameEditor
                    value={editingDialerGroupDraft}
                    onChange={setEditingDialerGroupDraft}
                    namePlaceholder="中转组名称"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-sm font-medium text-white truncate" title={group.name}>
                      {group.name}
                    </span>
                    <GroupListenerPortBadge name={group.name} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingDialerGroupId(group.id);
                        setEditingDialerGroupDraft(parseProxyGroupNameDraft(group.name, ""));
                      }}
                      title="改名"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
                  <>
                    <ProxyGroupSummary
                      className="ml-auto flex"
                      disabled={!isEnabled}
                      items={[
                        { label: `${group.relayNodes.length} 中转`, tone: "accent" },
                        { label: `${group.targetNodes.length} 落地`, tone: "success", separator: "arrow" },
                      ]}
                    />
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => {
                        const nextEnabled = Boolean(checked);
                        if (!nextEnabled) {
                          updateDialerProxyGroup(group.id, { enabled: false });
                          return;
                        }

                        const nodeNameSet = new Set(nodes.map((n) => n.name));
                        const otherEnabledGroups = dialerProxyGroups.filter(
                          (g) => g.id !== group.id && g.enabled !== false
                        );
                        const otherTargets = new Set<string>();
                        const otherRelayNodeNames = new Set<string>();
                        for (const g of otherEnabledGroups) {
                          for (const t of g.targetNodes) otherTargets.add(t);
                          for (const r of g.relayNodes) {
                            if (nodeNameSet.has(r)) otherRelayNodeNames.add(r);
                          }
                        }

                        const nextTargetNodes = group.targetNodes.filter(
                          (n) => !otherTargets.has(n) && !otherRelayNodeNames.has(n)
                        );
                        const nextRelayNodes = group.relayNodes.filter((n) => {
                          if (n === "DIRECT") return true;
                          if (!nodeNameSet.has(n)) return true; // 代理组等
                          return !otherTargets.has(n);
                        });

                        const removedTargets = group.targetNodes.length - nextTargetNodes.length;
                        const removedRelays = group.relayNodes.length - nextRelayNodes.length;

                        updateDialerProxyGroup(group.id, {
                          enabled: true,
                          relayNodes: nextRelayNodes,
                          targetNodes: nextTargetNodes,
                        });

                        if (removedTargets > 0 || removedRelays > 0) {
                          toast({
                            title: "中转组已启用并自动修正冲突",
                            description: [
                              removedRelays > 0 ? `已移除 ${removedRelays} 个冲突中转节点` : null,
                              removedTargets > 0 ? `已移除 ${removedTargets} 个冲突落地节点` : null,
                            ]
                              .filter(Boolean)
                              .join("；"),
                            variant: "warning",
                          });
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <ProxyGroupTypeMenu
                      value={dialerGroupType}
                      strategy={dialerStrategy}
                      contentAlign="end"
                      onChange={({ groupType, strategy }) =>
                        updateDialerProxyGroup(group.id, {
                          type: groupType,
                          ...(groupType === "load-balance"
                            ? { strategy: strategy ?? group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY }
                            : { strategy: undefined }),
                        })
                      }
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-white/35 hover:text-indigo-200"
                          title={`类型：${dialerTypeLabel}`}
                          aria-label={`修改 ${group.name} 类型`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDialerProxyGroup(group.id);
                      }}
                      className="p-1 text-white/30 hover:text-red-400"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>

              {/* 展开的组内容 */}
              {expandedDialerGroups.has(group.id) && (
                <div className="px-3 pb-3 space-y-3 border-t border-white/10">
                  {/* 中转节点选择 */}
                  <div className="mt-3">
                    <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-xs text-white/50">中转节点（流量入口）</label>
                      <div className="relative w-full sm:max-w-[220px]">
                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                        <Input
                          value={relaySearchByGroupId[group.id] ?? ""}
                          onChange={(e) =>
                            setRelaySearchByGroupId((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          placeholder="搜索中转节点..."
                          disabled={availableRelayNodes.length === 0}
                          className="h-7 bg-white/5 pl-7 text-xs border-white/10"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className={DIALER_NODE_LIST_HEIGHT_CLASS}>
                      {visibleRelayNodes.map((node) => {
                        const isSelected = group.relayNodes.includes(node.name);
                        const displayName = node.name === "DIRECT" ? "DIRECT（直连）" : node.name;
                        return (
                          <div
                            key={node.name}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors",
                              isSelected
                                ? "bg-indigo-500/20 text-indigo-400"
                                : "hover:bg-white/5 text-white/70"
                            )}
                            onClick={() => {
                              if (isSelected) {
                                removeNodeFromDialerGroup(group.id, node.name, true);
                              } else {
                                addNodeToDialerGroup(group.id, node.name, true);
                              }
                            }}
                          >
                            <div
                              className={cn(
                                "h-3 w-3 rounded border flex items-center justify-center",
                                isSelected ? "bg-indigo-500 border-indigo-500" : "border-white/30"
                              )}
                            >
                              {isSelected && <Check className="h-2 w-2 text-white" />}
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {node.type}
                            </Badge>
                            <span className="truncate">{displayName}</span>
                          </div>
                        );
                      })}
                      {availableRelayNodes.length === 0 ? (
                        <p className="text-xs text-white/30 text-center py-2">无可用节点</p>
                      ) : relaySearchKeyword && visibleRelayNodes.length === 0 ? (
                        <p className="text-xs text-white/30 text-center py-2">未找到匹配节点</p>
                      ) : null}
                    </div>
                  </div>

                  {/* 目标节点选择 */}
                  <div>
                    <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-xs text-white/50">落地节点（流量出口）</label>
                      <div className="relative w-full sm:max-w-[220px]">
                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                        <Input
                          value={targetSearchByGroupId[group.id] ?? ""}
                          onChange={(e) =>
                            setTargetSearchByGroupId((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          placeholder="搜索落地节点..."
                          disabled={availableTargetNodes.length === 0}
                          className="h-7 bg-white/5 pl-7 text-xs border-white/10"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className={DIALER_NODE_LIST_HEIGHT_CLASS}>
                      {visibleTargetNodes.map((node) => {
                          const isSelected = group.targetNodes.includes(node.name);
                          // 检查是否被其他组使用
                          const usedByOther = dialerProxyGroups.some(
                            (g) => g.id !== group.id && g.enabled !== false && g.targetNodes.includes(node.name)
                          );
                          return (
                            <div
                              key={node.name}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                                usedByOther ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                                isSelected
                                  ? "bg-green-500/20 text-green-400"
                                  : usedByOther
                                    ? ""
                                    : "hover:bg-white/5 text-white/70"
                              )}
                              onClick={() => {
                                if (usedByOther) return;
                                if (isSelected) {
                                  removeNodeFromDialerGroup(group.id, node.name, false);
                                } else {
                                  addNodeToDialerGroup(group.id, node.name, false);
                                }
                              }}
                            >
                              <div
                                className={cn(
                                  "h-3 w-3 rounded border flex items-center justify-center",
                                  isSelected ? "bg-green-500 border-green-500" : "border-white/30"
                                )}
                              >
                                {isSelected && <Check className="h-2 w-2 text-white" />}
                              </div>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {node.type}
                              </Badge>
                              <span className="truncate">{node.name}</span>
                              {usedByOther && (
                                <span className="text-[10px] text-white/30 ml-auto">已被其他组使用</span>
                              )}
                            </div>
                          );
                        })}
                      {availableTargetNodes.length === 0 ? (
                        <p className="text-xs text-white/30 text-center py-2">请先选择中转节点</p>
                      ) : targetSearchKeyword && visibleTargetNodes.length === 0 ? (
                        <p className="text-xs text-white/30 text-center py-2">未找到匹配节点</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
              </div>
            );
          })}

          {nodes.length === 0 && dialerProxyGroups.length === 0 && (
            <p className="text-xs text-white/30 text-center py-2">请先导入节点后配置中转代理组</p>
          )}

          {/* 添加中转组按钮 */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs border-dashed border-white/20 text-white/50 hover:text-white/70 hover:border-white/30"
              onClick={() => setShowDialerMenu(!showDialerMenu)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              添加中转组
            </Button>

            {showDialerMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden">
                {/* 预设地区选项 */}
                {PRESET_RELAY_NAMES.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleAddDialerGroup(name)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors text-sm text-white/70 hover:text-white"
                  >
                    <span>{name}</span>
                  </button>
                ))}
                {/* 自定义选项 */}
                <div className="border-t border-white/10 p-2">
                  <div className="flex gap-2">
                    <ProxyGroupNameEditor
                      value={customDialerDraft}
                      onChange={setCustomDialerDraft}
                      namePlaceholder="自定义名称"
                      onKeyDown={(e) => {
                        const nextName = buildProxyGroupName(customDialerDraft);
                        if (e.key === "Enter" && nextName) {
                          handleAddDialerGroup(nextName);
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddDialerGroup(buildProxyGroupName(customDialerDraft))}
                      disabled={!buildProxyGroupName(customDialerDraft)}
                      className="h-7 text-xs px-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
