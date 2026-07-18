"use client";

import { AlertCircle, Check, Loader2, Maximize2, Server, X, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input } from "@subboost/ui/components/ui/input";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { cn } from "@subboost/ui/lib/utils";
import { buildSourceDisplayLabel } from "@subboost/ui/product/converter/source-display-label";
import { AddSourceMenu, SourceStatusPopover, SourceTypeChoices } from "@subboost/ui/product/converter/source-controls";
import { useSubscriptionSourcesController } from "@subboost/ui/product/converter/use-subscription-sources-controller";
import { sourceTypeInfo } from "../constants";
import { SectionHeader } from "../section-header";
import { SubscriptionImportErrorBadge } from "@subboost/ui/product/converter/subscription-import-error";
import { InputSourceEditorDialog } from "./input-source-editor-dialog";

export function InputSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    addSource,
    closeExpandedSourceEditor,
    error: globalError,
    expandedSource,
    expandedSourcePreviewName,
    handleImportSource,
    moveSource,
    nodesBySourceId,
    removeSource,
    setExpandedSourceId,
    setShowAddMenu,
    showAddMenu,
    sources,
    updateSource,
    updateSourceMeta,
    updateSourceType,
  } = useSubscriptionSourcesController({ mode: "advanced" });
  const sourceCount = sources.length;

  return (
    <div>
      <SectionHeader
        icon={Server}
        title="节点导入"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          sourceCount > 0 && (
            <Badge variant="outline" className="ml-auto border-blue-500/50 bg-blue-500/10 text-blue-300">
              {sourceCount} 个导入源
            </Badge>
          )
        }
      />

      {isExpanded && (
        <div className="mt-2 space-y-2 pl-6">
          {sources.map((source, index) => {
            const typeInfo = sourceTypeInfo[source.type];
            const sourceDisplayLabel = buildSourceDisplayLabel({
              typeLabel: typeInfo.label,
              tag: source.tag,
              order: index + 1,
              total: sources.length,
            });
            const sourceNodes = nodesBySourceId.get(source.id) ?? [];
            return (
              <div key={source.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SourceTypeChoices
                      value={source.type}
                      onChange={(type) => updateSourceType(source.id, type)}
                      compact
                    />
                    <span className="text-xs text-white/50">
                      {sourceDisplayLabel}
                    </span>
                    <SourceStatusPopover source={source} nodes={sourceNodes} />
                    {(source.errorInfo || source.error) && (
                      <SubscriptionImportErrorBadge errorInfo={source.errorInfo} errorMessage={source.error} />
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <div className="flex flex-col">
                      <IconButton
                        label="上移"
                        variant="ghost"
                        onClick={() => moveSource(source.id, "up")}
                        disabled={index <= 0}
                        className="flex h-3.5 w-4 items-center justify-center text-white/30 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronUp className="h-2.5 w-2.5" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label="下移"
                        variant="ghost"
                        onClick={() => moveSource(source.id, "down")}
                        disabled={index >= sources.length - 1}
                        className="flex h-3.5 w-4 items-center justify-center text-white/30 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
                      </IconButton>
                    </div>
                    <IconButton
                      label="高级编辑"
                      variant="ghost"
                      onClick={() => setExpandedSourceId(source.id)}
                      className="h-6 w-6 rounded p-1 text-white/30 hover:bg-white/5 hover:text-white/50"
                    >
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={source.parsing ? "导入中" : source.parsed ? "重新导入" : "导入此源"}
                      variant="ghost"
                      onClick={() => void handleImportSource(source.id)}
                      disabled={!source.content.trim() || source.parsing}
                      className={cn(
                        "h-6 w-6 rounded p-1 transition-colors disabled:opacity-100",
                        source.parsing
                          ? "text-indigo-400"
                          : source.parsed
                            ? "text-green-400 hover:text-green-300"
                            : source.content.trim()
                              ? "text-white/50 hover:text-indigo-400 hover:bg-indigo-500/10"
                              : "text-white/50 cursor-not-allowed"
                      )}
                      title={source.parsing ? "导入中..." : source.parsed ? "重新导入" : "导入此源"}
                    >
                      {source.parsing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </IconButton>
                    {sources.length > 1 && (
                      <IconButton
                        label="删除导入源"
                        variant="ghost"
                        onClick={() => removeSource(source.id)}
                        className="h-6 w-6 rounded p-1 text-white/50 transition-colors hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </IconButton>
                    )}
                  </div>
                </div>
                {source.type === "url" ? (
                  <Input
                    value={source.content}
                    onChange={(e) => updateSource(source.id, e.target.value)}
                    placeholder={typeInfo.placeholder}
                    className="text-xs h-8"
                  />
                ) : (
                  <Textarea
                    value={source.content}
                    onChange={(e) => updateSource(source.id, e.target.value)}
                    placeholder={typeInfo.placeholder}
                    className="text-xs resize-none min-h-[60px]"
                  />
                )}
              </div>
            );
          })}
          {globalError && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="break-all">{globalError}</span>
            </div>
          )}
          <AddSourceMenu open={showAddMenu} onOpenChange={setShowAddMenu} onAdd={addSource} compact />
        </div>
      )}

      <InputSourceEditorDialog
        source={expandedSource}
        previewName={expandedSourcePreviewName}
        onClose={closeExpandedSourceEditor}
        onUpdateContent={updateSource}
        onUpdateMeta={updateSourceMeta}
      />
    </div>
  );
}
