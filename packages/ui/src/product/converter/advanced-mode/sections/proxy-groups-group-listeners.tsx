"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@subboost/ui/components/ui/select";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { cn } from "@subboost/ui/lib/utils";
import { PROXY_GROUP_MODULES, generateProxyGroups } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { buildManualRuleTargets } from "./proxy-group-rule-targets";
import { buildProviderGroupInfo } from "./provider-group-plan";

// 与「节点管理」区的监听端口警告共用同一 key（写同名字面量，不 import 该文件）：
// 任一侧确认过公网暴露警告，另一侧不再重复弹出。
const LISTENER_PORT_WARNING_STORAGE_KEY = "subboost.listenerPortWarningAccepted";

function hasAcceptedListenerPortWarning(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LISTENER_PORT_WARNING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberListenerPortWarningAccepted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LISTENER_PORT_WARNING_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

function isValidListenerPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 组卡片头部的监听端口徽标：该组绑定了分组监听时显示 ":端口"。
 * 自读 store，插入点无需透传任何 props。
 */
export function GroupListenerPortBadge({ name, className }: { name: string; className?: string }) {
  const groupListeners = useConfigStore((state) => state.groupListeners);
  const port = React.useMemo(() => {
    const hit = groupListeners.find((binding) => binding.target === name && isValidListenerPort(binding.port));
    return hit?.port;
  }, [groupListeners, name]);

  if (port === undefined) return null;
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 border-indigo-500/40 bg-indigo-500/10 text-[10px] text-indigo-300", className)}
      title={`分组监听端口 ${port}`}
    >
      :{port}
    </Badge>
  );
}

export function ProxyGroupsGroupListeners() {
  const {
    groupListeners,
    addGroupListener,
    updateGroupListener,
    removeGroupListener,
    enabledProxyGroups,
    hiddenProxyGroups,
    customProxyGroups,
    proxyGroupNameOverrides,
    dialerProxyGroups,
    sources,
    nodes,
    testUrl,
    testInterval,
    listenerPorts,
    mixedPort,
    ruleProviderBaseUrl,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    proxyGroupOrder,
  } = useConfigStore();

  const hasBindings = groupListeners.length > 0;
  const [isExpanded, setIsExpanded] = React.useState(() => hasBindings);
  React.useEffect(() => {
    if (hasBindings) setIsExpanded(true);
  }, [hasBindings]);

  // 可绑定目标 = 内置模块组（改名后）+ 自定义分组 + 启用的中转组 + provider 机场组
  const manualTargets = React.useMemo(
    () =>
      buildManualRuleTargets({
        enabledProxyGroups,
        hiddenProxyGroups,
        customProxyGroups,
        proxyGroupNameOverrides,
      }),
    [enabledProxyGroups, hiddenProxyGroups, customProxyGroups, proxyGroupNameOverrides],
  );
  const providerGroupNames = React.useMemo(
    () =>
      buildProviderGroupInfo(sources, {
        nodes,
        proxyGroupNameOverrides,
        customProxyGroups,
        dialerProxyGroups,
        testUrl,
        testInterval,
      }).names,
    [sources, testUrl, testInterval, nodes, proxyGroupNameOverrides, customProxyGroups, dialerProxyGroups],
  );
  const targetGroupNames = React.useMemo(() => {
    // 可绑定目标集合 = 内置模块组（改名后）+ 自定义分组 + 启用的中转组 + provider 机场组
    const validNames = new Set<string>();
    for (const target of manualTargets) validNames.add(target.name);
    for (const group of dialerProxyGroups) {
      if (!group || group.enabled === false) continue;
      if (typeof group.name === "string" && group.name.trim()) validNames.add(group.name.trim());
    }
    for (const name of providerGroupNames) validNames.add(name);

    // 展示顺序对齐生成 YAML 的最终组序（与可视化预览同一套镜像逻辑）：
    // generateProxyGroups 基础序 → 机场组+中转组插到「⚡ 自动选择」之后 → proxyGroupOrder 拖拽重排
    const generated = generateProxyGroups({
      nodes,
      enabledModules: enabledProxyGroups,
      ruleProviderBaseUrl,
      testUrl,
      testInterval,
      customProxyGroups,
      customRuleSets,
      proxyGroupAdvanced,
      builtinRuleEdits,
      proxyGroupNameOverrides,
    });
    const moduleIdByName = new Map(
      PROXY_GROUP_MODULES.map((module) => [
        resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
        module.id,
      ]),
    );
    const customIdByName = new Map(
      customProxyGroups
        .filter((group) => group?.id && typeof group.name === "string" && group.name.trim())
        .map((group) => [group.name.trim(), group.id]),
    );
    type OrderEntry = { key: string; name: string };
    const base: OrderEntry[] = [];
    for (const group of generated) {
      const name = typeof group.name === "string" ? group.name.trim() : "";
      if (!name) continue;
      const moduleId = moduleIdByName.get(name);
      const customId = customIdByName.get(name);
      base.push({ key: moduleId ? `module:${moduleId}` : customId ? `custom:${customId}` : `name:${name}`, name });
    }
    const extras: OrderEntry[] = [
      ...providerGroupNames.map((name) => ({ key: `name:${name}`, name })),
      ...dialerProxyGroups
        .filter((group) => group && group.enabled !== false && typeof group.name === "string" && group.name.trim())
        .map((group) => ({ key: `dialer:${group.id}`, name: group.name.trim() })),
    ];
    const autoIndex = base.findIndex((entry) => entry.key === "module:auto");
    const insertAt = autoIndex >= 0 ? autoIndex + 1 : Math.min(2, base.length);
    const merged = extras.length > 0 ? [...base.slice(0, insertAt), ...extras, ...base.slice(insertAt)] : base;

    const byKey = new Map<string, OrderEntry>();
    const defaultKeys: string[] = [];
    for (const entry of merged) {
      if (byKey.has(entry.key)) continue;
      byKey.set(entry.key, entry);
      defaultKeys.push(entry.key);
    }
    const orderKeys = proxyGroupOrder
      .filter((key) => typeof key === "string" && Boolean(key.trim()))
      .map((key) => key.trim());
    const nextKeys: string[] = [];
    const used = new Set<string>();
    for (const key of orderKeys) {
      if (used.has(key) || !byKey.has(key)) continue;
      used.add(key);
      nextKeys.push(key);
    }
    for (const key of defaultKeys) {
      if (used.has(key)) continue;
      used.add(key);
      nextKeys.push(key);
    }

    const seen = new Set<string>();
    const names: string[] = [];
    for (const key of nextKeys) {
      const name = byKey.get(key)?.name ?? "";
      if (!name || seen.has(name) || !validNames.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    // 兜底：有效目标若未出现在生成序中（异常场景），仍保持可选
    for (const name of validNames) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }, [
    manualTargets,
    dialerProxyGroups,
    providerGroupNames,
    nodes,
    enabledProxyGroups,
    ruleProviderBaseUrl,
    testUrl,
    testInterval,
    customProxyGroups,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    proxyGroupOrder,
  ]);

  const [portDrafts, setPortDrafts] = React.useState<Record<string, string>>({});
  const [portFormatErrors, setPortFormatErrors] = React.useState<Record<string, string>>({});

  const nodeListenerPortSet = React.useMemo(
    () => new Set(Object.values(listenerPorts).filter((port) => isValidListenerPort(port))),
    [listenerPorts],
  );

  const conflictMessageFor = React.useCallback(
    (id: string, port: number): string | null => {
      if (!isValidListenerPort(port)) return null;
      if (port === mixedPort) return `与 mixed-port（${mixedPort}）冲突`;
      if (nodeListenerPortSet.has(port)) return "与节点监听端口冲突";
      const other = groupListeners.find((binding) => binding.id !== id && binding.port === port);
      if (other) return `与「${other.target || "未选择分组"}」冲突`;
      return null;
    },
    [groupListeners, mixedPort, nodeListenerPortSet],
  );

  const handlePortChange = (id: string, raw: string) => {
    setPortDrafts((prev) => ({ ...prev, [id]: raw }));
    const trimmed = raw.trim();
    const port = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(port) || port < 1 || port > 65535) {
      setPortFormatErrors((prev) => ({ ...prev, [id]: "端口需为 1-65535 的整数" }));
      return;
    }
    setPortFormatErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    updateGroupListener(id, { port });
  };

  const portValueOf = (id: string, port: number) =>
    Object.prototype.hasOwnProperty.call(portDrafts, id)
      ? portDrafts[id]
      : isValidListenerPort(port)
        ? String(port)
        : "";

  const handleRemove = (id: string) => {
    removeGroupListener(id);
    setPortDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPortFormatErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAdd = React.useCallback(async () => {
    if (!hasAcceptedListenerPortWarning()) {
      const ok = await confirmDialog({
        title: "确认开启「分组监听」？",
        description: (
          <span className="block pt-2">
            <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
              警告：请确保你的设备处于受信任网络；如果你的监听端口暴露在公网，任何人都可以使用你的节点。
            </span>
            <span className="mt-3 block leading-6 text-white/65">
              如果你不清楚安全风险及规避方法，请不要开启。
            </span>
          </span>
        ),
        cancelText: "取消",
        confirmText: "我已了解，开启",
        variant: "warning",
      });
      if (!ok) return;
      rememberListenerPortWarningAccepted();
    }
    addGroupListener();
    setIsExpanded(true);
  }, [addGroupListener]);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full items-center gap-2 bg-white/5 px-2 py-1.5 transition-colors hover:bg-white/10"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-white/50" />
        )}
        <span className="text-xs font-medium text-white">分组监听管理</span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-[10px]",
            hasBindings
              ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
              : "border-white/15 bg-white/5 text-white/60",
          )}
        >
          {hasBindings ? `${groupListeners.length} 条` : "可选"}
        </Badge>
      </button>

      {isExpanded && (
        <div className="space-y-1 p-2">
          <div className="text-[10px] leading-relaxed text-white/35">
            为已存在的策略组生成本地 mixed 入站（listeners：proxy 绑定组名、listen 0.0.0.0、UDP 开启）；端口不可与
            mixed-port、节点监听端口重复。
          </div>

          {groupListeners.length === 0 ? (
            <div className="py-4 text-center text-xs text-white/40">暂无分组监听，点击下方添加</div>
          ) : (
            <div className="space-y-1">
              {groupListeners.map((binding) => {
                const boundByOthers = new Set(
                  groupListeners
                    .filter((item) => item.id !== binding.id)
                    .map((item) => item.target)
                    .filter(Boolean),
                );
                const targetMissing = Boolean(binding.target) && !targetGroupNames.includes(binding.target);
                const errorText = portFormatErrors[binding.id] ?? conflictMessageFor(binding.id, binding.port);
                return (
                  <div key={binding.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Select
                        value={binding.target || undefined}
                        onValueChange={(value) => updateGroupListener(binding.id, { target: value })}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-7 min-w-0 flex-1 text-xs",
                            targetMissing && "border-red-500/40 text-red-300",
                          )}
                        >
                          <SelectValue placeholder="选择策略组..." />
                        </SelectTrigger>
                        <SelectContent>
                          {targetMissing && (
                            <SelectItem value={binding.target} className="text-red-300">
                              {binding.target}（已不存在）
                            </SelectItem>
                          )}
                          {targetGroupNames.map((name) => (
                            <SelectItem key={name} value={name} disabled={boundByOthers.has(name)}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={portValueOf(binding.id, binding.port)}
                        onChange={(event) => handlePortChange(binding.id, event.target.value)}
                        inputMode="numeric"
                        placeholder="7891"
                        title={errorText || "本地 inbound 监听端口"}
                        className={cn(
                          "h-7 w-24 shrink-0 border-white/10 bg-white/5 text-xs",
                          errorText && "border-red-500/40 focus:border-red-500/50",
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(binding.id)}
                        className="h-7 w-7 shrink-0 px-0 text-white/30 hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {errorText && <div className="pl-1 text-[10px] text-red-400">{errorText}</div>}
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full border-dashed border-white/20 text-xs text-white/50 hover:border-white/30 hover:text-white/70"
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加分组监听
          </Button>
        </div>
      )}
    </div>
  );
}
