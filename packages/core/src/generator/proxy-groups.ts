/**
 * 分流代理组生成器
 * 合并代理组和分流规则为统一的"分流代理组"概念
 */

import type { ParsedNode } from "@subboost/core/types/node";
import { DEFAULT_LOAD_BALANCE_STRATEGY } from "@subboost/core/types/config";
import type {
  BuiltinRuleEdits,
  CustomProxyGroup,
  CustomRuleSet,
  LoadBalanceStrategy,
  ProxyGroup,
  ProxyGroupAdvancedConfig,
  ProxyGroupGroupType,
  RuleProvider,
} from "@subboost/core/types/config";
import { resolveProxyGroupMembers } from "@subboost/core/proxy-group-advanced";
import { isSubscriptionInfoNodeName } from "@subboost/core/subscription/info-node-name";

import { PROXY_GROUP_MODULES, type ProxyGroupModule, type ProxyGroupRule } from "./proxy-group-modules";
import {
  EXPERIMENTAL_CN_RULE,
  generateRules,
  resolveModuleName,
  resolveModuleNameFromModule,
} from "./rules";
import { getModuleRuleOrderKey } from "./module-rules";
import { buildRuleSetUrlFromPath } from "@subboost/core/rules/rule-model";
import { buildTypedProxyGroup } from "./proxy-group-type";

export { PROXY_GROUP_MODULES };
export type { ProxyGroupModule, ProxyGroupRule };
export { generateRules };

/**
 * 分类信息
 */
export const CATEGORY_INFO: Record<string, { name: string; order: number }> = {
  core: { name: "核心组", order: 0 },
  service: { name: "常用服务", order: 1 },
  social: { name: "社交通讯", order: 2 },
  media: { name: "流媒体", order: 3 },
  game: { name: "游戏平台", order: 4 },
  tech: { name: "技术服务", order: 5 },
  finance: { name: "金融服务", order: 6 },
  other: { name: "其他", order: 7 },
  custom: { name: "自定义分组", order: 8 },
};

export interface GenerateOptions {
  nodes: ParsedNode[];
  proxyProviderNames?: string[];
  enabledModules: string[];
  ruleProviderBaseUrl: string;
  testUrl: string;
  testInterval: number;
  customProxyGroups?: CustomProxyGroup[];
  customRuleSets?: CustomRuleSet[];
  proxyGroupAdvanced?: Record<string, ProxyGroupAdvancedConfig>;
  builtinRuleEdits?: BuiltinRuleEdits;
  // 国内服务 GeoIP 规则是否使用 no-resolve（默认 true；关闭可提升命中率但可能造成 DNS 泄露）
  cnIpNoResolve?: boolean;
  // 实验性：为“国内服务”额外启用 cn（geosite/cn.mrs），并将其规则后置（放到 global 之后）
  experimentalCnUseCnRuleSet?: boolean;
  proxyGroupNameOverrides?: Record<string, string>;
  ruleOrder?: string[];
}

export { isSubscriptionInfoNodeName };

function getEnabledCustomProxyGroups(customProxyGroups: CustomProxyGroup[]): CustomProxyGroup[] {
  return customProxyGroups.filter((group) => group && group.enabled !== false);
}

function usesFilteredNodeMembers(group: CustomProxyGroup): boolean {
  return group.memberSource === "filtered-nodes";
}

function isIncludedInGroupMembers(group: CustomProxyGroup): boolean {
  return group.includeInGroupMembers === true;
}

function customTargetIsDisabled(
  target: CustomRuleSet["target"],
  customProxyGroups: CustomProxyGroup[]
): boolean {
  const disabled = customProxyGroups.filter((group) => group && group.enabled === false);
  if (disabled.length === 0) return false;
  if (typeof target === "object" && target?.kind === "custom") {
    return disabled.some((group) => group.id === target.id);
  }
  if (typeof target === "string") {
    const name = target.trim();
    return Boolean(name) && disabled.some((group) => group.name.trim() === name);
  }
  return false;
}

/**
 * 代理组显示顺序（在 Clash 客户端中的排列顺序）
 * 
 * 顺序：节点选择 → 自动选择 → (中转组插入位置) → 广告 → 服务 → 私有/国内 → 非中国 → 漏网之鱼
 */
const PROXY_GROUP_ORDER: string[] = [
  // 1. 核心选择组（最前面）
  "select", "auto",
  // 2. 广告拦截
  "ad",
  // 3. 常用服务
  "ai", "gemini", "youtube", "google", "microsoft", "apple",
  // 4. 社交通讯
  "telegram", "twitter", "meta", "discord", "social-other",
  // 5. 流媒体
  "netflix", "disney", "streaming-west", "streaming-asia",
  // 6. 游戏平台
  "steam", "gaming-pc", "gaming-console",
  // 7. 技术服务
  "github", "cloud", "dev-tools", "storage",
  // 8. 金融服务
  "payment", "crypto",
  // 9. 其他
  "google-scholar", "education", "news", "shopping", "adult",
  // 10. 直连组（靠后）
  "private", "cn",
  // 11. 兜底组（最后）
  "global", "final",
];

/**
 * 生成代理组配置
 */
export function generateProxyGroups(options: GenerateOptions): ProxyGroup[] {
  const {
    nodes,
    proxyProviderNames = [],
    enabledModules,
    testUrl,
    testInterval,
    customProxyGroups = [],
    proxyGroupAdvanced = {},
    proxyGroupNameOverrides,
  } = options;
  const activeCustomProxyGroups = getEnabledCustomProxyGroups(customProxyGroups);
  const providerUse = proxyProviderNames.length > 0 ? { use: proxyProviderNames } : {};
  const nodeNames = nodes.map((n) => n.name);
  // 业务组/测速组需要过滤掉“信息节点”，仅在 🚀 节点选择 中保留显示
  const filteredNodeNames = nodeNames.filter((n) => !isSubscriptionInfoNodeName(n));
  const groups: ProxyGroup[] = [];
  const processedModules = new Set<string>();
  const leadingCustomProxyGroups = activeCustomProxyGroups.filter(usesFilteredNodeMembers);
  const inlineCustomProxyGroups = activeCustomProxyGroups.filter((group) => !usesFilteredNodeMembers(group));

  const enabledSet = new Set(enabledModules);
  // 默认顺序（影响 Clash 初始选中项）：节点选择 → 自动选择 → DIRECT → REJECT → 其它节点
  // - 大多数业务组默认指向“🚀 节点选择”，便于用户只改一次全局生效
  // - “🚀 节点选择”组本身会默认选择“⚡ 自动选择”（见下方）
  const enabledModuleTarget = (moduleId: string) =>
    enabledSet.has(moduleId) ? resolveModuleName(moduleId, proxyGroupNameOverrides) : null;

  const moduleNames = Object.fromEntries(
    PROXY_GROUP_MODULES.map((module) => [
      module.id,
      resolveModuleNameFromModule(module, proxyGroupNameOverrides),
    ])
  );
  const customGroupNames = activeCustomProxyGroups
    .filter(isIncludedInGroupMembers)
    .map((group) => (typeof group.name === "string" ? group.name.trim() : ""))
    .filter(Boolean);
  const policyTargets = (...targets: unknown[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const target of targets) {
      if (typeof target !== "string" || !target || seen.has(target)) continue;
      seen.add(target);
      out.push(target);
    }
    return out;
  };
  const fallbackTargets = (...targets: unknown[]) => policyTargets(...targets, "DIRECT", "REJECT");
  const selectTarget = enabledModuleTarget("select");
  const autoTarget = enabledModuleTarget("auto");
  const moduleBaseProxies = selectTarget
    ? fallbackTargets(
        selectTarget,
        autoTarget,
        "DIRECT",
        "REJECT",
        ...customGroupNames,
        ...filteredNodeNames
      )
    : fallbackTargets(
        autoTarget,
        ...customGroupNames,
        ...filteredNodeNames,
        "DIRECT",
        "REJECT"
      );
  const customBaseProxies = moduleBaseProxies;
  const availableMemberProxyNames = fallbackTargets(
    "DIRECT",
    "REJECT",
    autoTarget,
    selectTarget,
    ...filteredNodeNames,
    ...PROXY_GROUP_MODULES.filter((module) => enabledSet.has(module.id)).map((module) => moduleNames[module.id]),
    ...customGroupNames,
  );

  const resolveGroupProxyNames = (
    defaultProxyNames: string[],
    advanced: ProxyGroupAdvancedConfig | undefined,
    self: { kind: "module" | "custom"; id: string; name: string }
  ) =>
    resolveProxyGroupMembers({
      defaultProxyNames,
      availableProxyNames: availableMemberProxyNames,
      nodes,
      moduleNames,
      customProxyGroups: activeCustomProxyGroups,
      advanced,
      self,
    }).proxyNames;
  const createGeneratedProxyGroup = (
    name: string,
    groupType: ProxyGroupGroupType,
    proxies: string[],
    strategy?: LoadBalanceStrategy,
    extraFields: Record<string, unknown> = providerUse
  ): ProxyGroup =>
    buildTypedProxyGroup({
      name,
      groupType,
      proxies,
      testUrl,
      testInterval,
      strategy,
      extraFields,
      urlTestLazy: false,
    });

  // 辅助函数：生成单个代理组
  const generateGroup = (module: ProxyGroupModule) => {
    const moduleName = resolveModuleNameFromModule(module, proxyGroupNameOverrides);
    const advanced = proxyGroupAdvanced[module.id];
    const groupType: ProxyGroupGroupType = advanced?.groupType ?? module.groupType;
    switch (groupType) {
      case "select":
        if (module.id === "select") {
          const defaultProxies = fallbackTargets(
            autoTarget,
            "DIRECT",
            "REJECT",
            ...customGroupNames,
            ...nodeNames
          );
          groups.push({
            name: moduleName,
            type: "select",
            // “节点选择”组本身不应包含自己；默认先走“⚡ 自动选择”更符合开箱即用
            proxies: resolveGroupProxyNames(defaultProxies, advanced, {
              kind: "module",
              id: module.id,
              name: moduleName,
            }),
            ...providerUse,
          });
        } else {
          const defaultProxies = moduleBaseProxies.filter((target) => target !== moduleName);
          groups.push({
            name: moduleName,
            type: "select",
            proxies: resolveGroupProxyNames(defaultProxies, advanced, {
              kind: "module",
              id: module.id,
              name: moduleName,
            }),
            ...providerUse,
          });
        }
        break;

      case "url-test":
          groups.push(createGeneratedProxyGroup(
            moduleName,
            groupType,
            resolveGroupProxyNames(filteredNodeNames, advanced, {
              kind: "module",
              id: module.id,
              name: moduleName,
            }),
          ));
        break;

      case "fallback":
        groups.push(createGeneratedProxyGroup(
          moduleName,
          groupType,
          resolveGroupProxyNames(filteredNodeNames, advanced, {
            kind: "module",
            id: module.id,
            name: moduleName,
          }),
        ));
        break;

      case "load-balance":
        groups.push(createGeneratedProxyGroup(
          moduleName,
          groupType,
          resolveGroupProxyNames(filteredNodeNames, advanced, {
            kind: "module",
            id: module.id,
            name: moduleName,
          }),
          advanced?.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY,
        ));
        break;

      case "reject-first":
        {
          const defaultProxies = fallbackTargets("REJECT", "DIRECT", selectTarget).filter((target) => target !== moduleName);
          groups.push({
            name: moduleName,
            type: "select",
            proxies: resolveGroupProxyNames(defaultProxies, advanced, {
              kind: "module",
              id: module.id,
              name: moduleName,
            }),
            ...providerUse,
          });
        }
        break;

      case "direct-first":
        {
          const defaultProxies = fallbackTargets(
            "DIRECT",
            "REJECT",
            ...customGroupNames,
            selectTarget,
            autoTarget,
            ...filteredNodeNames
          ).filter((target) => target !== moduleName);
          groups.push({
            name: moduleName,
            type: "select",
            // 私有网络/国内服务：默认 DIRECT，但也提供自动选择
            proxies: resolveGroupProxyNames(defaultProxies, advanced, {
              kind: "module",
              id: module.id,
              name: moduleName,
            }),
            ...providerUse,
          });
        }
        break;
    }
  };

  const createCustomProxyGroup = (customGroup: CustomProxyGroup): ProxyGroup => {
    const resolveCustom = (defaultProxyNames: string[]) =>
      resolveGroupProxyNames(defaultProxyNames, customGroup.advanced, {
        kind: "custom",
        id: customGroup.id,
        name: customGroup.name,
      });

    if (usesFilteredNodeMembers(customGroup)) {
      if (customGroup.groupType === "url-test" || customGroup.groupType === "fallback") {
        return createGeneratedProxyGroup(customGroup.name, customGroup.groupType, resolveCustom(filteredNodeNames), undefined, {});
      }
      if (customGroup.groupType === "load-balance") {
        return createGeneratedProxyGroup(
          customGroup.name,
          customGroup.groupType,
          resolveCustom(filteredNodeNames),
          customGroup.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY,
          {}
        );
      }
      return {
        name: customGroup.name,
        type: "select",
        proxies: customGroup.groupType === "reject-first"
          ? resolveCustom(["REJECT", "DIRECT", ...filteredNodeNames])
          : resolveCustom(["DIRECT", "REJECT", ...filteredNodeNames]),
      };
    }
    if (customGroup.groupType === "url-test") {
      return createGeneratedProxyGroup(customGroup.name, customGroup.groupType, resolveCustom(filteredNodeNames));
    }
    if (customGroup.groupType === "fallback") {
      return createGeneratedProxyGroup(customGroup.name, customGroup.groupType, resolveCustom(filteredNodeNames));
    }
    if (customGroup.groupType === "load-balance") {
      return createGeneratedProxyGroup(
        customGroup.name,
        customGroup.groupType,
        resolveCustom(filteredNodeNames),
        customGroup.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY
      );
    }
    if (customGroup.groupType === "direct-first") {
      return {
        name: customGroup.name,
        type: "select",
        proxies: resolveCustom(
          fallbackTargets("DIRECT", "REJECT", selectTarget, autoTarget, ...filteredNodeNames).filter(
            (target) => target !== customGroup.name
          )
        ),
        ...providerUse,
      };
    }
    if (customGroup.groupType === "reject-first") {
      return {
        name: customGroup.name,
        type: "select",
        proxies: resolveCustom(
          fallbackTargets("REJECT", "DIRECT", selectTarget).filter(
            (target) => target !== customGroup.name
          )
        ),
        ...providerUse,
      };
    }
    return {
      name: customGroup.name,
      type: "select",
      proxies: resolveCustom(customBaseProxies.filter((target) => target !== customGroup.name)),
      ...providerUse,
    };
  };

  for (const customGroup of leadingCustomProxyGroups) {
    groups.push(createCustomProxyGroup(customGroup));
  }

  // 按 PROXY_GROUP_ORDER 顺序生成代理组
  let insertedCustom = false;
  for (const moduleId of PROXY_GROUP_ORDER) {
    // 自定义分流组插入位置：在 🍏 苹果服务 与 📲 电报消息之间
    if (!insertedCustom && moduleId === "ai" && inlineCustomProxyGroups.length > 0) {
      insertedCustom = true;
      for (const customGroup of inlineCustomProxyGroups) {
        groups.push(createCustomProxyGroup(customGroup));
      }
    }

    if (!enabledSet.has(moduleId)) continue;
    
    const proxyModule = PROXY_GROUP_MODULES.find(m => m.id === moduleId);
    if (!proxyModule) continue;
    
    processedModules.add(moduleId);
    generateGroup(proxyModule);
  }

  // 处理不在 PROXY_GROUP_ORDER 中的模块（按原始顺序添加到末尾）
  for (const proxyModule of PROXY_GROUP_MODULES) {
    if (!enabledSet.has(proxyModule.id)) continue;
    if (processedModules.has(proxyModule.id)) continue;
    
    generateGroup(proxyModule);
  }

  // 若未命中插入点（例如未来移除 private），则追加到末尾
  if (!insertedCustom && inlineCustomProxyGroups.length > 0) {
    for (const customGroup of inlineCustomProxyGroups) {
      groups.push(createCustomProxyGroup(customGroup));
    }
  }

  return groups;
}

/**
 * 生成规则提供者配置
 */
export function generateRuleProviders(options: GenerateOptions): Record<string, RuleProvider> {
  const {
    enabledModules,
    ruleProviderBaseUrl,
    customRuleSets = [],
    builtinRuleEdits,
    customProxyGroups = [],
  } = options;
  const providers: Record<string, RuleProvider> = {};
  const enabledSet = new Set(enabledModules);

  // 预设模块的规则
  for (const proxyModule of PROXY_GROUP_MODULES) {
    if (!enabledSet.has(proxyModule.id)) continue;

    for (const rule of proxyModule.rules) {
      const edit = builtinRuleEdits?.[getModuleRuleOrderKey(proxyModule.id, rule.id)];
      if (edit?.enabled === false) continue;
      providers[rule.id] = {
        type: "http",
        behavior: rule.behavior,
        url: `${ruleProviderBaseUrl}/${rule.path}`,
        path: `./ruleset/${rule.id}.mrs`,
        interval: 86400,
        format: "mrs",
      };
    }
  }

  if (options.experimentalCnUseCnRuleSet && enabledSet.has("cn") && !providers[EXPERIMENTAL_CN_RULE.id]) {
    providers[EXPERIMENTAL_CN_RULE.id] = {
      type: "http",
      behavior: EXPERIMENTAL_CN_RULE.behavior,
      url: `${ruleProviderBaseUrl}/${EXPERIMENTAL_CN_RULE.path}`,
      path: `./ruleset/${EXPERIMENTAL_CN_RULE.id}.mrs`,
      interval: 86400,
      format: "mrs",
    };
  }

  // 用户新增规则集统一由 customRuleSets 提供，不再挂在某个分流组对象上。
  for (const ruleSet of customRuleSets) {
    if (customTargetIsDisabled(ruleSet.target, customProxyGroups)) continue;
    if (!ruleSet?.id || !ruleSet.path || providers[ruleSet.id]) continue;
    providers[ruleSet.id] = {
      type: "http",
      behavior: ruleSet.behavior,
      url: buildRuleSetUrlFromPath(ruleSet.path, ruleProviderBaseUrl),
      path: `./ruleset/${ruleSet.id}.mrs`,
      interval: 86400,
      format: "mrs",
    };
  }

  return providers;
}

/**
 * 根据模板获取启用的模块列表
 */
export function getModulesForTemplate(template: "minimal" | "standard" | "full"): string[] {
  switch (template) {
    case "minimal":
      return ["select", "auto", "ad", "private", "cn", "global", "final"];
    case "standard":
      return ["select", "auto", "ad", "private", "cn", "global", "ai", "youtube", "google", "microsoft", "apple", "github", "telegram", "final"];
    case "full":
    default:
      // 排除默认关闭的模块
      return PROXY_GROUP_MODULES.filter((m) => m.id !== "adult" && m.id !== "gemini" && m.id !== "google-scholar").map((m) => m.id);
  }
}

export function getGroupTarget(groupId: string): string {
  const proxyModule = PROXY_GROUP_MODULES.find((m) => m.id === groupId);
  return proxyModule?.name || "🚀 节点选择";
}

/**
 * 获取所有可用的代理组名称（用于规则目标选择）
 */
export function getAllGroupNames(enabledModules: string[], customProxyGroups: CustomProxyGroup[] = []): string[] {
  const names = PROXY_GROUP_MODULES
    .filter(m => enabledModules.includes(m.id))
    .map(m => m.name);
  
  // 添加自定义代理组
  for (const group of getEnabledCustomProxyGroups(customProxyGroups)) {
    names.push(group.name);
  }
  
  return names;
}
