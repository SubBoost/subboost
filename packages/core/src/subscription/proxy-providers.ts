import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";

/**
 * 从订阅的结构化配置里提取 proxy-providers（proxy-providers模式）。
 *
 * 注意：
 * - 仅对 sources 里标记 useProxyProviders=true 的 URL 源生效
 * - 不触发任何出站请求
 * - provider key 支持自定义（providerKey），默认 url_<源id>；缓存 path 文件名跟随 key
 *   （文件名安全化，全非法字符回落 url_<源id>，撞名自动 _2 后缀）
 * - filter：providerFilter 未设置时写入默认正则（过滤到期/套餐类信息节点）；显式清空则不写 filter
 * - 接入模式（providerMode）：grouped=生成机场组挂入节点选择；inline=直接 use 注入所有策略组（旧行为，
 *   旧数据无此字段时按 inline 处理保持兼容）；bare=仅生成 proxy-providers 不挂接
 */

export type ProxyProviderAttachmentMode = "grouped" | "inline" | "bare";

export interface ProxyProviderAttachment {
  key: string;
  mode: ProxyProviderAttachmentMode;
  // 仅 grouped 模式生效：机场组名（留空回落为 "✈️ <key>"，emoji 按上游惯例拼在组名前缀）
  groupName?: string;
}

export interface ProxyProviderPlan {
  providers: Record<string, unknown>;
  attachments: ProxyProviderAttachment[];
}

// 机场组默认 emoji（拼进组名前缀，参考上游自定义分组）
export const DEFAULT_PROVIDER_GROUP_EMOJI = "✈️";

// provider 默认节点过滤正则：剔除到期/套餐/官网等信息节点
export const DEFAULT_PROXY_PROVIDER_FILTER = "(?i)^(?!.*(到期时间|套餐到期|官网|更新|到期)).*";

function toFileSafeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeAttachmentMode(value: unknown): ProxyProviderAttachmentMode {
  return value === "grouped" || value === "bare" || value === "inline" ? value : "inline";
}

export function buildProxyProviderPlanFromSources(
  rawSources: unknown[],
  opts: { testUrl: string; testInterval: number }
): ProxyProviderPlan | undefined {
  if (rawSources.length === 0) return undefined;

  const providers: Record<string, unknown> = {};
  const attachments: ProxyProviderAttachment[] = [];
  const usedPathNames = new Set<string>();
  let fallbackIndex = 0;

  for (const raw of rawSources) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type !== "url") continue;
    if (item.useProxyProviders !== true) continue;

    const url =
      typeof item.content === "string"
        ? (tryNormalizeSubscriptionUrlInput(item.content) ?? item.content.trim())
        : "";
    if (!url) continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) continue;

    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    const id = rawId || String(++fallbackIndex);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const defaultKey = `url_${safeId}`;

    const customKey = typeof item.providerKey === "string" ? item.providerKey.trim() : "";
    const key = customKey || defaultKey;
    // key 重复时跳过后者（与旧行为一致）；UI 层负责重复提示
    if (Object.prototype.hasOwnProperty.call(providers, key)) continue;

    // path 文件名与 key 呼应：安全化后跟随 key；全非法字符则回落源 id 默认名；撞名加后缀
    const fileSafeKey = toFileSafeName(key);
    const pathBase = /[a-zA-Z0-9]/.test(fileSafeKey) ? fileSafeKey : defaultKey;
    let pathName = pathBase;
    let pathSuffix = 2;
    while (usedPathNames.has(pathName)) {
      pathName = `${pathBase}_${pathSuffix++}`;
    }
    usedPathNames.add(pathName);

    // filter 三态：未设置→默认正则；显式空串→不写；有值→写
    const rawFilter = typeof item.providerFilter === "string" ? item.providerFilter.trim() : undefined;
    const filter = rawFilter === undefined ? DEFAULT_PROXY_PROVIDER_FILTER : rawFilter;

    providers[key] = {
      type: "http",
      url,
      interval: 43200,
      path: `./proxy_providers/${pathName}.yaml`,
      ...(filter ? { filter } : {}),
      "health-check": {
        enable: true,
        url: opts.testUrl,
        interval: 300,
        timeout: 5000,
        lazy: true,
      },
    };

    const mode = normalizeAttachmentMode(item.providerMode);
    if (mode === "grouped") {
      const rawGroupName = typeof item.providerGroupName === "string" ? item.providerGroupName.trim() : "";
      attachments.push({
        key,
        mode,
        groupName: rawGroupName || `${DEFAULT_PROVIDER_GROUP_EMOJI} ${key}`,
      });
    } else {
      attachments.push({ key, mode });
    }
  }

  if (Object.keys(providers).length === 0) return undefined;
  return { providers, attachments };
}

export function buildProxyProviderPlanFromConfig(
  config: Record<string, unknown>,
  opts: { testUrl: string; testInterval: number }
): ProxyProviderPlan | undefined {
  const rawSources = Array.isArray(config.sources) ? config.sources : [];
  return buildProxyProviderPlanFromSources(rawSources, opts);
}

export function buildProxyProvidersFromConfig(
  config: Record<string, unknown>,
  opts: { testUrl: string; testInterval: number }
): Record<string, unknown> | undefined {
  return buildProxyProviderPlanFromConfig(config, opts)?.providers;
}
