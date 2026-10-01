import type { SubscriptionSource } from "@subboost/ui/store/config-store";

export type EditingSubscription = {
  id: string;
  token: string;
  name: string;
  autoUpdateInterval: number | null;
  smartNodeMatchingEnabled: boolean;
};

export type EditingSubscriptionLoaderOptions = {
  editSubscriptionId: string | null;
  userId?: string | null;
  authChecked?: boolean;
  loadSubscription?: (id: string) => Promise<Response>;
  loginHref?: string;
  setCopied: (copied: boolean) => void;
  setEditingSubscription: (subscription: EditingSubscription | null) => void;
  setStoreSources: (sources: SubscriptionSource[]) => void;
  setSubscriptionName: (name: string) => void;
  setSubscriptionUrl: (url: string) => void;
};
