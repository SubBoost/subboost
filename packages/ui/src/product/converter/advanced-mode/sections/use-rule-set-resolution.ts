import * as React from "react";
import { isValidRuleSetFormatBehavior, parseManualRuleSetUrl, parseRuleSetUrl } from "@subboost/core/rules/rule-model";
import type { RuleSetMetadata } from "@subboost/core/types/config";
import type { ProductRulesApi } from "@subboost/ui/product/api-adapter";

export function resolveRuleSetUrl(url: string, api?: ProductRulesApi, signal?: AbortSignal): RuleSetMetadata | Promise<RuleSetMetadata> {
  const parsed = parseRuleSetUrl(url);
  if (/\.mrs$/i.test(parsed.pathname)) return parseManualRuleSetUrl(url);
  if (!api?.detectRuleSet) throw new Error("规则格式识别暂时不可用");
  return api.detectRuleSet({ url: parsed.path, signal }).then((result) => {
    if (!isValidRuleSetFormatBehavior(result.format, result.behavior) || !["text", "yaml"].includes(result.format ?? "")) {
      throw new Error("无法识别规则文件");
    }
    return { name: parsed.name, path: parsed.path, format: result.format, behavior: result.behavior };
  });
}

/** A changed draft or unmounted editor invalidates its pending network result. */
export function useRuleSetOperation(draftKey: string) {
  const active = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => { active.current?.abort(); active.current = null; }, [draftKey]);
  return (work: (signal: AbortSignal) => void | Promise<void>) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    try {
      const result = work(controller.signal);
      if (result instanceof Promise) void result.finally(() => { if (active.current === controller) active.current = null; });
      else active.current = null;
    } catch (error) { active.current = null; throw error; }
  };
}
