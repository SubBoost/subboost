"use client";

import * as React from "react";
import { toast, ToastAction } from "@subboost/ui/components/ui/toaster";
import type { ParsedNode } from "@subboost/core/types/node";
import {
  getNodeSourceIds,
  type SubscriptionSource,
  type DialerProxyGroup,
} from "@subboost/ui/store/config-store";
import type { BuiltinRuleEdits, CustomRule, CustomProxyGroup, CustomRuleSet } from "@subboost/core/types/config";
import type { User } from "@subboost/ui/store/user-store";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { captureAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";
import {
  hasSubscriptionUserInfo,
  mergeSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  resolveSubscriptionUserInfo,
  type SubscriptionUserInfo,
} from "@subboost/core/subscription/subscription-userinfo";
import {
  autoUpdateIntervalHoursToSeconds,
  autoUpdateIntervalSecondsToHours,
  getAutoUpdateIntervalPolicyMinLabel,
  resolveAutoUpdateIntervalPolicy,
  type AutoUpdateIntervalPolicy,
  type AutoUpdateIntervalPolicyOverride,
} from "@subboost/core/subscription/auto-update-interval";
import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import { formatDateInBeijing } from "@subboost/core/time/beijing";
import {
  useProductInteractionAdapter,
  type ProductInteractionResult,
  type ProductMode,
} from "@subboost/ui/product/interactions";

type EditingSubscription = {
  id: string;
  token: string;
  name: string;
  autoUpdateInterval: number | null;
  smartNodeMatchingEnabled: boolean;
};

export type HomeSubscriptionSaveInput = {
  isEditing: boolean;
  subscriptionId: string | null;
  payload: Record<string, unknown>;
};

export type HomeSubscriptionAdapter = {
  loginHref?: string;
  autoUpdateIntervalPolicy?: AutoUpdateIntervalPolicyOverride;
  acceptSaveRequirement?: () => Promise<Response>;
  saveSubscription?: (input: HomeSubscriptionSaveInput) => Promise<Response>;
};

type Options = {
  authChecked: boolean;
  user: User | null;
  fetchUser: () => Promise<void>;
  clearUser: () => void;
  subscriptionAdapter?: HomeSubscriptionAdapter;
  generatedYaml: string;
  editingSubscription: EditingSubscription | null;
  setEditingSubscription: (subscription: EditingSubscription | null) => void;
  appliedTemplateId: string | null;
  template: string;
  storeSources: SubscriptionSource[];
  nodes: ParsedNode[];
  deletedNodeNames: string[];
  deletedNodes: Array<{ originName: string; name: string }>;
  enabledProxyGroups: string[];
  hiddenProxyGroups: string[];
  customRules: CustomRule[];
  customProxyGroups: CustomProxyGroup[];
  customRuleSets: CustomRuleSet[];
  builtinRuleEdits: BuiltinRuleEdits;
  ruleOrder: string[];
  moduleRuleEditWarningAccepted: boolean;
  dialerProxyGroups: DialerProxyGroup[];
  proxyGroupNameOverrides: Record<string, string>;
  listenerPorts: Record<string, number>;
  dnsYaml: string;
  ruleProviderBaseUrl: string;
  testUrl: string;
  testInterval: number;
  cnIpNoResolve: boolean;
  experimentalCnUseCnRuleSet: boolean;
};

export function useSubscriptionLink({
  authChecked,
  user,
  fetchUser,
  clearUser,
  subscriptionAdapter,
  generatedYaml,
  editingSubscription,
  setEditingSubscription,
  appliedTemplateId,
  template,
  storeSources,
  nodes,
  deletedNodeNames,
  deletedNodes,
  enabledProxyGroups,
  hiddenProxyGroups,
  customRules,
  customProxyGroups,
  customRuleSets,
  builtinRuleEdits,
  ruleOrder,
  moduleRuleEditWarningAccepted,
  dialerProxyGroups,
  proxyGroupNameOverrides,
  listenerPorts,
  dnsYaml,
  ruleProviderBaseUrl,
  testUrl,
  testInterval,
  cnIpNoResolve,
  experimentalCnUseCnRuleSet,
}: Options) {
  const autoUpdatePolicy = React.useMemo(
    () =>
      resolveAutoUpdateIntervalPolicy(
        user?.isAdmin === true,
        subscriptionAdapter?.autoUpdateIntervalPolicy
      ),
    [subscriptionAdapter?.autoUpdateIntervalPolicy, user?.isAdmin]
  );
  const [subscriptionDialog, setSubscriptionDialog] = React.useState(false);
  const [subscriptionName, setSubscriptionName] = React.useState("");
  const [subscriptionUrl, setSubscriptionUrl] = React.useState("");
  const [autoUpdateEnabled, setAutoUpdateEnabled] = React.useState(false);
  const [autoUpdateHours, setAutoUpdateHours] = React.useState(autoUpdatePolicy.defaultHours);
  const [smartNodeMatchingEnabled, setSmartNodeMatchingEnabled] = React.useState(true);
  const [isCreatingSubscription, setIsCreatingSubscription] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [saveRequirementDialog, setSaveRequirementDialog] = React.useState(false);
  const [subscriptionFlowMode, setSubscriptionFlowMode] = React.useState<ProductMode>("quick");
  const interactions = useProductInteractionAdapter();

  const isEditingExistingSubscription = Boolean(editingSubscription);
  const loginHref = subscriptionAdapter?.loginHref ?? "/login";
  const trackSubscriptionMutation = React.useCallback((result: ProductInteractionResult) => {
    interactions.subscriptionLinkSaved?.({
      mode: subscriptionFlowMode,
      flow: isEditingExistingSubscription ? "update" : "create",
      result,
      autoUpdateEnabled,
      smartMatchingEnabled: smartNodeMatchingEnabled,
      autoUpdateHours: autoUpdateEnabled ? autoUpdateHours : null,
      sourceCount: storeSources.filter((source) => source.content.trim()).length,
      nodeCount: nodes.length,
    });
  }, [
    autoUpdateEnabled,
    autoUpdateHours,
    interactions,
    isEditingExistingSubscription,
    nodes.length,
    smartNodeMatchingEnabled,
    storeSources,
    subscriptionFlowMode,
  ]);

  const goToLogin = React.useCallback(() => {
    captureAuthConfigHandoff(useConfigStore.getState());
    window.location.href = loginHref;
  }, [loginHref]);

  const initializeSubscriptionDialog = React.useCallback(() => {
    const currentAutoUpdateInterval = editingSubscription?.autoUpdateInterval;
    const nextAutoUpdateEnabled =
      isEditingExistingSubscription &&
      typeof currentAutoUpdateInterval === "number" &&
      Number.isFinite(currentAutoUpdateInterval) &&
      currentAutoUpdateInterval > 0;
    const nextAutoUpdateHours =
      nextAutoUpdateEnabled && typeof currentAutoUpdateInterval === "number"
      ? Math.max(autoUpdatePolicy.minHours, autoUpdateIntervalSecondsToHours(currentAutoUpdateInterval))
      : autoUpdatePolicy.defaultHours;

    setSubscriptionName(
      isEditingExistingSubscription
        ? editingSubscription?.name || ""
        : `我的配置 ${formatDateInBeijing(new Date())}`
    );
    setAutoUpdateEnabled(nextAutoUpdateEnabled);
    setAutoUpdateHours(nextAutoUpdateHours);
    setSmartNodeMatchingEnabled(editingSubscription?.smartNodeMatchingEnabled !== false);
    setSubscriptionUrl("");
    setSubscriptionDialog(true);
  }, [autoUpdatePolicy.defaultHours, autoUpdatePolicy.minHours, editingSubscription, isEditingExistingSubscription]);

  // 打开订阅链接对话框
  const handleGenerateSubscription = React.useCallback((mode: ProductMode) => {
    setSubscriptionFlowMode(mode);

    if (!authChecked) {
      interactions.subscriptionLinkIntent?.({ mode, result: "blockedAuth" });
      toast({ title: "正在确认登录状态，请稍后再试", variant: "info" });
      return;
    }

    if (!generatedYaml) {
      interactions.subscriptionLinkIntent?.({ mode, result: "blockedNoConfig" });
      toast({ title: "请先生成配置后再生成订阅链接", variant: "warning" });
      return;
    }

    if (!user) {
      interactions.subscriptionLinkIntent?.({ mode, result: "blockedAuth" });
      toast({
        title: "生成订阅链接需要登录",
          description: "下载配置无需登录；如需订阅链接（可在客户端自动更新），请先登录。",
          variant: "info",
          action: (
          <ToastAction altText="去登录" onClick={goToLogin}>
            去登录
          </ToastAction>
        ),
      });
      return;
    }

    if (!user.saveRequirementSatisfied) {
      interactions.subscriptionLinkIntent?.({ mode, result: "blockedRequirement" });
      setSaveRequirementDialog(true);
      return;
    }

    initializeSubscriptionDialog();
    interactions.subscriptionLinkIntent?.({ mode, result: "opened" });
  }, [authChecked, generatedYaml, goToLogin, initializeSubscriptionDialog, interactions, user]);

  const handleAcceptSaveRequirement = React.useCallback(async () => {
    if (!subscriptionAdapter?.acceptSaveRequirement) {
      toast({ title: "当前应用未配置保存前置确认接口", variant: "destructive" });
      return;
    }

    try {
      const response = await subscriptionAdapter.acceptSaveRequirement();
      if (response.ok) {
        interactions.saveRequirementAccepted?.();
        await fetchUser();
        setSaveRequirementDialog(false);
        initializeSubscriptionDialog();
      }
    } catch (error) {
      console.error("Accept save requirement error:", error);
    }
  }, [fetchUser, initializeSubscriptionDialog, interactions, subscriptionAdapter]);

  // 创建订阅链接
  const handleCreateSubscription = React.useCallback(async () => {
    if (!subscriptionName.trim() || !generatedYaml) {
      trackSubscriptionMutation(!generatedYaml ? "noInput" : "validationError");
      return;
    }

    const hoursValue = Number(autoUpdateHours);
    if (autoUpdateEnabled) {
      if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
        trackSubscriptionMutation("validationError");
        toast({ title: "自动更新间隔必须是有效小时数", variant: "warning" });
        return;
      }
      if (autoUpdatePolicy.requireIntegerHours && !Number.isInteger(hoursValue)) {
        trackSubscriptionMutation("validationError");
        toast({ title: "自动更新间隔必须是整数小时", variant: "warning" });
        return;
      }
      if (hoursValue < autoUpdatePolicy.minHours) {
        trackSubscriptionMutation("validationError");
        toast({
          title: `自动更新最小间隔为 ${getAutoUpdateIntervalPolicyMinLabel(autoUpdatePolicy)}`,
          variant: "warning",
        });
        return;
      }
    }

    const nextAutoUpdateInterval = autoUpdateEnabled ? autoUpdateIntervalHoursToSeconds(hoursValue) : null;
    if (!subscriptionAdapter?.saveSubscription) {
      trackSubscriptionMutation("runtimeError");
      toast({ title: "当前应用未配置订阅保存接口", variant: "destructive" });
      return;
    }

    setIsCreatingSubscription(true);

    try {
      const subscriptionInfo: SubscriptionUserInfo = {};
      const sourceSubscriptionInfoById = new Map<string, SubscriptionUserInfo>();
      for (const source of storeSources) {
        const sourceNodes = nodes.filter((node) => getNodeSourceIds(node).includes(source.id));
        const resolvedSourceInfo = resolveSubscriptionUserInfo(source.subscriptionUserInfo, sourceNodes);
        if (!hasSubscriptionUserInfo(resolvedSourceInfo)) continue;
        sourceSubscriptionInfoById.set(source.id, resolvedSourceInfo);
        mergeSubscriptionUserInfo(subscriptionInfo, resolvedSourceInfo);
      }
      const hasSubscriptionInfo = hasSubscriptionUserInfo(subscriptionInfo);

      const payload = {
          name: subscriptionName,
          templateId: appliedTemplateId,
          autoUpdateInterval: nextAutoUpdateInterval,
          urls: storeSources
            .filter((s) => s.type === "url")
            .map((s) => s.content)
            .filter((u): u is string => typeof u === "string")
            .map((u) => tryNormalizeSubscriptionUrlInput(u) ?? u.trim())
            .filter(Boolean),
          nodes,
          ...(hasSubscriptionInfo ? { subscriptionInfo } : {}),
          // 订阅链接存储“结构化配置 + 节点列表”用于生成配置
          config: {
            template,
            appliedTemplateId,
            smartNodeMatchingEnabled,
            // 用于“我的订阅 → 编辑”恢复输入源（保留 YAML/节点链接/多个 URL 的顺序）
            sources: storeSources
            .filter((s) => typeof s?.content === "string" && s.content.trim())
              .map((s) => {
                const sourceSubscriptionUserInfo = normalizeSubscriptionUserInfo(
                  sourceSubscriptionInfoById.get(s.id) ?? s.subscriptionUserInfo
                );
                return {
                  id: s.id,
                  type: s.type,
                  content:
                    s.type === "url"
                      ? (tryNormalizeSubscriptionUrlInput(s.content) ?? s.content.trim())
                      : s.content,
                  ...(typeof s.tag === "string" && s.tag.trim() ? { tag: s.tag.trim() } : {}),
                  nameTemplate:
                    typeof s.nameTemplate === "string" && s.nameTemplate.trim()
                      ? s.nameTemplate.trim()
                      : DEFAULT_NODE_NAME_TEMPLATE,
                  ...(hasSubscriptionUserInfo(sourceSubscriptionUserInfo)
                    ? { subscriptionUserInfo: sourceSubscriptionUserInfo }
                    : {}),
                  ...(s.type === "url" && s.useProxyProviders ? { useProxyProviders: true } : {}),
                  ...(s.type === "url" && typeof s.providerKey === "string" && s.providerKey.trim()
                    ? { providerKey: s.providerKey.trim() }
                    : {}),
                  ...(s.type === "url" &&
                  (s.providerMode === "grouped" || s.providerMode === "inline" || s.providerMode === "bare")
                    ? { providerMode: s.providerMode }
                    : {}),
                  ...(s.type === "url" && typeof s.providerGroupName === "string" && s.providerGroupName.trim()
                    ? { providerGroupName: s.providerGroupName.trim() }
                    : {}),
                  ...(s.type === "url" && typeof s.providerFilter === "string"
                    ? { providerFilter: s.providerFilter }
                    : {}),
                  ...(s.type === "url" && typeof s.userinfoUrl === "string" && s.userinfoUrl.trim()
                    ? { userinfoUrl: tryNormalizeSubscriptionUrlInput(s.userinfoUrl) ?? s.userinfoUrl.trim() }
                    : {}),
                  ...(s.type === "url" && typeof s.userinfoUserAgent === "string" && s.userinfoUserAgent.trim()
                    ? { userinfoUserAgent: s.userinfoUserAgent.trim() }
                    : {}),
                  ...(typeof s.lastParsedTag === "string" && s.lastParsedTag.trim()
                    ? { lastParsedTag: s.lastParsedTag.trim() }
                    : {}),
                  ...(typeof s.lastParsedNameTemplate === "string" && s.lastParsedNameTemplate.trim()
                    ? { lastParsedNameTemplate: s.lastParsedNameTemplate.trim() }
                    : {}),
                  ...(s.type === "url"
                    ? {
                        lastParsedContent:
                          typeof s.lastParsedContent === "string" && s.lastParsedContent.trim()
                            ? (tryNormalizeSubscriptionUrlInput(s.lastParsedContent) ?? s.lastParsedContent.trim())
                            : (tryNormalizeSubscriptionUrlInput(s.content) ?? s.content.trim()),
                      }
                    : typeof s.lastParsedContent === "string" && s.lastParsedContent.trim()
                      ? { lastParsedContent: s.lastParsedContent.trim() }
                      : {}),
                };
              }),
            deletedNodeNames,
            deletedNodes,
            enabledGroups: enabledProxyGroups,
            enabledRules: enabledProxyGroups,
            hiddenProxyGroups,
            customRules,
            ruleOrder,
            customProxyGroups,
            customRuleSets,
            builtinRuleEdits,
            proxyGroupAdvanced: useConfigStore.getState().proxyGroupAdvanced,
            proxyGroupAdvancedModeEnabled: Boolean(useConfigStore.getState().proxyGroupAdvancedModeEnabled),
            moduleRuleEditWarningAccepted,
            dialerProxyGroups,
            proxyGroupNameOverrides,
            proxyGroupOrder: useConfigStore.getState().proxyGroupOrder,
            listenerPorts,
            groupListeners: useConfigStore.getState().groupListeners,
            dnsYaml,
            ruleProviderBaseUrl,
            testUrl,
            testInterval,
            cnIpNoResolve,
            experimentalCnUseCnRuleSet,
            autoSelectStrategy: "url-test",
          },
        };

      const response = await subscriptionAdapter.saveSubscription({
        isEditing: isEditingExistingSubscription,
        subscriptionId: editingSubscription?.id ?? null,
        payload,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json().catch(() => ({} as any));

      if (response.status === 401) {
        clearUser();
        trackSubscriptionMutation("runtimeError");
        toast({
            title: "生成订阅链接需要登录",
            description: "登录态已失效，请重新登录后再试。",
            variant: "warning",
            action: (
            <ToastAction altText="去登录" onClick={goToLogin}>
              去登录
            </ToastAction>
          ),
        });
        setSubscriptionDialog(false);
        return;
      }

      if (response.ok) {
        const token = data?.subscription?.token || editingSubscription?.token;
        const url =
          typeof data?.subscription?.subscriptionUrl === "string"
            ? data.subscription.subscriptionUrl
            : "";
        setSubscriptionUrl(url);
        if (isEditingExistingSubscription && editingSubscription && token) {
          setEditingSubscription({
            ...editingSubscription,
            name: subscriptionName,
            token,
            autoUpdateInterval: nextAutoUpdateInterval,
            smartNodeMatchingEnabled,
          });
        }
        trackSubscriptionMutation("success");
      } else {
        trackSubscriptionMutation(response.status >= 500 ? "runtimeError" : "validationError");
        toast({ title: data.error || "创建失败", variant: "destructive" });
      }
    } catch (error) {
      console.error("Create subscription error:", error);
      trackSubscriptionMutation("runtimeError");
      toast({ title: "创建订阅失败，请稍后重试", variant: "destructive" });
    } finally {
      setIsCreatingSubscription(false);
    }
  }, [
    appliedTemplateId,
    autoUpdatePolicy,
    autoUpdateEnabled,
    autoUpdateHours,
    clearUser,
    cnIpNoResolve,
    experimentalCnUseCnRuleSet,
    customProxyGroups,
    customRuleSets,
    builtinRuleEdits,
    customRules,
    ruleOrder,
    deletedNodeNames,
    deletedNodes,
    dialerProxyGroups,
    dnsYaml,
    editingSubscription,
    enabledProxyGroups,
    hiddenProxyGroups,
    generatedYaml,
    isEditingExistingSubscription,
    listenerPorts,
    goToLogin,
    moduleRuleEditWarningAccepted,
    nodes,
    proxyGroupNameOverrides,
    ruleProviderBaseUrl,
    setEditingSubscription,
    smartNodeMatchingEnabled,
    storeSources,
    subscriptionName,
    subscriptionAdapter,
    template,
    testInterval,
    testUrl,
    trackSubscriptionMutation,
  ]);

  // 复制订阅链接
  const handleCopyUrl = React.useCallback(async () => {
    if (!subscriptionUrl) return;

    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setCopied(true);
      interactions.subscriptionLinkCopied?.({
        mode: subscriptionFlowMode,
        flow: isEditingExistingSubscription ? "update" : "create",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy error:", error);
    }
  }, [interactions, isEditingExistingSubscription, subscriptionFlowMode, subscriptionUrl]);

  return {
    // state
    subscriptionDialog,
    setSubscriptionDialog,
    subscriptionName,
    setSubscriptionName,
    subscriptionUrl,
    setSubscriptionUrl,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    autoUpdateHours,
    setAutoUpdateHours,
    autoUpdatePolicy: autoUpdatePolicy as AutoUpdateIntervalPolicy,
    smartNodeMatchingEnabled,
    setSmartNodeMatchingEnabled,
    isCreatingSubscription,
    copied,
    setCopied,
    saveRequirementDialog,
    setSaveRequirementDialog,
    isEditingExistingSubscription,

    // actions
    handleGenerateSubscription,
    handleAcceptSaveRequirement,
    handleCreateSubscription,
    handleCopyUrl,
  };
}
