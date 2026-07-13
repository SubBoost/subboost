"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { HelpCircle } from "lucide-react";
import { Switch } from "@subboost/ui/components/ui/switch";
import { cn } from "@subboost/ui/lib/utils";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { ProviderSettingsFields } from "./provider-settings-fields";

/**
 * proxy-providers 模式状态栏：url 订阅源编辑框底部内嵌的一条状态栏。
 * 左右水平布局——左块为「proxy-providers模式 + 说明 + 开关」，
 * 开启后右侧显示接入方式/key/组名等设置（空间不足时自动换行）。
 */
export function ProviderModeStatusBar({
  source,
  defaultProviderKey,
  onCheckedChange,
  onUpdateMeta,
  className,
}: {
  source: SubscriptionSource;
  defaultProviderKey: string;
  onCheckedChange: (checked: boolean) => void;
  onUpdateMeta: (id: string, patch: Partial<SubscriptionSource>) => void;
  className?: string;
}) {
  const checked = Boolean(source.useProxyProviders);

  return (
    <div
      className={cn(
        // 固定 h-9(36px)：内部控件垂直居中，保证 provider 开/关两态状态栏同高（关闭时最高子元素 20px、
        // 开启时接入方式按钮组约 25px，若靠内容撑高会差 6px）；相比最初 h-7 上下间距各 +4px，不挤压控件
        "flex h-9 flex-none flex-nowrap items-center gap-x-3 overflow-x-auto border-t border-white/10 bg-white/5 px-3",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div className="flex flex-none items-center gap-2">
        <span className="text-xs text-white/60 whitespace-nowrap">proxy-providers模式</span>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              aria-label="proxy-providers 模式说明"
              title="proxy-providers 模式说明"
            >
              <HelpCircle className="h-3 w-3" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
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
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(Boolean(value))}
        />
      </div>

      {checked && (
        <ProviderSettingsFields
          source={source}
          defaultProviderKey={defaultProviderKey}
          onUpdateMeta={onUpdateMeta}
          className="flex-1 flex-nowrap"
        />
      )}
    </div>
  );
}
