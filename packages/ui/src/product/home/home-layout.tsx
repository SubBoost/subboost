"use client";

import * as React from "react";
import Link from "next/link";
import {
  Download,
  AlertTriangle,
  ExternalLink,
  Eye,
  Loader2,
  Settings2,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@subboost/ui/components/ui/tabs";
import { QuickMode } from "@subboost/ui/product/converter/quick-mode";
import { AdvancedMode } from "@subboost/ui/product/converter/advanced-mode";
import { UnsavedPrompt } from "@subboost/ui/product/home/unsaved-prompt";
import { VisualGraph } from "@subboost/ui/product/preview/visual-graph";
import { YamlHighlight } from "@subboost/ui/product/preview/diff-highlight";
import { SubscriptionLinkDialog } from "@subboost/ui/product/home/subscription-link-dialog";
import { artisticTabsIconClassName, artisticTabsListClassName, artisticTabsTriggerClassName } from "@subboost/ui/components/ui/artistic-nav";
import { useProductInteractionAdapter, type ProductMode } from "@subboost/ui/product/interactions";
import { cn } from "@subboost/ui/lib/utils";
import type { User } from "@subboost/ui/store/user-store";
import type { AutoUpdateIntervalPolicy } from "@subboost/core/subscription/auto-update-interval";

type EditingSubscription = {
  id: string;
  token: string;
  name: string;
  autoUpdateInterval: number | null;
  smartNodeMatchingEnabled: boolean;
};

type SubscriptionLinkState = {
  subscriptionDialog: boolean;
  setSubscriptionDialog: (open: boolean) => void;
  subscriptionName: string;
  setSubscriptionName: (value: string) => void;
  subscriptionUrl: string;
  autoUpdateEnabled: boolean;
  setAutoUpdateEnabled: (value: boolean) => void;
  autoUpdateHours: number;
  setAutoUpdateHours: (value: number) => void;
  autoUpdatePolicy: AutoUpdateIntervalPolicy;
  smartNodeMatchingEnabled: boolean;
  setSmartNodeMatchingEnabled: (value: boolean) => void;
  isCreatingSubscription: boolean;
  copied: boolean;
  saveRequirementDialog: boolean;
  setSaveRequirementDialog: (open: boolean) => void;
  isEditingExistingSubscription: boolean;
  handleGenerateSubscription: (mode: ProductMode) => void;
  handleAcceptSaveRequirement: () => void;
  handleCreateSubscription: () => void;
  handleCopyUrl: () => void;
};

type Props = {
  showAiColumn: boolean;
  user: User | null;
  authChecked: boolean;

  editingSubscription: EditingSubscription | null;
  isLoadingEditingSubscription: boolean;
  editSubscriptionId: string | null;

  generatedYaml: string;
  generatedYamlError: string | null;
  configLoading: boolean;
  hasValidSources: boolean;

  handleGenerate: (mode: ProductMode) => void;
  handleDownload: (mode: ProductMode) => void;

  subscription: SubscriptionLinkState;
  noticeSlot?: React.ReactNode;
  renderAnnouncement?: (context: {
    placement: "home" | "advanced";
    authChecked: boolean;
    user: User | null;
  }) => React.ReactNode;
  saveRequirementSlot?: React.ReactNode;
  onConfigImport?: () => void;
  onConfigExport?: () => void;
};

const DESKTOP_PANEL_MIN_HEIGHT_CLASS = "lg:min-h-[39rem]";
const DESKTOP_PANEL_CONTENT_MIN_HEIGHT_CLASS = "lg:min-h-[30rem]";

export function HomeLayout({
  showAiColumn,
  user,
  authChecked,
  editingSubscription,
  isLoadingEditingSubscription,
  editSubscriptionId,
  generatedYaml,
  generatedYamlError,
  configLoading,
  hasValidSources,
  handleGenerate,
  handleDownload,
  subscription,
  noticeSlot,
  renderAnnouncement,
  saveRequirementSlot,
  onConfigImport,
  onConfigExport,
}: Props) {
  const [configTab, setConfigTab] = React.useState<"quick" | "advanced">(editSubscriptionId ? "advanced" : "quick");
  const interactions = useProductInteractionAdapter();

  React.useEffect(() => {
    if (!editSubscriptionId) return;
    setConfigTab("advanced");
  }, [editSubscriptionId]);

  const handleConfigTabChange = React.useCallback((value: string) => {
    const nextMode: ProductMode = value === "advanced" ? "advanced" : "quick";
    setConfigTab(nextMode);
    interactions.modeChanged?.({ mode: nextMode });
  }, [interactions]);

  return (
    <div className="w-full max-w-[clamp(1200px,95vw,2400px)] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-3 lg:py-5 [@media(max-height:1000px)]:py-3 min-h-[calc(100vh-64px)] flex flex-col">
      {renderAnnouncement?.({
        placement: configTab === "advanced" ? "advanced" : "home",
        authChecked,
        user,
      })}

      {/* Hero */}
      <div className="text-center mb-2 lg:mb-3 [@media(max-height:1000px)]:mb-1.5">
        <h1 className="font-bold leading-[1.08] mb-1 text-[clamp(1.25rem,2vw,2rem)] [@media(max-height:1000px)]:text-[clamp(1.25rem,1.7vw,1.75rem)]">
          <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
            SubBoost
          </span>
        </h1>
        <p className="text-white/50 max-w-2xl mx-auto leading-snug text-[clamp(0.75rem,1vw,0.95rem)] [@media(max-height:1000px)]:text-[0.875rem]">
          Clash 订阅转换、生成与管理服务，支持链式代理、智能分流、多协议和多订阅聚合
        </p>
      </div>

      {noticeSlot}

      {/* Main Content - Three Column Layout */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 lg:flex-1 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}>
        {/* Left Column - Configuration */}
        <div
          id="config"
          className={`${
            showAiColumn ? "lg:col-span-4 xl:col-span-4" : "lg:col-span-6 xl:col-span-6"
          } flex flex-col gap-3 min-h-0 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}
        >
          <Tabs
            value={configTab}
            onValueChange={handleConfigTabChange}
            className={`flex flex-col lg:flex-1 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}
          >
            <Card className={`w-full flex flex-col overflow-visible lg:flex-1 lg:overflow-hidden ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}>
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base lg:text-lg flex items-center gap-2 min-w-0">
                    <Settings2 className="h-5 w-5 text-indigo-400" />
                    <span className="shrink-0">配置生成器</span>
                    {isLoadingEditingSubscription && editSubscriptionId && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-100/90">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        加载订阅中...
                      </span>
                    )}
                    {editingSubscription && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-100/90 min-w-0">
                        <span className="shrink-0">编辑中</span>
                        <span className="max-w-[10rem] sm:max-w-[16rem] truncate">
                          {editingSubscription.name}
                        </span>
                      </span>
                    )}
                  </CardTitle>
                  <TabsList className={cn(artisticTabsListClassName, "self-start")}>
                    <TabsTrigger value="quick" className={cn(artisticTabsTriggerClassName, "min-w-[7rem]")}>
                      <Zap className={artisticTabsIconClassName} />
                      快捷模式
                    </TabsTrigger>
                    <TabsTrigger value="advanced" className={cn(artisticTabsTriggerClassName, "min-w-[7rem]")}>
                      <Settings2 className={artisticTabsIconClassName} />
                      高级模式
                    </TabsTrigger>
                  </TabsList>
                </div>
              </CardHeader>
              <CardContent className={`pt-0 relative lg:flex-1 lg:overflow-hidden ${DESKTOP_PANEL_CONTENT_MIN_HEIGHT_CLASS}`}>
                <TabsContent
                  value="quick"
                  className="mt-0 flex flex-col data-[state=inactive]:hidden lg:absolute lg:inset-0 lg:overflow-y-auto custom-scrollbar lg:pr-1"
                >
                  <QuickMode />
                </TabsContent>
                <TabsContent
                  value="advanced"
                  className="mt-0 data-[state=inactive]:hidden lg:absolute lg:inset-0 lg:overflow-y-auto custom-scrollbar lg:pr-1"
                >
                  <AdvancedMode />
                </TabsContent>
              </CardContent>
              <CardFooter className="justify-center gap-2 flex-shrink-0 pt-3 flex-row flex-wrap">
                <Button className="h-10" onClick={() => handleGenerate(configTab)} disabled={configLoading || !hasValidSources}>
                  {configLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      处理中...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      生成配置
                    </>
                  )}
                </Button>
                {user && (
                  <>
                    <Button variant="outline" className="h-10 gap-2" onClick={onConfigImport}>
                      <Upload className="h-4 w-4" />
                      导入配置
                    </Button>
                    <Button variant="outline" className="h-10 gap-2" onClick={onConfigExport}>
                      <Download className="h-4 w-4" />
                      导出配置
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          </Tabs>
        </div>

        {/* Middle Column - Preview */}
        <div
          id="preview"
          className={`${
            showAiColumn ? "lg:col-span-4 xl:col-span-4" : "lg:col-span-6 xl:col-span-6"
          } flex flex-col gap-3 min-h-0 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}
        >
          <Tabs defaultValue="visual" className={`w-full flex flex-col lg:flex-1 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}>
            <Card className={`w-full flex flex-col lg:flex-1 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}>
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                    <Eye className="h-5 w-5 text-indigo-400" />
                    预览
                  </CardTitle>
                  <TabsList className="h-8">
                    <TabsTrigger value="yaml" className="text-xs px-3 h-6">
                      YAML
                    </TabsTrigger>
                    <TabsTrigger value="visual" className="text-xs px-3 h-6">
                      可视化
                    </TabsTrigger>
                  </TabsList>
                </div>
              </CardHeader>
              <CardContent className={`pt-0 relative lg:flex-1 lg:overflow-hidden ${DESKTOP_PANEL_CONTENT_MIN_HEIGHT_CLASS}`}>
                <TabsContent value="yaml" className="mt-0 data-[state=inactive]:hidden lg:absolute lg:inset-0">
                  <div className="h-[clamp(420px,70vh,820px)] lg:h-full rounded-xl bg-white/5 border border-white/10 overflow-auto custom-scrollbar">
                    {generatedYamlError ? (
                      <div className="h-full p-4 text-sm text-rose-200">
                        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300" />
                          <div>
                            <div className="font-medium text-rose-100">基础和 DNS 配置有错误</div>
                            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-rose-100/90">
                              {generatedYamlError}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ) : generatedYaml ? (
                      <YamlHighlight content={generatedYaml} className="h-full" />
                    ) : (
                      <pre className="p-4 font-mono text-xs text-white/60 whitespace-pre">
                        {`# 请先添加订阅或节点
# 配置将在此处预览

# 示例配置结构:
# proxies:
#   - name: "节点名称"
#     type: vmess
#     ...
#
# proxy-groups:
#   - name: "🚀 节点选择"
#     type: select
#     ...
#
# rules:
#   - RULE-SET,xxx,代理组
#   ...`}
                      </pre>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="visual" className="mt-0 data-[state=inactive]:hidden lg:absolute lg:inset-0">
                  <div className="h-[clamp(420px,70vh,820px)] lg:h-full rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <VisualGraph />
                  </div>
                </TabsContent>
              </CardContent>
              <CardFooter className="justify-center gap-2 flex-shrink-0 pt-3 flex-row flex-wrap">
                <Button
                  className="h-10"
                  disabled={!generatedYaml || Boolean(generatedYamlError)}
                  onClick={() => handleDownload(configTab)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  下载配置
                </Button>
                <Button
                  className="h-10"
                  variant="outline"
                  disabled={!generatedYaml || Boolean(generatedYamlError) || !authChecked}
                  onClick={() => subscription.handleGenerateSubscription(configTab)}
                >
                  {user && subscription.isEditingExistingSubscription ? "保存订阅" : "生成订阅链接"}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
                {subscription.isEditingExistingSubscription && (
                  <Button
                    className="h-10 border-rose-500/50 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-400/70"
                    variant="outline"
                    onClick={() => (window.location.href = "/")}
                    title="退出编辑模式"
                  >
                    退出编辑
                  </Button>
                )}
              </CardFooter>
            </Card>
          </Tabs>
        </div>

        {/* Right Column - AI (施工中占位) */}
        {showAiColumn && (
          <div id="ai" className={`lg:col-span-4 xl:col-span-4 flex flex-col gap-3 min-h-0 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}>
            <Card className={`w-full flex-1 flex flex-col overflow-hidden min-h-0 ${DESKTOP_PANEL_MIN_HEIGHT_CLASS}`}>
              <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="text-base lg:text-lg text-white">AI 助手</CardTitle>
              </CardHeader>
              <CardContent className={`flex-1 min-h-0 flex items-center justify-center ${DESKTOP_PANEL_CONTENT_MIN_HEIGHT_CLASS}`}>
                <p className="text-sm text-white/60">AI 助手施工中</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 未保存提醒 */}
      <UnsavedPrompt />

      {saveRequirementSlot}

      {/* 订阅链接对话框 */}
      <SubscriptionLinkDialog
        open={subscription.subscriptionDialog}
        onOpenChange={subscription.setSubscriptionDialog}
        subscriptionUrl={subscription.subscriptionUrl}
        subscriptionName={subscription.subscriptionName}
        setSubscriptionName={subscription.setSubscriptionName}
        autoUpdateEnabled={subscription.autoUpdateEnabled}
        setAutoUpdateEnabled={subscription.setAutoUpdateEnabled}
        autoUpdateHours={subscription.autoUpdateHours}
        setAutoUpdateHours={subscription.setAutoUpdateHours}
        autoUpdatePolicy={subscription.autoUpdatePolicy}
        smartNodeMatchingEnabled={subscription.smartNodeMatchingEnabled}
        setSmartNodeMatchingEnabled={subscription.setSmartNodeMatchingEnabled}
        isCreatingSubscription={subscription.isCreatingSubscription}
        copied={subscription.copied}
        isEditingExistingSubscription={subscription.isEditingExistingSubscription}
        handleCopyUrl={subscription.handleCopyUrl}
        handleCreateSubscription={subscription.handleCreateSubscription}
      />
    </div>
  );
}
