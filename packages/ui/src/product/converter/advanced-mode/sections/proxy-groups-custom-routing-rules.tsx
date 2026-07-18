"use client";

import * as React from "react";
import { ProxyGroupsCustomRules } from "./proxy-groups-custom-rules";
import { ProxyGroupsRulesLibrary } from "./proxy-groups-rules-library";

export function ProxyGroupsCustomRoutingRules() {
  return (
    <div className="space-y-1">
      <div className="flex min-h-7 items-center gap-2">
        <p className="text-xs text-white/50">自定义分流规则</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="p-2">
          <ProxyGroupsRulesLibrary />
        </div>
        <div className="border-t border-white/10" />
        <div className="p-2">
          <ProxyGroupsCustomRules />
        </div>
      </div>
    </div>
  );
}
