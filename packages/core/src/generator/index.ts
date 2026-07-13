/**
 * Clash 配置生成器 - 浏览器端运行
 */

import yaml from "js-yaml";
import {
  buildDefaultBaseConfigPatch,
  buildDefaultUserConfig,
} from "@subboost/core/config/defaults";
import {
  buildProviderProxyGroups,
  generateProxyGroups,
  generateRules,
  generateRuleProviders,
  PROXY_GROUP_MODULES,
  isSubscriptionInfoNodeName,
} from "./proxy-groups";
import { 
  generateDialerProxyGroups, 
  applyDialerProxy 
} from "./chain";
import { DEFAULT_DNS_CONFIG } from "./dns";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import type { ParsedNode } from "@subboost/core/types/node";
import type {
  BuiltinRuleEdits,
  ClashConfig,
  CustomProxyGroup,
  CustomRuleSet,
  GroupListenerBinding,
  ProxyGroup,
  ProxyGroupAdvancedConfig,
  TemplateType,
  UserConfig,
} from "@subboost/core/types/config";
import type { DialerProxyGroup } from "@subboost/core/types/template-config";
import type { ProxyProviderAttachment } from "@subboost/core/subscription/proxy-providers";
import { collectDnsPolicyEntries, configToYaml } from "./yaml";
import { isMihomoSupportedProxyNode, normalizeMihomoVlessForGeneration } from "../mihomo/proxy-sanitizer";
import { chooseFallbackPolicyTarget, withBuiltinPolicyTargets } from "./policy-targets";

export interface GenerateOptions {
  nodes: ParsedNode[];
  proxyProviders?: Record<string, unknown>;
  // 各 provider 的接入方式（key 对应 proxyProviders 的键）：
  // grouped=生成机场组挂入节点选择；inline=直接 use 注入所有策略组；bare=仅生成不挂接。
  // 未提供条目的 key 按 inline 处理（与历史行为一致）。
  proxyProviderAttachments?: ProxyProviderAttachment[];
  template?: TemplateType;
  userConfig?: Partial<UserConfig>;
  dialerProxyGroups?: DialerProxyGroup[];
  customProxyGroups?: CustomProxyGroup[];
  customRuleSets?: CustomRuleSet[];
  proxyGroupAdvanced?: Record<string, ProxyGroupAdvancedConfig>;
  builtinRuleEdits?: BuiltinRuleEdits;
  proxyGroupNameOverrides?: Record<string, string>;
  proxyGroupOrder?: string[];
  groupListeners?: GroupListenerBinding[];
}

type BaseConfig = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class BaseConfigYamlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseConfigYamlError";
  }
}

function formatYamlParseError(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as {
      reason?: unknown;
      message?: unknown;
      mark?: { line?: unknown; column?: unknown };
    };
    const reason = typeof record.reason === "string"
      ? record.reason
      : typeof record.message === "string"
        ? record.message
        : String(error);
    const line = typeof record.mark?.line === "number" ? record.mark.line + 1 : null;
    const column = typeof record.mark?.column === "number" ? record.mark.column + 1 : null;
    return line && column ? `${reason}（第 ${line} 行，第 ${column} 列）` : reason;
  }
  return String(error);
}

/**
 * 解析用户自定义的基础和DNS配置 YAML
 */
function parseBaseConfigYaml(configYaml: string): BaseConfig {
  try {
    const parsed = yaml.load(configYaml) as unknown;
    if (!isPlainObject(parsed)) {
      throw new BaseConfigYamlError("基础和 DNS 配置必须是 YAML 对象（顶层 key/value 映射），不能是字符串、数组、数字、布尔值或 null。");
    }
    return parsed as BaseConfig;
  } catch (error) {
    if (error instanceof BaseConfigYamlError) throw error;
    throw new BaseConfigYamlError(`基础和 DNS 配置 YAML 解析失败：${formatYamlParseError(error)}`);
  }
}

const GENERATED_CONFIG_SECTION_KEYS = new Set(["proxies", "proxy-groups", "rule-providers", "rules"]);

function assertNoGeneratedSectionsInBaseConfig(baseConfig: Record<string, unknown>) {
  const conflicts = [...GENERATED_CONFIG_SECTION_KEYS].filter((key) => baseConfig[key] !== undefined);
  if (conflicts.length === 0) return;
  throw new BaseConfigYamlError(
    `基础和 DNS 配置不能包含 ${conflicts.join(", ")}；这些段由 SubBoost 根据节点、代理组和规则生成。`
  );
}

function omitGeneratedSections(baseConfig: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(baseConfig).filter(
      ([key, value]) => value !== undefined && !GENERATED_CONFIG_SECTION_KEYS.has(key)
    )
  );
}

function normalizeBaseConfigPatch(baseConfig: Record<string, unknown>): Record<string, unknown> {
  const patch = omitGeneratedSections(baseConfig);
  const dnsPolicyEntries = collectDnsPolicyEntries(patch["nameserver-policy"]);
  if (dnsPolicyEntries.length === 0) return patch;

  const { ["nameserver-policy"]: _topLevelPolicy, ...withoutTopLevelPolicy } = patch;
  const dns = withoutTopLevelPolicy.dns;
  if (dns !== undefined && !isPlainObject(dns)) {
    throw new BaseConfigYamlError("基础和 DNS 配置中的 dns 必须是对象，才能合并顶层 nameserver-policy。");
  }
  if (isPlainObject(dns) && dns["nameserver-policy"] !== undefined) {
    return withoutTopLevelPolicy;
  }

  return {
    ...withoutTopLevelPolicy,
    dns: {
      ...(isPlainObject(dns) ? dns : {}),
      "nameserver-policy": Object.fromEntries(dnsPolicyEntries),
    },
  };
}

/**
 * Clash 要求 proxies.name 全局唯一，否则会报 duplicate name。
 * 多机场/多订阅源合并时经常出现同名节点，因此在生成前做一次“稳定重命名”。
 *
 * 规则：保留第一次出现的原名；从第二次起追加 " (2)/(3)..." 后缀。
 */
function ensureUniqueProxyNames(nodes: ParsedNode[]): ParsedNode[] {
  const used = new Set<string>();
  const counter = new Map<string, number>();

  return nodes.map((node) => {
    const baseRaw = typeof node?.name === "string" ? node.name : String((node as unknown as { name?: unknown })?.name ?? "");
    const base = baseRaw.trim() || "未命名节点";

    if (!used.has(base)) {
      used.add(base);
      counter.set(base, 1);
      return base === node.name ? node : ({ ...(node as unknown as Record<string, unknown>), name: base } as unknown as ParsedNode);
    }

    let i = counter.get(base) || 1;
    let candidate = `${base} (${i + 1})`;
    while (used.has(candidate)) {
      i += 1;
      candidate = `${base} (${i + 1})`;
    }

    counter.set(base, i + 1);
    used.add(candidate);
    return { ...(node as unknown as Record<string, unknown>), name: candidate } as unknown as ParsedNode;
  });
}

/**
 * 生成完整的 Clash 配置
 */
export function generateClashConfig(options: GenerateOptions): ClashConfig {
  const {
    nodes,
    proxyProviders,
    proxyProviderAttachments = [],
    template = "standard",
    userConfig = {},
    dialerProxyGroups = [],
    customProxyGroups = [],
    customRuleSets = [],
    proxyGroupAdvanced = {},
    builtinRuleEdits,
    proxyGroupNameOverrides,
  } = options;
  
  // 合并用户配置
  const config: UserConfig = {
    ...buildDefaultUserConfig(template),
    ...userConfig,
  };
  const hasExplicitBaseConfigYaml = typeof userConfig.dnsYaml === "string";

  const resolvedProxyProviders =
    proxyProviders && typeof proxyProviders === "object" && Object.keys(proxyProviders).length > 0
      ? proxyProviders
      : undefined;
  const proxyProviderNames = resolvedProxyProviders
    ? Object.keys(resolvedProxyProviders).map((k) => k.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
    : [];

  // provider 接入模式：grouped/inline/bare；未声明的 key 按 inline（历史行为）
  const attachmentByKey = new Map<string, ProxyProviderAttachment>();
  for (const attachment of proxyProviderAttachments) {
    if (!attachment || typeof attachment.key !== "string" || !attachment.key.trim()) continue;
    attachmentByKey.set(attachment.key.trim(), attachment);
  }
  const providerModeOf = (key: string) => {
    const mode = attachmentByKey.get(key)?.mode;
    return mode === "grouped" || mode === "bare" ? mode : "inline";
  };
  const inlineProviderNames = proxyProviderNames.filter((key) => providerModeOf(key) === "inline");
  const groupedProviderKeys = proxyProviderNames.filter((key) => providerModeOf(key) === "grouped");

  // 解析用户自定义的基础配置（提前解析：用于规范化补齐）
  const baseConfigYaml = (hasExplicitBaseConfigYaml ? userConfig.dnsYaml : config.dnsYaml) ?? "";
  const baseConfig = baseConfigYaml.trim() ? parseBaseConfigYaml(baseConfigYaml) : {};
  assertNoGeneratedSectionsInBaseConfig(baseConfig);
  const baseConfigRecord = baseConfig as unknown as Record<string, unknown>;
  const shouldUseDefaultBaseSections = !hasExplicitBaseConfigYaml;
  const baseConfigClientFingerprint =
    typeof baseConfigRecord["global-client-fingerprint"] === "string" && baseConfigRecord["global-client-fingerprint"].trim()
      ? String(baseConfigRecord["global-client-fingerprint"]).trim()
      : undefined;

  // 输出前做一次轻量标准化：避免 YAML 数字样式字段被下游（Clash）当成 number 解析
  // 特别是 Reality short-id（有些机场会给纯数字，如 7053 / 7250）
  const normalizedNodes = nodes.map((node) => {
    if (!node || typeof node !== "object") return node;
    const typed = node as unknown as Record<string, unknown>;
    const type = typeof typed.type === "string" ? typed.type : "";
    const hasClientFingerprint =
      typeof typed["client-fingerprint"] === "string" && Boolean(String(typed["client-fingerprint"]).trim());
    const supportsClientFingerprint = type === "vmess" || type === "vless" || type === "trojan" || type === "anytls";
    const shouldApplyBaseFingerprint =
      Boolean(baseConfigClientFingerprint) &&
      supportsClientFingerprint &&
      !hasClientFingerprint &&
      (type === "trojan" ||
        type === "anytls" ||
        (typeof typed.tls === "boolean" && typed.tls) ||
        (type === "vless" && Boolean(typed["reality-opts"])));
    const nextBase = shouldApplyBaseFingerprint
      ? { ...typed, "client-fingerprint": baseConfigClientFingerprint }
      : typed;

    if (type !== "vless") return nextBase as unknown as ParsedNode;
    return normalizeMihomoVlessForGeneration(nextBase) as unknown as ParsedNode;
  });

  // Mihomo 不支持的协议不能进入最终 YAML，否则一个无效节点会拖垮整份订阅。
  const supportedNodes = normalizedNodes.filter(isMihomoSupportedProxyNode);

  // 确保 proxies.name 全局唯一（否则 Clash 校验会失败）
  const uniqueNodes = ensureUniqueProxyNames(supportedNodes);

  // 中转代理组依赖节点名称；订阅更新/重命名后可能出现“引用了不存在的节点”。
  // 在生成阶段做一次清理，避免输出到 Clash 后出现无效 proxies 引用。
  const sanitizeDialerProxyGroups = (
    groups: DialerProxyGroup[],
    availableNodeNames: Set<string>,
    availableGroupNames: Set<string>
  ): DialerProxyGroup[] => {
    const builtinRelays = new Set<string>(["DIRECT"]);
    const normalizeList = (list: string[]) => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const raw of list) {
        const name = typeof raw === "string" ? raw.trim() : "";
        if (!name) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(name);
      }
      return out;
    };

    return groups.map((g) => {
      const relayNodes = normalizeList(g.relayNodes).filter(
        (n) => builtinRelays.has(n) || availableNodeNames.has(n) || availableGroupNames.has(n)
      );
      const targetNodes = normalizeList(g.targetNodes).filter((n) => availableNodeNames.has(n));

      // 若中转节点为空，则该组无法工作：同时清空目标节点，避免 dialer-proxy 指向一个不存在的组。
      if (relayNodes.length === 0) {
        return { ...g, relayNodes: [], targetNodes: [] };
      }

      return { ...g, relayNodes, targetNodes };
    });
  };

  const nodeNameSet = new Set(uniqueNodes.map((n) => n.name));
  const activeCustomProxyGroups = customProxyGroups.filter((g) => g && g.enabled !== false);
  const customGroupNameSet = new Set<string>(
    activeCustomProxyGroups.filter((g) => g && typeof g.name === "string" && g.name.trim()).map((g) => g.name.trim())
  );
  const moduleGroupNameSet = new Set<string>(
    PROXY_GROUP_MODULES.map((mod) => resolveProxyGroupModuleName(mod, proxyGroupNameOverrides?.[mod.id]))
  );
  const enabledDialerProxyGroups = dialerProxyGroups.filter((g) => g && g.enabled !== false);
  const sanitizedDialerProxyGroups = enabledDialerProxyGroups.length > 0
    ? sanitizeDialerProxyGroups(
        enabledDialerProxyGroups,
        nodeNameSet,
        new Set([...moduleGroupNameSet, ...customGroupNameSet])
      )
    : [];

  // 应用 dialer-proxy 到目标节点（基于最终输出的唯一节点名）
  const allNodes = sanitizedDialerProxyGroups.length > 0
    ? applyDialerProxy(uniqueNodes, sanitizedDialerProxyGroups)
    : uniqueNodes;
  const validDialerProxyNames = new Set<string>([
    "DIRECT",
    ...nodeNameSet,
    ...proxyProviderNames,
    ...moduleGroupNameSet,
    ...customGroupNameSet,
    ...sanitizedDialerProxyGroups.map((g) => g.name.trim()).filter(Boolean),
  ]);
  const outputNodes = allNodes.map((node) => {
    const record = node as unknown as Record<string, unknown>;
    const dialerProxy = typeof record["dialer-proxy"] === "string" ? record["dialer-proxy"].trim() : "";
    if (!dialerProxy || validDialerProxyNames.has(dialerProxy)) return node;
    const { ["dialer-proxy"]: _dialerProxy, ...withoutDialerProxy } = record;
    return withoutDialerProxy as unknown as ParsedNode;
  });

  // 为部分节点生成 listeners（mixed inbound → 固定走指定 proxy）
  const listeners = (() => {
    const ports = config.listenerPorts;
    if (!ports || typeof ports !== "object") return undefined;

    const usedPorts = new Set<number>();
    const out: Array<{ name: string; type: string; port: number; proxy: string }> = [];
    let i = 0;
    for (const node of outputNodes) {
      const port = (ports as Record<string, unknown>)[node.name];
      if (typeof port !== "number" || !Number.isInteger(port)) continue;
      if (port < 1 || port > 65535) continue;
      if (usedPorts.has(port)) continue;
      usedPorts.add(port);
      out.push({ name: `mixed${i++}`, type: "mixed", port, proxy: node.name });
    }
    return out.length > 0 ? out : undefined;
  })();

  // 生成机场组（proxy-providers 分组模式）：与可视化预览共用同一构建函数，保证组名一致
  const groupedAttachments = groupedProviderKeys
    .map((key) => attachmentByKey.get(key))
    .filter((attachment): attachment is ProxyProviderAttachment => Boolean(attachment));
  const { groups: providerGroups, names: providerGroupNames } = buildProviderProxyGroups(groupedAttachments, [
    "DIRECT",
    "REJECT",
    ...nodeNameSet,
    ...moduleGroupNameSet,
    ...customGroupNameSet,
    ...sanitizedDialerProxyGroups.map((g) => g.name.trim()).filter(Boolean),
  ]);
  // key→机场组名映射（供 Provider 组面板手动追加 provider-group 成员时解析组名）
  const providerGroupNameByKey: Record<string, string> = {};
  for (const providerGroup of providerGroups) {
    const key = Array.isArray(providerGroup.use) ? providerGroup.use[0] : undefined;
    if (typeof key === "string" && key) providerGroupNameByKey[key] = providerGroup.name;
  }

  // 生成中转代理组
  const dialerGroups = generateDialerProxyGroups(
    sanitizedDialerProxyGroups,
    config.testUrl,
    config.testInterval,
    inlineProviderNames
  ) as unknown as ProxyGroup[];

  // 生成选项
  const generateOpts = {
    nodes: outputNodes,
    proxyProviderNames: inlineProviderNames,
    providerGroupNames,
    allProviderKeys: proxyProviderNames,
    providerGroupNameByKey,
    enabledModules: config.enabledGroups,
    ruleProviderBaseUrl: config.ruleProviderBaseUrl,
    testUrl: config.testUrl,
    testInterval: config.testInterval,
    customProxyGroups,
    customRuleSets,
    proxyGroupAdvanced,
    builtinRuleEdits,
    cnIpNoResolve: config.cnIpNoResolve,
    experimentalCnUseCnRuleSet: config.experimentalCnUseCnRuleSet,
    proxyGroupNameOverrides,
  };

  const defaultBaseConfigPatch = buildDefaultBaseConfigPatch({
    mixedPort: config.mixedPort,
    allowLan: config.allowLan,
  }) as Record<string, unknown>;

  const baseTopLevelPatch = shouldUseDefaultBaseSections
    ? defaultBaseConfigPatch
    : normalizeBaseConfigPatch(baseConfigRecord);

  const proxyGroups = (() => {
    const allGroups = generateProxyGroups(generateOpts);

    const mergedGroups = (() => {
      // 机场组与中转组一起插入到“节点选择/自动选择”之后
      const extraGroups = [...providerGroups, ...dialerGroups];
      if (extraGroups.length === 0) {
        return allGroups;
      }

      // 找到"节点选择"和"自动选择"的位置，在它们之后插入中转组
      const selectIndex = allGroups.findIndex(g => g.name === "🚀 节点选择");
      const autoIndex = allGroups.findIndex(g => g.name === "⚡ 自动选择");
      const insertAfter = Math.max(selectIndex, autoIndex);

      if (insertAfter >= 0) {
        // 在节点选择和自动选择之后插入中转组
        const before = allGroups.slice(0, insertAfter + 1);
        const after = allGroups.slice(insertAfter + 1);
        return [...before, ...extraGroups, ...after];
      }

      // 如果找不到，就放在最前面
      return [...extraGroups, ...allGroups];
    })();

    const orderKeys = Array.isArray(options.proxyGroupOrder)
      ? options.proxyGroupOrder
          .filter((k) => typeof k === "string")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    if (orderKeys.length === 0) {
      return mergedGroups;
    }

    const moduleNameToKey = new Map<string, string>();
    for (const mod of PROXY_GROUP_MODULES) {
      const resolvedName = resolveProxyGroupModuleName(mod, proxyGroupNameOverrides?.[mod.id]);
      moduleNameToKey.set(resolvedName, `module:${mod.id}`);
    }

    const customNameToKey = new Map<string, string>();
    for (const g of activeCustomProxyGroups) {
      const name = typeof g.name === "string" ? g.name.trim() : "";
      if (!name) continue;
      customNameToKey.set(name, `custom:${g.id}`);
    }

    const dialerNameToKey = new Map<string, string>();
    for (const g of sanitizedDialerProxyGroups) {
      const name = typeof g.name === "string" ? g.name.trim() : "";
      if (!name) continue;
      dialerNameToKey.set(name, `dialer:${g.id}`);
    }

    const getKeyByName = (name: string) => {
      return (
        dialerNameToKey.get(name) ||
        customNameToKey.get(name) ||
        moduleNameToKey.get(name) ||
        `name:${name}`
      );
    };

    const byKey = new Map<string, ProxyGroup>();
    const defaultKeys: string[] = [];
    for (const g of mergedGroups) {
      const key = getKeyByName(g.name);
      defaultKeys.push(key);
      byKey.set(key, g);
    }

    const nextKeys: string[] = [];
    const used = new Set<string>();
    for (const key of orderKeys) {
      if (used.has(key)) continue;
      const group = byKey.get(key);
      if (!group) continue;
      used.add(key);
      nextKeys.push(key);
    }
    for (const key of defaultKeys) {
      if (used.has(key)) continue;
      used.add(key);
      nextKeys.push(key);
    }

    return nextKeys.map((key) => byKey.get(key)).filter(Boolean) as ProxyGroup[];
  })();

  const availablePolicyTargets = withBuiltinPolicyTargets([
    ...proxyGroups.map((group) => group.name),
    ...outputNodes.filter((node) => !isSubscriptionInfoNodeName(node.name)).map((node) => node.name),
  ]);
  const fallbackPolicyTarget = chooseFallbackPolicyTarget(
    [
      proxyGroups[0]?.name,
      outputNodes.find((node) => !isSubscriptionInfoNodeName(node.name))?.name,
      "DIRECT",
    ],
    availablePolicyTargets
  );
  const resolvedListeners = (() => {
    // 分组监听：给"已存在的策略组"绑定 inbound 端口；端口在节点监听与 mixed-port 之间去重。
    const groupListenerEntries = (() => {
      const list = Array.isArray(options.groupListeners) ? options.groupListeners : [];
      if (list.length === 0) return [] as Array<Record<string, unknown>>;

      const validTargets = new Set(availablePolicyTargets);
      const usedPorts = new Set<number>(Array.isArray(listeners) ? listeners.map((l) => l.port) : []);
      if (typeof config.mixedPort === "number" && Number.isInteger(config.mixedPort)) {
        usedPorts.add(config.mixedPort);
      }
      const usedNames = new Set<string>(Array.isArray(listeners) ? listeners.map((l) => l.name) : []);
      const usedTargets = new Set<string>();

      const out: Array<Record<string, unknown>> = [];
      let autoIndex = 0;
      for (const binding of list) {
        if (!binding || typeof binding !== "object") continue;

        const target = typeof binding.target === "string" ? binding.target.trim() : "";
        if (!target || !validTargets.has(target)) continue;
        // 一组一端口：同 target 重复绑定只取首条
        if (usedTargets.has(target)) continue;

        const port = binding.port;
        if (typeof port !== "number" || !Number.isInteger(port)) continue;
        if (port < 1 || port > 65535) continue;
        if (usedPorts.has(port)) continue;
        usedPorts.add(port);
        usedTargets.add(target);

        let name = `group-in-${autoIndex++}`;
        while (usedNames.has(name)) name = `group-in-${autoIndex++}`;
        usedNames.add(name);

        out.push({ name, type: "mixed", listen: "0.0.0.0", port, proxy: target, udp: true });
      }
      return out;
    })();

    const generatedListeners: Array<Record<string, unknown>> = [
      ...(Array.isArray(listeners) ? (listeners as Array<Record<string, unknown>>) : []),
      ...groupListenerEntries,
    ];

    if (generatedListeners.length === 0) return baseTopLevelPatch.listeners;
    if (baseTopLevelPatch.listeners === undefined) return generatedListeners;
    if (Array.isArray(baseTopLevelPatch.listeners)) return [...baseTopLevelPatch.listeners, ...generatedListeners];
    throw new BaseConfigYamlError("基础和 DNS 配置中的 listeners 必须是数组，才能与节点监听端口合并。");
  })();

  const mergedProxyProviders = (() => {
    const baseProxyProviders = baseTopLevelPatch["proxy-providers"];
    if (!resolvedProxyProviders) return baseProxyProviders;
    if (baseProxyProviders === undefined) return resolvedProxyProviders;
    if (isPlainObject(baseProxyProviders)) return { ...baseProxyProviders, ...resolvedProxyProviders };
    throw new BaseConfigYamlError("基础和 DNS 配置中的 proxy-providers 必须是对象，才能与 URL 源 proxy-providers 合并。");
  })();

  // 生成配置
  const clashConfig: Record<string, unknown> = {
    // 基础配置 patch：显式 YAML 按用户输入透传；未传入 YAML 时补默认基础段。
    ...baseTopLevelPatch,

    ...(resolvedListeners !== undefined ? { listeners: resolvedListeners } : {}),
    
    // 代理节点
    proxies: outputNodes,

    ...(mergedProxyProviders !== undefined ? { "proxy-providers": mergedProxyProviders } : {}),
    
    // 代理组（按顺序：节点选择→自动选择→中转组→广告→服务→直连→非中国→漏网之鱼）
    "proxy-groups": proxyGroups,
    
    // 规则提供者（包含自定义分流组的规则）
    "rule-providers": {
      ...generateRuleProviders(generateOpts),
    },
    
    // 规则（包含自定义分流组的规则）
    rules: generateRules({
      ...generateOpts,
      customRules: config.customRules,
      ruleOrder: config.ruleOrder,
      availablePolicyTargets,
      fallbackPolicyTarget,
    }),
  };

  return clashConfig as unknown as ClashConfig;
}

/**
 * 生成配置并返回 YAML 字符串
 */
export function generateClashYaml(options: GenerateOptions): string {
  const config = generateClashConfig(options);
  return configToYaml(config);
}

export {
  PROXY_GROUP_MODULES,
  DEFAULT_DNS_CONFIG,
  generateProxyGroups,
  generateRules,
  generateRuleProviders,
  generateDialerProxyGroups,
  applyDialerProxy,
  configToYaml,
};
