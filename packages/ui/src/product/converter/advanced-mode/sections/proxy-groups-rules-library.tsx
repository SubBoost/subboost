"use client";

import * as React from "react";
import { Check, Loader2, Search, X } from "lucide-react";
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
import { toast } from "@subboost/ui/components/ui/toaster";
import { cn } from "@subboost/ui/lib/utils";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { getModuleRuleOrderKey } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import { normalizeRuleSetPathInput } from "@subboost/core/rules/rule-model";
import { RULE_CATEGORIES, type RuleSetInfo } from "@subboost/core/rules/metadata";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import { ProxyGroupsAddedRuleSets } from "./proxy-groups-added-rule-sets";
import { getRuleDisplayName, useRulesLibrarySearch } from "./proxy-groups-rules-search";

export function ProxyGroupsRulesLibrary() {
  const {
    enabledProxyGroups,
    hiddenProxyGroups,
    toggleProxyGroup,
    customRuleSets = [],
    builtinRuleEdits = {},
    addModuleRules,
    customProxyGroups = [],
    proxyGroupNameOverrides = {},
  } = useConfigStore();
  const interactions = useProductInteractionAdapter();

  const [selectedRules, setSelectedRules] = React.useState<RuleSetInfo[]>([]);
  const [addToGroupId, setAddToGroupId] = React.useState("");
  const {
    ruleSearchKeyword,
    setRuleSearchKeyword,
    searchResults,
    rulesSearchLoading,
    rulesSearchLoadingMore,
    rulesSearchError,
    rulesSearchSource,
    totalMatched,
    totalRules,
    canLoadMore,
    handleLoadMore,
  } = useRulesLibrarySearch();

  const resolveModuleFullName = React.useCallback(
    (module: (typeof PROXY_GROUP_MODULES)[number]) =>
      resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
    [proxyGroupNameOverrides],
  );
  const visibleProxyGroupModules = React.useMemo(() => {
    const hidden = new Set(hiddenProxyGroups);
    return PROXY_GROUP_MODULES.filter((module) => !hidden.has(module.id));
  }, [hiddenProxyGroups]);
  const activeCustomProxyGroups = React.useMemo(
    () => customProxyGroups.filter((group) => group.enabled !== false),
    [customProxyGroups],
  );
  const moduleNames = React.useMemo(
    () =>
      Object.fromEntries(
        PROXY_GROUP_MODULES.map((module) => [
          module.id,
          resolveModuleFullName(module),
        ]),
      ),
    [resolveModuleFullName],
  );

  React.useEffect(() => {
    if (addToGroupId.startsWith("module:")) {
      const moduleId = addToGroupId.slice("module:".length);
      if (visibleProxyGroupModules.some((module) => module.id === moduleId)) return;
    } else if (addToGroupId.startsWith("custom:")) {
      const groupId = addToGroupId.slice("custom:".length);
      if (activeCustomProxyGroups.some((group) => group.id === groupId)) return;
    } else {
      return;
    }
    setAddToGroupId("");
  }, [activeCustomProxyGroups, addToGroupId, visibleProxyGroupModules]);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-h-5 items-center gap-2">
        <span className="text-xs font-medium text-white/80">
          方法一：搜索规则集
        </span>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0 text-[9px] font-medium leading-4 text-amber-200">
          推荐
        </span>
        <span className="text-[10px] text-white/40 ml-auto">
          {ruleSearchKeyword.trim() && typeof totalMatched === "number"
            ? `匹配 ${totalMatched} · ${totalRules ? `${totalRules} 规则` : "规则库"}`
            : totalRules
              ? `${totalRules} 规则`
              : "规则库"}
        </span>
      </div>
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <Input
            value={ruleSearchKeyword}
            onChange={(e) => setRuleSearchKeyword(e.target.value)}
            placeholder="搜索: Netflix、Google、Steam、Telegram..."
            className="pl-7 text-xs h-7 bg-white/5 border-white/10"
          />
        </div>

        {rulesSearchLoading && (
          <div className="flex items-center justify-center gap-1 text-[10px] text-white/40 py-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            搜索中...
          </div>
        )}
        {rulesSearchError && !rulesSearchLoading && (
          <div className="text-[10px] text-red-400 text-center py-1">
            {rulesSearchError}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-0.5 bg-white/5 rounded p-1.5 border border-white/10">
            {searchResults.map((rule) => {
              const categoryInfo = RULE_CATEGORIES[rule.category];
              const builtinSourceModule = visibleProxyGroupModules.find((m) =>
                (m.rules ?? []).some((r) => r.id === rule.id && builtinRuleEdits?.[getModuleRuleOrderKey(m.id, r.id)]?.enabled !== false),
              );
              const builtinTargetName = builtinSourceModule
                ? builtinRuleEdits?.[getModuleRuleOrderKey(builtinSourceModule.id, rule.id)]?.target ||
                  resolveModuleFullName(builtinSourceModule)
                : "";
              const resolvedBuiltinTargetName = builtinSourceModule
                ? resolveProxyGroupTargetName(builtinTargetName, {
                    moduleNames,
                    customProxyGroups: activeCustomProxyGroups,
                    fallbackTarget: resolveModuleFullName(builtinSourceModule),
                  })
                : "";
              const belongsToModule = builtinTargetName
                ? visibleProxyGroupModules.find((m) => resolveModuleFullName(m) === resolvedBuiltinTargetName)
                : null;
              const customRuleSet = customRuleSets.find((item) => item.id === rule.id);
              const belongsToCustom = customRuleSet
                ? activeCustomProxyGroups.find(
                    (g) =>
                      g.name ===
                      resolveProxyGroupTargetName(customRuleSet.target, {
                        moduleNames,
                        customProxyGroups: activeCustomProxyGroups,
                      }),
                  )
                : null;
              const isModuleEnabled = belongsToModule
                ? enabledProxyGroups.includes(belongsToModule.id)
                : false;
              const isSelected = selectedRules.some((r) => r.id === rule.id);

              if (belongsToModule) {
                return (
                  <div
                    key={rule.id}
                    className={cn(
                      "flex items-center gap-1.5 px-1.5 py-1.5 rounded transition-colors",
                      isModuleEnabled
                        ? "bg-green-500/10 border border-green-500/30"
                        : "bg-yellow-500/10 border border-yellow-500/30",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-medium truncate text-white">
                          {getRuleDisplayName(rule)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 text-white/50"
                        >
                          {rule.behavior === "ipcidr" ? "IP" : "域名"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-white/50">属于</span>
                        <span className="text-[9px] font-medium text-indigo-400">
                          {resolveModuleFullName(belongsToModule)}
                        </span>
                      </div>
                    </div>
                    {isModuleEnabled ? (
                      <Badge className="text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">
                        <Check className="h-2.5 w-2.5 mr-0.5" />
                        已启用
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleProxyGroup(belongsToModule.id)}
                        className="h-5 text-[9px] px-2 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20"
                      >
                        开启代理组
                      </Button>
                    )}
                  </div>
                );
              }

              if (belongsToCustom) {
                return (
                  <div
                    key={rule.id}
                    className="flex items-center gap-1.5 px-1.5 py-1.5 rounded transition-colors bg-green-500/10 border border-green-500/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-medium truncate text-white">
                          {getRuleDisplayName(rule)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 text-white/50"
                        >
                          {rule.behavior === "ipcidr" ? "IP" : "域名"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-white/50">属于</span>
                        <span className="text-[9px] font-medium text-indigo-400">
                          {belongsToCustom.name}
                        </span>
                      </div>
                    </div>
                    <Badge className="text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">
                      <Check className="h-2.5 w-2.5 mr-0.5" />
                      已添加
                    </Badge>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  key={rule.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedRules(
                        selectedRules.filter((r) => r.id !== rule.id),
                      );
                    } else {
                      setSelectedRules([...selectedRules, rule]);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors",
                    isSelected
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "hover:bg-white/5 text-white/70",
                  )}
                >
                  <div
                    className={cn(
                      "h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0",
                      isSelected
                        ? "bg-indigo-500 border-indigo-500"
                        : "border-white/30",
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-[11px] font-medium truncate">
                    {getRuleDisplayName(rule)}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 text-white/40 flex-shrink-0"
                  >
                    {categoryInfo?.name || rule.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 ml-auto flex-shrink-0"
                  >
                    {rule.behavior === "ipcidr" ? "IP" : "域名"}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}

        {ruleSearchKeyword.trim() &&
          !rulesSearchLoading &&
          !rulesSearchError &&
          searchResults.length === 0 &&
          typeof totalMatched === "number" &&
          totalMatched === 0 && (
            <p className="text-[10px] text-white/40 text-center py-2">
              未找到相关规则
            </p>
          )}

        {ruleSearchKeyword.trim() && searchResults.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">
              {typeof totalMatched === "number"
                ? `显示 ${searchResults.length}/${totalMatched}`
                : `显示 ${searchResults.length}`}
              {rulesSearchSource === "stale" ? "（缓存）" : ""}
            </span>
            {canLoadMore && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={rulesSearchLoadingMore || rulesSearchLoading}
                className="h-6 text-[10px] px-2 border-white/20 text-white/70 hover:bg-white/10"
              >
                {rulesSearchLoadingMore && (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                )}
                加载更多
              </Button>
            )}
          </div>
        )}

        {selectedRules.length > 0 && (
          <div className="space-y-2 bg-indigo-500/10 rounded p-2 border border-indigo-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/70">
                已选择{" "}
                <span className="text-indigo-400 font-medium">
                  {selectedRules.length}
                </span>{" "}
                条未分配的规则
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRules([])}
                className="h-auto p-0 text-[10px] text-white/40 hover:bg-transparent hover:text-white/60"
              >
                清空
              </Button>
            </div>
            <div className="flex flex-wrap gap-0.5">
              {selectedRules.slice(0, 5).map((rule) => (
                <Badge
                  key={rule.id}
                  variant="secondary"
                  className="text-[10px] cursor-pointer hover:bg-white/20 px-1.5 py-0"
                  onClick={() =>
                    setSelectedRules(
                      selectedRules.filter((r) => r.id !== rule.id),
                    )
                  }
                >
                  {getRuleDisplayName(rule)}
                  <X className="h-2.5 w-2.5 ml-0.5" />
                </Badge>
              ))}
              {selectedRules.length > 5 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{selectedRules.length - 5}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/50 flex-shrink-0">
                添加到:
              </span>
              <Select value={addToGroupId} onValueChange={setAddToGroupId}>
                <SelectTrigger className="flex-1 h-7 text-[10px]">
                  <SelectValue placeholder="选择代理组..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="__label_builtin__"
                    className="text-xs"
                    disabled
                  >
                    内置组
                  </SelectItem>
                  {visibleProxyGroupModules.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={`module:${m.id}`}
                      className="text-xs"
                    >
                      {resolveModuleFullName(m)}
                    </SelectItem>
                  ))}
                  <SelectItem
                    value="__label_custom__"
                    className="text-xs"
                    disabled
                  >
                    自定义组
                  </SelectItem>
                  {activeCustomProxyGroups.length === 0 ? (
                    <SelectItem value="__none__" className="text-xs" disabled>
                      暂无自定义组
                    </SelectItem>
                  ) : (
                    activeCustomProxyGroups.map((g) => (
                      <SelectItem
                        key={g.id}
                        value={`custom:${g.id}`}
                        className="text-xs"
                      >
                        {g.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (selectedRules.length === 0) return;
                  if (!addToGroupId || addToGroupId.startsWith("__")) return;

                  const extractPath = (url: string): string | null => {
                    const m = url.match(/\/(geosite|geoip)\/[^/]+\.mrs$/);
                    return m ? m[0].slice(1) : null;
                  };

                  const parseTarget = (raw: string) => {
                    if (raw.startsWith("module:"))
                      return {
                        kind: "module" as const,
                        id: raw.slice("module:".length),
                      };
                    if (raw.startsWith("custom:"))
                      return {
                        kind: "custom" as const,
                        id: raw.slice("custom:".length),
                      };
                    return null;
                  };

                  const target = parseTarget(addToGroupId);
                  if (!target) return;
                  const targetModule =
                    target.kind === "module"
                      ? visibleProxyGroupModules.find((m) => m.id === target.id)
                      : null;
                  if (target.kind === "module" && !targetModule) return;
                  const usedRuleIds = new Map<string, string>();
                  for (const m of visibleProxyGroupModules) {
                    const groupName = resolveModuleFullName(m);
                    for (const r of m.rules ?? []) {
                      const edit = builtinRuleEdits?.[getModuleRuleOrderKey(m.id, r.id)];
                      if (edit?.enabled === false) continue;
                      if (!usedRuleIds.has(r.id)) {
                        usedRuleIds.set(
                          r.id,
                          edit?.target
                            ? resolveProxyGroupTargetName(edit.target, {
                                moduleNames,
                                customProxyGroups: activeCustomProxyGroups,
                                fallbackTarget: groupName,
                              })
                            : groupName,
                        );
                      }
                    }
                  }
                  for (const ruleSet of customRuleSets) {
                    if (!usedRuleIds.has(ruleSet.id)) {
                      usedRuleIds.set(
                        ruleSet.id,
                        resolveProxyGroupTargetName(ruleSet.target, {
                          moduleNames,
                          customProxyGroups: activeCustomProxyGroups,
                        }),
                      );
                    }
                  }

                  const targetDisplayName =
                    target.kind === "custom"
                      ? activeCustomProxyGroups.find((g) => g.id === target.id)
                          ?.name || ""
                      : targetModule
                        ? resolveModuleFullName(targetModule)
                        : "";

                  const conflicts = selectedRules
                    .map((r) => ({
                      id: r.id,
                      name: getRuleDisplayName(r),
                      existsIn: usedRuleIds.get(r.id),
                    }))
                    .filter(
                      (x) => x.existsIn && x.existsIn !== targetDisplayName,
                    );
                  if (conflicts.length > 0) {
                    toast({
                      title: "规则集已在其他分流组中",
                      description:
                        `以下规则集已在其他分流组中：\\n` +
                        conflicts
                          .slice(0, 8)
                          .map((c) => `- ${c.name}（${c.existsIn}）`)
                          .join("\\n") +
                        (conflicts.length > 8
                          ? `\\n... 以及 ${conflicts.length - 8} 条`
                          : ""),
                      variant: "warning",
                    });
                    return;
                  }

                  let addedCount = 0;
                  let skippedExistingCount = 0;
                  let skippedInvalidCount = 0;

                  if (target.kind === "custom") {
                    const group = activeCustomProxyGroups.find((g) => g.id === target.id);
                    if (!group) return;
                    const existing = new Set(customRuleSets.map((r) => r.id));
                    const rulesToAdd = selectedRules
                      .filter((r) => !existing.has(r.id))
                      .flatMap((rule) => {
                        const path = normalizeRuleSetPathInput(rule.url);
                        if (!path) return [];
                        return [{
                        id: rule.id,
                        name: rule.nameZh,
                        behavior: rule.behavior,
                        path,
                        noResolve: rule.behavior === "ipcidr",
                        }];
                      });
                    skippedExistingCount =
                      selectedRules.length - rulesToAdd.length;
                    if (rulesToAdd.length > 0) {
                      addModuleRules(group.id, rulesToAdd);
                      addedCount = rulesToAdd.length;
                    }
                  } else {
                    const mod = targetModule;
                    if (!mod) return;

                    const existing = new Set<string>(
                      [
                        ...(mod.rules ?? [])
                          .filter((r) => builtinRuleEdits?.[getModuleRuleOrderKey(mod.id, r.id)]?.enabled !== false)
                          .map((r) => r.id),
                        ...customRuleSets
                          .filter(
                            (rule) =>
                              resolveProxyGroupTargetName(rule.target, {
                                moduleNames,
                                customProxyGroups,
                              }) === resolveModuleFullName(mod),
                          )
                          .map((r) => r.id),
                      ],
                    );
                    const candidateRules = selectedRules.filter(
                      (r) => !existing.has(r.id),
                    );
                    skippedExistingCount =
                      selectedRules.length - candidateRules.length;
                    const toAdd = candidateRules.flatMap((r) => {
                      const path = extractPath(r.url);
                      if (!path) return [];
                      return [
                        {
                          id: r.id,
                          name: r.nameZh,
                          behavior: r.behavior,
                          path,
                          noResolve: r.behavior === "ipcidr",
                        },
                      ];
                    });
                    skippedInvalidCount = candidateRules.length - toAdd.length;

                    if (toAdd.length > 0) {
                      if (!enabledProxyGroups.includes(mod.id))
                        toggleProxyGroup(mod.id);
                      addModuleRules(mod.id, toAdd);
                      addedCount = toAdd.length;
                    }
                  }

                  const skippedParts = [
                    skippedExistingCount > 0
                      ? `${skippedExistingCount} 条已存在`
                      : "",
                    skippedInvalidCount > 0
                      ? `${skippedInvalidCount} 条无法识别`
                      : "",
                  ].filter(Boolean);

                  if (addedCount === 0) {
                    toast({
                      title: "没有新增规则集",
                      description:
                        skippedParts.length > 0
                          ? `所选规则集未添加：${skippedParts.join("，")}。`
                          : "没有可添加的规则集。",
                      variant: "warning",
                    });
                    return;
                  }

                  toast({
                    title: "已添加规则集",
                    description:
                      `已添加 ${addedCount} 条规则集到「${targetDisplayName}」` +
                      (skippedParts.length > 0
                        ? `，${skippedParts.join("，")}`
                        : "") +
                      "。",
                  });
                  interactions.ruleAdded?.({
                    source: "library",
                    kind: "ruleset",
                  });
                  setSelectedRules([]);
                }}
                disabled={
                  selectedRules.length === 0 ||
                  !addToGroupId ||
                  addToGroupId.startsWith("__")
                }
                className="h-7 text-[10px] px-3 flex-shrink-0"
              >
                添加
              </Button>
            </div>
          </div>
        )}

        <ProxyGroupsAddedRuleSets
          showSearchHint={!ruleSearchKeyword && selectedRules.length === 0}
          totalRules={totalRules}
        />
      </div>
    </div>
  );
}
