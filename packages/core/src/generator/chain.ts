/**
 * 中转代理组生成器 (dialer-proxy 语法)
 * 
 * 实现原理：
 * 1. 创建中转代理组（proxy-group），包含用于中转的节点
 * 2. 给目标节点添加 dialer-proxy 属性，指向中转代理组
 */

import type { ParsedNode } from "@subboost/core/types/node";
import type { DialerProxyGroup } from "@subboost/core/types/template-config";
import { DEFAULT_LOAD_BALANCE_STRATEGY, type ProxyGroupGroupType } from "@subboost/core/types/config";
import { DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import { buildTypedProxyGroup, uniqueProxyNames } from "./proxy-group-type";

export interface DialerProxyGroupConfig {
  id: string;
  name: string;
  relayNodes: string[];      // 中转节点
  targetNodes: string[];     // 使用此中转的目标节点
  type: ProxyGroupGroupType;
}

function resolveDialerGroupProxies(group: DialerProxyGroup): string[] {
  if (group.type === "direct-first") return uniqueProxyNames(["DIRECT", ...group.relayNodes]);
  if (group.type === "reject-first") return uniqueProxyNames(["REJECT", ...group.relayNodes]);
  return uniqueProxyNames(group.relayNodes);
}

/**
 * 生成中转代理组（作为 proxy-groups 的一部分）
 */
export function generateDialerProxyGroups(
  groups: DialerProxyGroup[],
  testUrl: string = DEFAULT_SUBBOOST_CONFIG.testUrl,
  testInterval: number = DEFAULT_SUBBOOST_CONFIG.testInterval,
  proxyProviderNames: string[] = [],
  urlTestOptions: { urlTestLazy?: boolean; urlTestTolerance?: number } = {},
): Array<Record<string, unknown>> {
  const providerUse = proxyProviderNames.length > 0 ? { use: proxyProviderNames } : {};
  return groups
    .map((group) => ({ group, proxies: resolveDialerGroupProxies(group) }))
    .filter(({ proxies }) => proxies.length > 0)
    .map((group) => {
      return buildTypedProxyGroup({
        name: group.group.name,
        groupType: group.group.type,
        proxies: group.proxies,
        testUrl,
        testInterval,
        strategy: group.group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY,
        extraFields: providerUse,
        urlTestLazy: urlTestOptions.urlTestLazy ?? true,
        urlTestTolerance: urlTestOptions.urlTestTolerance,
      });
    });
}

/**
 * 给目标节点添加 dialer-proxy 属性
 * 返回修改后的节点列表
 */
export function applyDialerProxy(
  nodes: ParsedNode[],
  groups: DialerProxyGroup[]
): ParsedNode[] {
  // 构建节点名 -> 中转组名的映射
  const nodeToDialer = new Map<string, string>();

  for (const group of groups) {
    for (const targetNode of group.targetNodes) {
      // 一个节点只能使用一个中转组
      if (!nodeToDialer.has(targetNode)) {
        nodeToDialer.set(targetNode, group.name);
      }
    }
  }

  // 修改节点，添加 dialer-proxy
  return nodes.map((node) => {
    const dialerName = nodeToDialer.get(node.name);
    if (dialerName) {
      return {
        ...node,
        "dialer-proxy": dialerName,
      } as ParsedNode & { "dialer-proxy": string };
    }
    return node;
  });
}

/**
 * 获取所有使用中转的节点名称
 */
export function getDialerTargetNodes(groups: DialerProxyGroup[]): Set<string> {
  const targetNodes = new Set<string>();
  for (const group of groups) {
    for (const node of group.targetNodes) {
      targetNodes.add(node);
    }
  }
  return targetNodes;
}

/**
 * 获取所有中转节点名称（不应作为目标节点使用）
 */
export function getDialerRelayNodes(groups: DialerProxyGroup[]): Set<string> {
  const relayNodes = new Set<string>();
  for (const group of groups) {
    for (const node of group.relayNodes) {
      relayNodes.add(node);
    }
  }
  return relayNodes;
}

/**
 * 验证中转配置
 */
export function validateDialerConfig(
  nodes: ParsedNode[],
  group: DialerProxyGroup
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeNames = new Set(nodes.map((n) => n.name));
  const builtinRelays = new Set<string>(["DIRECT"]);

  // 检查中转节点是否存在
  for (const relayNode of group.relayNodes) {
    if (builtinRelays.has(relayNode)) continue;
    if (!nodeNames.has(relayNode)) {
      errors.push(`中转节点 "${relayNode}" 不存在`);
    }
  }

  // 检查目标节点是否存在
  for (const targetNode of group.targetNodes) {
    if (!nodeNames.has(targetNode)) {
      errors.push(`目标节点 "${targetNode}" 不存在`);
    }
  }

  // 检查中转节点和目标节点是否有重叠
  const relaySet = new Set(group.relayNodes);
  for (const targetNode of group.targetNodes) {
    if (relaySet.has(targetNode)) {
      errors.push(`节点 "${targetNode}" 不能同时作为中转节点和目标节点`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 从节点列表中推荐中转组合
 * 基于节点名称中的地区信息进行智能匹配
 */
export function suggestDialerGroups(
  nodes: ParsedNode[]
): Array<{ name: string; relayNodes: string[]; description: string }> {
  const suggestions: Array<{ name: string; relayNodes: string[]; description: string }> = [];

  // 地区关键词
  const regions: Record<string, { keywords: string[]; emoji: string; name: string }> = {
    us: { keywords: ["美国", "US", "USA", "United States", "洛杉矶", "纽约", "西雅图"], emoji: "🇺🇸", name: "美国" },
    hk: { keywords: ["香港", "HK", "Hong Kong", "港"], emoji: "🇭🇰", name: "香港" },
    jp: { keywords: ["日本", "JP", "Japan", "东京", "大阪"], emoji: "🇯🇵", name: "日本" },
    sg: { keywords: ["新加坡", "SG", "Singapore", "狮城"], emoji: "🇸🇬", name: "新加坡" },
    tw: { keywords: ["台湾", "TW", "Taiwan", "台北"], emoji: "🇹🇼", name: "台湾" },
    kr: { keywords: ["韩国", "KR", "Korea", "首尔"], emoji: "🇰🇷", name: "韩国" },
  };

  // 按地区分类节点
  const nodesByRegion: Record<string, string[]> = {};

  for (const node of nodes) {
    const name = node.name.toLowerCase();
    for (const [region, config] of Object.entries(regions)) {
      if (config.keywords.some((kw) => name.includes(kw.toLowerCase()))) {
        if (!nodesByRegion[region]) {
          nodesByRegion[region] = [];
        }
        nodesByRegion[region].push(node.name);
        break;
      }
    }
  }

  // 生成推荐的中转组
  for (const [region, config] of Object.entries(regions)) {
    const regionNodes = nodesByRegion[region] || [];
    if (regionNodes.length > 0) {
      suggestions.push({
        name: `${config.emoji} ${config.name}中转`,
        relayNodes: regionNodes.slice(0, 5), // 最多取5个节点
        description: `使用${config.name}节点作为中转`,
      });
    }
  }

  return suggestions;
}
