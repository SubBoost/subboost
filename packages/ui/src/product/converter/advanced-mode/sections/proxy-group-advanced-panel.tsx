"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { cn } from "@subboost/ui/lib/utils";
import { PROXY_GROUP_MODULES, generateProxyGroups } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { REGION_PRESETS } from "@subboost/core/proxy-group-advanced";
import { getProxyGroupMemberKey } from "@subboost/core/proxy-group-targets";
import { getNodeSourceIds } from "@subboost/core/subscription/node-source-state";
import { isSubscriptionInfoNodeName } from "@subboost/core/subscription/info-node-name";
import type {
  CustomProxyGroup,
  NodeRegion,
  ProxyGroupAdvancedConfig,
  ProxyGroupMemberRef,
} from "@subboost/core/types/config";
import type { ParsedNode } from "@subboost/core/types/node";
import { useConfigStore } from "@subboost/ui/store/config-store";

type AdvancedTarget = {
  kind: "module" | "custom";
  id: string;
  name: string;
};

export type ResolvedMember = {
  key: string;
  ref: ProxyGroupMemberRef;
  name: string;
  kind: ProxyGroupMemberRef["kind"];
};

export function normalizeList<T>(value: readonly T[] | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function memberLabel(member: ResolvedMember): string {
  if (member.kind === "direct") return "DIRECT";
  if (member.kind === "reject") return "REJECT";
  return member.name;
}

export function memberKindLabel(member: ResolvedMember): string {
  switch (member.kind) {
    case "node":
      return "节点";
    case "module":
      return "内置组";
    case "custom":
      return "自定义组";
    case "direct":
      return "直连";
    case "reject":
      return "拒绝";
  }
}

export function buildMemberFromName(
  name: string,
  options: {
    nodes: ParsedNode[];
    moduleNames: Record<string, string>;
    customProxyGroups: CustomProxyGroup[];
  },
): ResolvedMember | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  let ref: ProxyGroupMemberRef | null = null;
  if (trimmed === "DIRECT") ref = { kind: "direct" };
  else if (trimmed === "REJECT") ref = { kind: "reject" };
  else if (options.nodes.some((node) => node.name === trimmed)) ref = { kind: "node", name: trimmed };
  else {
    const moduleEntry = Object.entries(options.moduleNames).find(([, moduleName]) => moduleName === trimmed);
    const customEntry = options.customProxyGroups.find((group) => group.name === trimmed);
    if (moduleEntry) ref = { kind: "module", id: moduleEntry[0] };
    else if (customEntry) ref = { kind: "custom", id: customEntry.id };
  }

  if (!ref) return null;
  return {
    key: getProxyGroupMemberKey(ref),
    ref,
    name: trimmed,
    kind: ref.kind,
  };
}

export function toggleValue<T extends string>(list: readonly T[] | undefined, value: T): T[] {
  const next = new Set(normalizeList(list));
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return Array.from(next);
}

export function withoutMember(list: readonly ProxyGroupMemberRef[] | undefined, key: string): ProxyGroupMemberRef[] {
  return normalizeList(list).filter((member) => getProxyGroupMemberKey(member) !== key);
}

export function withMember(list: readonly ProxyGroupMemberRef[] | undefined, member: ProxyGroupMemberRef): ProxyGroupMemberRef[] {
  const key = getProxyGroupMemberKey(member);
  return [...withoutMember(list, key), member];
}

function isNodeMember(member: ResolvedMember): boolean {
  return member.kind === "node";
}

function isRuleGroupMember(member: ResolvedMember): boolean {
  // 规则组区域承载所有非节点成员，包括内置/自定义组以及 DIRECT/REJECT。
  return member.kind !== "node";
}

const PROTECTED_INSERT_KEYS = new Set([
  "direct:DIRECT",
  "reject:REJECT",
  "module:auto",
  "module:select",
]);

export function insertMemberAfterProtected(
  currentMembers: ResolvedMember[],
  member: ProxyGroupMemberRef,
): ProxyGroupMemberRef[] {
  const key = getProxyGroupMemberKey(member);
  const current = currentMembers
    .map((item) => item.ref)
    .filter((item) => getProxyGroupMemberKey(item) !== key);
  let insertAt = 0;
  current.forEach((item, index) => {
    if (PROTECTED_INSERT_KEYS.has(getProxyGroupMemberKey(item))) {
      insertAt = index + 1;
    }
  });
  return [...current.slice(0, insertAt), member, ...current.slice(insertAt)];
}

function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-[10px] text-white/45">
      {children}
    </Badge>
  );
}

function DragHandle() {
  return (
    <span className="grid grid-cols-2 gap-0.5 text-white/35">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="h-0.5 w-0.5 rounded-full bg-current" />
      ))}
    </span>
  );
}

const ADVANCED_PANEL_TITLE_CLASS = "mb-2 block text-[11px] font-medium text-white/50";
const ADVANCED_PANEL_TITLE_ROW_CLASS = "mb-2 flex min-h-5 items-center gap-2";

export function ProxyGroupAdvancedPanel({
  target,
  advanced,
  onChange,
  rulesCount,
  rulesContent,
}: {
  target: AdvancedTarget;
  advanced: ProxyGroupAdvancedConfig;
  onChange: (patch: Partial<ProxyGroupAdvancedConfig>) => void;
  rulesCount: number;
  rulesContent: React.ReactNode;
}) {
  const {
    nodes,
    sources,
    enabledProxyGroups,
    customProxyGroups,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    testUrl,
    testInterval,
    ruleProviderBaseUrl,
  } = useConfigStore();
  const [draggingKey, setDraggingKey] = React.useState<string | null>(null);
  const activeCustomProxyGroups = React.useMemo(
    () => customProxyGroups.filter((group) => group.enabled !== false),
    [customProxyGroups],
  );
  const previewEnabledProxyGroups = React.useMemo(() => {
    if (target.kind !== "module" || enabledProxyGroups.includes(target.id)) return enabledProxyGroups;
    return [...enabledProxyGroups, target.id];
  }, [enabledProxyGroups, target.id, target.kind]);
  const previewCustomProxyGroups = React.useMemo(() => {
    if (target.kind !== "custom") return customProxyGroups;
    return customProxyGroups.map((group) =>
      group.id === target.id && group.enabled === false ? { ...group, enabled: true } : group,
    );
  }, [customProxyGroups, target.id, target.kind]);

  const activeNodes = React.useMemo(
    () => nodes.filter((node) => !isSubscriptionInfoNodeName(node.name)),
    [nodes],
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

  const generatedProxyNames = React.useMemo(() => {
    if (nodes.length === 0) return [];
    const generated = generateProxyGroups({
      nodes,
      enabledModules: previewEnabledProxyGroups,
      ruleProviderBaseUrl,
      testUrl,
      testInterval,
      customProxyGroups: previewCustomProxyGroups,
      customRuleSets,
      proxyGroupAdvanced,
      builtinRuleEdits,
      proxyGroupNameOverrides,
    });
    return generated.find((group) => group.name === target.name)?.proxies ?? [];
  }, [
    nodes,
    previewEnabledProxyGroups,
    ruleProviderBaseUrl,
    testUrl,
    testInterval,
    previewCustomProxyGroups,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    target.name,
  ]);

  const candidateMembers = React.useMemo(() => {
    const rawNames = [
      "DIRECT",
      "REJECT",
      ...activeNodes.map((node) => node.name),
      ...PROXY_GROUP_MODULES.filter((module) => enabledProxyGroups.includes(module.id)).map((module) => moduleNames[module.id]),
      ...activeCustomProxyGroups.map((group) => group.name),
    ];
    const out: ResolvedMember[] = [];
    const seen = new Set<string>();
    for (const rawName of rawNames) {
      if (typeof rawName !== "string" || !rawName.trim()) continue;
      const member = buildMemberFromName(rawName, { nodes: activeNodes, moduleNames, customProxyGroups: activeCustomProxyGroups });
      if (!member || seen.has(member.key)) continue;
      if (member.key === `${target.kind}:${target.id}`) continue;
      seen.add(member.key);
      out.push(member);
    }
    return out;
  }, [activeCustomProxyGroups, activeNodes, enabledProxyGroups, moduleNames, target.id, target.kind]);

  const includedMembers = React.useMemo(() => {
    const out: ResolvedMember[] = [];
    const seen = new Set<string>();
    for (const name of generatedProxyNames) {
      const member = buildMemberFromName(name, { nodes: activeNodes, moduleNames, customProxyGroups: activeCustomProxyGroups });
      if (!member || seen.has(member.key)) continue;
      seen.add(member.key);
      out.push(member);
    }
    return out;
  }, [activeCustomProxyGroups, activeNodes, generatedProxyNames, moduleNames]);

  const excludedMembers = React.useMemo(() => {
    const included = new Set(includedMembers.map((member) => member.key));
    return candidateMembers.filter((member) => !included.has(member.key));
  }, [candidateMembers, includedMembers]);

  const includedNodeMembers = React.useMemo(() => includedMembers.filter(isNodeMember), [includedMembers]);
  const includedRuleGroupMembers = React.useMemo(
    () => includedMembers.filter(isRuleGroupMember),
    [includedMembers],
  );
  const excludedNodeMembers = React.useMemo(() => excludedMembers.filter(isNodeMember), [excludedMembers]);
  const excludedRuleGroupMembers = React.useMemo(
    () => excludedMembers.filter(isRuleGroupMember),
    [excludedMembers],
  );

  const sourceOptions = React.useMemo(() => {
    const sourceIdsInNodes = new Set<string>();
    for (const node of activeNodes) {
      for (const id of getNodeSourceIds(node)) sourceIdsInNodes.add(id);
    }
    return sources
      .filter((source) => sourceIdsInNodes.has(source.id))
      .map((source, index) => ({
        id: source.id,
        label: source.tag?.trim() || source.lastParsedTag?.trim() || `#${index + 1} ${source.type === "url" ? "订阅链接" : source.type === "yaml" ? "YAML 配置" : "节点链接"}`,
      }));
  }, [activeNodes, sources]);

  const moveMember = React.useCallback(
    (fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      const current = includedMembers.map((member) => member.ref);
      const from = current.findIndex((member) => getProxyGroupMemberKey(member) === fromKey);
      const to = current.findIndex((member) => getProxyGroupMemberKey(member) === toKey);
      if (from < 0 || to < 0) return;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onChange({ memberOrder: next });
    },
    [includedMembers, onChange],
  );

  const sourceIds = normalizeList(advanced.sourceIds);
  const regions = normalizeList(advanced.regions);
  const extraRefs = normalizeList(advanced.extraMembers);
  const excludedRefs = normalizeList(advanced.excludedMembers);

  const disableMember = React.useCallback(
    (member: ResolvedMember) => {
      onChange({
        extraMembers: withoutMember(extraRefs, member.key),
        excludedMembers: withMember(excludedRefs, member.ref),
        memberOrder: withoutMember(advanced.memberOrder, member.key),
      });
    },
    [advanced.memberOrder, excludedRefs, extraRefs, onChange],
  );

  const enableMember = React.useCallback(
    (member: ResolvedMember) => {
      onChange({
        extraMembers: withMember(extraRefs, member.ref),
        excludedMembers: withoutMember(excludedRefs, member.key),
        memberOrder: insertMemberAfterProtected(includedMembers, member.ref),
      });
    },
    [excludedRefs, extraRefs, includedMembers, onChange],
  );

  const clearMembers = React.useCallback((members: ResolvedMember[]) => {
    if (members.length === 0) return;

    const includedKeys = new Set(members.map((member) => member.key));
    const nextExcludedMembers = [...excludedRefs];
    const excludedKeys = new Set(excludedRefs.map(getProxyGroupMemberKey));

    for (const member of members) {
      if (excludedKeys.has(member.key)) continue;
      excludedKeys.add(member.key);
      nextExcludedMembers.push(member.ref);
    }

    onChange({
      // 清空当前列表时同步清掉手动加入和排序，避免旧配置把成员重新带回。
      extraMembers: extraRefs.filter(
        (member) => !includedKeys.has(getProxyGroupMemberKey(member)),
      ),
      excludedMembers: nextExcludedMembers,
      memberOrder: normalizeList(advanced.memberOrder).filter(
        (member) => !includedKeys.has(getProxyGroupMemberKey(member)),
      ),
    });
  }, [advanced.memberOrder, excludedRefs, extraRefs, onChange]);

  const clearIncludedNodeMembers = React.useCallback(() => {
    clearMembers(includedNodeMembers);
  }, [clearMembers, includedNodeMembers]);

  const clearIncludedRuleGroupMembers = React.useCallback(() => {
    clearMembers(includedRuleGroupMembers);
  }, [clearMembers, includedRuleGroupMembers]);

  const renderIncludedMembers = (members: ResolvedMember[], emptyMessage: string) => (
    members.length === 0 ? (
      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] text-white/35">
        {emptyMessage}
      </div>
    ) : (
      <div className="max-h-52 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
        {members.map((member) => (
          <div
            key={member.key}
            draggable
            onDragStart={() => setDraggingKey(member.key)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggingKey) moveMember(draggingKey, member.key);
              setDraggingKey(null);
            }}
            onDragEnd={() => setDraggingKey(null)}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs",
              draggingKey === member.key && "opacity-50",
            )}
          >
            <span className="flex h-5 w-4 cursor-grab items-center justify-center">
              <DragHandle />
            </span>
            <div className="min-w-0">
              <div className="truncate text-white/75" title={memberLabel(member)}>
                {memberLabel(member)}
              </div>
              <div className="text-[10px] text-white/35">{memberKindLabel(member)}</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-white/35 hover:text-red-300"
              title="排除"
              onClick={() => disableMember(member)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    )
  );

  const renderExcludedMembers = (members: ResolvedMember[], emptyMessage: string) => (
    members.length === 0 ? (
      <div className="text-[11px] text-white/35">{emptyMessage}</div>
    ) : (
      <div className="max-h-52 overflow-y-auto pr-1 custom-scrollbar flex flex-wrap gap-1.5">
        {members.map((member) => {
          return (
            <button
              key={member.key}
              type="button"
              className="inline-flex max-w-full items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/55 transition-colors hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100"
              title={memberLabel(member)}
              onClick={() => enableMember(member)}
            >
              <Plus className="h-3 w-3" />
              <span className="truncate">{memberLabel(member)}</span>
            </button>
          );
        })}
      </div>
    )
  );

  return (
    <div className="border-t border-white/10">
      <div className="grid gap-0 md:grid-cols-[1fr_1fr_1fr]">
        <div className="p-3">
          <div className={ADVANCED_PANEL_TITLE_CLASS}>导入源</div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {sourceOptions.length === 0 ? (
              <div className="text-[11px] text-white/35">暂无可匹配的导入源</div>
            ) : (
              sourceOptions.map((source) => (
                <label key={source.id} className="flex min-w-0 items-center gap-2 text-[11px] text-white/65">
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(source.id)}
                    onChange={() => onChange({ sourceIds: toggleValue(sourceIds, source.id) })}
                    className="h-3 w-3 accent-indigo-500"
                  />
                  <span className="truncate">{source.label}</span>
                </label>
              ))
            )}
          </div>
          <div className="mt-1 text-[10px] text-white/35">不选择表示匹配所有导入源</div>
        </div>

        <div className="relative p-3 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-px before:bg-white/10">
          <div className={ADVANCED_PANEL_TITLE_CLASS}>地区</div>
          <div className="flex flex-wrap gap-1.5">
            {REGION_PRESETS.map((region) => {
              const active = regions.includes(region.id);
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => onChange({ regions: toggleValue(regions, region.id as NodeRegion) })}
                  className={cn(
                    "rounded border px-2 py-1 text-[10px] transition-colors",
                    active
                      ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-100"
                      : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10",
                  )}
                >
                  {region.emoji} {region.label}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[10px] text-white/35">不选择表示匹配所有地区</div>
        </div>

        <div className="relative space-y-3 p-3 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-px before:bg-white/10">
          <label className="block">
            <span className={ADVANCED_PANEL_TITLE_CLASS}>包含正则（可选）</span>
            <Input
              value={advanced.includeRegex ?? ""}
              onChange={(event) => onChange({ includeRegex: event.target.value })}
              placeholder="例如: IEPL|专线|家宽"
              className="h-8 border-white/10 bg-white/5 text-xs"
            />
          </label>
          <label className="block">
            <span className={ADVANCED_PANEL_TITLE_CLASS}>排除正则（可选）</span>
            <Input
              value={advanced.excludeRegex ?? ""}
              onChange={(event) => onChange({ excludeRegex: event.target.value })}
              placeholder="例如: 测试|过期"
              className="h-8 border-white/10 bg-white/5 text-xs"
            />
          </label>
        </div>
      </div>

      <div className="mx-3 h-px bg-white/10" />

      <div className="p-3">
        <div className={ADVANCED_PANEL_TITLE_ROW_CLASS}>
          <div className="text-[11px] font-medium text-white/50">已启用节点</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-white/35 hover:text-red-300 disabled:pointer-events-none disabled:opacity-35"
            title="清空节点"
            disabled={includedNodeMembers.length === 0}
            onClick={clearIncludedNodeMembers}
          >
            清空节点
          </Button>
          <CountBadge>{includedNodeMembers.length} 个</CountBadge>
        </div>
        {renderIncludedMembers(includedNodeMembers, "暂无已启用的节点")}

        <div className="mt-3">
          <div className={ADVANCED_PANEL_TITLE_ROW_CLASS}>
            <div className="text-[11px] font-medium text-white/50">未启用节点</div>
            <CountBadge>{excludedNodeMembers.length} 个</CountBadge>
          </div>
          {renderExcludedMembers(excludedNodeMembers, "暂无未启用的节点")}
        </div>

        <div className="mt-3">
          <div className={ADVANCED_PANEL_TITLE_ROW_CLASS}>
            <div className="text-[11px] font-medium text-white/50">已启用规则组</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-white/35 hover:text-red-300 disabled:pointer-events-none disabled:opacity-35"
              title="清空规则组"
              disabled={includedRuleGroupMembers.length === 0}
              onClick={clearIncludedRuleGroupMembers}
            >
              清空规则组
            </Button>
            <CountBadge>{includedRuleGroupMembers.length} 个</CountBadge>
          </div>
          {renderIncludedMembers(includedRuleGroupMembers, "暂无已启用的规则组")}
        </div>

        <div className="mt-3">
          <div className={ADVANCED_PANEL_TITLE_ROW_CLASS}>
            <div className="text-[11px] font-medium text-white/50">未启用规则组</div>
            <CountBadge>{excludedRuleGroupMembers.length} 个</CountBadge>
          </div>
          {renderExcludedMembers(excludedRuleGroupMembers, "暂无未启用的规则组")}
        </div>
      </div>

      <div className="mx-3 h-px bg-white/10" />

      <div className="p-3">
        <div className={ADVANCED_PANEL_TITLE_ROW_CLASS}>
          <div className="text-[11px] font-medium text-white/50">分流规则</div>
          <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-[10px] text-white/45">
            {rulesCount} 条
          </Badge>
        </div>
        {rulesContent}
        {rulesCount === 0 && (
          <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-[11px] text-white/35">
            还没有分流规则
          </div>
        )}
      </div>
    </div>
  );
}
