import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@subboost/ui/store/config-store/definitions";
import {
  AUTH_CONFIG_HANDOFF_STORAGE_NAME,
  captureAuthConfigHandoff,
  consumeAuthConfigHandoff,
  hasAuthConfigHandoff,
} from "@subboost/ui/store/config-store/auth-handoff";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function envelope(state: unknown) {
  return JSON.stringify({ version: 1, createdAt: Date.now(), state });
}

describe("auth handoff invalid state normalization", () => {
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });

  it("cleans an empty storage entry without treating it as a handoff", () => {
    const storage = createStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage },
    });

    expect(hasAuthConfigHandoff()).toBe(false);
    expect(storage.getItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    expect(storage.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
  });

  it("rejects a non-object state from an otherwise valid envelope", () => {
    const storage = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: envelope(null),
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage },
    });

    expect(consumeAuthConfigHandoff()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
  });

  it("ignores a non-array source collection while preserving other valid state", () => {
    const storage = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: envelope({
        sources: "not-an-array",
        nodes: [{ name: "Node" }],
      }),
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage },
    });

    expect(consumeAuthConfigHandoff()).toEqual({
      nodes: [{ name: "Node" }],
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
      sharedHealthChecks: false,
    });
  });

  it("rejects an array containing a non-object source item", () => {
    const storage = createStorage({
      [AUTH_CONFIG_HANDOFF_STORAGE_NAME]: envelope({ sources: [null] }),
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage },
    });

    expect(consumeAuthConfigHandoff()).toEqual({
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
      sharedHealthChecks: false,
    });
  });

  it("captures a configuration whose enabled-group list differs only in length", () => {
    const storage = createStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage },
    });
    const state = {
      ...structuredClone(initialState),
      enabledProxyGroups: initialState.enabledProxyGroups.slice(0, -1),
    };

    captureAuthConfigHandoff(state);

    expect(storage.setItem).toHaveBeenCalledWith(
      AUTH_CONFIG_HANDOFF_STORAGE_NAME,
      expect.any(String)
    );
  });
});
