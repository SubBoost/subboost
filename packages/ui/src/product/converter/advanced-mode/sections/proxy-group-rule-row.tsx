"use client";

import * as React from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { cn } from "@subboost/ui/lib/utils";
import type { CustomRule } from "@subboost/core/types/config";
import type {
  CustomRuleListItem,
  ProxyGroupRuleTargetOption,
  ProxyGroupRuleTargetKind,
} from "./proxy-group-rule-targets";

export type RuleSetMoveTarget = ProxyGroupRuleTargetOption & { kind: "module" | "custom" };
export type ProxyGroupRuleRowState = "active" | "moved" | "removed";

type RuleSource = "preset" | "custom" | "manual" | "experimental";

export function isRuleSetMoveTarget(target: ProxyGroupRuleTargetOption): target is RuleSetMoveTarget {
  return target.kind === "module" || target.kind === "custom";
}

type ProxyGroupRuleRowProps = {
  title: string;
  detail: string;
  detailTitle?: string;
  state?: ProxyGroupRuleRowState;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
};

const targetKindLabels: Record<ProxyGroupRuleTargetKind, string> = {
  module: "内置组",
  custom: "自定义组",
};

const emptyTargetLabels: Record<ProxyGroupRuleTargetKind, string> = {
  module: "暂无内置组",
  custom: "暂无自定义组",
};

export function ProxyGroupRuleRow({
  title,
  detail,
  detailTitle,
  state = "active",
  badges,
  actions,
}: ProxyGroupRuleRowProps) {
  const isInactive = state !== "active";
  const isMoved = state === "moved";

  return (
    <div
      className={cn(
        "proxy-group-rule-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded border border-white/10 bg-white/[0.04] px-2 py-2",
        isInactive &&
          (isMoved
            ? "border-orange-500/25 bg-orange-500/10"
            : "border-red-500/20 bg-red-500/10"),
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span
            className={cn(
              "min-w-0 break-words text-xs font-medium leading-5",
              isInactive
                ? cn(
                    "text-white/50 line-through",
                    isMoved ? "decoration-orange-300/70" : "decoration-red-300/70"
                  )
                : "text-white"
            )}
            title={title}
          >
            {title}
          </span>
          {isInactive && <RuleStateBadge state={state} />}
          {badges}
        </div>

        <div
          className={cn(
            "min-w-0 break-all font-mono text-[10px]",
            isInactive
              ? cn(
                  "text-white/30 line-through",
                  isMoved ? "decoration-orange-300/50" : "decoration-red-300/50",
                )
              : "text-white/35",
          )}
          title={detailTitle || detail}
        >
          {detail}
        </div>
      </div>

      {actions && <div className="flex shrink-0 items-center justify-end gap-1.5">{actions}</div>}
    </div>
  );
}

export function ProxyGroupRuleSetRow({
  name,
  path,
  source,
  behavior,
  noResolve,
  state = "active",
  actions,
}: {
  name: string;
  path: string;
  source: Exclude<RuleSource, "manual">;
  behavior: "domain" | "ipcidr";
  noResolve?: boolean;
  state?: ProxyGroupRuleRowState;
  actions?: React.ReactNode;
}) {
  return (
    <ProxyGroupRuleRow
      title={name}
      detail={path}
      detailTitle={`${name} · ${path}`}
      state={state}
      badges={
        <>
          {state === "active" && <RuleSourceBadge source={source} />}
          <RuleBehaviorBadge behavior={behavior} />
          {noResolve && <NoResolveBadge />}
        </>
      }
      actions={actions}
    />
  );
}

export function ProxyGroupManualRuleRow({
  item,
  targets,
  currentTargetName,
  onMove,
  onRemove,
}: {
  item: CustomRuleListItem;
  targets: ProxyGroupRuleTargetOption[];
  currentTargetName: string;
  onMove: (item: CustomRuleListItem, target: ProxyGroupRuleTargetOption) => void;
  onRemove: (item: CustomRuleListItem) => void;
}) {
  const { rule } = item;
  const detail = buildManualRuleDetail(rule);

  return (
    <ProxyGroupRuleRow
      title={rule.value}
      detail={detail}
      detailTitle={detail}
      badges={
        <>
          <RuleSourceBadge source="manual" />
          <RuleTextBadge>{rule.type}</RuleTextBadge>
          {rule.noResolve && <NoResolveBadge />}
        </>
      }
      actions={
        <>
          <ProxyGroupRuleMoveMenu
            title="移动规则"
            ariaLabel={`移动 ${rule.value} 规则`}
            targets={targets}
            kinds={["module", "custom"]}
            currentTarget={{ name: currentTargetName }}
            onMove={(target) => onMove(item, target)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-white/35 hover:text-red-300"
            title="删除规则"
            aria-label={`删除 ${rule.value} 规则`}
            onClick={() => onRemove(item)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    />
  );
}

export function ProxyGroupRuleMoveMenu({
  title,
  ariaLabel,
  targets,
  kinds,
  currentTarget,
  onMove,
}: {
  title: string;
  ariaLabel: string;
  targets: ProxyGroupRuleTargetOption[];
  kinds: ProxyGroupRuleTargetKind[];
  currentTarget?: Partial<ProxyGroupRuleTargetOption>;
  onMove: (target: ProxyGroupRuleTargetOption) => void | Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-white/45 hover:text-indigo-200"
          title={title}
          aria-label={ariaLabel}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-white/10 bg-black/95 text-white shadow-2xl">
        {kinds.map((kind, index) => {
          const groupTargets = targets.filter((target) => target.kind === kind);
          return (
            <React.Fragment key={kind}>
              {index > 0 && <DropdownMenuSeparator className="bg-white/10" />}
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium text-white/45">
                {targetKindLabels[kind]}
              </DropdownMenuLabel>
              {groupTargets.length === 0 ? (
                <DropdownMenuItem className="text-xs text-white/35" disabled>
                  {emptyTargetLabels[kind]}
                </DropdownMenuItem>
              ) : (
                groupTargets.map((target) => (
                  <DropdownMenuItem
                    key={`${target.kind}:${target.id}`}
                    disabled={isCurrentTarget(target, currentTarget)}
                    className="text-xs text-white/70 focus:bg-white/10 focus:text-white"
                    onSelect={() => {
                      void onMove(target);
                    }}
                  >
                    {target.name}
                  </DropdownMenuItem>
                ))
              )}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RuleStateBadge({ state }: { state: Exclude<ProxyGroupRuleRowState, "active"> }) {
  const isMoved = state === "moved";
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 text-[9px]",
        isMoved
          ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
          : "border-red-500/50 bg-red-500/10 text-red-300",
      )}
    >
      {isMoved ? "已移动" : "已移除"}
    </Badge>
  );
}

function RuleSourceBadge({ source }: { source: RuleSource }) {
  const className = {
    preset: "border-white/10 bg-blue-500/10 text-blue-200",
    custom: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    manual: "border-indigo-400/20 bg-indigo-500/10 text-indigo-200",
    experimental: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  }[source];
  const label = {
    preset: "预设",
    custom: "自定义",
    manual: "自定义",
    experimental: "实验性",
  }[source];

  return (
    <Badge variant="outline" className={cn("px-1.5 py-0 text-[9px]", className)}>
      {label}
    </Badge>
  );
}

function RuleBehaviorBadge({ behavior }: { behavior: "domain" | "ipcidr" }) {
  return <RuleTextBadge>{behavior === "ipcidr" ? "IP" : "域名"}</RuleTextBadge>;
}

function RuleTextBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="border-white/10 bg-white/5 px-1.5 py-0 text-[9px] text-white/55">
      {children}
    </Badge>
  );
}

function NoResolveBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-200">
      no-resolve
    </Badge>
  );
}

function isCurrentTarget(
  target: ProxyGroupRuleTargetOption,
  currentTarget?: Partial<ProxyGroupRuleTargetOption>,
) {
  if (!currentTarget) return false;
  if (currentTarget.kind && currentTarget.id) {
    return currentTarget.kind === target.kind && currentTarget.id === target.id;
  }
  return Boolean(currentTarget.name && currentTarget.name === target.name);
}

function buildManualRuleDetail(rule: CustomRule) {
  return [rule.type, rule.value, rule.target, rule.noResolve ? "no-resolve" : ""]
    .filter(Boolean)
    .join(",");
}
