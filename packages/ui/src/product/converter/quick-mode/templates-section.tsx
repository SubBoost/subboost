import * as React from "react";
import Link from "next/link";
import { FileCode, Globe, Heart, Loader2, Upload } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { Card } from "@subboost/ui/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { cn } from "@subboost/ui/lib/utils";
import { useConfigStore, type SubBoostTemplateConfig } from "@subboost/ui/store/config-store";
import type { TemplateType } from "@subboost/core/types/config";
import { useUserStore } from "@subboost/ui/store/user-store";
import { BUILTIN_TEMPLATE_IDS } from "@subboost/core/templates/builtin";
import { toast } from "@subboost/ui/components/ui/toaster";
import { useProductApiAdapter, type QuickTemplateSummary } from "@subboost/ui/product/api-adapter";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import { templates } from "./constants";

type TemplatePickerSource = "catalog" | "my";

export type QuickTemplateUploadEntry = {
  href: string;
  onOpen?: () => void;
};

type Props = {
  templateUpload?: QuickTemplateUploadEntry | null;
};

const MY_TEMPLATES_NAME = "我的模板";

function TemplatePickerEntry({
  icon,
  name,
  description,
  action,
  onOpen,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  action: string;
  onOpen: () => void;
}) {
  return (
    <Card className="p-2.5 transition-all border-2 border-dashed border-ink/15 hover:border-ink/25 bg-ink/5">
      <button
        type="button"
        aria-label={`打开${name}`}
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-4 h-4 rounded-full border-2 border-ink/30 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-fg">{name}</span>
            <p className="text-xs text-fg-40 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="text-right text-xs text-fg-40 flex-shrink-0">
          <div>{action}</div>
        </div>
      </button>
    </Card>
  );
}

export function TemplatesSection({ templateUpload }: Props) {
  const [pickerSource, setPickerSource] = React.useState<TemplatePickerSource | null>(null);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [pickerTemplates, setPickerTemplates] = React.useState<QuickTemplateSummary[]>([]);
  const [pickerLoadFailed, setPickerLoadFailed] = React.useState(false);
  const [pickerSearch, setPickerSearch] = React.useState("");
  const [pickerApplyingId, setPickerApplyingId] = React.useState<string | null>(null);

  const { template: selectedTemplate, setTemplate, applyTemplateConfig, setAppliedTemplateId } = useConfigStore();
  const { user } = useUserStore();
  const templateApi = useProductApiAdapter().templates;
  const interactions = useProductInteractionAdapter();
  const templateLabels = templateApi?.labels;
  const catalogName = templateLabels?.catalogName ?? "模板目录";
  const catalogDescription = templateLabels?.catalogDescription ?? "选择并应用目录中的配置模板";
  const catalogSelectAction = templateLabels?.catalogSelectAction ?? "从目录选择";
  const engagementAction = templateLabels?.engagementAction ?? "收藏";
  const engagementLoginRequired = templateLabels?.engagementLoginRequired ?? "登录后可收藏";
  const loadBuiltinTemplateEngagement = templateApi?.loadBuiltinTemplateEngagement;
  const loadCatalogTemplates = templateApi?.loadCatalogTemplates;
  const loadMyTemplates = templateApi?.loadMyTemplates;
  const catalogEnabled =
    templateApi?.catalogEnabled !== false &&
    Boolean(loadCatalogTemplates && templateApi?.loadTemplateDetail);
  const myTemplatesEnabled = Boolean(user && loadMyTemplates && templateApi?.loadTemplateDetail);
  const builtinEngagementEnabled =
    templateApi?.builtinEngagementEnabled !== false &&
    Boolean(loadBuiltinTemplateEngagement && templateApi?.toggleTemplateEngagement);
  const pickerName = pickerSource === "my" ? MY_TEMPLATES_NAME : catalogName;
  const loadPickerTemplates =
    pickerSource === "my" ? loadMyTemplates : pickerSource === "catalog" ? loadCatalogTemplates : undefined;

  const [builtinEngagement, setBuiltinEngagement] = React.useState<Record<TemplateType, { id: string; engagementCount: number; isEngaged: boolean }>>({
    minimal: { id: BUILTIN_TEMPLATE_IDS.minimal, engagementCount: 0, isEngaged: false },
    standard: { id: BUILTIN_TEMPLATE_IDS.standard, engagementCount: 0, isEngaged: false },
    full: { id: BUILTIN_TEMPLATE_IDS.full, engagementCount: 0, isEngaged: false },
  });

  React.useEffect(() => {
    if (!loadBuiltinTemplateEngagement) return;
    let cancelled = false;
    const run = async () => {
      try {
        const ids = [BUILTIN_TEMPLATE_IDS.minimal, BUILTIN_TEMPLATE_IDS.standard, BUILTIN_TEMPLATE_IDS.full].join(",");
        const stats = await loadBuiltinTemplateEngagement(ids.split(","));
        if (cancelled) return;
        setBuiltinEngagement({
          minimal: stats.minimal ?? { id: BUILTIN_TEMPLATE_IDS.minimal, engagementCount: 0, isEngaged: false },
          standard: stats.standard ?? { id: BUILTIN_TEMPLATE_IDS.standard, engagementCount: 0, isEngaged: false },
          full: stats.full ?? { id: BUILTIN_TEMPLATE_IDS.full, engagementCount: 0, isEngaged: false },
        });
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadBuiltinTemplateEngagement, user?.id]);

  const toggleBuiltinEngagement = async (type: TemplateType) => {
    if (!user || !templateApi?.toggleTemplateEngagement) return;
    const tpl = builtinEngagement[type];
    if (!tpl?.id) return;

    try {
      const data = await templateApi.toggleTemplateEngagement(tpl.id);
      setBuiltinEngagement((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          isEngaged: !!data.isEngaged,
          engagementCount: typeof data.engagementCount === "number" ? data.engagementCount : prev[type].engagementCount,
        },
      }));
      interactions.templateEngagementToggled?.({ source: "builtin", engaged: !!data.isEngaged });
    } catch {
      toast({ title: "操作失败", variant: "destructive" });
    }
  };

  const openPicker = (source: TemplatePickerSource) => {
    setPickerTemplates([]);
    setPickerLoadFailed(false);
    setPickerLoading(true);
    setPickerSearch("");
    setPickerSource(source);
    if (source === "catalog") interactions.templateCatalogOpened?.({ mode: "quick" });
  };

  React.useEffect(() => {
    if (!pickerSource || !loadPickerTemplates) return;

    let cancelled = false;
    const run = async () => {
      setPickerLoading(true);
      setPickerLoadFailed(false);
      try {
        const items = await loadPickerTemplates();
        if (!cancelled) setPickerTemplates(items);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setPickerTemplates([]);
          setPickerLoadFailed(true);
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadPickerTemplates, pickerSource]);

  const filteredPickerTemplates = React.useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return pickerTemplates;
    return pickerTemplates.filter((t) => {
      const name = (t.name || "").toLowerCase();
      const desc = (t.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [pickerTemplates, pickerSearch]);

  React.useEffect(() => {
    const q = pickerSearch.trim();
    if (!pickerSource || !q) return;

    const timer = window.setTimeout(() => {
      interactions.templateSearchCompleted?.({
        source: pickerSource,
        resultCount: filteredPickerTemplates.length,
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [filteredPickerTemplates.length, pickerSource, pickerSearch, interactions]);

  const handleApplyPickerTemplate = async (id: string) => {
    const source = pickerSource;
    if (!source || !templateApi?.loadTemplateDetail) return;
    setPickerApplyingId(id);
    try {
      const tpl = await templateApi.loadTemplateDetail(id);
      if (!tpl) {
        interactions.templateApplied?.({
          source,
          kind: "unknown",
          result: "runtimeError",
        });
        toast({ title: "获取模板失败", variant: "destructive" });
        return;
      }

      if (tpl.kind === "config" && tpl.config && typeof tpl.config === "object") {
        setAppliedTemplateId(id);
        applyTemplateConfig(tpl.config as SubBoostTemplateConfig);
        setPickerSource(null);
        setPickerSearch("");
        interactions.templateApplied?.({
          source,
          kind: "config",
          result: "success",
        });
        toast({ title: `已应用模板：${tpl.name || "未命名模板"}`, variant: "success" });
        return;
      }

      interactions.templateApplied?.({
        source,
        kind: tpl.kind === "yaml" ? "yaml" : "unknown",
        result: "validationError",
      });
      toast({
        title: "YAML 模板无法一键应用到配置器。请使用“配置模板”重新发布。",
        variant: "warning",
      });
    } catch (e) {
      console.error(e);
      interactions.templateApplied?.({
        source,
        kind: "unknown",
        result: "runtimeError",
      });
      toast({ title: "应用模板失败，请稍后重试", variant: "destructive" });
    } finally {
      setPickerApplyingId(null);
    }
  };

  const renderPickerBody = () => {
    if (pickerLoading) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      );
    }

    if (pickerLoadFailed) {
      return <div className="text-center py-10 text-sm text-fg-50">加载模板失败，请稍后重试</div>;
    }

    if (pickerSource === "my" && pickerTemplates.length === 0) {
      return (
        <div className="text-center py-10 text-sm text-fg-50">
          <p>暂无模板，可将当前配置上传为模板</p>
          {templateUpload && (
            <Button asChild variant="outline" size="sm" className="mt-3 gap-2" onClick={templateUpload.onOpen}>
              <Link href={templateUpload.href}>
                <Upload className="h-4 w-4" />
                上传模板
              </Link>
            </Button>
          )}
        </div>
      );
    }

    if (filteredPickerTemplates.length === 0) {
      return <div className="text-center py-10 text-sm text-fg-50">暂无可用模板</div>;
    }

    return (
      <div className="max-h-[420px] overflow-auto custom-scrollbar space-y-2 pr-1">
        {filteredPickerTemplates.map((t) => (
          <div
            key={t.id}
            className="p-3 rounded-lg bg-ink/5 border border-ink/10 flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg truncate">{t.name}</div>
              <div className="text-xs text-fg-50 mt-1 line-clamp-2">{t.description || ""}</div>
            </div>
            <Button
              size="sm"
              onClick={() => void handleApplyPickerTemplate(t.id)}
              disabled={pickerApplyingId === t.id}
              className="flex-shrink-0"
            >
              {pickerApplyingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "使用"}
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Template Selection */}
      <div className="space-y-1.5">
        <p className="text-xs text-fg-50">选择模板</p>
        <div className="grid gap-1.5">
          {templates.map((template) => (
            <Card
              key={template.id}
              className={cn(
                "p-2.5 transition-all border-2",
                selectedTemplate === template.id ? "border-indigo-500 bg-indigo-500/10" : "border-transparent hover:border-ink/20"
              )}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-pressed={selectedTemplate === template.id}
                  aria-label={`选择 ${template.name} 模板`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  onClick={() => {
                    setTemplate(template.id);
                    interactions.templateSelected?.({
                      source: "builtin",
                      templateType: template.id,
                    });
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      selectedTemplate === template.id ? "border-indigo-500" : "border-ink/30"
                    )}
                  >
                    {selectedTemplate === template.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">{template.name}</span>
                    </div>
                    <p className="text-xs text-fg-40 mt-0.5">{template.description}</p>
                  </div>
                  </div>
                  <div className="space-y-0.5 text-right text-xs text-fg-40">
                    <div>{template.groups} 代理组</div>
                    <div>{template.rules} 规则集</div>
                  </div>
                </button>
                {builtinEngagementEnabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggleBuiltinEngagement(template.id)}
                    disabled={!user}
                    className={cn(
                      "h-auto gap-0.5 p-0 text-xs transition-colors hover:bg-transparent",
                      builtinEngagement[template.id]?.isEngaged ? "text-red-400" : "text-fg-40 hover:text-red-400",
                      !user && "cursor-not-allowed opacity-50"
                    )}
                    title={user ? engagementAction : engagementLoginRequired}
                  >
                    <Heart className={cn("h-3 w-3", builtinEngagement[template.id]?.isEngaged && "fill-current")} />
                    <span>{builtinEngagement[template.id]?.engagementCount ?? 0}</span>
                  </Button>
                )}
              </div>
            </Card>
          ))}

          {catalogEnabled && (
            <TemplatePickerEntry
              icon={<Globe className="h-3 w-3 text-indigo-400" />}
              name={catalogName}
              description={catalogDescription}
              action={catalogSelectAction}
              onOpen={() => openPicker("catalog")}
            />
          )}

          {myTemplatesEnabled && (
            <TemplatePickerEntry
              icon={<FileCode className="h-3 w-3 text-indigo-400" />}
              name={MY_TEMPLATES_NAME}
              description="选择并应用您上传的配置模板"
              action="从我的模板选择"
              onOpen={() => openPicker("my")}
            />
          )}
        </div>
      </div>

      <Dialog
        open={pickerSource !== null}
        onOpenChange={(open) => {
          if (!open) setPickerSource(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{pickerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="搜索模板..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="text-sm"
            />

            {renderPickerBody()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
