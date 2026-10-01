"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { cn } from "@subboost/ui/lib/utils";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  LOAD_BALANCE_STRATEGIES,
  type LoadBalanceStrategy,
} from "@subboost/core/types/config";

export type ProxyGroupTypeMenuValue =
  | "select"
  | "url-test"
  | "fallback"
  | "load-balance"
  | "direct-first"
  | "reject-first";

type ProxyGroupTypeMenuChange = {
  groupType: ProxyGroupTypeMenuValue;
  strategy?: LoadBalanceStrategy;
};

type ProxyGroupTypeMenuProps = {
  value?: ProxyGroupTypeMenuValue;
  strategy?: LoadBalanceStrategy;
  onChange: (next: ProxyGroupTypeMenuChange) => void;
  triggerClassName?: string;
  contentClassName?: string;
  contentAlign?: "start" | "center" | "end";
  showStrategyLabel?: boolean;
  trigger?: React.ReactElement;
};

const NORMAL_TYPE_OPTIONS: Array<{ value: Exclude<ProxyGroupTypeMenuValue, "load-balance">; label: string }> = [
  { value: "select", label: "手动选择" },
  { value: "url-test", label: "自动测速" },
  { value: "fallback", label: "故障切换" },
  { value: "direct-first", label: "直连优先" },
  { value: "reject-first", label: "拦截优先" },
];

const menuContentClassName =
  "min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border-ink/10 bg-surface-raised text-fg shadow-md";
const menuItemClassName = "gap-2 text-xs text-fg-80 focus:bg-ink/10 focus:text-fg";

export function getProxyGroupTypeLabel(groupType?: string) {
  switch (groupType) {
    case "url-test":
      return "自动测速";
    case "fallback":
      return "故障切换";
    case "load-balance":
      return "负载均衡";
    case "direct-first":
      return "直连优先";
    case "reject-first":
      return "拦截优先";
    case "select":
    default:
      return "手动选择";
  }
}

export function getLoadBalanceStrategyLabel(strategy: LoadBalanceStrategy) {
  switch (strategy) {
    case "round-robin":
      return "轮询均摊";
    case "sticky-sessions":
      return "会话保持";
    case "consistent-hashing":
    default:
      return "稳定分配";
  }
}

export function ProxyGroupTypeMenu({
  value = "select",
  strategy,
  onChange,
  triggerClassName,
  contentClassName,
  contentAlign = "start",
  showStrategyLabel = false,
  trigger,
}: ProxyGroupTypeMenuProps) {
  const selectedStrategy = strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY;
  const triggerLabel =
    showStrategyLabel && value === "load-balance"
      ? `${getProxyGroupTypeLabel(value)} / ${getLoadBalanceStrategyLabel(selectedStrategy)}`
      : getProxyGroupTypeLabel(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 w-full justify-between rounded-xl border-ink/10 bg-ink/10 px-3 text-xs font-normal text-fg hover:bg-ink/10",
              triggerClassName
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-fg-50" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn(menuContentClassName, contentClassName)} align={contentAlign}>
        {NORMAL_TYPE_OPTIONS.slice(0, 3).map((option) => (
          <DropdownMenuItem
            key={option.value}
            className={menuItemClassName}
            onSelect={() => onChange({ groupType: option.value })}
          >
            <SelectionMark selected={value === option.value} />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={cn(menuItemClassName, "cursor-default")}>
            <SelectionMark selected={value === "load-balance"} />
            <span>负载均衡</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={menuContentClassName} sideOffset={4}>
            {LOAD_BALANCE_STRATEGIES.map((nextStrategy) => (
              <DropdownMenuItem
                key={nextStrategy}
                className={menuItemClassName}
                onSelect={() => onChange({ groupType: "load-balance", strategy: nextStrategy })}
              >
                <SelectionMark selected={value === "load-balance" && selectedStrategy === nextStrategy} />
                <span>{getLoadBalanceStrategyLabel(nextStrategy)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {NORMAL_TYPE_OPTIONS.slice(3).map((option) => (
          <DropdownMenuItem
            key={option.value}
            className={menuItemClassName}
            onSelect={() => onChange({ groupType: option.value })}
          >
            <SelectionMark selected={value === option.value} />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
      {selected && <Check className="h-3.5 w-3.5 text-indigo-300" />}
    </span>
  );
}
