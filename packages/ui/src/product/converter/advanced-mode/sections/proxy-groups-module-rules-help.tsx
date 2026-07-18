"use client";

import { AlertCircle, HelpCircle } from "lucide-react";
import { HelpPopover } from "@subboost/ui/components/ui/popover";

export function ExperimentalCnRuleHelpButton() {
  return (
    <HelpPopover
      label="国内服务实验性选项说明"
      side="bottom"
      align="end"
      contentClassName="w-[420px] bg-black/90 p-3"
    >
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-amber-300" />
              <div className="text-white font-medium">实验性：启用后置geosite/cn.mrs规则</div>
            </div>
            <div className="text-white/60 leading-relaxed">
              开启后，会额外启用 <span className="font-mono">cn</span>（
              <span className="font-mono">geosite/cn.mrs</span>）规则，该规则会被放到{" "}
              <span className="font-mono">🌍 非中国</span> 之后。
            </div>
            <div className="text-white/60 leading-relaxed">
              预期结果：不会发生DNS泄露的同时正确分流绝大多数国内站点；但也可能导致意料之外的分流错误。
            </div>
          </div>
    </HelpPopover>
  );
}

export function CnIpNoResolveHelpButton() {
  return (
    <HelpPopover
      label="国内服务 no-resolve 说明"
      side="bottom"
      align="end"
      contentClassName="w-[360px] bg-black/90 p-3"
      className="text-amber-300/70"
    >
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-300" />
              <div className="text-white font-medium">国内服务 cn-ip no-resolve</div>
            </div>
            <div className="text-white/60 leading-relaxed space-y-1">
              <div>
                开启后将使用 <span className="font-mono">RULE-SET,cn-ip,🔒 国内服务,no-resolve</span>
              </div>
              <div>开启：不会发生DNS泄露，但部分国内站点无法正确分流</div>
              <div>关闭：大多数国内站点可以正确分流，但会发生DNS泄露</div>
            </div>
            <div className="pt-2 border-t border-white/10 text-[10px] text-white/40">
              该开关仅影响“国内服务”的 GeoIP（cn-ip）规则，不影响其它代理组。
            </div>
          </div>
    </HelpPopover>
  );
}
