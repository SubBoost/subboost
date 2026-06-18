"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { setConfigDraftUserScope, useConfigStore } from "@subboost/ui/store/config-store";
import { consumeAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";
import { useUserStore, type User } from "@subboost/ui/store/user-store";
import { useUIStore } from "@subboost/ui/store/ui-store";
import { HomeLayout } from "@subboost/ui/product/home/home-layout";
import { useHomeActions } from "@subboost/ui/product/home/use-home-actions";
import { useCleanNewSubscriptionIntent } from "@subboost/ui/product/home/use-clean-new-subscription-intent";
import { useEditingSubscriptionLoader } from "@subboost/ui/product/home/use-editing-subscription-loader";
import { useSubscriptionLink, type HomeSubscriptionAdapter } from "@subboost/ui/product/home/use-subscription-link";
import { ProductApiAdapterProvider, type ProductApiAdapter } from "@subboost/ui/product/api-adapter";
import {
  ProductInteractionAdapterProvider,
  type ProductInteractionAdapter,
} from "@subboost/ui/product/interactions";

type AnnouncementContext = {
  placement: "home" | "advanced";
  authChecked: boolean;
  user: User | null;
};

type SaveRequirementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
};

export type HomeSurfaceAdapter = {
  productApi?: ProductApiAdapter;
  interactions?: ProductInteractionAdapter;
  subscription?: HomeSubscriptionAdapter;
  loadSubscription?: (id: string) => Promise<Response>;
  loginHref?: string;
  recordConfigDownload?: (templateId: string | null) => void;
  onAuthenticatedUserReady?: (context: { user: User }) => void;
  renderNotice?: (context: { user: User | null; showAiColumn: boolean }) => React.ReactNode;
  renderAnnouncement?: (context: AnnouncementContext) => React.ReactNode;
  renderSaveRequirementDialog?: (props: SaveRequirementDialogProps) => React.ReactNode;
  onConfigImport?: () => void;
  onConfigExport?: () => void;
};

type Props = {
  adapter?: HomeSurfaceAdapter;
};

function HomeSurfaceInner({ adapter }: Props) {
  const {
    nodes,
    deletedNodeNames,
    deletedNodes,
    generatedYaml,
    generatedYamlError,
    isLoading: configLoading,
    sources: storeSources,
    setSources: setStoreSources,
    parseMultipleSources,
    clearNodes,
    generateConfig,
    template,
    enabledProxyGroups,
    hiddenProxyGroups,
    customProxyGroups,
    moduleRuleOverrides,
    moduleRuleExclusions,
    moduleRuleEditWarningAccepted,
    customRules,
    ruleOrder,
    allRulesOrderEditingEnabled,
    dialerProxyGroups,
    listenerPorts,
    dnsYaml,
    ruleProviderBaseUrl,
    testUrl,
    testInterval,
    cnIpNoResolve,
    experimentalCnUseCnRuleSet,
    proxyGroupNameOverrides,
    appliedTemplateId,
  } = useConfigStore();
  const { user, fetchUser, clearUser } = useUserStore();
  const userId = user?.id ?? null;
  const editingSubscription = useUIStore((state) => state.editingSubscription);
  const setEditingSubscription = useUIStore((state) => state.setEditingSubscription);
  const searchParams = useSearchParams();
  const editSubscriptionId = searchParams.get("editSubscriptionId");

  const showAiColumn = Boolean(user?.aiAssistantEnabled);
  const [authChecked, setAuthChecked] = React.useState(false);

  const subscription = useSubscriptionLink({
    authChecked,
    user,
    fetchUser,
    clearUser,
    subscriptionAdapter: adapter?.subscription,
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
    moduleRuleOverrides,
    moduleRuleExclusions,
    moduleRuleEditWarningAccepted,
    ruleOrder,
    allRulesOrderEditingEnabled,
    dialerProxyGroups,
    proxyGroupNameOverrides,
    listenerPorts,
    dnsYaml,
    ruleProviderBaseUrl,
    testUrl,
    testInterval,
    cnIpNoResolve,
    experimentalCnUseCnRuleSet,
  });
  const { setSubscriptionName, setSubscriptionUrl, setCopied } = subscription;

  React.useEffect(() => {
    let cancelled = false;
    fetchUser()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUser]);

  React.useEffect(() => {
    setConfigDraftUserScope(userId);
    if (!userId) return;

    const handoff = consumeAuthConfigHandoff();
    if (!handoff) return;

    useConfigStore.setState((state) => ({
      ...state,
      ...handoff,
      parseErrors: [],
      isLoading: false,
      generatedYaml: "",
      generatedYamlError: null,
      history: [],
      historyIndex: -1,
    }));
    useConfigStore.getState().generateConfig();
  }, [userId]);

  React.useEffect(() => {
    if (!authChecked || !user) return;
    adapter?.onAuthenticatedUserReady?.({ user });
  }, [adapter, authChecked, user]);

  useCleanNewSubscriptionIntent({
    authChecked,
    searchParams,
    setCopied,
    setEditingSubscription,
    setSubscriptionName,
    setSubscriptionUrl,
  });

  const isLoadingEditingSubscription = useEditingSubscriptionLoader({
    editSubscriptionId,
    loadSubscription: adapter?.loadSubscription,
    loginHref: adapter?.loginHref ?? adapter?.subscription?.loginHref,
    setCopied,
    setEditingSubscription,
    setStoreSources,
    setSubscriptionName,
    setSubscriptionUrl,
  });

  const { handleDownload, handleGenerate, hasValidSources } = useHomeActions({
    generatedYaml,
    generatedYamlError,
    appliedTemplateId,
    recordConfigDownload: adapter?.recordConfigDownload,
    storeSources,
    nodes,
    clearNodes,
    parseMultipleSources,
    generateConfig,
  });

  return (
    <HomeLayout
      showAiColumn={showAiColumn}
      user={user}
      authChecked={authChecked}
      editingSubscription={editingSubscription}
      isLoadingEditingSubscription={isLoadingEditingSubscription}
      editSubscriptionId={editSubscriptionId}
      generatedYaml={generatedYaml}
      generatedYamlError={generatedYamlError}
      configLoading={configLoading}
      hasValidSources={hasValidSources}
      handleGenerate={handleGenerate}
      handleDownload={handleDownload}
      subscription={subscription}
      noticeSlot={adapter?.renderNotice?.({ user, showAiColumn })}
      renderAnnouncement={adapter?.renderAnnouncement}
      saveRequirementSlot={adapter?.renderSaveRequirementDialog?.({
        open: subscription.saveRequirementDialog,
        onOpenChange: subscription.setSaveRequirementDialog,
        onAccept: subscription.handleAcceptSaveRequirement,
      })}
      onConfigImport={adapter?.onConfigImport}
      onConfigExport={adapter?.onConfigExport}
    />
  );
}

export function HomeSurface({ adapter }: Props) {
  return (
    <ProductApiAdapterProvider adapter={adapter?.productApi}>
      <ProductInteractionAdapterProvider adapter={adapter?.interactions}>
        <React.Suspense fallback={null}>
          <HomeSurfaceInner adapter={adapter} />
        </React.Suspense>
      </ProductInteractionAdapterProvider>
    </ProductApiAdapterProvider>
  );
}
