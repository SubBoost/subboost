import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import { normalizeSubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";
import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import type { ParsedNode } from "@subboost/core/types/node";
import { resolveSubscriptionAutoUpdateState, type SubscriptionAutoUpdateStateFields } from "./auto-update-state";
import { normalizeSavedSourcesForPersistence, type NormalizeSavedSourcesForPersistenceOptions } from "./saved-sources";
import { resolveSmartNodeMatchingEnabled } from "./refresh-node-snapshot";
import { migrateLegacyConfig } from "@subboost/core/migrations/legacy-config";

export type SubscriptionConfigInput = {
  config?: unknown;
  smartNodeMatchingEnabled?: unknown;
};

export type NormalizeSubscriptionConfigOptions = NormalizeSavedSourcesForPersistenceOptions & {
  existingConfig?: Record<string, unknown>;
  mergeExistingConfig?: boolean;
  defaultSmartNodeMatchingEnabled?: boolean;
};

export type SubscriptionSummaryDataSource = {
  id: string;
  name: string;
  token: string;
  isPrimary: boolean;
  autoUpdateInterval?: number | null;
  autoUpdateState?: Partial<SubscriptionAutoUpdateStateFields> | null;
  lastUpdatedAt?: Date | string | null;
  lastAccessedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  cacheExpiresAt?: Date | string | null;
};

export type SubscriptionSecretsData = {
  urls: string[];
  nodes: unknown[];
  config: Record<string, unknown>;
  subscriptionInfo: Record<string, unknown>;
};

export type SerializeSubscriptionOptions = {
  subscriptionUrl: string;
  dateMode?: "preserve" | "iso";
  yamlUrl?: string;
  includeCounts?: boolean;
  includeFailureSourceState?: boolean;
  includeLastAttemptedAt?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function maybeIso(value: Date | string | null | undefined, mode: "preserve" | "iso") {
  if (value === null || value === undefined) return value ?? null;
  return mode === "iso" && value instanceof Date ? value.toISOString() : value;
}

export function normalizeSubscriptionName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSubscriptionUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => tryNormalizeSubscriptionUrlInput(item) ?? item.trim())
    .filter(Boolean);
}

export function normalizeSubscriptionNodeList(value: unknown): ParsedNode[] {
  return Array.isArray(value) ? stripImportedNodeControlFieldsFromList(value as ParsedNode[]) : [];
}

export function normalizeSubscriptionInfoForPersistence(value: unknown): Record<string, unknown> | null {
  return normalizeSubscriptionResponseInfo(value);
}

export function areSubscriptionUrlListsEquivalent(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = left.slice().sort();
  const b = right.slice().sort();
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function normalizeSubscriptionConfigForPersistence(
  input: SubscriptionConfigInput,
  options: NormalizeSubscriptionConfigOptions = {}
): Record<string, unknown> {
  const existingConfig = options.existingConfig ?? {};
  const submittedConfig = isRecord(input.config) ? input.config : {};
  const baseConfig =
    input.config === undefined
      ? { ...existingConfig }
      : options.mergeExistingConfig === false
        ? { ...submittedConfig }
        : { ...existingConfig, ...submittedConfig };

  if ("sources" in baseConfig || options.fallbackUrls) {
    const sources = normalizeSavedSourcesForPersistence(baseConfig.sources, options);
    if (sources.length > 0) {
      baseConfig.sources = sources;
    } else {
      delete baseConfig.sources;
    }
  }

  if (typeof input.smartNodeMatchingEnabled === "boolean") {
    baseConfig.smartNodeMatchingEnabled = input.smartNodeMatchingEnabled;
  } else if (typeof baseConfig.smartNodeMatchingEnabled !== "boolean" && options.defaultSmartNodeMatchingEnabled !== undefined) {
    baseConfig.smartNodeMatchingEnabled = options.defaultSmartNodeMatchingEnabled;
  }

  return migrateLegacyConfig(baseConfig);
}

export function serializeSubscriptionAutoUpdateState(
  source: { autoUpdateState?: Partial<SubscriptionAutoUpdateStateFields> | null },
  mode: "preserve" | "iso" = "preserve",
  options: { includeFailureSourceState?: boolean; includeLastAttemptedAt?: boolean } = {}
) {
  const state = resolveSubscriptionAutoUpdateState(source);
  return {
    externalFailureCount: state.externalFailureCount,
    ...(options.includeFailureSourceState === false ? {} : { failureSourceState: state.failureSourceState }),
    lastFailedAt: maybeIso(state.lastFailedAt, mode),
    ...(options.includeLastAttemptedAt === false ? {} : { lastAttemptedAt: maybeIso(state.lastAttemptedAt, mode) }),
    disabledAt: maybeIso(state.disabledAt, mode),
    disabledReason: state.disabledReason,
    disabledPreviousInterval: state.disabledPreviousInterval,
  };
}

export function serializeSubscriptionSummaryData(
  subscription: SubscriptionSummaryDataSource,
  secrets: Pick<SubscriptionSecretsData, "config" | "nodes">,
  options: SerializeSubscriptionOptions
) {
  const dateMode = options.dateMode ?? "preserve";
  const sources = Array.isArray(secrets.config.sources) ? secrets.config.sources : [];
  return {
    id: subscription.id,
    name: subscription.name,
    token: subscription.token,
    subscriptionUrl: options.subscriptionUrl,
    ...(options.yamlUrl ? { yamlUrl: options.yamlUrl } : {}),
    ...(options.includeCounts ? { nodeCount: secrets.nodes.length, sourceCount: sources.length } : {}),
    isPrimary: subscription.isPrimary,
    autoUpdateInterval: subscription.autoUpdateInterval ?? null,
    smartNodeMatchingEnabled: resolveSmartNodeMatchingEnabled(secrets.config),
    ...("cacheExpiresAt" in subscription ? { cacheExpiresAt: maybeIso(subscription.cacheExpiresAt, dateMode) } : {}),
    ...("lastAccessedAt" in subscription ? { lastAccessedAt: maybeIso(subscription.lastAccessedAt, dateMode) } : {}),
    ...("lastUpdatedAt" in subscription ? { lastUpdatedAt: maybeIso(subscription.lastUpdatedAt, dateMode) } : {}),
    ...(subscription.createdAt !== undefined ? { createdAt: maybeIso(subscription.createdAt, dateMode) } : {}),
    ...(subscription.updatedAt !== undefined ? { updatedAt: maybeIso(subscription.updatedAt, dateMode) } : {}),
    autoUpdateState: serializeSubscriptionAutoUpdateState(subscription, dateMode, {
      includeFailureSourceState: options.includeFailureSourceState,
      includeLastAttemptedAt: options.includeLastAttemptedAt,
    }),
  };
}

export function serializeSubscriptionDetailData(
  subscription: SubscriptionSummaryDataSource,
  secrets: SubscriptionSecretsData,
  options: SerializeSubscriptionOptions
) {
  return {
    ...serializeSubscriptionSummaryData(subscription, secrets, options),
    urls: secrets.urls,
    nodes: secrets.nodes,
    config: secrets.config,
    subscriptionInfo: secrets.subscriptionInfo,
  };
}
