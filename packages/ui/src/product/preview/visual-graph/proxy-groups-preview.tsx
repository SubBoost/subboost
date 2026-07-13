"use client";

import * as React from "react";
import {
  ArrowRight,
  Box,
  ChevronDown,
  ChevronRight,
  Globe,
  Network,
  RefreshCcw,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import type { ProxyGroupGroupType } from "@subboost/core/types/config";
import { cn } from "@subboost/ui/lib/utils";

export type VisualDisplayGroup = {
  id: string;
  name: string;
  emoji: string;
  groupType: string;
  strategy?: string;
  category: string;
  rules: Array<{ id: string; name: string; behavior: string }>;
  dialer?: {
    relayNodes: string[];
    targetNodes: string[];
    type: ProxyGroupGroupType;
  };
};

type DragOverGroup = {
  id: string;
  position: "before" | "after";
} | null;

function getDisplayName(name: string) {
  return name.replace(/^\S+\s+/, "");
}

function formatDefaultProxy(proxyName: string) {
  if (proxyName === "DIRECT") return "直连";
  if (proxyName === "REJECT") return "拒绝";
  return getDisplayName(proxyName);
}

function getGroupIcon(groupType: string) {
  switch (groupType) {
    case "select":
      return <Globe className="h-3.5 w-3.5" />;
    case "url-test":
      return <Zap className="h-3.5 w-3.5" />;
    case "fallback":
      return <RefreshCcw className="h-3.5 w-3.5" />;
    case "load-balance":
      return <Network className="h-3.5 w-3.5" />;
    case "reject-first":
      return <Shield className="h-3.5 w-3.5" />;
    case "direct-first":
      return <Server className="h-3.5 w-3.5" />;
    default:
      return <Network className="h-3.5 w-3.5" />;
  }
}

function getGroupTypeLabel(groupType: string) {
  switch (groupType) {
    case "select":
      return "手动选择";
    case "url-test":
      return "自动测速";
    case "fallback":
      return "故障切换";
    case "load-balance":
      return "负载均衡";
    case "reject-first":
      return "拦截";
    case "direct-first":
      return "直连";
    default:
      return groupType;
  }
}

function getStrategyLabel(strategy: string | undefined) {
  switch (strategy) {
    case "round-robin":
      return "轮询均摊";
    case "sticky-sessions":
      return "会话保持";
    case "consistent-hashing":
      return "稳定分配";
    default:
      return strategy;
  }
}

function getGroupColor(category: string) {
  switch (category) {
    case "core":
      return "border-blue-500/50 bg-blue-500/10";
    case "service":
      return "border-green-500/50 bg-green-500/10";
    case "social":
      return "border-purple-500/50 bg-purple-500/10";
    case "media":
      return "border-pink-500/50 bg-pink-500/10";
    case "game":
      return "border-orange-500/50 bg-orange-500/10";
    case "tech":
      return "border-cyan-500/50 bg-cyan-500/10";
    case "finance":
      return "border-yellow-500/50 bg-yellow-500/10";
    case "other":
      return "border-slate-500/50 bg-slate-500/10";
    case "custom":
      return "border-indigo-500/50 bg-indigo-500/10";
    case "dialer":
      return "border-amber-500/50 bg-amber-500/10";
    case "provider":
      return "border-sky-500/50 bg-sky-500/10";
    default:
      return "border-white/20 bg-white/5";
  }
}

export function ProxyGroupsPreview({
  displayGroups,
  expandedGroups,
  draggingGroupId,
  dragOverGroup,
  defaultProxyByGroupName,
  preferVerticalDialerLayout,
  onToggleExpand,
  onSetDraggingGroupId,
  onSetDragOverGroup,
  onSetProxyGroupOrder,
}: {
  displayGroups: VisualDisplayGroup[];
  expandedGroups: Set<string>;
  draggingGroupId: string | null;
  dragOverGroup: DragOverGroup;
  defaultProxyByGroupName: Map<string, string>;
  preferVerticalDialerLayout: boolean;
  onToggleExpand: (groupId: string) => void;
  onSetDraggingGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  onSetDragOverGroup: React.Dispatch<React.SetStateAction<DragOverGroup>>;
  onSetProxyGroupOrder: (order: string[]) => void;
}) {
  const getDefaultLabelForGroup = (groupName: string) => {
    const defaultProxy = defaultProxyByGroupName.get(groupName);
    if (!defaultProxy) return null;
    return formatDefaultProxy(defaultProxy);
  };

  return (
    <div className="space-y-1.5">
      {displayGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const hasRules = group.rules.length > 0;
        const isDialerGroup = group.category === "dialer";
        const canReorderGroups = displayGroups.length > 1;
        const isDragging = draggingGroupId === group.id;
        const isDragOver = dragOverGroup?.id === group.id;
        const dragOverPosition = isDragOver ? dragOverGroup?.position : null;
        const relayNodes = group.dialer?.relayNodes || [];
        const targetNodes = group.dialer?.targetNodes || [];

        return (
          <div
            key={group.id}
            data-proxy-group-card
            className={cn(
              "relative rounded-lg border transition-all",
              getGroupColor(group.category),
              isDragging && "opacity-60",
              isDragOver && "ring-2 ring-indigo-400/40",
            )}
          >
            {isDragOver && dragOverPosition && (
              <div
                className={cn(
                  "pointer-events-none absolute left-2 right-2 h-0.5 rounded-full bg-indigo-400/70",
                  dragOverPosition === "before" ? "top-0" : "bottom-0",
                )}
              />
            )}
            <button
              onClick={() => hasRules && onToggleExpand(group.id)}
              onDragOver={(e) => {
                if (!canReorderGroups) return;
                const activeId = (
                  draggingGroupId || e.dataTransfer.getData("text/plain")
                ).trim();
                if (!activeId || activeId === group.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const position: "before" | "after" =
                  e.clientY >= rect.top + rect.height / 2 ? "after" : "before";
                if (
                  !dragOverGroup ||
                  dragOverGroup.id !== group.id ||
                  dragOverGroup.position !== position
                ) {
                  onSetDragOverGroup({ id: group.id, position });
                }
              }}
              onDrop={(e) => {
                if (!canReorderGroups) return;
                const activeId = (
                  draggingGroupId || e.dataTransfer.getData("text/plain")
                ).trim();
                if (!activeId || activeId === group.id) return;
                e.preventDefault();
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const position: "before" | "after" =
                  e.clientY >= rect.top + rect.height / 2 ? "after" : "before";
                const currentOrder = displayGroups.map((g) => g.id);
                const withoutActive = currentOrder.filter(
                  (id) => id !== activeId,
                );
                const overIndex = withoutActive.indexOf(group.id);
                if (overIndex >= 0) {
                  const insertAt =
                    position === "after" ? overIndex + 1 : overIndex;
                  const nextOrder = [
                    ...withoutActive.slice(0, insertAt),
                    activeId,
                    ...withoutActive.slice(insertAt),
                  ];
                  onSetProxyGroupOrder(nextOrder);
                }
                onSetDragOverGroup(null);
                onSetDraggingGroupId(null);
              }}
              onDragLeave={() => {
                if (dragOverGroup?.id === group.id) onSetDragOverGroup(null);
              }}
              className={cn(
                "w-full flex items-center gap-2 p-2 text-left",
                hasRules && "cursor-pointer hover:bg-white/5",
              )}
            >
              <span
                draggable={canReorderGroups}
                onDragStart={(e) => {
                  if (!canReorderGroups) return;
                  e.stopPropagation();
                  onSetDraggingGroupId(group.id);
                  onSetDragOverGroup(null);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", group.id);

                  const card = (e.currentTarget as HTMLElement).closest(
                    "[data-proxy-group-card]",
                  ) as HTMLElement | null;
                  if (!card) return;
                  const clone = card.cloneNode(true) as HTMLElement;
                  const rect = card.getBoundingClientRect();
                  clone.style.width = `${rect.width}px`;
                  clone.style.pointerEvents = "none";
                  clone.style.position = "absolute";
                  clone.style.top = "-1000px";
                  clone.style.left = "-1000px";
                  clone.style.opacity = "1";
                  clone.style.backgroundColor = "rgba(15, 23, 42, 0.98)";
                  clone.style.border = "1px solid rgba(99, 102, 241, 0.55)";
                  clone.style.transform = "scale(1.03)";
                  clone.style.boxShadow = "0 18px 55px rgba(0,0,0,0.55)";
                  clone.style.filter = "saturate(1.2) contrast(1.05)";
                  document.body.appendChild(clone);
                  try {
                    e.dataTransfer.setDragImage(clone, 16, 16);
                  } catch {
                    // ignore
                  }
                  setTimeout(() => {
                    clone.remove();
                  }, 0);
                }}
                onDragEnd={() => {
                  onSetDraggingGroupId(null);
                  onSetDragOverGroup(null);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "flex h-4 w-4 items-center justify-center text-white/40 hover:text-white/70",
                  canReorderGroups
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-default opacity-30",
                )}
                title="拖动排序"
                aria-label="拖动排序"
              >
                <span className="grid grid-cols-2 gap-0.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-0.5 w-0.5 rounded-full bg-current"
                    />
                  ))}
                </span>
              </span>

              {hasRules ? (
                isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-white/60" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-white/60" />
                )
              ) : (
                <Box className="h-3.5 w-3.5 text-white/50" />
              )}

              <span className="text-sm">{group.emoji}</span>
              <span className="text-xs font-medium flex-1 min-w-0 flex flex-wrap items-center gap-x-2">
                <span className="truncate">{getDisplayName(group.name)}</span>
                {isDialerGroup && (
                  <span className="text-[10px] text-amber-200/80">
                    中转节点: {relayNodes.length} · 落地节点:{" "}
                    {targetNodes.length}
                  </span>
                )}
              </span>

              <div className="flex items-center gap-1.5">
                {getGroupIcon(group.groupType)}
                <span className="text-[10px] text-white/60">
                  {getGroupTypeLabel(group.groupType)}
                </span>
                {group.groupType === "load-balance" && getStrategyLabel(group.strategy) && (
                  <span className="text-[10px] text-white/50">
                    策略：{getStrategyLabel(group.strategy)}
                  </span>
                )}
                {getDefaultLabelForGroup(group.name) && (
                  <span className="text-[10px] text-white/50">
                    默认：{getDefaultLabelForGroup(group.name)}
                  </span>
                )}
              </div>
            </button>

            {isDialerGroup && (
              <div className="border-t border-white/10 p-2">
                <div
                  className={cn(
                    "flex items-center gap-2",
                    preferVerticalDialerLayout ? "flex-col" : "flex-row",
                  )}
                >
                  <DialerStep preferVertical={preferVerticalDialerLayout}>
                    <span className="px-2 py-1 rounded bg-white/5 text-white/70 text-[10px] whitespace-nowrap">
                      我的流量
                    </span>
                  </DialerStep>
                  <DialerArrow preferVertical={preferVerticalDialerLayout} />
                  <DialerNodeList
                    title="中转节点"
                    emptyText="未配置中转节点"
                    nodes={relayNodes}
                    color="blue"
                    preferVertical={preferVerticalDialerLayout}
                  />
                  <DialerArrow preferVertical={preferVerticalDialerLayout} />
                  <DialerNodeList
                    title="落地节点"
                    emptyText="未选择落地节点"
                    nodes={targetNodes}
                    color="green"
                    preferVertical={preferVerticalDialerLayout}
                  />
                  <DialerArrow preferVertical={preferVerticalDialerLayout} />
                  <DialerStep preferVertical={preferVerticalDialerLayout}>
                    <span className="px-2 py-1 rounded bg-white/5 text-white/70 text-[10px] whitespace-nowrap">
                      谷歌服务
                    </span>
                  </DialerStep>
                </div>
              </div>
            )}

            {isExpanded && hasRules && (
              <div className="border-t border-white/10 p-2 space-y-1">
                {group.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-2 text-[10px] text-white/60 pl-5"
                  >
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        rule.behavior === "domain"
                          ? "bg-blue-400"
                          : "bg-orange-400",
                      )}
                    />
                    <span className="flex-1">{rule.name}</span>
                    <span className="px-1 py-0.5 rounded bg-white/5">
                      {rule.behavior}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DialerStep({
  preferVertical,
  children,
}: {
  preferVertical: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        preferVertical ? "" : "self-stretch",
      )}
    >
      {children}
    </div>
  );
}

function DialerArrow({ preferVertical }: { preferVertical: boolean }) {
  return (
    <DialerStep preferVertical={preferVertical}>
      <ArrowRight
        className={cn(
          "h-3 w-3 text-white/40",
          preferVertical ? "rotate-90" : "rotate-0",
        )}
      />
    </DialerStep>
  );
}

function DialerNodeList({
  title,
  emptyText,
  nodes,
  color,
  preferVertical,
}: {
  title: string;
  emptyText: string;
  nodes: string[];
  color: "blue" | "green";
  preferVertical: boolean;
}) {
  const colorClass =
    color === "blue"
      ? "border-blue-500/30 bg-blue-500/5 text-blue-200/90"
      : "border-green-500/30 bg-green-500/5 text-green-200/90";

  return (
    <div
      className={cn(
        "rounded-md border p-2",
        colorClass,
        preferVertical ? "w-full" : "flex-1 min-w-0",
      )}
    >
      <div className="text-[10px] text-center mb-1">{title}</div>
      {nodes.length === 0 ? (
        <div className="text-[10px] text-white/50 text-center">
          {emptyText}
        </div>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-1">
          {nodes.map((node) => (
            <div key={node} className="text-[10px] text-center break-all">
              {node}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
