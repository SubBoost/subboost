import {
  PROXY_GROUP_MODULES,
  buildProviderProxyGroups,
} from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { buildProxyProviderPlanFromSources } from "@subboost/core/subscription/proxy-providers";
import type { CustomProxyGroup } from "@subboost/core/types/config";
import type { ParsedNode } from "@subboost/core/types/node";

export interface ProviderGroupInfo {
  /** grouped 模式生成的机场组名（按生成顺序，已去重后缀） */
  names: string[];
  /** provider key → 机场组名 */
  nameByKey: Record<string, string>;
  /** 全部 provider key（grouped/inline/bare），供 generateProxyGroups 的 allProviderKeys */
  keys: string[];
}

const EMPTY: ProviderGroupInfo = { names: [], nameByKey: {}, keys: [] };

/**
 * 计算 provider 分组模式的机场组信息（组名 + key↔名映射 + 全部 key）。
 * reserved 名单与生成器 / categories 完全一致，保证组名去重后缀不分叉。
 * 面板与 categories 共用本函数，避免各自算出不同的机场组名。
 */
export function buildProviderGroupInfo(
  sources: unknown[],
  opts: {
    nodes: ParsedNode[];
    proxyGroupNameOverrides?: Record<string, string>;
    customProxyGroups?: CustomProxyGroup[];
    dialerProxyGroups?: Array<{ name?: string } | null | undefined>;
    testUrl: string;
    testInterval: number;
  },
): ProviderGroupInfo {
  const plan = buildProxyProviderPlanFromSources(sources, {
    testUrl: opts.testUrl,
    testInterval: opts.testInterval,
  });
  if (!plan) return EMPTY;

  const reserved = [
    "DIRECT",
    "REJECT",
    ...opts.nodes.map((node) => node.name),
    ...PROXY_GROUP_MODULES.map((module) =>
      resolveProxyGroupModuleName(module, opts.proxyGroupNameOverrides?.[module.id]),
    ),
    ...(opts.customProxyGroups ?? [])
      .map((group) => (typeof group.name === "string" ? group.name.trim() : ""))
      .filter(Boolean),
    ...(opts.dialerProxyGroups ?? [])
      .map((group) => (group && typeof group.name === "string" ? group.name.trim() : ""))
      .filter(Boolean),
  ];

  const { groups, names } = buildProviderProxyGroups(plan.attachments, reserved);
  const nameByKey: Record<string, string> = {};
  for (const group of groups) {
    const key = Array.isArray(group.use) ? group.use[0] : undefined;
    if (typeof key === "string" && key) nameByKey[key] = group.name;
  }
  return { names, nameByKey, keys: Object.keys(plan.providers) };
}
