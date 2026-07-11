import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  type LoadBalanceStrategy,
  type ProxyGroup,
  type ProxyGroupGroupType,
} from "@subboost/core/types/config";

type BuildTypedProxyGroupOptions = {
  name: string;
  groupType: ProxyGroupGroupType;
  proxies: string[];
  testUrl: string;
  testInterval: number;
  strategy?: LoadBalanceStrategy;
  extraFields?: Record<string, unknown>;
  urlTestLazy?: boolean;
  urlTestTolerance?: number;
};

export function uniqueProxyNames(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildTypedProxyGroup({
  name,
  groupType,
  proxies,
  testUrl,
  testInterval,
  strategy,
  extraFields = {},
  urlTestLazy = false,
  urlTestTolerance,
}: BuildTypedProxyGroupOptions): ProxyGroup {
  const base: ProxyGroup = {
    name,
    type: "select",
    proxies,
    ...extraFields,
  };

  switch (groupType) {
    case "url-test":
      return {
        ...base,
        type: "url-test",
        url: testUrl,
        interval: testInterval,
        lazy: urlTestLazy,
        ...(urlTestTolerance !== undefined ? { tolerance: urlTestTolerance } : {}),
      };
    case "fallback":
      return {
        ...base,
        type: "fallback",
        url: testUrl,
        interval: testInterval,
      };
    case "load-balance":
      return {
        ...base,
        type: "load-balance",
        url: testUrl,
        interval: testInterval,
        strategy: strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY,
      };
    case "direct-first":
    case "reject-first":
    case "select":
    default:
      return base;
  }
}
