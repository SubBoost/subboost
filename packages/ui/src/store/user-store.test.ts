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
  useUserStore.getState().clearUser();
  useUserStore.setState({ user: null, isLoading: false, error: null });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("user store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  it("ignores an older user response after successful logout", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ok: true }));
    useUserStore.setState({ user: user() });
    const request = useUserStore.getState().fetchUser();
    await useUserStore.getState().logout();
    pending.resolve(Response.json({ user: user() }));
    await request;
    expect(useUserStore.getState()).toMatchObject({ user: null, error: null, isLoading: false });
  });

  it("ignores a response whose body finishes after clearUser", async () => {
    const body = deferred<{ user: User }>();
    const json = vi.fn(() => body.promise);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json }));
    const request = useUserStore.getState().fetchUser();
    await vi.waitFor(() => expect(json).toHaveBeenCalled());
    useUserStore.getState().clearUser();
    body.resolve({ user: user() });
    await request;
    expect(useUserStore.getState()).toMatchObject({ user: null, error: null, isLoading: false });
  });

  it.each(["http", "network"])("an old %s failure cannot clear a newer request", async (failure) => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal("fetch", fetchMock);
    const first = useUserStore.getState().fetchUser();
    useUserStore.getState().clearUser();
    const second = useUserStore.getState().fetchUser();
    if (failure === "http") older.resolve(new Response(null, { status: 401 }));
    else older.reject(new Error("old network failure"));
    await first;
    expect(useUserStore.getState()).toMatchObject({ isLoading: true, error: null });
    const third = useUserStore.getState().fetchUser();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    newer.resolve(Response.json({ user: user({ id: "new-user" }) }));
    await Promise.all([second, third]);
    expect(useUserStore.getState()).toMatchObject({ user: { id: "new-user" }, isLoading: false, error: null });
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
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(useUserStore.getState().user).toBeNull();

    useUserStore.setState({ user: user(), error: "old" });
    useUserStore.getState().clearUser();
    expect(useUserStore.getState()).toEqual(expect.objectContaining({ user: null, error: null }));
  });

  it("keeps the authenticated user when logout persistence fails", async () => {
    const currentUser = user();
    useUserStore.setState({ user: currentUser, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: vi.fn(async () => ({ error: "Session service unavailable." })),
      })
    );

    await expect(useUserStore.getState().logout()).rejects.toThrow("Session service unavailable.");
    expect(useUserStore.getState()).toEqual(
      expect.objectContaining({ user: currentUser, error: "Session service unavailable." })
    );

    useUserStore.getState().updateAiAssistantEnabled(true);
    expect(useUserStore.getState().user?.aiAssistantEnabled).toBe(true);
  });

  it("keeps the user and reports HTTP status when logout returns invalid JSON", async () => {
    const currentUser = user();
    useUserStore.setState({ user: currentUser, error: null });
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValueOnce(new SyntaxError("Invalid JSON")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(useUserStore.getState().logout()).rejects.toThrow("退出登录失败 (HTTP 503)");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(useUserStore.getState().user).toBe(currentUser);
    expect(useUserStore.getState().error).toBe("退出登录失败 (HTTP 503)");
  });
});
