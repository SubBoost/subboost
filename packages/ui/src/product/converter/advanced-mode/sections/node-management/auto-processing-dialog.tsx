"use client";

import * as React from "react";
import {
  NodeNameFilterConfigError,
  parseNodeNameFilterConfig,
  resolveNodeNameFilter,
  type NodeNameFilterConfig,
  type NodeNameFilterValidationError,
} from "@subboost/core/subscription/node-name-filter";
import { getNodeOriginName } from "@subboost/core/subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";
import { Button } from "@subboost/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Textarea } from "@subboost/ui/components/ui/textarea";

type NodeManagementAutoProcessingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: ParsedNode[];
  config: NodeNameFilterConfig;
  hasProxyProviders: boolean;
  onSave: (config: NodeNameFilterConfig) => void;
};

function formatValidationError(error: NodeNameFilterValidationError): string {
  if (error.line && error.code === "invalid_regex") {
    return `第 ${error.line} 行正则无效`;
  }
  if (error.line && error.code === "unsafe_regex") {
    return `第 ${error.line} 行正则过于复杂`;
  }
  return error.line ? `第 ${error.line} 行${error.message}` : error.message;
}

export function NodeManagementAutoProcessingDialog({
  open,
  onOpenChange,
  nodes,
  config,
  hasProxyProviders,
  onSave,
}: NodeManagementAutoProcessingDialogProps) {
  const configText = config.excludeRegexes.join("\n");
  const includeText = (config.includeRegexes ?? []).join("\n");
  const [enabled, setEnabled] = React.useState(config.enabled);
  const [includeEnabled, setIncludeEnabled] = React.useState(config.includeEnabled !== false);
  const [excludeEnabled, setExcludeEnabled] = React.useState(config.excludeEnabled !== false);
  const [includeRegexText, setIncludeRegexText] = React.useState(includeText);
  const [excludeRegexText, setExcludeRegexText] = React.useState(configText);

  React.useEffect(() => {
    if (!open) return;
    setEnabled(config.enabled);
    setIncludeEnabled(config.includeEnabled !== false);
    setExcludeEnabled(config.excludeEnabled !== false);
    setIncludeRegexText(includeText);
    setExcludeRegexText(configText);
  }, [config.enabled, config.includeEnabled, config.excludeEnabled, configText, includeText, open]);

  const plan = React.useMemo(() => {
    try {
      const parsedConfig = parseNodeNameFilterConfig({
        enabled,
        includeEnabled,
        excludeEnabled,
        includeRegexes: includeRegexText.split("\n"),
        excludeRegexes: excludeRegexText.split("\n"),
      });
      return {
        config: parsedConfig,
        result: resolveNodeNameFilter(nodes, parsedConfig),
        errors: [] as NodeNameFilterValidationError[],
      };
    } catch (error) {
      return {
        config: null,
        result: null,
        errors:
          error instanceof NodeNameFilterConfigError
            ? error.errors
            : [{ code: "invalid_config" as const, message: "配置格式无效" }],
      };
    }
  }, [enabled, includeEnabled, excludeEnabled, excludeRegexText, includeRegexText, nodes]);

  const validationMessage =
    plan.errors.length > 0 ? plan.errors.map((error) => `${error.field === "includeRegexes" ? "保留正则：" : "排除正则："}${formatValidationError(error)}`).join("；") : undefined;
  const blocksEmptyResult = Boolean(
    plan.config?.enabled &&
      plan.result &&
      plan.result.rawCount > 0 &&
      plan.result.effectiveCount === 0 &&
      !hasProxyProviders
  );
  const canSave = Boolean(plan.config && plan.result && !blocksEmptyResult);

  const handleSave = () => {
    if (!plan.config || !canSave) return;
    onSave(plan.config);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%_-_2rem)] max-w-xl gap-4 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>自动处理</DialogTitle>
          <DialogDescription className="sr-only">
            设置按导入名称自动保留或排除节点的规则
          </DialogDescription>
        </DialogHeader>

        <SwitchField
          label="启用"
          checked={enabled}
          onCheckedChange={setEnabled}
        />

        <FormField
          label="保留正则"
          labelAction={<span className="mr-px pr-4"><Switch aria-label="启用保留正则" checked={includeEnabled} onCheckedChange={setIncludeEnabled} /></span>}
          description="每行一条，匹配任意一条即可保留。"
          descriptionPlacement="before-control"
        >
          <Textarea
            value={includeRegexText}
            onChange={(event) => setIncludeRegexText(event.target.value)}
            placeholder="日本|新加坡"
            rows={3}
            className="min-h-20 resize-y break-words [overflow-wrap:anywhere]"
          />
        </FormField>

        <FormField
          label="排除正则"
          labelAction={<span className="mr-px pr-4"><Switch aria-label="启用排除正则" checked={excludeEnabled} onCheckedChange={setExcludeEnabled} /></span>}
          description="每行一条，命中节点会被全局排除。"
          descriptionPlacement="before-control"
          error={validationMessage}
        >
          <Textarea
            value={excludeRegexText}
            onChange={(event) => setExcludeRegexText(event.target.value)}
            placeholder="剩余流量|套餐到期|注意事项"
            rows={3}
            className="min-h-20 resize-y break-words [overflow-wrap:anywhere]"
          />
        </FormField>

        <div
          className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          aria-live="polite"
        >
          <p className="text-xs leading-relaxed text-white/60">
            导入 {plan.result?.rawCount ?? nodes.length} · 排除{" "}
            {plan.result?.excludedCount ?? "—"} · 保留{" "}
            {plan.result?.effectiveCount ?? "—"}
          </p>

          {hasProxyProviders ? (
            <p className="text-xs leading-relaxed text-white/40">
              proxy-providers 不参与。
            </p>
          ) : null}

          {blocksEmptyResult ? (
            <p className="text-xs leading-relaxed text-red-400" role="alert">
              过滤后没有可用节点，请调整规则或关闭过滤。
            </p>
          ) : null}

          {plan.result ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-white/60">排除的节点</p>
              {plan.result.excludedNodes.length > 0 ? (
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                  {plan.result.excludedNodes.map((node, index) => {
                    const originName = getNodeOriginName(node);
                    return (
                      <div
                        key={`${node.name}:${index}`}
                        className="rounded-lg border border-red-500/15 bg-red-500/[0.06] px-2.5 py-2"
                      >
                        <p className="break-words text-xs leading-relaxed text-white/75 [overflow-wrap:anywhere]">
                          {node.name}
                        </p>
                        {originName !== node.name ? (
                          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-white/40 [overflow-wrap:anywhere]">
                            原名：{originName}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-white/40">没有排除的节点</p>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
