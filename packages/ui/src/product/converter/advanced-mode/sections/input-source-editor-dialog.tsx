"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { ProviderSettingsFields } from "@subboost/ui/product/converter/provider-settings-fields";
import { sourceTypeInfo } from "../constants";

type InputSourceEditorDialogProps = {
  source: SubscriptionSource | null;
  previewName: string;
  onClose: () => void;
  onUpdateContent: (id: string, content: string) => void;
  onUpdateMeta: (id: string, patch: Partial<SubscriptionSource>) => void;
};

export function InputSourceEditorDialog({
  source,
  previewName,
  onClose,
  onUpdateContent,
  onUpdateMeta,
}: InputSourceEditorDialogProps) {
  const [providerSettingsOpen, setProviderSettingsOpen] = React.useState(false);
  return (
    <Dialog
      open={Boolean(source)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {source ? `高级编辑：${sourceTypeInfo[source.type].label}` : "高级编辑"}
          </DialogTitle>
        </DialogHeader>

        {source && (
          <div className="space-y-3">
            {source.type === "url" && (
              <div className="space-y-1">
                <div className="text-xs text-white/60">{sourceTypeInfo[source.type].label}</div>
                <div className="flex items-center gap-3">
                  <Input
                    value={source.content}
                    onChange={(e) => onUpdateContent(source.id, e.target.value)}
                    placeholder={sourceTypeInfo[source.type].placeholder}
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
                      checked={Boolean(source.useProxyProviders)}
                      onCheckedChange={(checked) =>
                        onUpdateMeta(source.id, {
                          useProxyProviders: Boolean(checked),
                          // UI 新开启时默认分组模式；旧数据（已保存无此字段）保持 inline 兼容
                          ...(checked && !source.providerMode ? { providerMode: "grouped" as const } : {}),
                        })
                      }
                    />
                  </div>
                </div>

                {/* provider 设置：可折叠分组，开启 proxy-providers 模式后可用 */}
                <div>
                  <button
                    type="button"
                    onClick={() => setProviderSettingsOpen((open) => !open)}
                    disabled={!source.useProxyProviders}
                    className="flex items-center gap-2 py-1 px-2 rounded-lg text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    {providerSettingsOpen && source.useProxyProviders ? (
                      <ChevronDown className="h-3.5 w-3.5 text-white/50" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-white/50" />
                    )}
                    <span className="text-xs font-medium">provider 设置</span>
                    {!source.useProxyProviders && (
                      <span className="text-[10px] text-white/40">开启 proxy-providers 模式后可用</span>
                    )}
                  </button>
                  {providerSettingsOpen && source.useProxyProviders && (
                    <div className="mt-1 pl-6">
                      <ProviderSettingsFields
                        source={source}
                        defaultProviderKey={`url_${source.id}`}
                        onUpdateMeta={onUpdateMeta}
                        showFilter
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="text-xs text-white/60">标签（tag）</div>
                <Input
                  value={source.tag ?? ""}
                  onChange={(e) => onUpdateMeta(source.id, { tag: e.target.value })}
                  placeholder="例如：A / 订阅1 / 自建1"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">节点命名模板</div>
                  <Input
                    value={source.nameTemplate ?? DEFAULT_NODE_NAME_TEMPLATE}
                    onChange={(e) => onUpdateMeta(source.id, { nameTemplate: e.target.value })}
                    className="text-xs font-mono"
                  />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">预览</div>
                <Input value={previewName} readOnly className="text-xs font-mono" />
              </div>
            </div>

            <div className="text-[11px] text-white/40">
              可用占位符：{"{tag}"}、{"{name}"}；留空则默认：{DEFAULT_NODE_NAME_TEMPLATE}
            </div>

            {source.type === "url" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs text-white/60">流量/到期信息 URL（可选）</div>
                    <Input
                      value={source.userinfoUrl ?? ""}
                      onChange={(e) => onUpdateMeta(source.id, { userinfoUrl: e.target.value })}
                      placeholder="留空则默认使用当前订阅源 URL"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-white/60">流量信息 User-Agent（可选）</div>
                    <Input
                      value={source.userinfoUserAgent ?? ""}
                      onChange={(e) => onUpdateMeta(source.id, { userinfoUserAgent: e.target.value })}
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
              <div className="space-y-1">
                <div className="text-xs text-white/60">{sourceTypeInfo[source.type].label}</div>
                <Textarea
                  value={source.content}
                  onChange={(e) => onUpdateContent(source.id, e.target.value)}
                  placeholder={sourceTypeInfo[source.type].placeholder}
                  className="min-h-[60vh] text-xs font-mono"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
