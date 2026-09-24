/**
 * 用户状态管理 - Zustand Store
 */

import { create } from "zustand";

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
let userRequestGeneration = 0;

function invalidateUserRequest() {
  userRequestGeneration += 1;
  fetchUserPromise = null;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  fetchUser: async () => {
    // 防止并发请求
    if (fetchUserPromise) return fetchUserPromise;
    const generation = userRequestGeneration;

    set({ isLoading: true, error: null });

    fetchUserPromise = (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (generation !== userRequestGeneration) return;
        if (!response.ok) {
          set({ user: null, error: `请求失败 (HTTP ${response.status})`, isLoading: false });
          return;
        }
        const data = (await response.json().catch(() => ({}))) as { user?: User | null };
        if (generation !== userRequestGeneration) return;
        set({ user: data?.user ?? null, isLoading: false });
      } catch (error) {
        if (generation !== userRequestGeneration) return;
        set({
          user: null,
          error: error instanceof Error ? error.message : "获取用户信息失败",
          isLoading: false,
        });
      } finally {
        if (generation === userRequestGeneration) fetchUserPromise = null;
      }
    })();

    return fetchUserPromise;
  },

  logout: async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : `退出登录失败 (HTTP ${response.status})`;
        throw new Error(message);
      }
      invalidateUserRequest();
      set({ user: null, error: null, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "退出登录失败";
      set({ error: message });
      throw error instanceof Error ? error : new Error(message);
    }
  },

  clearUser: () => {
    invalidateUserRequest();
    set({ user: null, error: null, isLoading: false });
  },

  updateAiAssistantEnabled: (enabled: boolean) => {
    set((state) => {
      if (!state.user) return state;
      return { user: { ...state.user, aiAssistantEnabled: enabled } };
    });
  },
}));
