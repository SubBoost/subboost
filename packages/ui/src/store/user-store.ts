/**
 * 用户状态管理 - Zustand Store
 */

import { create } from "zustand";
import { setCsrfToken, withCsrfHeaders } from "@subboost/ui/lib/csrf";

export interface UserQuota {
  maxSubscriptions: number;
  maxNodesPerSubscription: number;
  maxCustomTemplates: number;
  maxImportSourcesPerType: number;
  canUseSubscriptionLink: boolean;
}

export interface User {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  trustLevel: number;
  aiAssistantEnabled: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  bannedUntil?: string | null;
  banReason?: string | null;
  banSource?: string | null;
  banCreatedAt?: string | null;
  subscriptionLinkRateLimitTotal?: number;
  subscriptionLinkRateLimitConsecutive?: number;
  subscriptionLinkRateLimitLastAt?: string | null;
  active: boolean;
  silenced: boolean;
  saveRequirementSatisfied: boolean;
  saveRequirementSatisfiedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  accounts?: Array<{ provider: string; providerAccountId: string }>;
  quota: UserQuota;
  subscriptionCount: number;
  templateCount: number;
}

type AuthSnapshot = {
  user?: User | null;
  csrfToken?: string | null;
};

interface UserState {
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  clearUser: () => void;
  updateAiAssistantEnabled: (enabled: boolean) => void;
}

// 防止并发请求的单例 Promise
let fetchUserPromise: Promise<void> | null = null;

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  fetchUser: async () => {
    // 防止并发请求
    if (fetchUserPromise) return fetchUserPromise;

    set({ isLoading: true, error: null });

    fetchUserPromise = (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          set({ user: null, error: `请求失败 (HTTP ${response.status})`, isLoading: false });
          return;
        }
        const data = (await response.json().catch(() => ({}))) as AuthSnapshot;
        setCsrfToken(data.csrfToken ?? null);
        set({ user: data?.user ?? null, isLoading: false });
      } catch (error) {
        setCsrfToken(null);
        set({
          user: null,
          error: error instanceof Error ? error.message : "获取用户信息失败",
          isLoading: false,
        });
      } finally {
        fetchUserPromise = null;
      }
    })();

    return fetchUserPromise;
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: withCsrfHeaders(),
      });
      setCsrfToken(null);
      set({ user: null });
    } catch (error) {
      console.error("Logout error:", error);
    }
  },

  clearUser: () => {
    setCsrfToken(null);
    set({ user: null, error: null });
  },

  updateAiAssistantEnabled: (enabled: boolean) => {
    set((state) => {
      if (!state.user) return state;
      return { user: { ...state.user, aiAssistantEnabled: enabled } };
    });
  },
}));
