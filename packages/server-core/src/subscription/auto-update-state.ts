import {
  AUTO_UPDATE_NODE_QUOTA_DISABLED_REASON,
  AUTO_UPDATE_NODE_QUOTA_FAILURE_THRESHOLD,
} from "@subboost/core/subscription/auto-update-failure-policy";

import {
  AUTO_UPDATE_DISABLED_REASON,
  updateAutoUpdateFailureSourceState,
  type AutoUpdateFailureSourceStateUpdate,
} from "./auto-update-failure";
import type { RefreshNodeSnapshotResult } from "./refresh-node-snapshot";

export {
  AUTO_UPDATE_NODE_QUOTA_DISABLED_REASON,
  AUTO_UPDATE_NODE_QUOTA_FAILURE_THRESHOLD,
};

export type SubscriptionAutoUpdateStateFields = {
  externalFailureCount: number;
  failureSourceState: string | null;
  lastFailedAt: Date | null;
  lastAttemptedAt: Date | null;
  nodeQuotaFailureCount: number;
  lastNodeQuotaExceededAt: Date | null;
  lastNodeQuotaActual: number | null;
  lastNodeQuotaLimit: number | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  disabledPreviousInterval: number | null;
};

export type SubscriptionAutoUpdateStateSource = {
  autoUpdateState?: Partial<SubscriptionAutoUpdateStateFields> | null;
};

export type AutomaticRefreshFailureAnalysis = {
  failureState: AutoUpdateFailureSourceStateUpdate | null;
  failureReason: string;
};

export type AutomaticRefreshAutoUpdateStateResult = {
  state: SubscriptionAutoUpdateStateFields;
  externalFailureCount: number;
  shouldDisableAutoUpdate: boolean;
};

export function resolveSubscriptionAutoUpdateState<T extends SubscriptionAutoUpdateStateSource>(
  subscription: T
): SubscriptionAutoUpdateStateFields {
  const state = subscription.autoUpdateState;
  return {
    externalFailureCount: state?.externalFailureCount ?? 0,
    failureSourceState: state?.failureSourceState ?? null,
    lastFailedAt: state?.lastFailedAt ?? null,
    lastAttemptedAt: state?.lastAttemptedAt ?? null,
    nodeQuotaFailureCount: state?.nodeQuotaFailureCount ?? 0,
    lastNodeQuotaExceededAt: state?.lastNodeQuotaExceededAt ?? null,
    lastNodeQuotaActual: state?.lastNodeQuotaActual ?? null,
    lastNodeQuotaLimit: state?.lastNodeQuotaLimit ?? null,
    disabledAt: state?.disabledAt ?? null,
    disabledReason: state?.disabledReason ?? null,
    disabledPreviousInterval: state?.disabledPreviousInterval ?? null,
  };
}

export function createResetSubscriptionAutoUpdateState(): SubscriptionAutoUpdateStateFields {
  return {
    externalFailureCount: 0,
    failureSourceState: null,
    lastFailedAt: null,
    lastAttemptedAt: null,
    nodeQuotaFailureCount: 0,
    lastNodeQuotaExceededAt: null,
    lastNodeQuotaActual: null,
    lastNodeQuotaLimit: null,
    disabledAt: null,
    disabledReason: null,
    disabledPreviousInterval: null,
  };
}

export function resolveAutomaticRefreshFailureAnalysis(params: {
  currentState: Pick<SubscriptionAutoUpdateStateFields, "failureSourceState">;
  snapshot: RefreshNodeSnapshotResult;
  failedAt: Date;
}): AutomaticRefreshFailureAnalysis {
  const refreshableSources = params.snapshot.savedSources;
  let failureState =
    params.snapshot.failedSourceCount > 0
      ? updateAutoUpdateFailureSourceState({
          previousStateRaw: params.currentState.failureSourceState,
          sources: refreshableSources,
          failedSources: params.snapshot.failedSources,
          failedAt: params.failedAt,
        })
      : null;
  // Cached output stays usable while upstream sources recover. A failed source
  // must not stop successful sources from being refreshed on the next cycle.
  if (failureState && params.snapshot.nodes.length > 0) {
    failureState = { ...failureState, shouldDisableAutoUpdate: false };
  }
  const failureReason =
    failureState?.disableSource?.reason ??
    failureState?.stableFailedSources[0]?.reason ??
    failureState?.failedSources[0]?.reason ??
    "缺少失败源明细";

  return { failureState, failureReason };
}

export function buildAutomaticRefreshAutoUpdateState(params: {
  failureState: AutoUpdateFailureSourceStateUpdate | null;
  attemptedAt: Date;
  failedAt?: Date;
  previousAutoUpdateInterval: number | null;
  currentState?: SubscriptionAutoUpdateStateFields;
  preserveNodeQuotaFailure?: boolean;
}): AutomaticRefreshAutoUpdateStateResult {
  const externalFailureCount = params.failureState?.maxFailureCount ?? 0;
  const shouldDisableAutoUpdate = params.failureState?.shouldDisableAutoUpdate ?? false;
  const failureMarkedAt = params.failedAt ?? params.attemptedAt;
  const preservedQuotaState = params.preserveNodeQuotaFailure
    ? {
        nodeQuotaFailureCount: params.currentState?.nodeQuotaFailureCount ?? 0,
        lastNodeQuotaExceededAt: params.currentState?.lastNodeQuotaExceededAt ?? null,
        lastNodeQuotaActual: params.currentState?.lastNodeQuotaActual ?? null,
        lastNodeQuotaLimit: params.currentState?.lastNodeQuotaLimit ?? null,
      }
    : {
        nodeQuotaFailureCount: 0,
        lastNodeQuotaExceededAt: null,
        lastNodeQuotaActual: null,
        lastNodeQuotaLimit: null,
      };

  return {
    externalFailureCount,
    shouldDisableAutoUpdate,
    state: {
      externalFailureCount,
      failureSourceState: params.failureState?.serializedSourceState ?? null,
      lastFailedAt: externalFailureCount > 0 ? failureMarkedAt : null,
      lastAttemptedAt: params.attemptedAt,
      ...preservedQuotaState,
      disabledAt: shouldDisableAutoUpdate ? failureMarkedAt : null,
      disabledReason: shouldDisableAutoUpdate ? AUTO_UPDATE_DISABLED_REASON : null,
      disabledPreviousInterval: shouldDisableAutoUpdate ? params.previousAutoUpdateInterval : null,
    },
  };
}

export function buildAutomaticRefreshNodeQuotaExceededState(params: {
  currentState: SubscriptionAutoUpdateStateFields;
  attemptedAt: Date;
  actualNodeCount: number;
  effectiveNodeLimit: number;
  previousAutoUpdateInterval: number | null;
}): AutomaticRefreshAutoUpdateStateResult {
  const nodeQuotaFailureCount = Math.max(0, params.currentState.nodeQuotaFailureCount) + 1;
  const shouldDisableAutoUpdate = nodeQuotaFailureCount >= AUTO_UPDATE_NODE_QUOTA_FAILURE_THRESHOLD;

  return {
    externalFailureCount: params.currentState.externalFailureCount,
    shouldDisableAutoUpdate,
    state: {
      ...params.currentState,
      lastAttemptedAt: params.attemptedAt,
      nodeQuotaFailureCount,
      lastNodeQuotaExceededAt: params.attemptedAt,
      lastNodeQuotaActual: params.actualNodeCount,
      lastNodeQuotaLimit: params.effectiveNodeLimit,
      disabledAt: shouldDisableAutoUpdate ? params.attemptedAt : null,
      disabledReason: shouldDisableAutoUpdate ? AUTO_UPDATE_NODE_QUOTA_DISABLED_REASON : null,
      disabledPreviousInterval: shouldDisableAutoUpdate ? params.previousAutoUpdateInterval : null,
    },
  };
}

export function markAutomaticRefreshAttempted(
  currentState: SubscriptionAutoUpdateStateFields,
  attemptedAt: Date
): SubscriptionAutoUpdateStateFields {
  return {
    ...currentState,
    lastAttemptedAt: attemptedAt,
  };
}

export function buildAutomaticRefreshUnexpectedFailureState(
  attemptedAt: Date,
  currentState?: SubscriptionAutoUpdateStateFields
): SubscriptionAutoUpdateStateFields {
  return {
    externalFailureCount: 0,
    failureSourceState: null,
    lastFailedAt: null,
    lastAttemptedAt: attemptedAt,
    nodeQuotaFailureCount: currentState?.nodeQuotaFailureCount ?? 0,
    lastNodeQuotaExceededAt: currentState?.lastNodeQuotaExceededAt ?? null,
    lastNodeQuotaActual: currentState?.lastNodeQuotaActual ?? null,
    lastNodeQuotaLimit: currentState?.lastNodeQuotaLimit ?? null,
    disabledAt: null,
    disabledReason: null,
    disabledPreviousInterval: null,
  };
}
