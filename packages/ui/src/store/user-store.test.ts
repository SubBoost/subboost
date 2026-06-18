import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUserStore, type User } from "./user-store";

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    username: "ry",
    name: "Ryan",
    avatarUrl: null,
    trustLevel: 1,
    aiAssistantEnabled: false,
    isAdmin: false,
    isBanned: false,
    active: true,
    silenced: false,
    saveRequirementSatisfied: true,
    saveRequirementSatisfiedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    quota: {
      maxSubscriptions: 3,
      maxNodesPerSubscription: 100,
      maxCustomTemplates: 3,
      maxImportSourcesPerType: 5,
      canUseSubscriptionLink: true,
    },
    subscriptionCount: 0,
    templateCount: 0,
    ...overrides,
  };
}

function resetStore() {
  useUserStore.setState({ user: null, isLoading: false, error: null });
}

describe("user store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  it("fetches the authenticated user and deduplicates concurrent requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn(async () => ({ user: user({ aiAssistantEnabled: true }) })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = useUserStore.getState().fetchUser();
    const second = useUserStore.getState().fetchUser();
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });
    expect(useUserStore.getState()).toEqual(
      expect.objectContaining({
        isLoading: false,
        error: null,
        user: expect.objectContaining({ id: "user-1", aiAssistantEnabled: true }),
      })
    );
  });

  it("stores HTTP and network failures as user-facing errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));
    await useUserStore.getState().fetchUser();
    expect(useUserStore.getState()).toEqual(
      expect.objectContaining({
        user: null,
        isLoading: false,
        error: "请求失败 (HTTP 503)",
      })
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network down")));
    await useUserStore.getState().fetchUser();
    expect(useUserStore.getState()).toEqual(
      expect.objectContaining({
        user: null,
        isLoading: false,
        error: "network down",
      })
    );
  });

  it("logs out, clears state, and updates the local AI assistant flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    useUserStore.setState({ user: user(), isLoading: false, error: "old" });

    useUserStore.getState().updateAiAssistantEnabled(true);
    expect(useUserStore.getState().user?.aiAssistantEnabled).toBe(true);

    await useUserStore.getState().logout();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST", headers: {} });
    expect(useUserStore.getState().user).toBeNull();

    useUserStore.setState({ user: user(), error: "old" });
    useUserStore.getState().clearUser();
    expect(useUserStore.getState()).toEqual(expect.objectContaining({ user: null, error: null }));
  });

  it("keeps logout failures contained and leaves missing users unchanged for local flag updates", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("logout failed")));

    await useUserStore.getState().logout();
    expect(useUserStore.getState().user).toBeNull();

    useUserStore.getState().updateAiAssistantEnabled(true);
    expect(useUserStore.getState().user).toBeNull();
  });
});
