"use client";

import * as React from "react";
import { ArrowRight, Shield } from "lucide-react";
import { resolveProxyGroupTargetName } from "@subboost/core/proxy-group-targets";
import type { CustomRoutingRuleSetItem } from "@subboost/core/rules/custom-routing-rule-sets";
import type { CustomProxyGroup, CustomRule } from "@subboost/core/types/config";

const UNAVAILABLE_TARGET_LABEL = "目标分流组不可用";

export function CustomRulesPreview({
  customRules,
  ruleSets = [],
  moduleNames,
  customProxyGroups,
}: {
  customRules: CustomRule[];
  ruleSets?: CustomRoutingRuleSetItem[];
  moduleNames: Record<string, string>;
  customProxyGroups: CustomProxyGroup[];
}) {
  const resolveTargetName = React.useCallback(
    (target: CustomRule["target"]) =>
      resolveProxyGroupTargetName(target, {
        moduleNames,
        customProxyGroups,
        fallbackTarget: UNAVAILABLE_TARGET_LABEL,
      }),
    [customProxyGroups, moduleNames],
  );

  const items = React.useMemo(
    () => [
      ...customRules.map((rule) => ({
        key: rule.id || `${rule.type}:${rule.value}`,
        type: rule.type,
        value: rule.value,
        target: resolveTargetName(rule.target),
        noResolve: Boolean(rule.noResolve),
        title: rule.value,
      })),
      ...ruleSets.map((rule) => ({
        key: rule.key,
        type: "RULE-SET",
        value: rule.name,
        target: resolveTargetName(rule.target),
        noResolve: Boolean(rule.noResolve),
        title: `${rule.name} · ${rule.path}`,
      })),
    ],
    [customRules, resolveTargetName, ruleSets],
  );

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-fg-60">
        <Shield className="h-3.5 w-3.5" />
        <span>自定义规则</span>
        <span className="text-[10px] text-fg-50">
          ({items.length})
        </span>
      </div>
      <div className="space-y-1 rounded-lg border border-ink/10 bg-ink/[0.04] p-2">
        {items.slice(0, 10).map((rule, idx) => (
          <div
            key={rule.key}
            className="flex min-w-0 flex-wrap items-center gap-1 rounded-md bg-ink/[0.04] px-2 py-1 text-[10px]"
          >
            <span className="w-5 shrink-0 tabular-nums text-fg-40">
              {idx + 1}.
            </span>
            <span className="rounded border border-indigo-400/20 bg-indigo-500/10 px-1.5 py-0.5 font-medium text-indigo-200">
              {rule.type}
            </span>
            <span
              className="min-w-0 max-w-[14rem] truncate text-fg-70"
              title={rule.title}
            >
              {rule.value}
            </span>
            {rule.noResolve && (
              <span className="rounded border border-ink/10 bg-ink/5 px-1.5 py-0.5 text-fg-45">
                no-resolve
              </span>
            )}
            <ArrowRight className="h-3 w-3 shrink-0 text-fg-35" />
            <span
              className="max-w-[11rem] truncate rounded border border-ink/10 bg-ink/5 px-1.5 py-0.5 text-primary-300"
              title={rule.target}
            >
              {rule.target}
            </span>
          </div>
        ))}
        {items.length > 10 && (
          <div className="py-1 text-center text-[10px] text-fg-50">
            ... 还有 {items.length - 10} 条规则
          </div>
        )}
      </div>
    </div>
  );
}
