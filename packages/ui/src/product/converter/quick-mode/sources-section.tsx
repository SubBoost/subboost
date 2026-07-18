import { X, AlertCircle, Check, Loader2, Maximize2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { Input } from "@subboost/ui/components/ui/input";
import { Badge } from "@subboost/ui/components/ui/badge";
import { cn } from "@subboost/ui/lib/utils";
import { SubscriptionImportErrorBadge } from "@subboost/ui/product/converter/subscription-import-error";
import { buildSourceDisplayLabel } from "@subboost/ui/product/converter/source-display-label";
import { AddSourceMenu, SourceStatusPopover, SourceTypeChoices } from "@subboost/ui/product/converter/source-controls";
import { SourceEditorDialog } from "@subboost/ui/product/converter/source-editor-dialog";
import { useSubscriptionSourcesController } from "@subboost/ui/product/converter/use-subscription-sources-controller";
import { sourceTypeInfo } from "./constants";

export function SourcesSection() {
  const {
    addSource,
    closeExpandedSourceEditor,
    error,
    expandedSource,
    expandedSourcePreviewName,
    handleImportSource,
    moveSource,
    nodeCount,
    nodesBySourceId,
    removeSource,
    setExpandedSourceId,
    setShowAddMenu,
    showAddMenu,
    sources,
    updateSource,
    updateSourceMeta,
    updateSourceType,
  } = useSubscriptionSourcesController({ mode: "quick" });

  return (
    <>
      {/* Sources List */}
      <div className="flex flex-col gap-2">
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
            <div key={source.id} className="flex flex-col gap-1.5 flex-shrink-0">
              {/* Source Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SourceTypeChoices value={source.type} onChange={(type) => updateSourceType(source.id, type)} />
                  <span className="text-xs text-white/50">
                    {sourceDisplayLabel}
                  </span>
                  <SourceStatusPopover source={source} nodes={sourceNodes} />
                  {(source.errorInfo || source.error) && (
                    <SubscriptionImportErrorBadge errorInfo={source.errorInfo} errorMessage={source.error} />
                  )}
                </div>
                <div className="flex items-center gap-1">
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
                    className="h-6 w-6 rounded p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
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

              {/* Source Input */}
              {source.type === "url" ? (
                <Input
                  value={source.content}
                  onChange={(e) => updateSource(source.id, e.target.value)}
                  placeholder={typeInfo.placeholder}
                  className="text-xs h-9"
                />
              ) : (
                <Textarea
                  value={source.content}
                  onChange={(e) => updateSource(source.id, e.target.value)}
                  placeholder={typeInfo.placeholder}
                  className={cn(
                    "text-xs resize-none",
                    sources.length === 1 ? "flex-1 min-h-[100px]" : "min-h-[140px] md:min-h-[180px] xl:min-h-[80px]"
                  )}
                />
              )}
            </div>
          );
        })}

        <div className="flex-shrink-0">
          <AddSourceMenu open={showAddMenu} onOpenChange={setShowAddMenu} onAdd={addSource} />
        </div>

        {/* Status */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 flex-shrink-0">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
        {nodeCount > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="success">{nodeCount} 个节点已解析</Badge>
          </div>
        )}
      </div>

      <SourceEditorDialog
        source={expandedSource}
        previewName={expandedSourcePreviewName}
        onClose={closeExpandedSourceEditor}
        onUpdateContent={updateSource}
        onUpdateMeta={updateSourceMeta}
      />
    </>
  );
}
