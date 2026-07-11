import * as Popover from "@radix-ui/react-popover";
import { Plus, X, AlertCircle, Check, Loader2, Maximize2, HelpCircle, Menu, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { Input } from "@subboost/ui/components/ui/input";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { Switch } from "@subboost/ui/components/ui/switch";
import { cn } from "@subboost/ui/lib/utils";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import type { SourceType } from "@subboost/ui/store/config-store";
import { SubscriptionImportErrorBadge } from "@subboost/ui/product/converter/subscription-import-error";
import { getSubscriptionUserInfoDisplay } from "@subboost/ui/product/subscription/subscription-userinfo-display";
import { buildSourceDisplayLabel } from "@subboost/ui/product/converter/source-display-label";
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
          const userInfoDisplay = getSubscriptionUserInfoDisplay(source.subscriptionUserInfo, sourceNodes);
          const hasUserInfoDisplay = Boolean(userInfoDisplay && (userInfoDisplay.traffic || userInfoDisplay.expire));

          return (
            <div key={source.id} className="flex flex-col gap-1.5 flex-shrink-0">
              {/* Source Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
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
                <div className="flex items-center gap-1">
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
                    className="p-1 rounded transition-colors text-white/30 hover:text-white/60 hover:bg-white/5"
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

        {/* Add Source Button */}
        <div className="relative flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border-dashed border-white/20 text-white/50 hover:text-white/70 hover:border-white/30"
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
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
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <Icon className="h-4 w-4 text-indigo-400" />
                    <div>
                      <div className="text-xs font-medium text-white">{info.label}</div>
                      <div className="text-[10px] text-white/40">{info.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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

      <Dialog
        open={Boolean(expandedSource)}
        onOpenChange={(open) => {
          if (!open) closeExpandedSourceEditor();
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{expandedSource ? `高级编辑：${sourceTypeInfo[expandedSource.type].label}` : "高级编辑"}</DialogTitle>
          </DialogHeader>

          {expandedSource && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs text-white/60">标签（tag）</div>
                  <Input
                    value={expandedSource.tag ?? ""}
                    onChange={(e) => updateSourceMeta(expandedSource.id, { tag: e.target.value })}
                    placeholder="例如：A / 订阅1 / 自建1"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-white/60">节点命名模板</div>
                  <Input
                    value={expandedSource.nameTemplate ?? DEFAULT_NODE_NAME_TEMPLATE}
                    onChange={(e) => updateSourceMeta(expandedSource.id, { nameTemplate: e.target.value })}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-white/60">预览</div>
                  <Input value={expandedSourcePreviewName} readOnly className="text-xs font-mono" />
                </div>
              </div>

              <div className="text-[11px] text-white/40">
                可用占位符：{"{tag}"}、{"{name}"}；留空则默认：{DEFAULT_NODE_NAME_TEMPLATE}
              </div>

              <div className="space-y-1">
                <div className="text-xs text-white/60">{sourceTypeInfo[expandedSource.type].label}</div>
                {expandedSource.type === "url" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Input
                        value={expandedSource.content}
                        onChange={(e) => updateSource(expandedSource.id, e.target.value)}
                        placeholder={sourceTypeInfo[expandedSource.type].placeholder}
                        className="text-xs min-w-0 flex-1"
                      />

                      <div className="flex h-10 flex-none items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                        <div className="text-xs text-white/70 whitespace-nowrap">proxy-providers模式</div>
                        <Popover.Root>
                          <Popover.Trigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                              aria-label="proxy-providers 模式说明"
                              title="proxy-providers 模式说明"
                            >
                              <HelpCircle className="h-3.5 w-3.5" />
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              side="bottom"
                              align="end"
                              sideOffset={8}
                              className="z-50 w-[360px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl p-3"
                            >
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <HelpCircle className="h-4 w-4 text-amber-300" />
                                  <div className="text-white font-medium">proxy-providers 模式</div>
                                </div>
                                <div className="text-white/60 leading-relaxed">
                                  部分订阅限制 CN IP 导入，url 无法在 SubBoost 内拉取解析。开启后 SubBoost
                                  不再拉取/解析该 url，而是在最终配置中写入{" "}
                                  <span className="font-mono">proxy-providers</span>，交由客户端自行拉取节点。
                                </div>
                                <div className="pt-2 border-t border-white/10 text-white/60 space-y-1">
                                  <div className="font-medium text-white/80">注意开启后：</div>
                                  <ul className="ml-4 list-disc space-y-1">
                                    <li>无法在预览中查看/管理该 url 的节点</li>
                                    <li>无法将这些节点用于中转代理组、分流组高级模式等高级功能</li>
                                    <li>节点命名模板与 tag 在该模式下不生效</li>
                                  </ul>
                                </div>
                                <div className="pt-2 border-t border-white/10 text-[10px] text-white/40">
                                  若导入 url 报“未解析到有效节点/获取失败”等，可尝试开启此模式。
                                </div>
                              </div>
                              <Popover.Arrow className="fill-white/10" />
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                        <Switch
                          checked={Boolean(expandedSource.useProxyProviders)}
                          onCheckedChange={(checked) =>
                            updateSourceMeta(expandedSource.id, { useProxyProviders: Boolean(checked) })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">流量/到期信息 URL（可选）</div>
                        <Input
                          value={expandedSource.userinfoUrl ?? ""}
                          onChange={(e) => updateSourceMeta(expandedSource.id, { userinfoUrl: e.target.value })}
                          placeholder="留空则默认使用当前订阅源 URL"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">流量信息 User-Agent（可选）</div>
                        <Input
                          value={expandedSource.userinfoUserAgent ?? ""}
                          onChange={(e) =>
                            updateSourceMeta(expandedSource.id, { userinfoUserAgent: e.target.value })
                          }
                          placeholder="例如 clash.meta/v1.19.16"
                          className="text-xs"
                        />
                      </div>
                    </div>

                    <div className="text-[11px] text-white/40">
                      有些订阅源不会直接返回 <span className="font-mono">subscription-userinfo</span>，但会提供独立的流量接口。
                      设置后，SubBoost 会在导入/刷新时额外抓取该接口，用来更新这个源自己的流量与到期快照。
                    </div>
                  </div>
                ) : (
                  <Textarea
                    value={expandedSource.content}
                    onChange={(e) => updateSource(expandedSource.id, e.target.value)}
                    placeholder={sourceTypeInfo[expandedSource.type].placeholder}
                    className="min-h-[60vh] text-xs font-mono"
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeExpandedSourceEditor}>
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
