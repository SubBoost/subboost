"use client";

import { HelpCircle, Menu, Plus } from "lucide-react";
import type { ParsedNode } from "@subboost/core/types/node";
import { Button } from "@subboost/ui/components/ui/button";
import { ChoiceChip, ChoiceGroup } from "@subboost/ui/components/ui/choice-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@subboost/ui/components/ui/popover";
import { cn } from "@subboost/ui/lib/utils";
import { getSubscriptionUserInfoDisplay } from "@subboost/ui/product/subscription/subscription-userinfo-display";
import type { SourceType, SubscriptionSource } from "@subboost/ui/store/config-store";
import { sourceTypeInfo } from "./source-type-info";

const sourceTypes = Object.keys(sourceTypeInfo) as SourceType[];

export function SourceTypeChoices({
  value,
  onChange,
  compact = false,
}: {
  value: SourceType;
  onChange: (type: SourceType) => void;
  compact?: boolean;
}) {
  return (
    <ChoiceGroup label="导入源类型" className={compact ? "gap-0.5" : "gap-1"}>
      {sourceTypes.map((type) => {
        const info = sourceTypeInfo[type];
        const Icon = info.icon;
        return (
          <ChoiceChip
            key={type}
            selected={value === type}
            onClick={() => onChange(type)}
            title={info.label}
            label={
              <>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{info.label}</span>
              </>
            }
            className="min-h-0 rounded p-1"
          />
        );
      })}
    </ChoiceGroup>
  );
}

export function SourceStatusPopover({
  source,
  nodes,
}: {
  source: SubscriptionSource;
  nodes: ParsedNode[];
}) {
  if (!source.parsed || source.nodeCount === undefined) return null;

  const userInfo = getSubscriptionUserInfoDisplay(source.subscriptionUserInfo, nodes);
  const hasUserInfo = Boolean(userInfo && (userInfo.traffic || userInfo.expire));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto gap-1 whitespace-nowrap rounded-full border border-green-500/50 bg-green-500/5 px-2 py-0.5 text-xs font-semibold text-green-300 hover:bg-green-500/10"
          title="查看流量/到期"
          aria-label="查看流量/到期"
        >
          ✓ {source.nodeCount} 节点
          <Menu className="h-3 w-3 text-green-300/70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[260px] bg-black/90 p-3">
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-green-300" aria-hidden="true" />
            <p className="font-medium text-white">订阅信息</p>
          </div>
          {hasUserInfo && userInfo ? (
            <div className="space-y-1 text-white/60">
              {userInfo.traffic ? <p>已用流量：{userInfo.traffic}</p> : null}
              {userInfo.expire ? <p>到期时间：{userInfo.expire}</p> : null}
            </div>
          ) : (
            <p className="leading-relaxed text-white/60">暂无已用流量/到期时间信息</p>
          )}
        </div>
        <PopoverArrow className="fill-black/90" />
      </PopoverContent>
    </Popover>
  );
}

export function AddSourceMenu({
  open,
  onOpenChange,
  onAdd,
  compact = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: SourceType) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-full border-dashed border-white/20 text-xs text-white/50 hover:border-white/30 hover:text-white/70",
            compact ? "h-7" : "h-8"
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          添加订阅/节点源
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] border-white/10 bg-[#1a1a1a] text-white">
        {sourceTypes.map((type) => {
          const info = sourceTypeInfo[type];
          const Icon = info.icon;
          return (
            <DropdownMenuItem
              key={type}
              onSelect={() => onAdd(type)}
              className={cn("gap-3 focus:bg-white/5 focus:text-white", compact ? "py-2" : "py-2.5")}
            >
              <Icon className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              <span>
                <span className="block text-xs font-medium text-white">{info.label}</span>
                {!compact ? <span className="block text-[10px] text-white/40">{info.description}</span> : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
