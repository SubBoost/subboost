import { describe, expect, it, vi } from "vitest";
import { createSettingsActions } from "./settings-actions";

function createStore(initial: Record<string, unknown> = {}) {
  let state = { ...initial };
  const set = vi.fn((next: any) => {
    const patch = typeof next === "function" ? next(state) : next;
    state = { ...state, ...patch };
  });
  const setAndGenerateConfig = vi.fn((updater: any) => {
    state = { ...state, ...updater(state) };
  });
  const get = vi.fn(() => state);
  return { get, set, setAndGenerateConfig, state: () => state };
}

describe("config store settings actions", () => {
  it("updates generated config settings through the generation path", () => {
    const store = createStore();
    const actions = createSettingsActions(store.set as any, store.get as any, store.setAndGenerateConfig as any);

    actions.setDnsYaml("dns: {}");
    actions.setMixedPort(7890);
    actions.setAllowLan(true);
    actions.setTestUrl("https://cp.cloudflare.com/generate_204");
    actions.setTestInterval(600);
    actions.setUrlTestLazy(true);
    actions.setUrlTestTolerance(50);
    actions.setRuleProviderBaseUrl("https://rules.example.com");
    actions.setCnIpNoResolve(true);
    actions.setExperimentalCnUseCnRuleSet(1 as unknown as boolean);

    expect(store.state()).toEqual({
      dnsYaml: "dns: {}",
      mixedPort: 7890,
      allowLan: true,
      testUrl: "https://cp.cloudflare.com/generate_204",
      testInterval: 600,
      urlTestLazy: true,
      urlTestTolerance: 50,
      ruleProviderBaseUrl: "https://rules.example.com",
      cnIpNoResolve: true,
      experimentalCnUseCnRuleSet: true,
    });
    expect(store.setAndGenerateConfig).toHaveBeenCalledTimes(10);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("can clear the optional global url-test overrides", () => {
    const store = createStore({ urlTestLazy: true, urlTestTolerance: 50 });
    const actions = createSettingsActions(store.set as any, store.get as any, store.setAndGenerateConfig as any);

    actions.setUrlTestLazy(undefined);
    actions.setUrlTestTolerance(undefined);

    expect(store.state()).toMatchObject({
      urlTestLazy: undefined,
      urlTestTolerance: undefined,
    });
  });
});
