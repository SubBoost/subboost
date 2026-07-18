"use client";

import { HelpCircle } from "lucide-react";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import { Button } from "@subboost/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { HelpPopover } from "@subboost/ui/components/ui/popover";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { sourceTypeInfo } from "./source-type-info";

export type SourceEditorDialogProps = {
  source: SubscriptionSource | null;
  previewName: string;
  onClose: () => void;
  onUpdateContent: (id: string, content: string) => void;
  onUpdateMeta: (id: string, patch: Partial<SubscriptionSource>) => void;
};

export function SourceEditorDialog({
  source,
  previewName,
  onClose,
  onUpdateContent,
  onUpdateMeta,
}: SourceEditorDialogProps) {
  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{source ? `高级编辑：${sourceTypeInfo[source.type].label}` : "高级编辑"}</DialogTitle>
        </DialogHeader>

        {source ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="标签（tag）">
                <Input
                  value={source.tag ?? ""}
                  onChange={(event) => onUpdateMeta(source.id, { tag: event.target.value })}
                  placeholder="例如：A / 订阅1 / 自建1"
                  className="text-xs"
                />
              </FormField>
              <FormField label="节点命名模板">
                <Input
                  value={source.nameTemplate ?? DEFAULT_NODE_NAME_TEMPLATE}
                  onChange={(event) => onUpdateMeta(source.id, { nameTemplate: event.target.value })}
                  className="text-xs font-mono"
                />
              </FormField>
              <FormField label="预览">
                <Input value={previewName} readOnly className="text-xs font-mono" />
              </FormField>
            </div>

            <p className="text-[11px] text-white/40">
              可用占位符：{"{tag}"}、{"{name}"}；留空则默认：{DEFAULT_NODE_NAME_TEMPLATE}
            </p>

            <div className="space-y-1">
              <p className="text-xs text-white/60">{sourceTypeInfo[source.type].label}</p>
              {source.type === "url" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Input
                      value={source.content}
                      onChange={(event) => onUpdateContent(source.id, event.target.value)}
                      placeholder={sourceTypeInfo[source.type].placeholder}
                      className="min-w-0 flex-1 text-xs"
                    />
                    <div className="flex h-10 flex-none items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                      <span className="whitespace-nowrap text-xs text-white/70">proxy-providers模式</span>
                      <HelpPopover
                        label="proxy-providers 模式说明"
                        side="bottom"
                        align="end"
                        contentClassName="w-[360px] bg-black/90 p-3"
                      >
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <HelpCircle className="h-4 w-4 text-amber-300" aria-hidden="true" />
                            <p className="font-medium text-white">proxy-providers 模式</p>
                          </div>
                          <p className="leading-relaxed text-white/60">
                            部分订阅限制 CN IP 导入，url 无法在 SubBoost 内拉取解析。开启后 SubBoost
                            不再拉取/解析该 url，而是在最终配置中写入{" "}
                            <span className="font-mono">proxy-providers</span>，交由客户端自行拉取节点。
                          </p>
                          <div className="space-y-1 border-t border-white/10 pt-2 text-white/60">
                            <p className="font-medium text-white/80">注意开启后：</p>
                            <ul className="ml-4 list-disc space-y-1">
                              <li>无法在预览中查看/管理该 url 的节点</li>
                              <li>无法将这些节点用于中转代理组、分流组高级模式等高级功能</li>
                              <li>节点命名模板与 tag 在该模式下不生效</li>
                            </ul>
                          </div>
                          <p className="border-t border-white/10 pt-2 text-[10px] text-white/40">
                            若导入 url 报“未解析到有效节点/获取失败”等，可尝试开启此模式。
                          </p>
                        </div>
                      </HelpPopover>
                      <Switch
                        checked={Boolean(source.useProxyProviders)}
                        onCheckedChange={(checked) => onUpdateMeta(source.id, { useProxyProviders: checked })}
                        aria-label="使用 proxy-providers 模式"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="流量/到期信息 URL（可选）">
                      <Input
                        value={source.userinfoUrl ?? ""}
                        onChange={(event) => onUpdateMeta(source.id, { userinfoUrl: event.target.value })}
                        placeholder="留空则默认使用当前订阅源 URL"
                        className="text-xs"
                      />
                    </FormField>
                    <FormField label="流量信息 User-Agent（可选）">
                      <Input
                        value={source.userinfoUserAgent ?? ""}
                        onChange={(event) => onUpdateMeta(source.id, { userinfoUserAgent: event.target.value })}
                        placeholder="例如 clash.meta/v1.19.16"
                        className="text-xs"
                      />
                    </FormField>
                  </div>
                  <p className="text-[11px] text-white/40">
                    有些订阅源不会直接返回 <span className="font-mono">subscription-userinfo</span>，但会提供独立的流量接口。
                    设置后，SubBoost 会在导入/刷新时额外抓取该接口，用来更新这个源自己的流量与到期快照。
                  </p>
                </div>
              ) : (
                <Textarea
                  value={source.content}
                  onChange={(event) => onUpdateContent(source.id, event.target.value)}
                  placeholder={sourceTypeInfo[source.type].placeholder}
                  className="min-h-[60vh] text-xs font-mono"
                />
              )}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>完成</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
