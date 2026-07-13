"use client";

import * as React from "react";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import type { ParsedNode } from "@subboost/core/types/node";
import type { EditingSubscriptionLoaderOptions } from "./editing-subscription-types";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import { ensureCustomRulesHaveIds } from "@subboost/core/rules/custom-rule-utils";
import { normalizeRuleModelFromConfig } from "@subboost/core/rules/rule-model";
import { resolveProxyGroupAdvancedModeEnabled } from "@subboost/core/proxy-group-advanced-mode";
import { normalizeProxyGroupAdvancedConfig } from "@subboost/core/proxy-group-advanced";
import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import {
  hasSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  type SubscriptionUserInfo,
} from "@subboost/core/subscription/subscription-userinfo";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { captureAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";
import { toast } from "@subboost/ui/components/ui/toaster";
import {
  ensureNodeOriginName,
  ensureNodesHaveValidSourceIds,
  getNodeOriginName,
  getNodeSourceIds,
} from "./editing-subscription-node-sources";

export function useEditingSubscriptionLoader({
  editSubscriptionId,
  loadSubscription,
  loginHref = "/login",
  setCopied,
  setEditingSubscription,
  setStoreSources,
  setSubscriptionName,
  setSubscriptionUrl,
}: EditingSubscriptionLoaderOptions): boolean {
  const [isLoadingEditingSubscription, setIsLoadingEditingSubscription] = React.useState(false);

  // 从“我的订阅”跳转回来时，加载订阅详情到首页编辑器
  React.useEffect(() => {
    if (!editSubscriptionId) return;

    let cancelled = false;
    const run = async () => {
      setIsLoadingEditingSubscription(true);
      try {
        if (!loadSubscription) {
          throw new Error("当前应用未配置订阅加载接口");
        }
        const res = await loadSubscription(editSubscriptionId);
        if (res.status === 401) {
          captureAuthConfigHandoff(useConfigStore.getState());
          window.location.href = loginHref;
          return;
        }

        const data = (await res.json()) as unknown;
        if (!res.ok) {
          const err = (data as { error?: string })?.error || "加载订阅失败";
          throw new Error(err);
        }

        const sub = (data as { subscription?: any })?.subscription;
        if (!sub?.id || !sub?.token) {
          throw new Error("订阅数据不完整");
        }

        const urls = Array.isArray(sub.urls) ? (sub.urls.filter((u: unknown) => typeof u === "string") as string[]) : [];
        const loadedNodesRaw = Array.isArray(sub.nodes) ? (sub.nodes as ParsedNode[]) : [];
        const loadedNodes = loadedNodesRaw.map(ensureNodeOriginName);
        const nodeSourceIdSet = (() => {
          const out = new Set<string>();
          for (const node of loadedNodes) {
            for (const id of getNodeSourceIds(node)) out.add(id);
          }
          return out;
        })();
        const cfg = sub.config && typeof sub.config === "object" ? (sub.config as Record<string, unknown>) : {};
        const subscriptionInfoFromRecord = normalizeSubscriptionUserInfo((sub as any).subscriptionInfo);
        const hasSubscriptionInfoFromRecord = hasSubscriptionUserInfo(subscriptionInfoFromRecord);
        const deletedNodesFromCfg = Array.isArray((cfg as any).deletedNodes)
          ? ((cfg as any).deletedNodes as unknown[])
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const originName = (item as any).originName;
              const name = (item as any).name;
              if (typeof originName !== "string" || !originName.trim()) return null;
              const normalizedOriginName = originName.trim();
              const normalizedName = typeof name === "string" && name.trim() ? name.trim() : normalizedOriginName;
              return { originName: normalizedOriginName, name: normalizedName };
            })
            .filter(Boolean) as Array<{ originName: string; name: string }>
          : [];
        const deletedNodeNamesFromCfg = Array.isArray((cfg as any).deletedNodeNames)
          ? ((cfg as any).deletedNodeNames as unknown[])
            .filter((n: unknown) => typeof n === "string" && n.trim())
            .map((n: unknown) => String(n).trim())
          : [];

        const deletedNodeNamesMerged = (() => {
          const out: string[] = [];
          const seen = new Set<string>();
          for (const item of deletedNodesFromCfg) {
            const name = item.originName.trim();
            if (!name || seen.has(name)) continue;
            seen.add(name);
            out.push(name);
          }
          for (const raw of deletedNodeNamesFromCfg) {
            const name = raw.trim();
            if (!name || seen.has(name)) continue;
            seen.add(name);
            out.push(name);
          }
          return out;
        })();

        const deletedOriginNameSet = new Set<string>(deletedNodeNamesMerged);
        const filteredLoadedNodes =
          deletedOriginNameSet.size > 0
            ? loadedNodes.filter((node) => {
              const origin = getNodeOriginName(node);
              return !deletedOriginNameSet.has(origin);
            })
            : loadedNodes;

        // 优先从 config.sources 恢复用户当时的“输入源”（保留 YAML/节点链接/多个 URL 的顺序）
        // 若订阅记录尚未保存 sources，则仅按 urls 重建，避免插入空白 YAML/#nodes 导致顺序错乱。
        const rebuildSourcesFromConfig = (raw: unknown): SubscriptionSource[] => {
          if (!Array.isArray(raw)) return [];

          const validTypes = new Set(["url", "yaml", "nodes"]);
          const normalized = raw
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const id = (item as any).id;
              const t = (item as any).type;
              const c = (item as any).content;
              if (typeof t !== "string" || !validTypes.has(t)) return null;
              if (typeof c !== "string" || !c.trim()) return null;
              const lastParsedContent = (item as any).lastParsedContent;
              const tag = (item as any).tag;
              const nameTemplate = (item as any).nameTemplate;
              const useProxyProviders = (item as any).useProxyProviders;
              const userinfoUrl = (item as any).userinfoUrl;
              const userinfoUserAgent = (item as any).userinfoUserAgent;
              const subscriptionUserInfo = normalizeSubscriptionUserInfo((item as any).subscriptionUserInfo);
              const lastParsedTag = (item as any).lastParsedTag;
              const lastParsedNameTemplate = (item as any).lastParsedNameTemplate;
              const normalizedContent =
                t === "url" ? tryNormalizeSubscriptionUrlInput(c) ?? c.trim() : c;
              const normalizedUserinfoUrl =
                t === "url" && typeof userinfoUrl === "string" && userinfoUrl.trim()
                  ? (tryNormalizeSubscriptionUrlInput(userinfoUrl) ?? userinfoUrl.trim())
                  : undefined;
              return {
                id: typeof id === "string" && id.trim() ? id.trim() : undefined,
                type: t as "url" | "yaml" | "nodes",
                content: normalizedContent,
                lastParsedContent:
                  typeof lastParsedContent === "string" && lastParsedContent.trim()
                    ? (
                        t === "url"
                          ? (tryNormalizeSubscriptionUrlInput(lastParsedContent) ?? lastParsedContent.trim())
                          : lastParsedContent.trim()
                      )
                    : undefined,
                tag: typeof tag === "string" && tag.trim() ? tag.trim() : undefined,
                nameTemplate: typeof nameTemplate === "string" && nameTemplate.trim() ? nameTemplate.trim() : undefined,
                subscriptionUserInfo: hasSubscriptionUserInfo(subscriptionUserInfo) ? subscriptionUserInfo : undefined,
                useProxyProviders: t === "url" && useProxyProviders === true ? true : undefined,
                userinfoUrl: normalizedUserinfoUrl,
                userinfoUserAgent:
                  t === "url" && typeof userinfoUserAgent === "string" && userinfoUserAgent.trim()
                    ? userinfoUserAgent.trim()
                    : undefined,
                lastParsedTag: typeof lastParsedTag === "string" && lastParsedTag.trim() ? lastParsedTag.trim() : undefined,
                lastParsedNameTemplate:
                  typeof lastParsedNameTemplate === "string" && lastParsedNameTemplate.trim()
                    ? lastParsedNameTemplate.trim()
                    : undefined,
              };
            })
            .filter(Boolean) as Array<{
              id?: string;
              type: "url" | "yaml" | "nodes";
              content: string;
              lastParsedContent?: string;
              tag?: string;
              nameTemplate?: string;
              subscriptionUserInfo?: SubscriptionUserInfo;
              useProxyProviders?: boolean;
              userinfoUrl?: string;
              userinfoUserAgent?: string;
              lastParsedTag?: string;
              lastParsedNameTemplate?: string;
            }>;

          const hasAnyExplicitId = normalized.some((s) => typeof s.id === "string" && s.id.trim());
          const typeToStableId: Record<string, string> = { url: "1", yaml: "2", nodes: "3" };
          const canUseStableTypeIds =
            !hasAnyExplicitId &&
            normalized.length > 0 &&
            normalized.length <= 3 &&
            new Set(normalized.map((s) => s.type)).size === normalized.length;

          const candidateIds = (() => {
            const ids = Array.from(nodeSourceIdSet).filter(Boolean);
            if (ids.length !== normalized.length) return null;
            const allNumeric = ids.every((id) => /^\d+$/.test(id));
            return allNumeric
              ? [...ids].sort((a, b) => Number(a) - Number(b))
              : [...ids].sort((a, b) => a.localeCompare(b));
          })();

          const now = Date.now();
          const used = new Set<string>();
          const toUniqueId = (preferred: string) => {
            const base = preferred.trim();
            if (!base) return null;
            if (!used.has(base)) {
              used.add(base);
              return base;
            }
            let i = 2;
            let candidate = `${base}-${i}`;
            while (used.has(candidate)) {
              i += 1;
              candidate = `${base}-${i}`;
            }
            used.add(candidate);
            return candidate;
          };

          return normalized.map((s, i) => {
            const preferred =
              (typeof s.id === "string" && s.id.trim() ? s.id.trim() : null) ??
              (canUseStableTypeIds ? typeToStableId[s.type] : null) ??
              (candidateIds ? candidateIds[i] : null) ??
              `sub-src-${now}-${i}`;
            const finalId = toUniqueId(preferred) ?? `sub-src-${now}-${i}`;
            const lastParsedContent =
              s.type === "url"
                ? (typeof s.lastParsedContent === "string" && s.lastParsedContent.trim()
                  ? s.lastParsedContent.trim()
                  : s.content.trim())
                : typeof s.lastParsedContent === "string" && s.lastParsedContent.trim()
                  ? s.lastParsedContent.trim()
                  : undefined;
            return {
              id: finalId,
              type: s.type,
              content: s.type === "url" ? (tryNormalizeSubscriptionUrlInput(s.content) ?? s.content.trim()) : s.content,
              ...(lastParsedContent ? { lastParsedContent } : {}),
              ...(typeof s.tag === "string" && s.tag.trim() ? { tag: s.tag.trim() } : {}),
              ...(typeof s.nameTemplate === "string" && s.nameTemplate.trim() ? { nameTemplate: s.nameTemplate.trim() } : {}),
              ...(hasSubscriptionUserInfo(s.subscriptionUserInfo) ? { subscriptionUserInfo: s.subscriptionUserInfo } : {}),
              ...(s.type === "url" && s.useProxyProviders ? { useProxyProviders: true } : {}),
              ...(s.type === "url" && typeof s.userinfoUrl === "string" && s.userinfoUrl.trim()
                ? { userinfoUrl: tryNormalizeSubscriptionUrlInput(s.userinfoUrl) ?? s.userinfoUrl.trim() }
                : {}),
              ...(s.type === "url" && typeof s.userinfoUserAgent === "string" && s.userinfoUserAgent.trim()
                ? { userinfoUserAgent: s.userinfoUserAgent.trim() }
                : {}),
              ...(typeof s.lastParsedTag === "string" && s.lastParsedTag.trim() ? { lastParsedTag: s.lastParsedTag.trim() } : {}),
              ...(typeof s.lastParsedNameTemplate === "string" && s.lastParsedNameTemplate.trim()
                ? { lastParsedNameTemplate: s.lastParsedNameTemplate.trim() }
                : {}),
            } as SubscriptionSource;
          });
        };

        const rebuiltSourcesFromCfg = rebuildSourcesFromConfig((cfg as { sources?: unknown }).sources);

        const normalizedUrls = urls
          .map((u) => (typeof u === "string" ? tryNormalizeSubscriptionUrlInput(u) ?? u.trim() : ""))
          .filter(Boolean);
        const rebuiltSourcesFromUrls =
          normalizedUrls.length > 0
            ? normalizedUrls.map((u, i) => {
              const stableSingleUrlId =
                normalizedUrls.length === 1 && (nodeSourceIdSet.has("1") || nodeSourceIdSet.size === 0) ? "1" : null;
              const fallbackId = stableSingleUrlId ?? `sub-url-${i + 1}`;
              return {
                id: fallbackId,
                type: "url" as const,
                content: u,
                lastParsedContent: u,
              };
            })
            : [];

        // 订阅记录未保存 sources 时，尽量保留用户当前页面里的非 URL 输入（若 URL 列表完全一致）。
        const rebuiltSourcesFromCurrent = (() => {
          const current = useConfigStore.getState().sources as SubscriptionSource[];
          if (!Array.isArray(current) || current.length === 0) return [];

          const currentUrls = current
            .filter((s) => s.type === "url")
            .map((s) =>
              typeof s.content === "string" ? (tryNormalizeSubscriptionUrlInput(s.content) ?? s.content.trim()) : ""
            )
            .filter(Boolean);

          const hasNonUrlContent = current.some((s) => s.type !== "url" && typeof s.content === "string" && s.content.trim());
          const sameOrder = currentUrls.length === normalizedUrls.length && currentUrls.every((v, i) => v === normalizedUrls[i]);
          if (!hasNonUrlContent || !sameOrder) return [];

          return current.map((s) => {
            const subscriptionUserInfo = normalizeSubscriptionUserInfo(s.subscriptionUserInfo);
            return {
              id: s.id,
              type: s.type,
              content: s.type === "url" ? (tryNormalizeSubscriptionUrlInput(s.content) ?? s.content.trim()) : s.content,
              ...(typeof s.tag === "string" && s.tag.trim() ? { tag: s.tag.trim() } : {}),
              ...(typeof s.nameTemplate === "string" && s.nameTemplate.trim() ? { nameTemplate: s.nameTemplate.trim() } : {}),
              ...(hasSubscriptionUserInfo(subscriptionUserInfo) ? { subscriptionUserInfo } : {}),
              ...(s.type === "url" && s.useProxyProviders ? { useProxyProviders: true } : {}),
              ...(s.type === "url" && typeof s.userinfoUrl === "string" && s.userinfoUrl.trim()
                ? { userinfoUrl: tryNormalizeSubscriptionUrlInput(s.userinfoUrl) ?? s.userinfoUrl.trim() }
                : {}),
              ...(s.type === "url" && typeof s.userinfoUserAgent === "string" && s.userinfoUserAgent.trim()
                ? { userinfoUserAgent: s.userinfoUserAgent.trim() }
                : {}),
              ...(typeof s.lastParsedTag === "string" && s.lastParsedTag.trim() ? { lastParsedTag: s.lastParsedTag.trim() } : {}),
              ...(typeof s.lastParsedNameTemplate === "string" && s.lastParsedNameTemplate.trim()
                ? { lastParsedNameTemplate: s.lastParsedNameTemplate.trim() }
                : {}),
              ...(typeof s.lastParsedContent === "string" && s.lastParsedContent.trim()
                ? {
                    lastParsedContent:
                      s.type === "url"
                        ? (tryNormalizeSubscriptionUrlInput(s.lastParsedContent) ?? s.lastParsedContent.trim())
                        : s.lastParsedContent.trim(),
                  }
                : s.type === "url" && typeof s.content === "string" && s.content.trim()
                  ? { lastParsedContent: s.content.trim() }
                  : {}),
            };
          });
        })();

        const rebuiltSourcesBase: SubscriptionSource[] =
          rebuiltSourcesFromCfg.length > 0
            ? rebuiltSourcesFromCfg
            : rebuiltSourcesFromCurrent.length > 0
              ? rebuiltSourcesFromCurrent
              : rebuiltSourcesFromUrls;
        const rebuiltSources = (() => {
          if (!hasSubscriptionInfoFromRecord) return rebuiltSourcesBase;
          const urlSources = rebuiltSourcesBase.filter((s) => s.type === "url");
          if (urlSources.length !== 1) return rebuiltSourcesBase;
          const targetId = urlSources[0]?.id;
          return rebuiltSourcesBase.map((s) =>
            s.id === targetId && !hasSubscriptionUserInfo(s.subscriptionUserInfo)
              ? { ...s, subscriptionUserInfo: subscriptionInfoFromRecord }
              : s
          );
        })();

        const hydratedNodes = ensureNodesHaveValidSourceIds(filteredLoadedNodes, rebuiltSources, {
          onMissingMultiUrlSourceIds: () => {
            toast({
              title: "节点来源信息缺失",
              description:
                "该订阅包含多条订阅链接，但当前记录未标明每个节点来自哪条链接。建议分别点击每条订阅右侧 ✅ 重新导入一次，以建立正确的替换关系。",
              variant: "warning",
            });
          },
        });
        const rebuiltSourcesWithStatus = (() => {
          const nodeCountBySourceId = new Map<string, number>();
          for (const node of hydratedNodes) {
            for (const sid of getNodeSourceIds(node)) {
              nodeCountBySourceId.set(sid, (nodeCountBySourceId.get(sid) || 0) + 1);
            }
          }

          return rebuiltSources.map((s) => {
            const count = nodeCountBySourceId.get(s.id) || 0;
            return {
              ...s,
              parsed: true,
              parsing: false,
              // 若该源确实有节点归属，则显示节点数；否则不显示（但 ✅ 会变绿）
              ...(count > 0 ? { nodeCount: count } : {}),
              error: undefined,
              errorInfo: undefined,
            } as SubscriptionSource;
          });
        })();

        const templateFromCfg =
          cfg.template === "minimal" || cfg.template === "standard" || cfg.template === "full"
            ? (cfg.template as "minimal" | "standard" | "full")
            : "standard";

        const enabledGroupsFromCfg = Array.isArray(cfg.enabledGroups) ? (cfg.enabledGroups as string[]) : undefined;
        const hiddenProxyGroupsFromCfg = Array.isArray((cfg as any).hiddenProxyGroups)
          ? (() => {
              const out: string[] = [];
              const seen = new Set<string>();
              for (const item of (cfg as any).hiddenProxyGroups as unknown[]) {
                if (typeof item !== "string") continue;
                const id = item.trim();
                if (!id || seen.has(id)) continue;
                seen.add(id);
                out.push(id);
              }
              return out;
            })()
          : [];
        const hiddenProxyGroupSetFromCfg = new Set(hiddenProxyGroupsFromCfg);
        const customRulesFromCfg = ensureCustomRulesHaveIds(Array.isArray(cfg.customRules) ? (cfg.customRules as any[]) : []);
        const ruleModelFromCfg = normalizeRuleModelFromConfig(cfg);
        const customProxyGroupsFromCfg = ruleModelFromCfg.customProxyGroups;
        const customRuleSetsFromCfg = ruleModelFromCfg.customRuleSets;
        const builtinRuleEditsFromCfg = ruleModelFromCfg.builtinRuleEdits;
        const proxyGroupAdvancedFromCfg =
          cfg.proxyGroupAdvanced && typeof cfg.proxyGroupAdvanced === "object" && !Array.isArray(cfg.proxyGroupAdvanced)
            ? Object.fromEntries(
                Object.entries(cfg.proxyGroupAdvanced as Record<string, unknown>)
                  .map(([id, value]) => [id.trim(), normalizeProxyGroupAdvancedConfig(value)] as const)
                  .filter(([id, advanced]) => id && Object.keys(advanced).length > 0),
              )
            : {};
        const dialerProxyGroupsFromCfg = Array.isArray(cfg.dialerProxyGroups) ? (cfg.dialerProxyGroups as any[]) : [];
        const proxyGroupNameOverridesFromCfg =
          cfg.proxyGroupNameOverrides && typeof cfg.proxyGroupNameOverrides === "object"
            ? (cfg.proxyGroupNameOverrides as Record<string, unknown>)
            : null;
        const proxyGroupOrderFromCfg = Array.isArray((cfg as any).proxyGroupOrder)
          ? (() => {
              const out: string[] = [];
              const seen = new Set<string>();
              for (const item of (cfg as any).proxyGroupOrder as unknown[]) {
                if (typeof item !== "string") continue;
                const key = item.trim();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                out.push(key);
              }
              return out;
            })()
          : null;
        const nextEnabledModules = (enabledGroupsFromCfg ?? useConfigStore.getState().enabledProxyGroups).filter(
          (moduleId) => !hiddenProxyGroupSetFromCfg.has(moduleId)
        );
        const ruleOrderFromCfg = normalizePersistedRuleOrder({
          enabledModules: nextEnabledModules,
          customRules: customRulesFromCfg,
          customRuleSets: customRuleSetsFromCfg,
          builtinRuleEdits: builtinRuleEditsFromCfg,
          proxyGroupNameOverrides: proxyGroupNameOverridesFromCfg
            ? Object.fromEntries(
                Object.entries(proxyGroupNameOverridesFromCfg)
                  .filter(([, v]) => typeof v === "string")
                  .map(([k, v]) => [k, v as string])
              ) as Record<string, string>
            : useConfigStore.getState().proxyGroupNameOverrides,
          experimentalCnUseCnRuleSet:
            typeof (cfg as any).experimentalCnUseCnRuleSet === "boolean"
              ? Boolean((cfg as any).experimentalCnUseCnRuleSet)
              : useConfigStore.getState().experimentalCnUseCnRuleSet,
          cnIpNoResolve:
            typeof (cfg as any).cnIpNoResolve === "boolean"
              ? Boolean((cfg as any).cnIpNoResolve)
              : useConfigStore.getState().cnIpNoResolve,
          ruleOrder: Array.isArray((cfg as any).ruleOrder) ? ((cfg as any).ruleOrder as string[]) : [],
        });
        const listenerPortsFromCfg = (() => {
          const raw = (cfg as any).listenerPorts;
          if (!raw || typeof raw !== "object") return {};
          const activeNames = new Set(hydratedNodes.map((n) => n.name));
          const out: Record<string, number> = {};
          for (const [name, port] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof name !== "string" || !name.trim()) continue;
            if (!activeNames.has(name)) continue;
            if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) continue;
            out[name] = port;
          }
          return out;
        })();
        const appliedTemplateIdFromCfg =
          typeof cfg.appliedTemplateId === "string" && cfg.appliedTemplateId.trim()
            ? (cfg.appliedTemplateId as string)
            : null;
        const proxyGroupAdvancedModeEnabledFromCfg = resolveProxyGroupAdvancedModeEnabled({
          proxyGroupAdvancedModeEnabled: (cfg as any).proxyGroupAdvancedModeEnabled,
          customProxyGroups: customProxyGroupsFromCfg,
          proxyGroupAdvanced: proxyGroupAdvancedFromCfg,
        });

        // 重置后批量写入，避免中间状态触发重复生成
        useConfigStore.getState().reset();

        if (rebuiltSourcesWithStatus.length > 0) {
          setStoreSources(rebuiltSourcesWithStatus);
        }

        useConfigStore.setState((state) => ({
          ...state,
          nodes: hydratedNodes,
          deletedNodeNames: deletedNodeNamesMerged.length > 0 ? deletedNodeNamesMerged : state.deletedNodeNames,
          deletedNodes:
            deletedNodesFromCfg.length > 0
              ? deletedNodesFromCfg
              : deletedNodeNamesMerged.length > 0
                ? deletedNodeNamesMerged.map((originName) => ({ originName, name: originName }))
                : state.deletedNodes,
          parseErrors: [],
          template: templateFromCfg,
          enabledProxyGroups: nextEnabledModules,
          hiddenProxyGroups: hiddenProxyGroupsFromCfg,
          customRules: customRulesFromCfg as any,
          customProxyGroups: customProxyGroupsFromCfg as any,
          customRuleSets: customRuleSetsFromCfg,
          builtinRuleEdits: builtinRuleEditsFromCfg,
          proxyGroupAdvanced: proxyGroupAdvancedFromCfg,
          proxyGroupAdvancedModeEnabled: proxyGroupAdvancedModeEnabledFromCfg,
          moduleRuleEditWarningAccepted:
            typeof (cfg as any).moduleRuleEditWarningAccepted === "boolean"
              ? Boolean((cfg as any).moduleRuleEditWarningAccepted)
              : state.moduleRuleEditWarningAccepted,
          dialerProxyGroups: dialerProxyGroupsFromCfg as any,
          proxyGroupNameOverrides: proxyGroupNameOverridesFromCfg
            ? Object.fromEntries(
              Object.entries(proxyGroupNameOverridesFromCfg)
                .filter(([, v]) => typeof v === "string")
                .map(([k, v]) => [k, v as string])
            ) as Record<string, string>
            : state.proxyGroupNameOverrides,
          proxyGroupOrder: proxyGroupOrderFromCfg ? proxyGroupOrderFromCfg : state.proxyGroupOrder,
          ruleOrder: ruleOrderFromCfg.length > 0 ? ruleOrderFromCfg : state.ruleOrder,
          listenerPorts: listenerPortsFromCfg,
          appliedTemplateId: appliedTemplateIdFromCfg ?? state.appliedTemplateId,
          dnsYaml: typeof cfg.dnsYaml === "string" ? (cfg.dnsYaml as string) : state.dnsYaml,
          ruleProviderBaseUrl:
            typeof cfg.ruleProviderBaseUrl === "string" ? (cfg.ruleProviderBaseUrl as string) : state.ruleProviderBaseUrl,
          testUrl: typeof cfg.testUrl === "string" ? (cfg.testUrl as string) : state.testUrl,
          testInterval: typeof cfg.testInterval === "number" ? (cfg.testInterval as number) : state.testInterval,
          cnIpNoResolve: typeof (cfg as any).cnIpNoResolve === "boolean" ? Boolean((cfg as any).cnIpNoResolve) : state.cnIpNoResolve,
          experimentalCnUseCnRuleSet:
            typeof (cfg as any).experimentalCnUseCnRuleSet === "boolean"
              ? Boolean((cfg as any).experimentalCnUseCnRuleSet)
              : state.experimentalCnUseCnRuleSet,
        }));

        useConfigStore.getState().generateConfig();

        if (!cancelled) {
          const autoUpdateInterval =
            typeof sub.autoUpdateInterval === "number" &&
            Number.isFinite(sub.autoUpdateInterval) &&
            sub.autoUpdateInterval > 0
              ? Math.round(sub.autoUpdateInterval)
              : null;
          setEditingSubscription({
            id: sub.id,
            token: sub.token,
            name: sub.name || "未命名订阅",
            autoUpdateInterval,
            smartNodeMatchingEnabled: (cfg as any).smartNodeMatchingEnabled !== false,
          });
          setSubscriptionName(sub.name || "");
          setSubscriptionUrl("");
          setCopied(false);
        }
      } finally {
        if (!cancelled) setIsLoadingEditingSubscription(false);
      }
    };

    run().catch((e) => {
      if (!cancelled) {
        console.error(e);
        toast({
          title: e instanceof Error ? e.message : "加载订阅失败",
          variant: "destructive",
        });
        setEditingSubscription(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [editSubscriptionId, loadSubscription, loginHref, setCopied, setEditingSubscription, setStoreSources, setSubscriptionName, setSubscriptionUrl]);

  return isLoadingEditingSubscription;
}
