"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, Upload } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { toast } from "@subboost/ui/components/ui/toaster";
import {
  parseCustomRuleBatchImport,
  type CustomRuleBatchImportPreviewItem,
  type ParseCustomRuleBatchImportOptions,
} from "@subboost/core/rules/custom-rule-batch-import";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import type { CustomRule, CustomRuleSet } from "@subboost/core/types/config";

function getStatusClass(item: CustomRuleBatchImportPreviewItem): string {
  if (item.status === "ready") {
    return "border-emerald-500/20 bg-emerald-500/10";
  }
  if (item.status === "duplicate") {
    return "border-amber-500/20 bg-amber-500/10";
  }
  return "border-red-500/20 bg-red-500/10";
}

function getStatusTextClass(item: CustomRuleBatchImportPreviewItem): string {
  if (item.status === "ready") return "text-emerald-200";
  if (item.status === "duplicate") return "text-amber-200";
  return "text-red-200";
}

function ruleTargetToText(target: CustomRule["target"]): string {
  if (typeof target === "string") return target;
  return `${target.kind}:${target.id}`;
}

export function ProxyGroupsCustomRulesBatchDialog({
  open,
  onOpenChange,
  defaultType,
  defaultTarget,
  defaultNoResolve,
  targetOptions,
  ruleSetTargetOptions,
  existingRules,
  existingRuleSets,
  reservedRuleSetIds,
  onImport,
  onImportRuleSets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: ParseCustomRuleBatchImportOptions["defaultType"];
  defaultTarget: string;
  defaultNoResolve: boolean;
  targetOptions: string[];
  ruleSetTargetOptions?: string[];
  existingRules: CustomRule[];
  existingRuleSets?: CustomRuleSet[];
  reservedRuleSetIds?: string[];
  onImport: (rules: CustomRule[]) => void;
  onImportRuleSets?: (rules: CustomRuleSet[]) => void;
}) {
  const [rawText, setRawText] = React.useState("");
  const interactions = useProductInteractionAdapter();

  const importPlan = React.useMemo(
    () =>
      parseCustomRuleBatchImport({
        text: rawText,
        defaultType,
        defaultTarget,
        defaultNoResolve,
        targetOptions,
        ruleSetTargetOptions,
        existingRules,
        existingRuleSets,
        reservedRuleSetIds,
      }),
    [
      defaultNoResolve,
      defaultTarget,
      defaultType,
      existingRules,
      existingRuleSets,
      reservedRuleSetIds,
      rawText,
      targetOptions,
      ruleSetTargetOptions,
    ],
  );

  const hasInput = rawText.trim().length > 0;
  const visibleItems = React.useMemo(
    () =>
      hasInput
        ? importPlan.items.filter((item) => item.status !== "skipped")
        : [],
    [hasInput, importPlan.items],
  );

  const close = React.useCallback(() => {
    setRawText("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        close();
        return;
      }
      onOpenChange(true);
    },
    [close, onOpenChange],
  );

  const handleImport = () => {
    if (!importPlan.canImport) {
      interactions.customRuleBatchImported?.({
        result: "validationError",
        ruleCount: importPlan.readyCount,
      });
      toast({
        title: "无法导入",
        description: "请先修正无效或重复的规则行。",
        variant: "warning",
      });
      return;
    }

    if (importPlan.rules.length > 0) onImport(importPlan.rules);
    if (importPlan.ruleSets.length > 0) onImportRuleSets?.(importPlan.ruleSets);
    interactions.customRuleBatchImported?.({
      result: "success",
      ruleCount: importPlan.readyCount,
    });
    toast({
      title: `已导入 ${importPlan.readyCount} 条规则`,
      variant: "success",
    });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-300" />
            批量导入规则
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/60">规则行</div>
              <div className="text-[10px] text-white/40">
                可导入 {hasInput ? importPlan.readyCount : 0}
                {hasInput && importPlan.errorCount > 0
                  ? ` · 错误 ${importPlan.errorCount}`
                  : ""}
                {hasInput && importPlan.duplicateCount > 0
                  ? ` · 重复 ${importPlan.duplicateCount}`
                  : ""}
                {hasInput && importPlan.skippedCount > 0
                  ? ` · 跳过 ${importPlan.skippedCount}`
                  : ""}
              </div>
            </div>
            <Textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={defaultType === "RULE-SET" ? "https://example.com/geosite/udemy.mrs" : [
                "DOMAIN-SUFFIX,example.com,🚀 节点选择",
                "IP-CIDR,1.1.1.0/24,DIRECT,no-resolve",
                "GEOSITE,google",
                "github.com",
              ].join("\n")}
              className="min-h-[180px] resize-y font-mono text-xs"
            />
            <div className="text-[10px] leading-4 text-white/40">
              每行一条；缺少目标时使用当前目标，纯值行使用当前类型、目标和 no-resolve 设置。
            </div>
          </div>

          {hasInput && (importPlan.errorCount > 0 || importPlan.duplicateCount > 0) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span>存在无效或重复规则，当前不会导入任何内容。</span>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/60">预览</div>
              <div className="text-[10px] text-white/40">
                {hasInput ? `${visibleItems.length} 行` : "等待输入"}
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-[10px] text-white/40">
                {hasInput ? "暂无可预览的规则行" : "粘贴规则后会在这里预览。"}
              </div>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                {visibleItems.map((item) => (
                  <div
                    key={`${item.lineNumber}:${item.raw}`}
                    className={`rounded-md border px-2 py-1.5 text-[11px] ${getStatusClass(item)}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-white/40">第 {item.lineNumber} 行</span>
                      <span className={getStatusTextClass(item)}>{item.message}</span>
                    </div>
                    {item.rule ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1">
                        <span className="rounded border border-indigo-400/20 bg-indigo-500/10 px-1.5 py-0.5 font-medium text-indigo-200">
                          {item.rule.type}
                        </span>
                        <span
                          className="min-w-0 max-w-[14rem] truncate text-white/75"
                          title={item.rule.value}
                        >
                          {item.rule.value}
                        </span>
                        {item.rule.noResolve && (
                          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/45">
                            no-resolve
                          </span>
                        )}
                        <ArrowRight className="h-3 w-3 shrink-0 text-white/35" />
                        <span
                          className="max-w-[11rem] truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70"
                          title={ruleTargetToText(item.rule.target)}
                        >
                          {ruleTargetToText(item.rule.target)}
                        </span>
                      </div>
                    ) : (
                      <div className="truncate font-mono text-white/45" title={item.raw}>
                        {item.raw}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={close} className="h-8">
              取消
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importPlan.canImport}
              className="h-8"
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              导入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
