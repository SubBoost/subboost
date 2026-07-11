"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileCode, Loader2, Plus, Search, Upload } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@subboost/ui/components/ui/tabs";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { toast } from "@subboost/ui/components/ui/toaster";
import { useUserStore } from "@subboost/ui/store/user-store";
import { useConfigStore, type SubBoostTemplateConfig } from "@subboost/ui/store/config-store";
import { builtinIdToType } from "@subboost/core/templates/builtin";
import { formatDateInBeijing } from "@subboost/core/time/beijing";
import {
  ProductInteractionAdapterProvider,
  type ProductInteractionAdapter,
  type ProductTemplateSource,
} from "@subboost/ui/product/interactions";
import type { TabValue, Template } from "@subboost/ui/templates/types";
import { TemplateCard } from "@subboost/ui/templates/template-card";
import { TemplateUploadDialog } from "@subboost/ui/templates/template-upload-dialog";

type TemplateDetail = {
  kind?: string;
  config?: unknown;
};

type UploadTemplatePayload = {
  name: string;
  description: string;
  config: SubBoostTemplateConfig;
  isPublic: boolean;
  isOfficial?: boolean;
};

export type TemplateLibraryAdapter = {
  interactions?: ProductInteractionAdapter;
  labels?: {
    catalogTab?: string;
    engagementAction?: string;
    engagementLoginRequired?: string;
  };
  enabledTabs?: Partial<Record<TabValue, boolean>>;
  allowUpload?: boolean;
  allowEngagement?: boolean;
  allowDelete?: boolean;
  allowPublicTemplates?: boolean;
  uploadSearchParam?: boolean;
  loadTemplates: (tab: TabValue) => Promise<Template[]>;
  loadTemplateDetail: (id: string) => Promise<TemplateDetail | null>;
  deleteTemplate?: (id: string) => Promise<void>;
  toggleTemplateEngagement?: (id: string) => Promise<{ engagementCount: number; isEngaged: boolean }>;
  uploadTemplate?: (payload: UploadTemplatePayload) => Promise<void>;
};

type Props = {
  adapter: TemplateLibraryAdapter;
};

function getInteractionTemplateSource(tab: TabValue): ProductTemplateSource {
  if (tab === "default") return "default";
  if (tab === "catalog") return "catalog";
  return "my";
}

function isTabEnabled(adapter: TemplateLibraryAdapter, tab: TabValue, hasUser: boolean): boolean {
  const enabledTabs = adapter.enabledTabs ?? { default: true, catalog: true, my: true };
  if (enabledTabs[tab] === false) return false;
  if (tab === "my" && !hasUser) return false;
  return true;
}

function TemplateLibraryInner({ adapter }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, fetchUser } = useUserStore();
  const {
    template,
    enabledProxyGroups,
    hiddenProxyGroups,
    customProxyGroups,
    customRuleSets,
    builtinRuleEdits,
    customRules,
    ruleOrder,
    dialerProxyGroups,
    proxyGroupNameOverrides,
    dnsYaml,
    mixedPort,
    allowLan,
    testUrl,
    testInterval,
    urlTestLazy,
    urlTestTolerance,
    ruleProviderBaseUrl,
    cnIpNoResolve,
    experimentalCnUseCnRuleSet,
    setTemplate,
    applyTemplateConfig,
    setAppliedTemplateId,
  } = useConfigStore();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabValue>("default");
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);

  const [uploadDialog, setUploadDialog] = React.useState(false);
  const [uploadName, setUploadName] = React.useState("");
  const [uploadDescription, setUploadDescription] = React.useState("");
  const [uploadIsPublic, setUploadIsPublic] = React.useState(false);
  const [uploadAsDefault, setUploadAsDefault] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadMode, setUploadMode] = React.useState<"config" | "yaml">("config");
  const [uploadYamlContent, setUploadYamlContent] = React.useState("");
  const interactions = adapter.interactions;

  React.useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const canUpload = Boolean(user && adapter.allowUpload !== false && adapter.uploadTemplate);
  const allowPublicTemplates = adapter.allowPublicTemplates !== false;

  const openUploadDialog = React.useCallback((entry?: "templatesPage") => {
    if (!canUpload) return;
    if (entry) interactions?.templateUploadOpened?.({ entry });
    setUploadDialog(true);
    setUploadName("");
    setUploadDescription("");
    setUploadIsPublic(false);
    setUploadAsDefault(false);
    setUploadMode("config");
    setUploadYamlContent("");
  }, [canUpload, interactions]);

  React.useEffect(() => {
    if (adapter.uploadSearchParam === false) return;
    const shouldOpen = searchParams.get("upload") === "1";
    if (!shouldOpen || !canUpload) return;
    setActiveTab("my");
    openUploadDialog();
    router.replace("/templates");
  }, [adapter.uploadSearchParam, canUpload, openUploadDialog, router, searchParams]);

  const loadTemplates = React.useCallback(async (tab: TabValue) => {
    setIsLoading(true);
    try {
      setTemplates(await adapter.loadTemplates(tab));
    } catch (error) {
      console.error("Load templates error:", error);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);

  React.useEffect(() => {
    if (!isTabEnabled(adapter, activeTab, Boolean(user))) {
      setActiveTab("default");
      return;
    }
    void loadTemplates(activeTab);
  }, [activeTab, adapter, user, loadTemplates]);

  const handleApplyTemplate = async (templateId: string) => {
    const builtinType = builtinIdToType(templateId);
    if (builtinType) {
      setTemplate(builtinType);
      interactions?.templateSelected?.({
        source: "builtin",
        templateType: builtinType,
      });
      router.push("/");
      return;
    }

    setApplyingId(templateId);
    try {
      const tpl = await adapter.loadTemplateDetail(templateId);
      if (!tpl) {
        interactions?.templateApplied?.({
          source: getInteractionTemplateSource(activeTab),
          kind: "unknown",
          result: "runtimeError",
        });
        toast({ title: "获取模板失败", variant: "destructive" });
        return;
      }

      if (tpl.kind === "config" && tpl.config && typeof tpl.config === "object") {
        setAppliedTemplateId(templateId);
        applyTemplateConfig(tpl.config as SubBoostTemplateConfig);
        interactions?.templateApplied?.({
          source: getInteractionTemplateSource(activeTab),
          kind: "config",
          result: "success",
        });
        router.push("/");
        return;
      }

      interactions?.templateApplied?.({
        source: getInteractionTemplateSource(activeTab),
        kind: tpl.kind === "yaml" ? "yaml" : "unknown",
        result: "validationError",
      });
      toast({
        title: "YAML 模板无法一键应用到配置器。请让作者使用“配置模板（推荐）”重新发布。",
        variant: "warning",
      });
    } catch (error) {
      console.error("Apply template error:", error);
      interactions?.templateApplied?.({
        source: getInteractionTemplateSource(activeTab),
        kind: "unknown",
        result: "runtimeError",
      });
      toast({ title: "应用模板失败，请稍后重试", variant: "destructive" });
    } finally {
      setApplyingId(null);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!user || !adapter.deleteTemplate) return;
    const ok = await confirmDialog({
      title: "确定要删除该模板吗？此操作不可撤销。",
      confirmText: "删除",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await adapter.deleteTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "删除失败", variant: "destructive" });
    }
  };

  const allTags = Array.from(new Set(templates.flatMap((t) => t.tags)));
  const filteredTemplates = templates.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = !selectedTag || item.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  React.useEffect(() => {
    if (!searchQuery.trim() && !selectedTag) return;
    const timer = window.setTimeout(() => {
      interactions?.templateSearchCompleted?.({
        source: getInteractionTemplateSource(activeTab),
        resultCount: filteredTemplates.length,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeTab, filteredTemplates.length, interactions, searchQuery, selectedTag]);

  const formatDate = (iso: string) => formatDateInBeijing(iso, {}, "-");
  const formatNumber = (num: number) => (num >= 1000 ? `${(num / 1000).toFixed(1)}k` : num.toString());

  const handleEngagement = async (templateId: string) => {
    if (!user || !adapter.toggleTemplateEngagement || adapter.allowEngagement === false) return;
    try {
      const data = await adapter.toggleTemplateEngagement(templateId);
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, engagementCount: data.engagementCount, isEngaged: data.isEngaged }
            : t
        )
      );
      interactions?.templateEngagementToggled?.({
        source: getInteractionTemplateSource(activeTab),
        engaged: Boolean(data.isEngaged),
      });
    } catch (error) {
      console.error("Template engagement error:", error);
    }
  };

  const handleUpload = async () => {
    if (!adapter.uploadTemplate || !uploadName.trim()) return;
    if (uploadMode === "yaml") {
      toast({ title: "YAML 模板上传开发中", variant: "info" });
      return;
    }

    setIsUploading(true);
    try {
      await adapter.uploadTemplate({
        name: uploadName,
        description: uploadDescription,
        config: {
          schema: "subboost-template-config/v1",
          template,
          enabledProxyGroups,
          hiddenProxyGroups,
          customProxyGroups,
          customRuleSets,
          builtinRuleEdits,
          customRules,
          ruleOrder,
          dialerProxyGroups,
          proxyGroupNameOverrides,
          dnsYaml,
          mixedPort,
          allowLan,
          testUrl,
          testInterval,
          ...(urlTestLazy !== undefined ? { urlTestLazy } : {}),
          ...(urlTestTolerance !== undefined ? { urlTestTolerance } : {}),
          ruleProviderBaseUrl,
          cnIpNoResolve,
          experimentalCnUseCnRuleSet,
        } satisfies SubBoostTemplateConfig,
        isPublic: allowPublicTemplates ? (uploadAsDefault ? true : uploadIsPublic) : false,
        ...(uploadAsDefault ? { isOfficial: true } : {}),
      });

      toast({ title: "模板上传成功！", variant: "success" });
      setUploadDialog(false);
      if (uploadAsDefault) {
        setActiveTab("default");
        await loadTemplates("default");
      } else {
        await loadTemplates(activeTab);
      }
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "上传失败", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const tabValues = (["default", "catalog", "my"] as const).filter((tab) => isTabEnabled(adapter, tab, Boolean(user)));
  const catalogTabLabel = adapter.labels?.catalogTab ?? "模板目录";
  const tabLabel = (tab: TabValue) =>
    tab === "default" ? "默认模板" : tab === "catalog" ? catalogTabLabel : "我的模板";
  const enabledTabLabelText = tabValues.map(tabLabel).join(" / ");

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">模板库</h1>
          <p className="text-white/50">{enabledTabLabelText}</p>
        </div>
        {canUpload && (
          <Button className="gap-2" onClick={() => openUploadDialog("templatesPage")}>
            <Upload className="h-4 w-4" />
            上传模板
          </Button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            placeholder="搜索模板..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
          <Button variant={selectedTag === null ? "default" : "outline"} size="sm" onClick={() => setSelectedTag(null)}>
            全部
          </Button>
          {allTags.map((tag) => (
            <Button key={tag} variant={selectedTag === tag ? "default" : "outline"} size="sm" onClick={() => setSelectedTag(tag)}>
              {tag}
            </Button>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className="space-y-6">
        <TabsList>
          {tabValues.includes("default") && <TabsTrigger value="default">默认模板</TabsTrigger>}
          {tabValues.includes("catalog") && <TabsTrigger value="catalog">{catalogTabLabel}</TabsTrigger>}
          {tabValues.includes("my") && <TabsTrigger value="my">我的模板</TabsTrigger>}
        </TabsList>

        {tabValues.map((tab) => (
          <TabsContent key={tab} value={tab}>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <EmptyTemplates tab={tab} canUpload={canUpload} onUpload={() => openUploadDialog("templatesPage")} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((item) => (
                  <TemplateCard
                    key={item.id}
                    template={item}
                    formatNumber={formatNumber}
                    formatDate={formatDate}
                    engagementActionLabel={adapter.labels?.engagementAction}
                    engagementLoginRequiredLabel={adapter.labels?.engagementLoginRequired}
                    onEngage={() => void handleEngagement(item.id)}
                    onApply={() => void handleApplyTemplate(item.id)}
                    onDelete={() => void handleDeleteTemplate(item.id)}
                    isLoggedIn={!!user}
                    isApplying={applyingId === item.id}
                    showDelete={tab === "my" && adapter.allowDelete !== false && Boolean(adapter.deleteTemplate)}
                    showVisibility={tab === "my" && allowPublicTemplates}
                    showEngagement={adapter.allowEngagement !== false}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {canUpload && (
        <TemplateUploadDialog
          open={uploadDialog}
          onOpenChange={setUploadDialog}
          userIsAdmin={Boolean(user?.isAdmin)}
          name={uploadName}
          onNameChange={setUploadName}
          description={uploadDescription}
          onDescriptionChange={setUploadDescription}
          isPublic={uploadIsPublic}
          onPublicChange={setUploadIsPublic}
          asDefault={uploadAsDefault}
          onDefaultChange={setUploadAsDefault}
          isUploading={isUploading}
          mode={uploadMode}
          onModeChange={setUploadMode}
          yamlContent={uploadYamlContent}
          onYamlContentChange={setUploadYamlContent}
          onUpload={handleUpload}
          showVisibilityControls={allowPublicTemplates}
        />
      )}
    </div>
  );
}

function EmptyTemplates({
  tab,
  canUpload,
  onUpload,
}: {
  tab: TabValue;
  canUpload: boolean;
  onUpload: () => void;
}) {
  if (tab === "my" && canUpload) {
    return (
      <div className="text-center py-12">
        <Plus className="h-12 w-12 mx-auto text-white/40 mb-4" />
        <h3 className="text-lg font-medium mb-2">暂无模板</h3>
        <p className="text-white/50 mb-4">创建您的第一个配置模板</p>
        <Button onClick={onUpload}>
          <Plus className="mr-2 h-4 w-4" />
          创建模板
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <FileCode className="h-12 w-12 mx-auto text-white/40 mb-4" />
      <h3 className="text-lg font-medium mb-2">{tab === "catalog" ? "没有找到模板" : "暂无模板"}</h3>
      <p className="text-white/50">尝试调整搜索条件</p>
    </div>
  );
}

export function TemplateLibrarySurface({ adapter }: Props) {
  return (
    <ProductInteractionAdapterProvider adapter={adapter.interactions}>
      <React.Suspense fallback={null}>
        <TemplateLibraryInner adapter={adapter} />
      </React.Suspense>
    </ProductInteractionAdapterProvider>
  );
}
