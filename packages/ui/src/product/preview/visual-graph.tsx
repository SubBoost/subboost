"use client";

import * as React from "react";
import { Network, Server } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ProtocolBadge } from "@subboost/ui/components/ui/protocol-badge";
import { cn } from "@subboost/ui/lib/utils";
import { useConfigStore } from "@subboost/ui/store/config-store";
import {
  PROXY_GROUP_MODULES,
  buildProviderProxyGroups,
  generateProxyGroups,
} from "@subboost/core/generator/proxy-groups";
import { getModuleRuleOrderKey } from "@subboost/core/generator/module-rules";
import { buildProxyProviderPlanFromSources } from "@subboost/core/subscription/proxy-providers";
import { resolveProxyGroupModuleName, splitLeadingEmoji } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import { collectCustomRoutingRuleSets } from "@subboost/core/rules/custom-routing-rule-sets";
import { CustomRulesPreview } from "./visual-graph/custom-rules-preview";
import { getDialerEmojiFromName } from "./visual-graph/emoji";
import {
  ProxyGroupsPreview,
  type VisualDisplayGroup,
} from "./visual-graph/proxy-groups-preview";

/**
 * 可视化关系图组件
 * 展示代理组、节点、规则之间的关系
 */
export function VisualGraph() {
  const {
    nodes,
    sources,
    enabledProxyGroups,
    dialerProxyGroups,
    customRules,
    customProxyGroups,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    proxyGroupOrder,
    testUrl,
    testInterval,
    ruleProviderBaseUrl,
    setProxyGroupOrder,
  } = useConfigStore(
    useShallow((state) => ({
      nodes: state.nodes,
      sources: state.sources ?? [],
      enabledProxyGroups: state.enabledProxyGroups,
      dialerProxyGroups: state.dialerProxyGroups ?? [],
      customRules: state.customRules ?? [],
      customProxyGroups: state.customProxyGroups ?? [],
      customRuleSets: state.customRuleSets ?? [],
      proxyGroupAdvanced: state.proxyGroupAdvanced ?? {},
      builtinRuleEdits: state.builtinRuleEdits ?? {},
      proxyGroupNameOverrides: state.proxyGroupNameOverrides ?? {},
      proxyGroupOrder: state.proxyGroupOrder ?? [],
      testUrl: state.testUrl,
      testInterval: state.testInterval,
      ruleProviderBaseUrl: state.ruleProviderBaseUrl,
      setProxyGroupOrder: state.setProxyGroupOrder,
    })),
  );

  const enabledDialerProxyGroups = React.useMemo(
    () => dialerProxyGroups.filter((g) => g && g.enabled !== false),
    [dialerProxyGroups],
  );
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(
    new Set(["module:select", "module:auto"]),
  );
  const [draggingGroupId, setDraggingGroupId] = React.useState<string | null>(
    null,
  );
  const [dragOverGroup, setDragOverGroup] = React.useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerContentWidth, setContainerContentWidth] = React.useState(0);
  const activeCustomProxyGroups = React.useMemo(
    () => customProxyGroups.filter((group) => group && group.enabled !== false),
    [customProxyGroups],
  );

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const styles = window.getComputedStyle(el);
      const paddingLeft = Number.parseFloat(styles.paddingLeft || "0") || 0;
      const paddingRight = Number.parseFloat(styles.paddingRight || "0") || 0;
      const next = Math.max(0, el.clientWidth - paddingLeft - paddingRight);
      setContainerContentWidth(next);
    };
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resolveModuleName = React.useCallback(
    (m: (typeof PROXY_GROUP_MODULES)[number]) => {
      return resolveProxyGroupModuleName(m, proxyGroupNameOverrides?.[m.id]);
    },
    [proxyGroupNameOverrides],
  );

  // 节点名称列表
  // 生成当前配置下的代理组（用于显示“默认选中项”）
  const generatedProxyGroups = React.useMemo(() => {
    if (nodes.length === 0) return [];
    return generateProxyGroups({
      nodes,
      enabledModules: enabledProxyGroups,
      ruleProviderBaseUrl,
      testUrl,
      testInterval,
      customProxyGroups: activeCustomProxyGroups,
      customRuleSets,
      proxyGroupAdvanced,
      builtinRuleEdits,
      proxyGroupNameOverrides,
    });
  }, [
    nodes,
    enabledProxyGroups,
    ruleProviderBaseUrl,
    testUrl,
    testInterval,
    activeCustomProxyGroups,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    proxyGroupNameOverrides,
  ]);

  // 按生成后的 proxy-groups 顺序展示（更贴近 Clash 实际 UI）
  const displayGroups = React.useMemo((): VisualDisplayGroup[] => {
    const moduleByName = new Map<
      string,
      (typeof PROXY_GROUP_MODULES)[number]
    >();
    for (const m of PROXY_GROUP_MODULES) {
      moduleByName.set(resolveModuleName(m), m);
    }
    const customByName = new Map<string, (typeof customProxyGroups)[number]>();
    for (const g of activeCustomProxyGroups) {
      if (!g || typeof g.name !== "string" || !g.name.trim()) continue;
      customByName.set(g.name.trim(), g);
    }
    const moduleNames = Object.fromEntries(
      PROXY_GROUP_MODULES.map((module) => [module.id, resolveModuleName(module)]),
    );

    const base = generatedProxyGroups.map((g) => {
      const groupName = typeof g.name === "string" ? g.name.trim() : "";
      const mod = groupName ? moduleByName.get(groupName) : undefined;
      if (mod) {
        const moduleTarget = resolveModuleName(mod);
        const mergedRules = [
          ...(mod.rules ?? [])
            .filter((r) => {
              const edit = builtinRuleEdits?.[getModuleRuleOrderKey(mod.id, r.id)];
              const target = edit?.target
                ? resolveProxyGroupTargetName(edit.target, {
                    moduleNames,
                    customProxyGroups: activeCustomProxyGroups,
                    fallbackTarget: moduleTarget,
                  })
                : moduleTarget;
              return edit?.enabled !== false && target === moduleTarget;
            })
            .map((r) => ({
            id: r.id,
            name: r.name,
            behavior: r.behavior,
          })),
          ...customRuleSets
            .filter(
              (ruleSet) =>
                resolveProxyGroupTargetName(ruleSet.target, {
                  moduleNames,
                  customProxyGroups: activeCustomProxyGroups,
                }) === moduleTarget,
            )
            .map((ruleSet) => ({
              id: ruleSet.id,
              name: ruleSet.name,
              behavior: ruleSet.behavior,
            })),
          ...Object.entries(builtinRuleEdits || {}).flatMap(([key, edit]) => {
            const target = edit?.target
              ? resolveProxyGroupTargetName(edit.target, {
                  moduleNames,
                  customProxyGroups: activeCustomProxyGroups,
                })
              : "";
            if (edit?.enabled === false || target !== moduleTarget) return [];
            const match = key.match(/^module:([^:]+):(.+)$/);
            if (!match) return [];
            const [, sourceModuleId, ruleId] = match;
            if (sourceModuleId === mod.id) return [];
            const sourceModule = PROXY_GROUP_MODULES.find((module) => module.id === sourceModuleId);
            const sourceRule = sourceModule?.rules?.find((rule) => rule.id === ruleId);
            if (!sourceRule) return [];
            return [{ id: sourceRule.id, name: sourceRule.name, behavior: sourceRule.behavior }];
          }),
        ];

        return {
          id: `module:${mod.id}`,
          name: resolveModuleName(mod),
          emoji: mod.emoji,
          groupType: proxyGroupAdvanced?.[mod.id]?.groupType ?? mod.groupType,
          strategy: proxyGroupAdvanced?.[mod.id]?.strategy,
          category: mod.category,
          rules: mergedRules,
        };
      }

      const cg = groupName ? customByName.get(groupName) : undefined;
      return {
        id: cg ? `custom:${cg.id}` : `name:${groupName}`,
        name: groupName,
        emoji: cg?.emoji || "🧩",
        groupType: cg?.groupType || g.type,
        strategy: cg?.strategy || g.strategy,
        category: "custom",
        rules: customRuleSets
          .filter(
            (ruleSet) =>
              resolveProxyGroupTargetName(ruleSet.target, {
                moduleNames,
                customProxyGroups: activeCustomProxyGroups,
              }) === groupName,
          )
          .map((r) => ({
            id: r.id,
            name: r.name,
            behavior: r.behavior,
        })),
      };
    });

    const dialerGroups: VisualDisplayGroup[] =
      enabledDialerProxyGroups.length === 0
        ? []
        : enabledDialerProxyGroups.map((g) => ({
            id: `dialer:${g.id}`,
            name: g.name,
            emoji: getDialerEmojiFromName(g.name),
            groupType: g.type,
            category: "dialer",
            rules: [],
            dialer: {
              relayNodes: Array.isArray(g.relayNodes) ? g.relayNodes : [],
              targetNodes: Array.isArray(g.targetNodes) ? g.targetNodes : [],
              type: g.type,
            },
          }));

    // 机场组（proxy-providers 分组模式）：与生成器共用 buildProviderProxyGroups 保证组名一致
    const providerPlan = buildProxyProviderPlanFromSources(sources, { testUrl, testInterval });
    const providerDisplayGroups: VisualDisplayGroup[] = (() => {
      if (!providerPlan) return [];
      const reserved = [
        "DIRECT",
        "REJECT",
        ...nodes.map((n) => n.name),
        ...PROXY_GROUP_MODULES.map((m) => resolveModuleName(m)),
        ...activeCustomProxyGroups
          .map((g) => (typeof g.name === "string" ? g.name.trim() : ""))
          .filter(Boolean),
        ...enabledDialerProxyGroups.map((g) => g.name.trim()).filter(Boolean),
      ];
      const { groups: providerGroups } = buildProviderProxyGroups(providerPlan.attachments, reserved);
      return providerGroups.map((g) => {
        const parsed = splitLeadingEmoji(g.name);
        return {
          // id 用 name: 前缀：与生成器 getKeyByName 对机场组的 key 一致，
          // 且能通过 setProxyGroupOrder 的前缀白名单（provider: 会被过滤导致拖拽排序丢失）。
          id: `name:${g.name}`,
          name: g.name,
          emoji: parsed.hasEmojiPrefix ? parsed.emoji : "✈️",
          groupType: g.type,
          category: "provider",
          rules: [],
        };
      });
    })();

    const merged = (() => {
      const extraGroups = [...providerDisplayGroups, ...dialerGroups];
      if (extraGroups.length === 0) return base;

      // 按 Clash UI 默认顺序：插入到“自动选择(auto)”之后
      const autoIndex = base.findIndex((g) => g.id === "module:auto");
      const insertAt =
        autoIndex >= 0 ? autoIndex + 1 : Math.min(2, base.length);
      return [
        ...base.slice(0, insertAt),
        ...extraGroups,
        ...base.slice(insertAt),
      ];
    })();

    const orderKeys =
      Array.isArray(proxyGroupOrder) && proxyGroupOrder.length > 0
        ? proxyGroupOrder
            .filter((k) => typeof k === "string" && Boolean(k.trim()))
            .map((k) => k.trim())
        : [];
    if (orderKeys.length === 0) return merged;

    const byId = new Map<string, VisualDisplayGroup>();
    const defaultIds: string[] = [];
    for (const g of merged) {
      defaultIds.push(g.id);
      byId.set(g.id, g);
    }

    const nextIds: string[] = [];
    const used = new Set<string>();
    for (const key of orderKeys) {
      if (used.has(key)) continue;
      if (!byId.has(key)) continue;
      used.add(key);
      nextIds.push(key);
    }
    for (const id of defaultIds) {
      if (used.has(id)) continue;
      used.add(id);
      nextIds.push(id);
    }

    return nextIds
      .map((id) => byId.get(id))
      .filter(Boolean) as VisualDisplayGroup[];
  }, [
    activeCustomProxyGroups,
    enabledDialerProxyGroups,
    generatedProxyGroups,
    customRuleSets,
    builtinRuleEdits,
    proxyGroupAdvanced,
    proxyGroupOrder,
    resolveModuleName,
    nodes,
    sources,
    testUrl,
    testInterval,
  ]);

  const defaultProxyByGroupName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of generatedProxyGroups) {
      if (Array.isArray(g.proxies) && g.proxies.length > 0) {
        map.set(g.name, g.proxies[0]);
      }
    }
    return map;
  }, [generatedProxyGroups]);

  const customRoutingRuleSets = React.useMemo(
    () =>
      collectCustomRoutingRuleSets({
        customRuleSets,
        customProxyGroups: activeCustomProxyGroups,
        proxyGroupNameOverrides,
      }),
    [activeCustomProxyGroups, customRuleSets, proxyGroupNameOverrides],
  );

  // 注意：`containerRef` 有 `p-4`，Safari 上用 `clientWidth` 会把 padding 算进去，导致阈值判断偏大；
  // 这里用“内容宽度（扣除 padding）”来决定横/竖布局，避免 iPad Safari 误判导致节点名挤成竖排乱码。
  const preferVerticalDialerLayout =
    containerContentWidth > 0 && containerContentWidth < 420;

  // 切换展开状态
  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const legendItems = React.useMemo(() => {
    const inUse = new Set<string>(displayGroups.map((g) => g.category));
    if (enabledDialerProxyGroups.length > 0) inUse.add("dialer");

    const items = [
      { id: "core", label: "核心", dotClass: "bg-blue-500/50", order: 0 },
      { id: "dialer", label: "中转", dotClass: "bg-amber-500/50", order: 1 },
      { id: "service", label: "常用", dotClass: "bg-green-500/50", order: 2 },
      { id: "social", label: "社交", dotClass: "bg-purple-500/50", order: 3 },
      { id: "media", label: "媒体", dotClass: "bg-pink-500/50", order: 4 },
      { id: "game", label: "游戏", dotClass: "bg-orange-500/50", order: 5 },
      { id: "tech", label: "技术", dotClass: "bg-cyan-500/50", order: 6 },
      { id: "finance", label: "支付", dotClass: "bg-yellow-500/50", order: 7 },
      { id: "other", label: "其它", dotClass: "bg-slate-500/50", order: 8 },
      { id: "custom", label: "自定义", dotClass: "bg-indigo-500/50", order: 9 },
    ];

    return items
      .filter((item) => inUse.has(item.id))
      .sort((a, b) => a.order - b.order);
  }, [enabledDialerProxyGroups.length, displayGroups]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50">
        <Network className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">添加节点后显示可视化关系图</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto p-4 space-y-3">
      {/* 图例 */}
      <div className="flex flex-wrap gap-2 pb-3 border-b border-white/10">
        {legendItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 text-[10px] text-white/60"
          >
            <div className={cn("w-2.5 h-2.5 rounded", item.dotClass)} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-lg font-bold text-primary-500">
            {nodes.length}
          </div>
          <div className="text-[10px] text-white/50">节点</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-lg font-bold text-green-500">
            {displayGroups.length}
          </div>
          <div className="text-[10px] text-white/50">代理组</div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <div className="text-lg font-bold text-purple-500">
            {displayGroups.reduce((acc, g) => acc + g.rules.length, 0)}
          </div>
          <div className="text-[10px] text-white/50">规则集</div>
        </div>
      </div>

      <ProxyGroupsPreview
        displayGroups={displayGroups}
        expandedGroups={expandedGroups}
        draggingGroupId={draggingGroupId}
        dragOverGroup={dragOverGroup}
        defaultProxyByGroupName={defaultProxyByGroupName}
        preferVerticalDialerLayout={preferVerticalDialerLayout}
        onToggleExpand={toggleExpand}
        onSetDraggingGroupId={setDraggingGroupId}
        onSetDragOverGroup={setDragOverGroup}
        onSetProxyGroupOrder={setProxyGroupOrder}
      />

      {/* 节点列表预览 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-white/60">
          <span className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5" />
            节点列表
          </span>
          <span className="text-[10px] text-white/50">
            共 {nodes.length} 个
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg bg-white/5 p-2">
          {nodes.slice(0, 50).map((node, idx) => (
            <div
              key={node.name + idx}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-[10px] hover:bg-white/5"
            >
              <div
                className={cn(
                  "h-2 w-2 rounded-full flex-shrink-0 shadow-[0_0_0_3px_rgba(255,255,255,0.03)]",
                  node.type === "ss"
                    ? "bg-blue-400"
                    : node.type === "vmess"
                      ? "bg-green-400"
                      : node.type === "vless"
                        ? "bg-purple-400"
                        : node.type === "trojan"
                          ? "bg-red-400"
                          : node.type === "anytls"
                            ? "bg-teal-400"
                            : node.type === "hysteria2"
                              ? "bg-orange-400"
                              : "bg-gray-400",
                )}
              />
              <span
                className="min-w-0 flex-1 truncate text-white/90 font-medium"
                title={node.name}
              >
                {node.name}
              </span>
              <ProtocolBadge type={node.type} className="flex-shrink-0" />
            </div>
          ))}
          {nodes.length > 50 && (
            <div className="text-center text-[10px] text-white/50 py-1">
              ... 还有 {nodes.length - 50} 个节点
            </div>
          )}
        </div>
      </div>

      <CustomRulesPreview
        customRules={customRules}
        ruleSets={customRoutingRuleSets}
      />
    </div>
  );
}
