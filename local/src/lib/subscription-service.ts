import { randomBytes, randomUUID } from "node:crypto";
import { generateClashYaml } from "@subboost/core/generator";
import { buildGenerateOptionsFromConfig, getEffectiveTestOptions } from "@subboost/core/subscription/config-utils";
import { buildProxyProvidersFromConfig } from "@subboost/core/subscription/proxy-providers";
import type { SubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";
import type { ParsedNode } from "@subboost/core/types/node";
import {
  buildManualRefreshFailureResponse,
  buildManualRefreshSuccessResponseBody,
  normalizeSubscriptionConfigForPersistence,
  normalizeSubscriptionInfoForPersistence,
  normalizeSubscriptionName,
  normalizeSubscriptionNodeList,
  normalizeSubscriptionUrlList,
  prepareRefreshCacheResult,
  refreshNodeSnapshot,
  serializeSubscriptionDetailData,
  serializeSubscriptionSummaryData,
  type SavedSource,
  type RefreshNodeSnapshotResult,
} from "@subboost/server-core/subscription";
import { decryptJson, decryptJsonObject, encryptJson } from "./crypto";
import { getAppUrl } from "./env";
import { prisma } from "./prisma";
import { fetchSourceUserInfoHeadersDirect, importSourceUrlDirect } from "./source-import";
import { normalizeLocalAutoUpdateIntervalSeconds } from "./auto-update-policy";

export const MAX_NODES_PER_SUBSCRIPTION = 10000;
export const CACHE_TTL_SECONDS = 3600;

export type SubscriptionRow = {
  id: string;
  ownerId: string;
  name: string;
  token: string;
  isPrimary: boolean;
  encryptedUrls: string;
  encryptedNodes: string;
  encryptedConfig: string;
  encryptedSubscriptionInfo: string | null;
  autoUpdateInterval: number | null;
  cacheExpiresAt: Date | null;
  lastAccessedAt: Date | null;
  lastUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  autoUpdateState?: {
    externalFailureCount: number;
    failureSourceState: string | null;
    lastFailedAt: Date | null;
    lastAttemptedAt: Date | null;
    disabledAt: Date | null;
    disabledReason: string | null;
    disabledPreviousInterval: number | null;
  } | null;
};

export type SubscriptionSummary = {
  id: string;
  name: string;
  token: string;
  subscriptionUrl: string;
  nodeCount: number;
  sourceCount: number;
  yamlUrl: string;
  isPrimary: boolean;
  autoUpdateInterval: number | null;
  smartNodeMatchingEnabled: boolean;
  cacheExpiresAt: string | null;
  lastAccessedAt: string | null;
  lastUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  autoUpdateState: {
    externalFailureCount: number;
    lastFailedAt: string | null;
    lastAttemptedAt: string | null;
    disabledAt: string | null;
    disabledReason: string | null;
    disabledPreviousInterval: number | null;
  };
};

export type SubscriptionDetail = SubscriptionSummary & {
  urls: string[];
  nodes: ParsedNode[];
  config: Record<string, unknown>;
  subscriptionInfo: Record<string, unknown>;
};

export type GeneratedSubscriptionYaml = {
  yaml: string;
  name: string;
  subscriptionInfo: SubscriptionResponseInfo;
  cacheExpirySeconds: number;
  autoUpdateIntervalSeconds: number | null;
  isAdmin: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildLocalSubscriptionUrl(token: string): string {
  return `${getAppUrl()}/api/subscriptions/${token}/config.yaml`;
}

function buildLocalSubscriptionConfig(
  body: Record<string, unknown>,
  existingConfig: Record<string, unknown> = {}
): Record<string, unknown> {
  return normalizeSubscriptionConfigForPersistence(
    {
      config: body.config,
      smartNodeMatchingEnabled: body.smartNodeMatchingEnabled,
    },
    {
      existingConfig,
      idFactory: randomUUID,
      splitUrlLines: true,
      mergeExistingConfig: false,
      defaultSmartNodeMatchingEnabled: true,
    }
  );
}

export function generateLocalSubscriptionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function readSubscriptionSecrets(row: SubscriptionRow) {
  return {
    urls: decryptJson<string[]>(row.encryptedUrls, []),
    nodes: decryptJson<ParsedNode[]>(row.encryptedNodes, []),
    config: decryptJsonObject(row.encryptedConfig),
    subscriptionInfo:
      normalizeSubscriptionInfoForPersistence(decryptJson<unknown>(row.encryptedSubscriptionInfo, {})) ?? {},
  };
}

export function formatSubscription(row: SubscriptionRow): SubscriptionSummary {
  const secrets = readSubscriptionSecrets(row);
  const subscriptionUrl = buildLocalSubscriptionUrl(row.token);
  return serializeSubscriptionSummaryData(row, secrets, {
    subscriptionUrl,
    yamlUrl: subscriptionUrl,
    dateMode: "iso",
    includeCounts: true,
    includeFailureSourceState: false,
    includeLastAttemptedAt: true,
  }) as SubscriptionSummary;
}

export function formatSubscriptionDetail(row: SubscriptionRow): SubscriptionDetail {
  const secrets = readSubscriptionSecrets(row);
  const subscriptionUrl = buildLocalSubscriptionUrl(row.token);
  return serializeSubscriptionDetailData(row, secrets, {
    subscriptionUrl,
    yamlUrl: subscriptionUrl,
    dateMode: "iso",
    includeCounts: true,
    includeFailureSourceState: false,
    includeLastAttemptedAt: true,
  }) as SubscriptionDetail;
}

export async function listSubscriptions(ownerId: string): Promise<SubscriptionSummary[]> {
  const rows = await prisma.subscription.findMany({
    where: { ownerId },
    include: { autoUpdateState: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(formatSubscription);
}

export async function createSubscription(ownerId: string, body: unknown): Promise<SubscriptionSummary> {
  if (!isRecord(body)) {
    throw new Error("Invalid request body.");
  }
  const name = normalizeSubscriptionName(body.name);
  if (!name) throw new Error("Subscription name is required.");

  const urls = normalizeSubscriptionUrlList(body.urls);
  const nodes = normalizeSubscriptionNodeList(body.nodes);
  if (urls.length === 0 && nodes.length === 0) throw new Error("At least one URL or node is required.");

  const config = buildLocalSubscriptionConfig(body);
  const autoUpdateInterval = normalizeLocalAutoUpdateIntervalSeconds(body.autoUpdateInterval);
  const subscriptionInfo = normalizeSubscriptionInfoForPersistence(body.subscriptionInfo) ?? {};

  const row = await prisma.subscription.create({
    data: {
      ownerId,
      name,
      token: generateLocalSubscriptionToken(),
      encryptedUrls: encryptJson(urls),
      encryptedNodes: encryptJson(nodes),
      encryptedConfig: encryptJson(config),
      encryptedSubscriptionInfo: encryptJson(subscriptionInfo),
      autoUpdateInterval,
    },
    include: { autoUpdateState: true },
  });
  return formatSubscription(row);
}

export async function updateSubscription(ownerId: string, id: string, body: unknown): Promise<SubscriptionSummary | null> {
  if (!isRecord(body)) throw new Error("Invalid request body.");
  const current = await prisma.subscription.findFirst({ where: { id, ownerId }, include: { autoUpdateState: true } });
  if (!current) return null;

  const currentSecrets = readSubscriptionSecrets(current);
  const name = normalizeSubscriptionName(body.name) || current.name;
  const data: Record<string, unknown> = { name };
  const hasUrls = "urls" in body;
  const hasNodes = "nodes" in body;
  const hasConfig = "config" in body || "smartNodeMatchingEnabled" in body;

  if (hasUrls) {
    data.encryptedUrls = encryptJson(normalizeSubscriptionUrlList(body.urls));
  }
  if (hasNodes) {
    data.encryptedNodes = encryptJson(normalizeSubscriptionNodeList(body.nodes));
  }
  if (hasConfig) {
    const config = buildLocalSubscriptionConfig(body, currentSecrets.config);
    data.encryptedConfig = encryptJson(config);
  }
  if ("subscriptionInfo" in body) {
    data.encryptedSubscriptionInfo = encryptJson(normalizeSubscriptionInfoForPersistence(body.subscriptionInfo) ?? {});
  }

  if (hasUrls || hasNodes || hasConfig) {
    const nextUrls = hasUrls ? normalizeSubscriptionUrlList(body.urls) : currentSecrets.urls;
    const nextNodes = hasNodes ? normalizeSubscriptionNodeList(body.nodes) : currentSecrets.nodes;
    if (nextUrls.length === 0 && nextNodes.length === 0) {
      throw new Error("At least one URL or node is required.");
    }
  }

  if ("autoUpdateInterval" in body) {
    data.autoUpdateInterval = normalizeLocalAutoUpdateIntervalSeconds(body.autoUpdateInterval);
  }

  const row = await prisma.subscription.update({
    where: { id: current.id },
    data,
    include: { autoUpdateState: true },
  });
  return formatSubscription(row);
}

export async function getSubscription(ownerId: string, id: string): Promise<SubscriptionDetail | null> {
  const row = await prisma.subscription.findFirst({
    where: { id, ownerId },
    include: { autoUpdateState: true },
  });
  return row ? formatSubscriptionDetail(row) : null;
}

export async function deleteSubscription(ownerId: string, id: string): Promise<boolean> {
  const row = await prisma.subscription.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!row) return false;
  await prisma.subscription.delete({ where: { id: row.id } });
  return true;
}

export function buildSubscriptionFetchCallbacks() {
  return {
    fetchUrlNodes: async (source: SavedSource) => {
      const imported = await importSourceUrlDirect({
        url: source.content,
        ...(source.userinfoUrl ? { userinfoUrl: source.userinfoUrl } : {}),
        ...(source.userinfoUserAgent ? { userinfoUserAgent: source.userinfoUserAgent } : {}),
      });
      if (imported.ok) {
        return {
          ok: true,
          nodes: imported.parsedNodes,
          errors: imported.parseErrors,
          headers: imported.headers,
        };
      }
      return {
        ok: false,
        nodes: [],
        responseStatus: imported.responseStatus,
        error: imported.error,
        errorInfo: imported.errorInfo,
        publicReason: imported.publicReason ?? undefined,
      };
    },
    fetchUrlUserInfo: async (source: SavedSource) => {
      return fetchSourceUserInfoHeadersDirect(source);
    },
  };
}

export function buildSubscriptionCacheExpiry(from: Date): Date {
  return new Date(from.getTime() + CACHE_TTL_SECONDS * 1000);
}

async function persistRefreshSuccess(params: {
  subscriptionId: string;
  snapshot: RefreshNodeSnapshotResult;
  config: Record<string, unknown>;
  cachedAt: Date;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: params.subscriptionId },
      data: {
        encryptedNodes: encryptJson(params.snapshot.nodes),
        encryptedConfig: encryptJson({ ...params.config, sources: params.snapshot.savedSources }),
        encryptedSubscriptionInfo: encryptJson(params.snapshot.subscriptionInfo),
        lastUpdatedAt: params.cachedAt,
        cacheExpiresAt: buildSubscriptionCacheExpiry(params.cachedAt),
      },
    });
    await tx.subscriptionAutoUpdateState.upsert({
      where: { subscriptionId: params.subscriptionId },
      create: { subscriptionId: params.subscriptionId },
      update: {
        externalFailureCount: 0,
        failureSourceState: null,
        lastFailedAt: null,
        lastAttemptedAt: null,
        disabledAt: null,
        disabledReason: null,
        disabledPreviousInterval: null,
      },
    });
  });
}

export async function refreshSubscription(ownerId: string, id: string) {
  const row = await prisma.subscription.findFirst({ where: { id, ownerId }, include: { autoUpdateState: true } });
  if (!row) return null;

  const secrets = readSubscriptionSecrets(row);
  const snapshot = await refreshNodeSnapshot({
    config: secrets.config,
    urls: secrets.urls,
    storedNodes: secrets.nodes,
    ...buildSubscriptionFetchCallbacks(),
  });
  const refreshResult = prepareRefreshCacheResult({
    config: secrets.config,
    snapshot,
    maxNodesPerSubscription: MAX_NODES_PER_SUBSCRIPTION,
  });

  if (!refreshResult.ok) {
    return {
      ok: false as const,
      response: buildManualRefreshFailureResponse({
        refreshResult,
        maxNodesPerSubscription: MAX_NODES_PER_SUBSCRIPTION,
      }),
    };
  }

  const cachedAt = new Date();
  await persistRefreshSuccess({ subscriptionId: row.id, snapshot, config: secrets.config, cachedAt });
  return {
    ok: true as const,
    body: buildManualRefreshSuccessResponseBody({
      subscriptionId: row.id,
      refreshResult,
      snapshot,
      cachedAt,
    }),
  };
}

export async function generateSubscriptionYaml(token: string): Promise<GeneratedSubscriptionYaml | null> {
  const row = await prisma.subscription.findUnique({ where: { token }, include: { autoUpdateState: true } });
  if (!row) return null;
  const secrets = readSubscriptionSecrets(row);
  const { testUrl, testInterval } = getEffectiveTestOptions(secrets.config);
  const proxyProviders = buildProxyProvidersFromConfig(secrets.config, { testUrl, testInterval });
  if (secrets.nodes.length === 0 && !proxyProviders) return null;
  const yaml = generateClashYaml(
    buildGenerateOptionsFromConfig(secrets.config, {
      nodes: secrets.nodes,
      proxyProviders,
    })
  );
  await prisma.subscription.update({ where: { id: row.id }, data: { lastAccessedAt: new Date() } });
  return {
    yaml,
    name: row.name,
    subscriptionInfo: secrets.subscriptionInfo,
    cacheExpirySeconds: CACHE_TTL_SECONDS,
    autoUpdateIntervalSeconds: row.autoUpdateInterval,
    isAdmin: true,
  };
}
