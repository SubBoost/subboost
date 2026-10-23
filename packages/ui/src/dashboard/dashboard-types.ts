export interface SubscriptionAutoUpdateState {
  externalFailureCount: number;
  failureSourceState?: string | null;
  lastFailedAt: string | null;
  lastAttemptedAt?: string | null;
  nodeQuotaFailureCount: number;
  lastNodeQuotaExceededAt: string | null;
  lastNodeQuotaActual: number | null;
  lastNodeQuotaLimit: number | null;
  disabledAt: string | null;
  disabledReason: string | null;
  disabledPreviousInterval: number | null;
}

export interface Subscription {
  id: string;
  name: string;
  token: string;
  subscriptionUrl: string;
  isPrimary: boolean;
  autoUpdateInterval: number | null;
  autoUpdateState: SubscriptionAutoUpdateState;
  smartNodeMatchingEnabled: boolean;
  lastUpdatedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
}

export interface RefreshSubscriptionResponse {
  error?: string;
  refreshableSourceCount?: number;
  refreshedSourceCount?: number;
  refreshedUrlSourceCount?: number;
  refreshedStaticSourceCount?: number;
  failedSourceCount?: number;
  nodeCount?: number;
  attemptedUrlFetch?: boolean;
  usedUrlFetch?: boolean;
}

export type SubscriptionLink = Pick<Subscription, "id" | "token" | "subscriptionUrl">;
