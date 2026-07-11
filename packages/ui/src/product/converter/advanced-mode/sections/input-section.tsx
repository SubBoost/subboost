"use client";

import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, Check, HelpCircle, Loader2, Maximize2, Plus, Server, X, Menu, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Input } from "@subboost/ui/components/ui/input";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { cn } from "@subboost/ui/lib/utils";
import type { SourceType } from "@subboost/ui/store/config-store";
import { getSubscriptionUserInfoDisplay } from "@subboost/ui/product/subscription/subscription-userinfo-display";
import { buildSourceDisplayLabel } from "@subboost/ui/product/converter/source-display-label";
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
            const userInfoDisplay = getSubscriptionUserInfoDisplay(source.subscriptionUserInfo, sourceNodes);
            const hasUserInfoDisplay = Boolean(userInfoDisplay && (userInfoDisplay.traffic || userInfoDisplay.expire));
            return (
              <div key={source.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {(Object.keys(sourceTypeInfo) as SourceType[]).map((type) => {
                        const info = sourceTypeInfo[type];
                        const Icon = info.icon;
                        return (
                          <button
                            key={type}
                            onClick={() => updateSourceType(source.id, type)}
                            className={cn(
                              "p-1 rounded transition-colors",
                              source.type === type
                                ? "bg-indigo-500/20 text-indigo-400"
                                : "text-white/30 hover:text-white/50 hover:bg-white/5"
                            )}
                            title={info.label}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-white/50">
                      {sourceDisplayLabel}
                    </span>
                    {source.parsed && source.nodeCount !== undefined && (
                      <Popover.Root>
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full border border-green-500/50 bg-green-500/5 px-2 py-0.5 text-xs font-semibold text-green-300 transition-colors hover:bg-green-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black whitespace-nowrap"
                            title="查看流量/到期"
                            aria-label="查看流量/到期"
                          >
                            ✓ {source.nodeCount} 节点
                            <Menu className="h-3 w-3 text-green-300/70" aria-hidden="true" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            side="bottom"
                            align="start"
                            sideOffset={8}
                            className="z-50 w-[260px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
                          >
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-green-300" />
                                <div className="text-white font-medium">订阅信息</div>
                              </div>
                              {hasUserInfoDisplay && userInfoDisplay ? (
                                <div className="space-y-1 text-white/60">
                                  {userInfoDisplay.traffic ? <div>已用流量：{userInfoDisplay.traffic}</div> : null}
                                  {userInfoDisplay.expire ? <div>到期时间：{userInfoDisplay.expire}</div> : null}
                                </div>
                              ) : (
                                <div className="text-white/60 leading-relaxed">暂无已用流量/到期时间信息</div>
                              )}
                            </div>
                            <Popover.Arrow className="fill-white/10" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    )}
                    {(source.errorInfo || source.error) && (
                      <SubscriptionImportErrorBadge errorInfo={source.errorInfo} errorMessage={source.error} />
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveSource(source.id, "up")}
                        disabled={index <= 0}
                        className="flex h-3.5 w-4 items-center justify-center text-white/30 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30"
                        title="上移"
                        aria-label="上移"
                      >
                        <ChevronUp className="h-2.5 w-2.5" />
                      </button>
                      <button
                        onClick={() => moveSource(source.id, "down")}
                        disabled={index >= sources.length - 1}
                        className="flex h-3.5 w-4 items-center justify-center text-white/30 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30"
                        title="下移"
                        aria-label="下移"
                      >
                        <ChevronDown className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setExpandedSourceId(source.id)}
                      className="p-1 rounded transition-colors text-white/30 hover:text-white/50 hover:bg-white/5"
                      title="高级编辑"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    {/* 导入按钮 */}
                    <button
                      onClick={() => void handleImportSource(source.id)}
                      disabled={!source.content.trim() || source.parsing}
                      className={cn(
                        "p-1 rounded transition-colors disabled:opacity-100",
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
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {/* 删除按钮 */}
                    {sources.length > 1 && (
                      <button
                        onClick={() => removeSource(source.id)}
                        className="p-1 text-white/50 hover:text-red-400 transition-colors"
                        title="删除"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
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
          {/* Add Source Button with Menu */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs border-dashed border-white/20 text-white/50 hover:text-white/70 hover:border-white/30"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              添加订阅/节点源
            </Button>

            {showAddMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden">
                {(Object.keys(sourceTypeInfo) as SourceType[]).map((type) => {
                  const info = sourceTypeInfo[type];
                  const Icon = info.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => addSource(type)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-indigo-400" />
                      <div>
                        <div className="text-xs font-medium text-white">{info.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
