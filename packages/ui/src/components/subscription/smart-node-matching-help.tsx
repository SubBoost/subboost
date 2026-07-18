"use client";

import { HelpCircle } from "lucide-react";
import { HelpPopover } from "@subboost/ui/components/ui/popover";

type Props = {
  enabled: boolean;
};

const ENABLED_DESCRIPTION =
  "开启后，刷新订阅时会结合节点名称和参数识别同一节点，尽量保留你的节点顺序、手动改名和相关配置。";
const DISABLED_DESCRIPTION =
  "关闭后，刷新订阅时只按原始节点名判断是否为同一节点。适合遇到新增节点没有出现或节点名称异常保留的情况。";
const SUMMARY_DESCRIPTION = "智能匹配可减少订阅换地址后配置丢失；关闭后更严格按节点名更新，快速找出新节点。";

export function SmartNodeMatchingHelp({ enabled }: Props) {
  return (
    <HelpPopover
      label="更新时智能匹配节点说明"
      side="bottom"
      align="start"
      contentClassName="w-[340px] max-w-[calc(100vw-2rem)] bg-black/90 p-3"
    >
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <p className="font-medium text-white">更新时智能匹配节点</p>
        </div>
        <p className="leading-relaxed text-white/60">
          {enabled ? ENABLED_DESCRIPTION : DISABLED_DESCRIPTION}
        </p>
        <p className="leading-relaxed text-white/50">{SUMMARY_DESCRIPTION}</p>
      </div>
    </HelpPopover>
  );
}
