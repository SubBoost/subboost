import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  computeGeneratedYamlResult: vi.fn(),
}));

vi.mock("./config-store/generated-yaml", () => ({
  computeGeneratedYamlResult: mocks.computeGeneratedYamlResult,
}));

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } as unknown as Storage;
}

async function loadStore(storage = createMemoryStorage()) {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  const mod = await import("./config-store");
  return { ...mod, storage };
}

describe("useConfigStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.computeGeneratedYamlResult.mockImplementation((state: any) => ({
      yaml: `yaml:${state.dnsYaml || ""}`,
      error: state.dnsYaml === "bad" ? "bad yaml" : null,
    }));
  });

  it("wires generated YAML updates through store actions", async () => {
    const { useConfigStore } = await loadStore();

    useConfigStore.getState().setDnsYaml("dns: {}");

    expect(mocks.computeGeneratedYamlResult).toHaveBeenCalledWith(
      expect.objectContaining({ dnsYaml: "dns: {}" })
    );
    expect(useConfigStore.getState()).toMatchObject({
      dnsYaml: "dns: {}",
      generatedYaml: "yaml:dns: {}",
      generatedYamlError: null,
    });

    useConfigStore.getState().setDnsYaml("bad");
    expect(useConfigStore.getState()).toMatchObject({
      generatedYaml: "yaml:bad",
      generatedYamlError: "bad yaml",
    });
  }, 15_000);

  it("switches config draft storage scopes and regenerates restored drafts", async () => {
    const storage = createMemoryStorage({
      "subboost-config:user:u1": JSON.stringify({
        state: {
          template: "full",
          dnsYaml: "persisted dns",
          hiddenProxyGroups: ["ai", "ai", "", 123],
          cnIpNoResolve: false,
        },
        version: 11,
      }),
    });
    const { setConfigDraftUserScope, useConfigStore } = await loadStore(storage);

    setConfigDraftUserScope("u1");

    expect(useConfigStore.persist.getOptions().name).toBe("subboost-config:user:u1");
    expect(useConfigStore.getState()).toMatchObject({
      template: "full",
      dnsYaml: "persisted dns",
      hiddenProxyGroups: ["ai"],
      cnIpNoResolve: false,
      generatedYaml: "yaml:persisted dns",
    });
    expect(mocks.computeGeneratedYamlResult).toHaveBeenCalledWith(
      expect.objectContaining({ dnsYaml: "persisted dns" })
    );
  });

  it("drops stale draft versions instead of migrating legacy dnsYaml defaults", async () => {
    const storage = createMemoryStorage({
      "subboost-config:user:u1": JSON.stringify({
        state: {
          template: "full",
          dnsYaml: "legacy base config",
        },
        version: 8,
      }),
    });
    const { setConfigDraftUserScope, useConfigStore } = await loadStore(storage);

    setConfigDraftUserScope("u1");

    expect(useConfigStore.getState()).toMatchObject({
      template: "minimal",
    });
    expect(useConfigStore.getState().dnsYaml).not.toBe("legacy base config");
  });

  it("does not reset the draft when switching to the current scope", async () => {
    const storage = createMemoryStorage();
    const { setConfigDraftUserScope, useConfigStore } = await loadStore(storage);

    setConfigDraftUserScope(null);

    expect(useConfigStore.persist.getOptions().name).toBe("subboost-config:guest");
    expect(mocks.computeGeneratedYamlResult).not.toHaveBeenCalled();
  });

  it("ignores scope switches when browser storage is unavailable", async () => {
    const { setConfigDraftUserScope, useConfigStore } = await loadStore();
    const prevName = useConfigStore.persist.getOptions().name;

    vi.unstubAllGlobals();
    setConfigDraftUserScope("u2");

    expect(useConfigStore.persist.getOptions().name).toBe(prevName);
  });
});
