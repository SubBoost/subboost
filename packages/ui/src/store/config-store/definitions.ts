import type { ParsedNode, ParseResult } from "@subboost/core/types/node";
import type {
  BuiltinRuleEdits,
  CustomProxyGroup,
  CustomRule,
  CustomRuleSet,
  GroupListenerBinding,
  ProxyGroupAdvancedConfig,
  TemplateType,
} from "@subboost/core/types/config";
import { DEFAULT_BASE_CONFIG_YAML, DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import { getBuiltinTemplateId } from "@subboost/core/templates/builtin";
import { TEMPLATES } from "@subboost/core/templates";
import type { DialerProxyGroup, SubBoostTemplateConfig } from "@subboost/core/types/template-config";
import {
  isSubscriptionImportError,
  type SubscriptionImportErrorInfo,
} from "@subboost/core/subscription/import-error";
import type { SubscriptionUserInfo } from "@subboost/core/subscription/subscription-userinfo";
import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import { getActiveProductApiAdapter } from "@subboost/ui/product/api-adapter";
import {
  getNodeSourceIds,
  makeUniqueName,
  ORIGIN_NAME_KEY,
  SOURCE_IDS_KEY,
  withNodeSourceId,
  withoutNodeSourceIds,
  withUniqueNodeNames,
} from "@subboost/core/subscription/node-source-state";

export { DEFAULT_BASE_CONFIG_YAML };
export type RuleSetDraft = Omit<CustomRuleSet, "target">;
export type { BuiltinRuleEdits, CustomRuleSet, ProxyGroupAdvancedConfig };
export type { DialerProxyGroup, SubBoostTemplateConfig } from "@subboost/core/types/template-config";

// 预设的中转组名称
export const PRESET_RELAY_NAMES = [
  "🇺🇸 美国中转",
  "🇭🇰 香港中转",
  "🇯🇵 日本中转",
  "🇸🇬 新加坡中转",
  "🇰🇷 韩国中转",
  "🇹🇼 台湾中转",
];

// 订阅源类型
export type SourceType = "url" | "yaml" | "nodes";

export interface SubscriptionSource {
  id: string;
  type: SourceType;
  content: string;
  name?: string;
  // 上一次成功导入时的输入内容（用于判断是否更换 url 等）
  lastParsedContent?: string;
  // 上一次成功导入时使用的标签/模板（用于判断是否为“用户手动改名”）
  lastParsedTag?: string;
  lastParsedNameTemplate?: string;
  // 用于区分不同机场/来源的标签（不直接参与匹配，仅用于生成节点显示名）
  tag?: string;
  // 节点命名模板：支持 {tag} / {name}
  nameTemplate?: string;
  // URL 源使用 proxy-providers 模式：不在 SubBoost 内拉取/解析节点，仅在最终配置中写入 proxy-providers 供客户端拉取
  useProxyProviders?: boolean;
  // proxy-providers 的自定义 key（留空用默认 url_<源id>）
  providerKey?: string;
  // provider 接入方式：grouped=生成机场组挂入节点选择（UI 默认）；inline=直接 use 注入所有策略组（旧行为，
  // 旧数据无此字段时按 inline 兼容）；bare=仅生成 proxy-providers 不挂接
  providerMode?: "grouped" | "inline" | "bare";
  // 机场组名（仅 grouped 模式生效；emoji 拼在组名前缀，留空回落为 "✈️ <key>"）
  providerGroupName?: string;
  // provider 节点过滤正则（mihomo proxy-providers filter）；未设置时生成默认正则，显式清空则不写 filter
  providerFilter?: string;
  // 独立的流量/到期元信息 URL（可选）
  userinfoUrl?: string;
  // 获取流量/到期元信息时使用的自定义 User-Agent（可选）
  userinfoUserAgent?: string;
  // 导入状态
  parsed?: boolean;
  parsing?: boolean;
  nodeCount?: number;
  subscriptionUserInfo?: SubscriptionUserInfo;
  error?: string;
  errorInfo?: SubscriptionImportErrorInfo;
}

// 重新导出类型供其他模块使用
export type { CustomProxyGroup };

export async function fetchUrlContentInBrowser(
  url: string,
  options?: { userinfoUrl?: string; userinfoUserAgent?: string }
): Promise<{
  content: string;
  headers: Record<string, string>;
  parseResult?: ParseResult;
}> {
  const normalizedUrl = tryNormalizeSubscriptionUrlInput(url);
  if (!normalizedUrl) {
    throw new Error("无效的 url 格式");
  }
  const parsed = new URL(normalizedUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只支持 HTTP/HTTPS url");
  }

  const normalizedUserinfoUrl = options?.userinfoUrl
    ? tryNormalizeSubscriptionUrlInput(options.userinfoUrl)
    : null;
  if (options?.userinfoUrl && !normalizedUserinfoUrl) {
    throw new Error("无效的流量信息 url 格式");
  }

  try {
    const sourceImport = getActiveProductApiAdapter().sourceImport;
    if (!sourceImport) {
      throw new Error("当前应用未配置 URL 导入服务");
    }

    const data = await sourceImport.importSource({
      url: normalizedUrl,
      ...(normalizedUserinfoUrl ? { userinfoUrl: normalizedUserinfoUrl } : {}),
      ...(typeof options?.userinfoUserAgent === "string" && options.userinfoUserAgent.trim()
        ? { userinfoUserAgent: options.userinfoUserAgent.trim() }
        : {}),
    });

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.headers || {})) {
      if (!key || typeof value !== "string") continue;
      const k = key.toLowerCase().trim();
      if (k) headers[k] = value;
    }

    const parsedNodes = Array.isArray(data.parseResult?.nodes)
      ? data.parseResult.nodes.filter((item) => item && typeof item === "object")
      : null;
    const parseErrors = Array.isArray(data.parseResult?.errors)
      ? data.parseResult.errors.filter((item): item is string => typeof item === "string")
      : [];

    return {
      content: data.content,
      headers,
      parseResult: parsedNodes
        ? {
            nodes: parsedNodes,
            errors: parseErrors,
            totalParsed: parsedNodes.length,
            totalFailed: parseErrors.length,
          }
        : undefined,
    };
  } catch (error) {
    if (isSubscriptionImportError(error)) {
      throw error;
    }
    throw new Error(error instanceof Error ? error.message : "获取 url 失败");
  }
}

export interface ConfigState {
  // 节点相关
  nodes: ParsedNode[];
  deletedNodeNames: string[];
  deletedNodes: Array<{
    originName: string;
    name: string;
    node?: ParsedNode;
    listenerPort?: number;
    dialerRelayGroupIds?: string[];
    dialerTargetGroupIds?: string[];
  }>;
  parseErrors: string[];
  isLoading: boolean;

  // 订阅源
  sources: SubscriptionSource[];

  // 配置选项
  template: TemplateType;
  enabledProxyGroups: string[];
  hiddenProxyGroups: string[]; // 隐藏的内置代理组（仅影响 UI，不参与生成）
  customProxyGroups: CustomProxyGroup[]; // 自定义分流组
  proxyGroupAdvanced: Record<string, ProxyGroupAdvancedConfig>; // 内置分流组高级筛选/排序配置
  proxyGroupAdvancedModeEnabled: boolean; // 分流组高级模式 UI 开关
  customRuleSets: CustomRuleSet[]; // 用户新增规则集，统一进入自定义规则块
  builtinRuleEdits: BuiltinRuleEdits; // 内置规则的目标覆盖或禁用状态
  customRules: CustomRule[];
  dialerProxyGroups: DialerProxyGroup[];

  // 分流代理组名称覆盖（仅影响显示与生成输出）
  proxyGroupNameOverrides: Record<string, string>;

  // 代理组顺序（影响 Clash 客户端中的展示顺序；由可视化预览拖拽维护）
  // Key 格式：module:<id> / custom:<id> / dialer:<id>
  proxyGroupOrder: string[];

  // 用户可编辑规则窗口顺序
  // Key 格式：custom-rule:<id> / custom-rule-set:<id> / module:<moduleId>:<ruleId> / special:<id>
  ruleOrder: string[];

  // 当前配置是否已确认过“编辑预设规则”风险提示；只影响 UI，不参与生成。
  moduleRuleEditWarningAccepted: boolean;

  // 当前“使用中的模板来源”（用于统计模板使用次数）
  appliedTemplateId: string | null;

  // DNS 配置 (YAML 文本)
  dnsYaml: string;

  // 其他设置
  mixedPort: number;
  allowLan: boolean;
  testUrl: string;
  testInterval: number;
  ruleProviderBaseUrl: string;
  cnIpNoResolve: boolean;
  experimentalCnUseCnRuleSet: boolean;

  // 节点监听端口（用于生成 listeners）
  listenerPorts: Record<string, number>;

  // 分组监听：给已存在的策略组绑定 inbound 端口（用于生成 listeners）
  groupListeners: GroupListenerBinding[];

  // 生成结果
  generatedYaml: string;
  generatedYamlError: string | null;

  // 历史记录（用于撤销）
  history: string[];
  historyIndex: number;
}

export interface ConfigActions {
  // 订阅源操作
  setSources: (sources: SubscriptionSource[]) => void;

  // 节点操作
  parseContent: (content: string) => void;
  parseMultipleSources: (sources: SubscriptionSource[]) => Promise<void>;
  parseSingleSource: (sourceId: string) => Promise<void>;
  clearNodes: () => void;
  removeNode: (name: string) => void;
  renameNode: (oldName: string, newName: string) => void;
  bulkRenameNodes: (renames: Array<{ oldName: string; newName: string }>) => void;
  restoreNodeName: (nodeName: string) => void;
  restoreDeletedNode: (originName: string) => void;
  moveNode: (nodeName: string, direction: "up" | "down") => void;
  setNodeOrder: (nodeName: string, order: number) => void;

  // 模板和配置
  setTemplate: (template: TemplateType) => void;
  setEnabledProxyGroups: (groups: string[]) => void;
  toggleProxyGroup: (groupId: string) => void;
  hideProxyGroup: (moduleId: string) => void;
  restoreHiddenProxyGroup: (moduleId: string) => void;
  addCustomRule: (rule: CustomRule) => void;
  addCustomRules: (rules: CustomRule[]) => void;
  updateCustomRule: (id: string, rule: Partial<Omit<CustomRule, "id">>) => void;
  removeCustomRule: (index: number) => void;
  setRuleOrder: (order: string[]) => void;

  // 自定义分流组
  addCustomProxyGroup: (group: Omit<CustomProxyGroup, "id">) => void;
  removeCustomProxyGroup: (id: string) => void;
  updateCustomProxyGroup: (id: string, group: Partial<CustomProxyGroup>) => void;

  // 代理组顺序
  setProxyGroupOrder: (order: string[]) => void;

  // 分流组高级配置
  updateProxyGroupAdvanced: (moduleId: string, patch: Partial<ProxyGroupAdvancedConfig>) => void;

  // 规则集与内置规则编辑
  addModuleRules: (moduleId: string, rules: RuleSetDraft[]) => void;
  updateModuleRule: (
    moduleId: string,
    ruleId: string,
    rule: Partial<Omit<RuleSetDraft, "id">>
  ) => void;
  removeModuleRule: (moduleId: string, ruleId: string) => void;
  moveModuleRule: (
    moduleId: string,
    ruleId: string,
    target: { kind: "module" | "custom"; id: string }
  ) => void;
  restoreModuleRule: (moduleId: string, ruleId: string) => void;
  resetModuleRuleTarget: (moduleId: string, ruleId: string) => void;
  restoreModuleDefaultRules: (moduleId: string) => void;
  acceptModuleRuleEditWarning: () => void;

  // 中转代理组（dialer-proxy）
  addDialerProxyGroup: (group: Omit<DialerProxyGroup, "id">) => void;
  removeDialerProxyGroup: (id: string) => void;
  updateDialerProxyGroup: (id: string, group: Partial<DialerProxyGroup>) => void;
  addNodeToDialerGroup: (groupId: string, nodeName: string, isRelay: boolean) => void;
  removeNodeFromDialerGroup: (groupId: string, nodeName: string, isRelay: boolean) => void;

  // DNS
  setDnsYaml: (yaml: string) => void;

  // 其他设置
  setMixedPort: (port: number) => void;
  setAllowLan: (allow: boolean) => void;
  setTestUrl: (url: string) => void;
  setTestInterval: (interval: number) => void;
  setRuleProviderBaseUrl: (url: string) => void;
  setProxyGroupAdvancedModeEnabled: (value: boolean) => void;
  setCnIpNoResolve: (value: boolean) => void;
  setExperimentalCnUseCnRuleSet: (value: boolean) => void;
  setListenerPort: (nodeName: string, port: number | null) => void;
  bulkSetListenerPorts: (patch: Record<string, number | null>) => void;

  // 分组监听
  addGroupListener: (binding?: Partial<Omit<GroupListenerBinding, "id">>) => void;
  updateGroupListener: (id: string, patch: Partial<Omit<GroupListenerBinding, "id">>) => void;
  removeGroupListener: (id: string) => void;

  // 生成配置
  generateConfig: () => string;
  setGeneratedYaml: (yaml: string) => void;

  // 历史操作
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  // 应用模板配置
  applyTemplateConfig: (config: SubBoostTemplateConfig) => void;

  // 分流代理组名称覆盖
  setProxyGroupNameOverride: (moduleId: string, displayName: string) => void;
  clearProxyGroupNameOverride: (moduleId: string) => void;

  // 模板来源标记（用于统计）
  setAppliedTemplateId: (templateId: string | null) => void;

  // 重置
  reset: () => void;
}

export const initialState: ConfigState = {
  nodes: [],
  deletedNodeNames: [],
  deletedNodes: [],
  parseErrors: [],
  isLoading: false,
  sources: [
    { id: "1", type: "url", content: "" },
    { id: "2", type: "yaml", content: "" },
    { id: "3", type: "nodes", content: "" },
  ],
  // 默认选择“精简版”模板
  template: "minimal",
  enabledProxyGroups: TEMPLATES.minimal.groups,
  hiddenProxyGroups: [],
  customProxyGroups: [], // 自定义分流组
  proxyGroupAdvanced: {},
  proxyGroupAdvancedModeEnabled: false,
  customRuleSets: [],
  builtinRuleEdits: {},
  customRules: [],
  dialerProxyGroups: [],
  proxyGroupNameOverrides: {},
  proxyGroupOrder: [],
  ruleOrder: [],
  moduleRuleEditWarningAccepted: false,
  appliedTemplateId: getBuiltinTemplateId("minimal"),
  dnsYaml: DEFAULT_BASE_CONFIG_YAML,
  mixedPort: DEFAULT_SUBBOOST_CONFIG.mixedPort,
  allowLan: DEFAULT_SUBBOOST_CONFIG.allowLan,
  testUrl: DEFAULT_SUBBOOST_CONFIG.testUrl,
  testInterval: DEFAULT_SUBBOOST_CONFIG.testInterval,
  ruleProviderBaseUrl: DEFAULT_SUBBOOST_CONFIG.ruleProviderBaseUrl,
  cnIpNoResolve: DEFAULT_SUBBOOST_CONFIG.cnIpNoResolve,
  experimentalCnUseCnRuleSet: DEFAULT_SUBBOOST_CONFIG.experimentalCnUseCnRuleSet,
  listenerPorts: {},
  groupListeners: [],
  generatedYaml: "",
  generatedYamlError: null,
  history: [],
  historyIndex: -1,
};

export {
  makeUniqueName,
  withUniqueNodeNames,
  ORIGIN_NAME_KEY,
  SOURCE_IDS_KEY,
  getNodeSourceIds,
  withNodeSourceId,
  withoutNodeSourceIds,
};
