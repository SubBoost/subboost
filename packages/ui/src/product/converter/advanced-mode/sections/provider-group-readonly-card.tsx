"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";

/**
 * provider 分组模式生成的机场组：核心组分类里的只读卡片。
 * 成员恒为该 provider 的全部节点，不提供高级模式/成员编辑/删除。
 */
export function ProviderGroupReadonlyCard({ name }: { name: string }) {
  return (
    <div className="overflow-hidden rounded border border-sky-500/20 bg-sky-500/[0.06]">
      <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1.5">
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="min-w-0 break-words text-sm font-medium text-white">{name}</span>
          <Badge
            variant="outline"
            className="shrink-0 border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-200"
          >
            Provider
          </Badge>
        </div>
        <span
          className="flex shrink-0 items-center gap-1 text-[10px] text-white/40"
          title="机场组由 proxy-providers 分组模式自动生成，成员为该订阅的全部节点，不可编辑"
        >
          <Lock className="h-3 w-3" />
          只读
        </span>
      </div>
    </div>
  );
}
