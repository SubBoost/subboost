import { generateClashYaml } from "@subboost/core/generator";
import {
  buildGenerateOptionsFromConfig,
  getEffectiveTestOptions,
} from "@subboost/core/subscription/config-utils";
import { buildProxyProvidersFromConfig } from "@subboost/core/subscription/proxy-providers";
import { resolveNodeNameFilter } from "@subboost/core/subscription/node-name-filter";
import { reconcileNodeNameReferences } from "@subboost/core/subscription/node-name-references";
import type { ParsedNode } from "@subboost/core/types/node";
import type { SubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";
import type { RefreshNodeSnapshotResult } from "./refresh-node-snapshot";

export type RefreshCacheFailureReason =
  | "all_sources_failed"
  | "empty_result"
  | "node_quota_exceeded";

export type RefreshCacheEntry = {
  nodes: ParsedNode[];
  subscriptionInfo: SubscriptionResponseInfo;
  generatedYaml: string;
};

export type PreparedRefreshCacheResult =
  | {
      ok: true;
      cacheEntry: RefreshCacheEntry;
      refreshedConfig: Record<string, unknown>;
      generatedYaml: string;
      nodeCount: number;
      proxyProviders?: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: RefreshCacheFailureReason;
      proxyProviders?: Record<string, unknown>;
      nodeCount: number;
      maxNodesPerSubscription?: number;
    };

export function prepareRefreshCacheResult(params: {
  config: Record<string, unknown>;
  snapshot: RefreshNodeSnapshotResult;
  maxNodesPerSubscription: number;
  proxyProviders?: Record<string, unknown>;
}): PreparedRefreshCacheResult {
  const { testUrl, testInterval } = getEffectiveTestOptions(params.config);
  const proxyProviders =
    params.proxyProviders ??
    buildProxyProvidersFromConfig(params.config, {
      testUrl,
      testInterval,
    });
  const hasProxyProviders = Boolean(
    proxyProviders && Object.keys(proxyProviders).length > 0
  );
  const common = {
    proxyProviders,
    nodeCount: params.snapshot.nodes.length,
  };
  const nodeNameFilterResult = resolveNodeNameFilter(
    params.snapshot.nodes,
    params.config.nodeNameFilter
  );

  if (params.snapshot.refreshableSourceCount > 0 && params.snapshot.refreshedSourceCount === 0) {
    return {
      ok: false,
      reason: "all_sources_failed",
      ...common,
    };
  }

  if (params.snapshot.nodes.length > params.maxNodesPerSubscription) {
    return {
      ok: false,
      reason: "node_quota_exceeded",
      maxNodesPerSubscription: params.maxNodesPerSubscription,
      ...common,
    };
  }

  if (nodeNameFilterResult.effectiveCount === 0 && !hasProxyProviders) {
    return {
      ok: false,
      reason: "empty_result",
      ...common,
    };
  }

  const refreshedConfig = reconcileNodeNameReferences(
    {
      ...params.config,
      sources: params.snapshot.savedSources,
    },
    {
      nodes: params.snapshot.nodes,
      renameMap: params.snapshot.renameMap,
    }
  );

  const generatedYaml = generateClashYaml(
    buildGenerateOptionsFromConfig(refreshedConfig, {
      nodes: params.snapshot.nodes,
      proxyProviders,
    })
  );

  return {
    ok: true,
    ...common,
    refreshedConfig,
    generatedYaml,
    cacheEntry: {
      nodes: params.snapshot.nodes,
      subscriptionInfo: params.snapshot.subscriptionInfo,
      generatedYaml,
    },
  };
}
