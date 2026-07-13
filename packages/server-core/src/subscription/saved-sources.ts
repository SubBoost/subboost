import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import {
  hasSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  type SubscriptionUserInfo,
} from "@subboost/core/subscription/subscription-userinfo";

export type SavedSourceType = "url" | "yaml" | "nodes";

export type SavedSource = {
  id: string;
  type: SavedSourceType;
  content: string;
  useProxyProviders?: boolean;
  providerKey?: string;
  providerMode?: "grouped" | "inline" | "bare";
  providerGroupName?: string;
  providerFilter?: string;
  userinfoUrl?: string;
  userinfoUserAgent?: string;
  subscriptionUserInfo?: SubscriptionUserInfo;
  tag?: string;
  nameTemplate?: string;
  lastParsedContent?: string;
  lastParsedTag?: string;
  lastParsedNameTemplate?: string;
};

export type NormalizeSavedSourcesForPersistenceOptions = {
  fallbackUrls?: readonly unknown[];
  idFactory?: () => string;
  splitUrlLines?: boolean;
};

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeUrlContent(value: string): string {
  return tryNormalizeSubscriptionUrlInput(value) ?? value;
}

function normalizeSavedSourceUserInfo(value: unknown): SubscriptionUserInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const normalized = normalizeSubscriptionUserInfo(value as SubscriptionUserInfo);
  return hasSubscriptionUserInfo(normalized) ? normalized : undefined;
}

export function normalizeSavedSourcesForPersistence(
  rawSources: unknown,
  options: NormalizeSavedSourcesForPersistenceOptions = {}
): SavedSource[] {
  const out: SavedSource[] = [];
  const usedIds = new Set<string>();
  let fallbackIndex = 0;

  const nextGeneratedId = (): string => toTrimmedString(options.idFactory?.()) ?? `source_${++fallbackIndex}`;

  const nextId = (preferred?: string): string => {
    const base = toTrimmedString(preferred) ?? nextGeneratedId();
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }

    let i = 2;
    let candidate = `${base}-${i}`;
    while (usedIds.has(candidate)) {
      i += 1;
      candidate = `${base}-${i}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const buildSource = (
    record: Record<string, unknown>,
    type: SavedSourceType,
    content: string,
    preferredId?: string
  ): SavedSource => {
    const userinfoUrl = toTrimmedString(record.userinfoUrl);
    const userinfoUserAgent = toTrimmedString(record.userinfoUserAgent);
    const subscriptionUserInfo = normalizeSavedSourceUserInfo(record.subscriptionUserInfo);
    const tag = toTrimmedString(record.tag);
    const nameTemplate = toTrimmedString(record.nameTemplate);
    const lastParsedContent = toTrimmedString(record.lastParsedContent);
    const lastParsedTag = toTrimmedString(record.lastParsedTag);
    const lastParsedNameTemplate = toTrimmedString(record.lastParsedNameTemplate);
    const providerKey = toTrimmedString(record.providerKey);
    const providerMode =
      record.providerMode === "grouped" || record.providerMode === "inline" || record.providerMode === "bare"
        ? record.providerMode
        : undefined;
    const providerGroupName = toTrimmedString(record.providerGroupName);
    // providerFilter 保留空串（空串=显式不过滤，与"未设置走默认正则"区分），不能 trim
    const providerFilter = typeof record.providerFilter === "string" ? record.providerFilter : undefined;

    return {
      id: nextId(preferredId),
      type,
      content: type === "url" ? normalizeUrlContent(content) : content,
      ...(type === "url" && record.useProxyProviders === true ? { useProxyProviders: true } : {}),
      ...(type === "url" && providerKey ? { providerKey } : {}),
      ...(type === "url" && providerMode ? { providerMode } : {}),
      ...(type === "url" && providerGroupName ? { providerGroupName } : {}),
      ...(type === "url" && providerFilter !== undefined ? { providerFilter } : {}),
      ...(type === "url" && userinfoUrl ? { userinfoUrl: normalizeUrlContent(userinfoUrl) } : {}),
      ...(type === "url" && userinfoUserAgent ? { userinfoUserAgent } : {}),
      ...(subscriptionUserInfo ? { subscriptionUserInfo } : {}),
      ...(tag ? { tag } : {}),
      ...(nameTemplate ? { nameTemplate } : {}),
      ...(lastParsedContent
        ? { lastParsedContent: type === "url" ? normalizeUrlContent(lastParsedContent) : lastParsedContent }
        : {}),
      ...(lastParsedTag ? { lastParsedTag } : {}),
      ...(lastParsedNameTemplate ? { lastParsedNameTemplate } : {}),
    };
  };

  if (Array.isArray(rawSources)) {
    for (const item of rawSources) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const type = record.type;
      const content = toTrimmedString(record.content);
      if ((type !== "url" && type !== "yaml" && type !== "nodes") || !content) continue;

      const preferredId = toTrimmedString(record.id);
      if (type === "url" && options.splitUrlLines) {
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          out.push(buildSource(record, type, line, preferredId));
        }
        continue;
      }

      out.push(buildSource(record, type, content, preferredId));
    }
  }

  if (out.length > 0) return out;

  for (const rawUrl of options.fallbackUrls ?? []) {
    const content = toTrimmedString(rawUrl);
    if (!content) continue;
    const normalized = normalizeUrlContent(content);
    out.push({
      id: nextId(undefined),
      type: "url",
      content: normalized,
      lastParsedContent: normalized,
    });
  }

  return out;
}
