import { createSourceSnapshot } from "@subboost/core/subscription/source-snapshot";
import { parseSubscription } from "@subboost/core/parser";
import { stripImportedNodeControlFields } from "@subboost/core/subscription/imported-node-controls";
import {
  keepOnlyValidNodeSourceIds,
  normalizeNodeOriginName,
} from "@subboost/core/subscription/node-source-state";
import {
  type DeletedNodeDescriptor,
  mergeParsedSourceNodes,
  prepareSourceParsedNodes,
} from "@subboost/core/subscription/source-node-refresh";
import {
  hasSubscriptionUserInfo,
  mergeSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  parseSubscriptionUserInfo,
  resolveSubscriptionUserInfo,
  type SubscriptionUserInfo,
} from "@subboost/core/subscription/subscription-userinfo";
import {
  pickSubscriptionResponseInfoFromHeaders,
  type SubscriptionResponseInfo,
} from "@subboost/core/subscription/subscription-response-info";
import type { SubscriptionImportErrorCategory } from "@subboost/core/subscription/import-error";
import type { ParsedNode } from "@subboost/core/types/node";
import { composeNodeNameRenameMaps } from "@subboost/core/subscription/node-name-references";
import { normalizeSavedSourcesForPersistence, type SavedSource, type SavedSourceType } from "./saved-sources";

type UrlNodeFetchResult = {
  ok: boolean;
  nodes: ParsedNode[];
  sourceConfig?: Record<string, unknown>;
  resolvedHosts?: Record<string, string[]>;
  errors?: string[];
  headers?: Record<string, string>;
  error?: string;
  errorInfo?: {
    category?: SubscriptionImportErrorCategory;
    message?: string;
    detail?: string;
    httpStatus?: number;
  } | null;
  publicReason?: string | null;
  responseStatus?: number;
};

export type RefreshNodeSnapshotFailedSource = {
  id: string;
  type: SavedSourceType;
  content: string;
  errorMessage: string;
  errorCategory?: SubscriptionImportErrorCategory;
  httpStatus?: number;
  publicReason?: string | null;
};

export type RefreshNodeSnapshotOptions = {
  config: Record<string, unknown>;
  urls: string[];
  storedNodes: ParsedNode[];
  resolveHosts?: (config: Record<string, unknown> | undefined) => Promise<Record<string, string[]>>;
  fetchUrlNodes: (source: SavedSource) => Promise<UrlNodeFetchResult>;
  fetchUrlUserInfo?: (source: SavedSource) => Promise<Record<string, string> | undefined>;
};

export type RefreshNodeSnapshotResult = {
  nodes: ParsedNode[];
  renameMap?: ReadonlyMap<string, string>;
  subscriptionInfo: SubscriptionResponseInfo;
  savedSources: SavedSource[];
  attemptedUrlFetch: boolean;
  usedUrlFetch: boolean;
  refreshableSourceCount: number;
  refreshedSourceCount: number;
  refreshedUrlSourceCount: number;
  refreshedStaticSourceCount: number;
  detachedSourceCount: number;
  failedSourceCount: number;
  failedSources: RefreshNodeSnapshotFailedSource[];
};

function getDeletedNodeNames(config: Record<string, unknown>): string[] {
  if (!Array.isArray(config.deletedNodeNames)) return [];
  return (config.deletedNodeNames as unknown[])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDeletedNodes(config: Record<string, unknown>): DeletedNodeDescriptor[] {
  if (!Array.isArray(config.deletedNodes)) return [];
  return (config.deletedNodes as unknown[]).filter(
    (item): item is DeletedNodeDescriptor => Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

export function resolveSmartNodeMatchingEnabled(config: Record<string, unknown>): boolean {
  return config.smartNodeMatchingEnabled !== false;
}

type StableMetadataState = {
  value?: string;
  conflicted: boolean;
};

function mergeStableMetadataValue(state: StableMetadataState, nextValue: string | undefined) {
  if (!nextValue || state.conflicted) return;
  if (!state.value) {
    state.value = nextValue;
    return;
  }
  if (state.value !== nextValue) {
    state.value = undefined;
    state.conflicted = true;
  }
}

export async function refreshNodeSnapshot(
  options: RefreshNodeSnapshotOptions
): Promise<RefreshNodeSnapshotResult> {
  const savedSources = normalizeSavedSourcesForPersistence(options.config.sources, {
    fallbackUrls: options.urls,
  });
  let refreshedSavedSources = savedSources.map((source) => ({ ...source }));
  const validSourceIds = new Set(savedSources.map((source) => source.id));
  const deletedNodeNames = getDeletedNodeNames(options.config);
  const deletedNodes = getDeletedNodes(options.config);
  const smartNodeMatchingEnabled = resolveSmartNodeMatchingEnabled(options.config);

  let currentNodes = options.storedNodes
    .map(stripImportedNodeControlFields)
    .map(normalizeNodeOriginName)
    .map((node) => keepOnlyValidNodeSourceIds(node, validSourceIds))
    .filter(Boolean) as ParsedNode[];

  const subscriptionInfo: SubscriptionResponseInfo = {};
  const profileWebPageUrlState: StableMetadataState = { conflicted: false };
  const planNameState: StableMetadataState = { conflicted: false };
  const attemptedUrlFetch = savedSources.some((source) => source.type === "url");
  let usedUrlFetch = false;
  let refreshableSourceCount = 0;
  let refreshedSourceCount = 0;
  let refreshedUrlSourceCount = 0;
  let refreshedStaticSourceCount = 0;
  const detachedSourceCount = 0;
  let failedSourceCount = 0;
  const failedSources: RefreshNodeSnapshotFailedSource[] = [];
  let renameMap = new Map<string, string>();

  const recordFailedSource = (
    source: SavedSource,
    errorMessage: string,
    extra: {
      errorCategory?: SubscriptionImportErrorCategory;
      httpStatus?: number;
      publicReason?: string | null;
    } = {}
  ) => {
    failedSourceCount += 1;
    failedSources.push({
      id: source.id,
      type: source.type,
      content: source.content,
      errorMessage,
      ...extra,
    });
  };

  const mergeResponseMetadata = (headers?: Record<string, string>) => {
    const responseInfo = pickSubscriptionResponseInfoFromHeaders(headers);
    mergeStableMetadataValue(profileWebPageUrlState, responseInfo.profileWebPageUrl);
    mergeStableMetadataValue(planNameState, responseInfo.planName);
  };

  const updateSourceSubscriptionInfo = (sourceId: string, info: SubscriptionUserInfo | undefined) => {
    const index = refreshedSavedSources.findIndex((source) => source.id === sourceId);
    if (index < 0) return;

    const normalized = normalizeSubscriptionUserInfo(info);
    if (hasSubscriptionUserInfo(normalized)) {
      refreshedSavedSources = refreshedSavedSources.map((source, i) =>
        i === index ? { ...source, subscriptionUserInfo: normalized } : source
      );
      return;
    }

    refreshedSavedSources = refreshedSavedSources.map((source, i) => {
      if (i !== index) return source;
      const next = { ...source };
      delete next.subscriptionUserInfo;
      return next;
    });
  };

  const mergeSourceSubscriptionInfo = (sourceId: string, info: SubscriptionUserInfo | undefined) => {
    updateSourceSubscriptionInfo(sourceId, info);
    const normalized = normalizeSubscriptionUserInfo(info);
    if (hasSubscriptionUserInfo(normalized)) {
      mergeSubscriptionUserInfo(subscriptionInfo, normalized);
    }
  };

  const shouldFetchSupplementalUserInfoForSource = (source: SavedSource): boolean => {
    return Boolean(source.userinfoUrl || source.userinfoUserAgent);
  };

  for (const source of savedSources) {
    refreshableSourceCount += 1;

    if (source.type === "url") {
      let fetched: UrlNodeFetchResult;
      try { fetched = await options.fetchUrlNodes(source); }
      catch (error) { fetched = { ok: false, nodes: [], error: error instanceof Error ? error.message : "获取失败" }; }
      fetched ??= { ok: false, nodes: [], error: "获取失败" };
      const userInfoHeader = fetched.headers?.["subscription-userinfo"];
      const rawUserInfo = userInfoHeader ? parseSubscriptionUserInfo(userInfoHeader) : undefined;
      const resolvedUserInfo = resolveSubscriptionUserInfo(
        rawUserInfo,
        fetched.ok ? fetched.nodes : []
      );
      if (!fetched.ok || fetched.nodes.length === 0) {
        const errorInfo = fetched.errorInfo ?? null;
        const firstParseError =
          Array.isArray(fetched.errors) && typeof fetched.errors[0] === "string"
            ? fetched.errors[0]
            : null;
        const errorMessage =
          errorInfo?.detail ||
          errorInfo?.message ||
          fetched.error ||
          firstParseError ||
          "未解析到可用节点";
        recordFailedSource(source, errorMessage, {
          errorCategory: errorInfo?.category ?? (firstParseError ? "parse" : undefined),
          httpStatus: errorInfo?.httpStatus ?? fetched.responseStatus,
          publicReason: fetched.publicReason ?? null,
        });
        continue;
      }
      mergeResponseMetadata(fetched.headers);
      if (hasSubscriptionUserInfo(resolvedUserInfo)) mergeSubscriptionUserInfo(subscriptionInfo, resolvedUserInfo);
      updateSourceSubscriptionInfo(source.id, resolvedUserInfo);
      const resolvedHosts = fetched.resolvedHosts ?? await options.resolveHosts?.(fetched.sourceConfig);
      refreshedSavedSources = refreshedSavedSources.map(item => item.id === source.id
        ? { ...item, sourceSnapshot: createSourceSnapshot(fetched.nodes, fetched.sourceConfig, fetched.headers, resolvedHosts, source.sourceSnapshot) } : item);

      const parsedNodes = prepareSourceParsedNodes(fetched.nodes, {
        currentTag: source.useProxyProviders ? undefined : source.tag,
        currentNameTemplate: source.useProxyProviders ? undefined : source.nameTemplate,
      });
      const merged = mergeParsedSourceNodes(currentNodes, parsedNodes, deletedNodeNames, {
        sourceId: source.id,
        currentTag: source.useProxyProviders ? undefined : source.tag,
        currentNameTemplate: source.useProxyProviders ? undefined : source.nameTemplate,
        lastTag: source.lastParsedTag,
        lastNameTemplate: source.lastParsedNameTemplate,
        treatAsNewSource: Boolean(
          source.lastParsedContent &&
            source.lastParsedContent.trim() &&
            source.lastParsedContent.trim() !== source.content.trim()
        ),
        smartNodeMatchingEnabled,
        deletedNodes,
      });

      renameMap = composeNodeNameRenameMaps(renameMap, merged.renameMap);
      currentNodes = merged.nodes;
      usedUrlFetch = true;
      refreshedSourceCount += 1;
      refreshedUrlSourceCount += 1;
      continue;
    }

    try {
      const parsed = parseSubscription(source.content);
      const resolvedUserInfo = resolveSubscriptionUserInfo(undefined, parsed.nodes);
      if (hasSubscriptionUserInfo(resolvedUserInfo)) {
        mergeSubscriptionUserInfo(subscriptionInfo, resolvedUserInfo);
      }
      if (parsed.nodes.length === 0) {
        recordFailedSource(source, "未解析到可用节点", { errorCategory: "parse" });
        continue;
      }
      updateSourceSubscriptionInfo(source.id, resolvedUserInfo);
      const resolvedHosts = await options.resolveHosts?.(parsed.sourceConfig);
      refreshedSavedSources = refreshedSavedSources.map(item => item.id === source.id
        ? { ...item, sourceSnapshot: createSourceSnapshot(parsed.nodes, parsed.sourceConfig, undefined, resolvedHosts) } : item);

      const parsedNodes = prepareSourceParsedNodes(parsed.nodes, {
        currentTag: source.useProxyProviders ? undefined : source.tag,
        currentNameTemplate: source.useProxyProviders ? undefined : source.nameTemplate,
      });
      const merged = mergeParsedSourceNodes(currentNodes, parsedNodes, deletedNodeNames, {
        sourceId: source.id,
        currentTag: source.useProxyProviders ? undefined : source.tag,
        currentNameTemplate: source.useProxyProviders ? undefined : source.nameTemplate,
        lastTag: source.lastParsedTag,
        lastNameTemplate: source.lastParsedNameTemplate,
        treatAsNewSource: false,
        smartNodeMatchingEnabled,
        deletedNodes,
      });

      renameMap = composeNodeNameRenameMaps(renameMap, merged.renameMap);
      currentNodes = merged.nodes;
      refreshedSourceCount += 1;
      refreshedStaticSourceCount += 1;
    } catch (error) {
      recordFailedSource(source, error instanceof Error ? error.message : "解析失败", {
        errorCategory: "parse",
      });
    }
  }

  if (
    typeof options.fetchUrlUserInfo === "function" &&
    usedUrlFetch &&
    (
      !hasSubscriptionUserInfo(subscriptionInfo) ||
      savedSources.some((source) => source.type === "url" && shouldFetchSupplementalUserInfoForSource(source))
    )
  ) {
    for (const source of savedSources) {
      if (source.type !== "url" || source.useProxyProviders) continue;
      if (!shouldFetchSupplementalUserInfoForSource(source) && hasSubscriptionUserInfo(subscriptionInfo)) continue;
      const headers = await options.fetchUrlUserInfo(source);
      if (!headers) continue;
      mergeResponseMetadata(headers);
      const header = headers["subscription-userinfo"];
      mergeSourceSubscriptionInfo(
        source.id,
        header ? resolveSubscriptionUserInfo(parseSubscriptionUserInfo(header)) : undefined
      );
    }
  }

  // A failed source retains its successful data and response metadata.
  for (let index = 0; index < refreshedSavedSources.length; index++) {
    const source = refreshedSavedSources[index];
    if (!failedSources.some(failed => failed.id === source.id)) continue;
    if (source.subscriptionUserInfo) mergeSubscriptionUserInfo(subscriptionInfo, source.subscriptionUserInfo);
    mergeResponseMetadata(source.sourceSnapshot?.headers);
    // A closed upstream retains the original successful response. Its hostname
    // aliases still follow normal DNS changes, independently of subscription fetch.
    if (source.sourceSnapshot && options.resolveHosts) {
      const addresses = await options.resolveHosts(source.sourceSnapshot.config).catch(() => ({}));
      refreshedSavedSources[index] = {
        ...source,
        sourceSnapshot: createSourceSnapshot(source.sourceSnapshot.nodes, source.sourceSnapshot.config,
          source.sourceSnapshot.headers, addresses, source.sourceSnapshot),
      };
    }
    if (source.sourceSnapshot && !currentNodes.some(node => {
      const ids = (node as unknown as Record<string, unknown>)._sourceIds;
      return Array.isArray(ids) && ids.includes(source.id);
    })) {
      const prepared = prepareSourceParsedNodes(source.sourceSnapshot.nodes, { currentTag: source.useProxyProviders ? undefined : source.tag, currentNameTemplate: source.useProxyProviders ? undefined : source.nameTemplate });
      currentNodes = mergeParsedSourceNodes(currentNodes, prepared, deletedNodeNames, {
        sourceId: source.id, currentTag: source.useProxyProviders ? undefined : source.tag, currentNameTemplate: source.useProxyProviders ? undefined : source.nameTemplate,
        lastTag: source.lastParsedTag, lastNameTemplate: source.lastParsedNameTemplate,
        treatAsNewSource: false, deletedNodes,
      }).nodes;
    }
  }

  if (!profileWebPageUrlState.conflicted && profileWebPageUrlState.value) {
    subscriptionInfo.profileWebPageUrl = profileWebPageUrlState.value;
  }
  if (!planNameState.conflicted && planNameState.value) {
    subscriptionInfo.planName = planNameState.value;
  }

  return {
    nodes: currentNodes,
    renameMap,
    subscriptionInfo,
    savedSources: refreshedSavedSources,
    attemptedUrlFetch,
    usedUrlFetch,
    refreshableSourceCount,
    refreshedSourceCount,
    refreshedUrlSourceCount,
    refreshedStaticSourceCount,
    detachedSourceCount,
    failedSourceCount,
    failedSources,
  };
}
