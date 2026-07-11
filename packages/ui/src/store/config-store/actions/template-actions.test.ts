import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@subboost/core/templates";
import { getBuiltinTemplateId } from "@subboost/core/templates/builtin";
import { initialState, type ConfigState, type SubBoostTemplateConfig } from "../definitions";
import { createTemplateActions } from "./template-actions";

function createHarness(overrides: Record<string, unknown> = {}) {
  let state = {
    ...structuredClone(initialState),
    ...overrides,
  } as any;

  const applyPatch = (patch: any) => {
    if (!patch || patch === state) return;
    state = { ...state, ...patch };
  };

  const set = (patch: any) => {
    applyPatch(typeof patch === "function" ? patch(state) : patch);
  };

  const setAndGenerateConfig = (updater: any) => {
    applyPatch(updater(state));
  };

  const actions = createTemplateActions(set, () => state, setAndGenerateConfig);
  return { actions, getState: () => state as ConfigState };
}

describe("createTemplateActions", () => {
  it("switches builtin templates and resets template-specific edits", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "ai"],
      hiddenProxyGroups: ["ai"],
      appliedTemplateId: "custom-template",
      customRules: [{ id: "rule-1", type: "DOMAIN", value: "example.com", target: "Proxy" }],
      customRuleSets: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" }],
      builtinRuleEdits: { "module:ai:anthropic": { enabled: false } },
      ruleOrder: ["module:ai:openai"],
      moduleRuleEditWarningAccepted: true,
    });

    actions.setTemplate("standard");

    expect(getState()).toMatchObject({
      template: "standard",
      enabledProxyGroups: TEMPLATES.standard.groups,
      hiddenProxyGroups: [],
      appliedTemplateId: getBuiltinTemplateId("standard"),
      customRules: [],
      customRuleSets: [],
      builtinRuleEdits: {},
      ruleOrder: [],
      moduleRuleEditWarningAccepted: false,
    });

    actions.setAppliedTemplateId(null);
    expect(getState().appliedTemplateId).toBeNull();

    actions.setEnabledProxyGroups(["select", "final"]);
    expect(getState().enabledProxyGroups).toEqual(["select", "final"]);
  });

  it("toggles builtin proxy groups and clears hidden state when a group is re-enabled", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "ai"],
      hiddenProxyGroups: ["ai", "google"],
    });

    actions.toggleProxyGroup("ai");
    expect(getState().enabledProxyGroups).toEqual(["select"]);
    expect(getState().hiddenProxyGroups).toEqual(["ai", "google"]);

    actions.toggleProxyGroup("google");
    expect(getState().enabledProxyGroups).toEqual(["select", "google"]);
    expect(getState().hiddenProxyGroups).toEqual(["ai"]);
  });

  it("applies validated template config fields and refreshes rule order", () => {
    const { actions, getState } = createHarness({
      customRules: [{ id: "old-rule", type: "DOMAIN", value: "old.example", target: "Old" }],
      ruleOrder: ["custom-rule:old-rule"],
    });

    const config = {
      schema: "subboost-template-config/v1",
      template: "full",
      enabledProxyGroups: ["select", "ai", "google"],
      hiddenProxyGroups: [" ai ", "missing", "", "ai"],
      customProxyGroups: [
        {
          id: "custom-group-1",
          name: "Custom Group",
          emoji: "",
          groupType: "select",
        },
      ],
      customRuleSets: [
        {
          id: "custom-provider",
          name: "Custom Provider",
          behavior: "domain",
          path: "https://example.com/rule.mrs",
          target: "Custom Group",
        },
      ],
      builtinRuleEdits: { "module:ai:openai": { target: "🔍 Google" } },
      customRules: [{ id: "", type: "DOMAIN-SUFFIX", value: "example.com", target: "Proxy" }],
      ruleOrder: ["custom-rule:custom-rule-domain-suffix-example-com-proxy-1"],
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
      dialerProxyGroups: [
        { id: "dialer-1", enabled: true, name: "Relay", relayNodes: ["Node A"], type: "url-test", targetNodes: ["Node B"] },
      ],
      proxyGroupNameOverrides: { google: "Google" },
      dnsYaml: "dns: {}",
      mixedPort: 7890,
      allowLan: false,
      testUrl: "https://example.com/generate_204",
      testInterval: 60,
      urlTestLazy: true,
      urlTestTolerance: 50,
      ruleProviderBaseUrl: "https://example.com/rules",
    } as unknown as SubBoostTemplateConfig;

    actions.applyTemplateConfig(config);

    expect(getState()).toMatchObject({
      template: "full",
      enabledProxyGroups: ["select", "google"],
      hiddenProxyGroups: ["ai"],
      customProxyGroups: [
        {
          id: "custom-group-1",
          name: "Custom Group",
          emoji: "",
          advanced: {},
          groupType: "select",
        },
      ],
      proxyGroupAdvancedModeEnabled: true,
      customRuleSets: [
        {
          id: "custom-provider",
          name: "Custom Provider",
          behavior: "domain",
          path: "https://example.com/rule.mrs",
          target: "Custom Group",
        },
      ],
      builtinRuleEdits: { "module:ai:openai": { target: "🔍 Google" } },
      moduleRuleEditWarningAccepted: false,
      cnIpNoResolve: false,
      experimentalCnUseCnRuleSet: true,
      dialerProxyGroups: config.dialerProxyGroups,
      proxyGroupNameOverrides: config.proxyGroupNameOverrides,
      dnsYaml: "dns: {}",
      mixedPort: 7890,
      allowLan: false,
      testUrl: "https://example.com/generate_204",
      testInterval: 60,
      urlTestLazy: true,
      urlTestTolerance: 50,
      ruleProviderBaseUrl: "https://example.com/rules",
    });
    expect(getState().customRules).toEqual([
      {
        id: "custom-rule-domain-suffix-example-com-proxy-1",
        type: "DOMAIN-SUFFIX",
        value: "example.com",
        target: "Proxy",
      },
    ]);
    expect(getState().ruleOrder).toContain("custom-rule:custom-rule-domain-suffix-example-com-proxy-1");
  });

  it("ignores invalid template configs and preserves existing values where fields are malformed", () => {
    const { actions, getState } = createHarness({
      enabledProxyGroups: ["select", "ai"],
      customProxyGroups: [
        {
          id: "existing-group",
          name: "Existing",
          emoji: "",
          groupType: "select",
        },
      ],
      customRules: [{ id: "existing-rule", type: "DOMAIN", value: "example.org", target: "Proxy" }],
      customRuleSets: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" }],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      ruleOrder: ["module:ai:openai"],
      cnIpNoResolve: true,
      experimentalCnUseCnRuleSet: false,
      dialerProxyGroups: [{ id: "existing-dialer", name: "Existing Dialer", relayNodes: [], type: "select", targetNodes: [] }],
      proxyGroupNameOverrides: { ai: "AI" },
      dnsYaml: "dns: old",
      mixedPort: 7897,
      allowLan: true,
      testUrl: "https://old.example/generate_204",
      testInterval: 300,
      ruleProviderBaseUrl: "https://old.example/rules",
    });
    const beforeNoop = getState();

    actions.applyTemplateConfig(null as never);
    expect(getState()).toBe(beforeNoop);

    actions.applyTemplateConfig({
      template: undefined,
      enabledProxyGroups: "bad",
      hiddenProxyGroups: [" ai ", "adult", "adult", 123],
      customProxyGroups: "bad",
      customRules: "bad",
      cnIpNoResolve: "bad",
      experimentalCnUseCnRuleSet: "bad",
      dialerProxyGroups: "bad",
      proxyGroupNameOverrides: null,
      dnsYaml: 123,
      mixedPort: "7890",
      allowLan: "false",
      testUrl: 123,
      testInterval: "60",
      ruleProviderBaseUrl: 123,
    } as never);

    expect(getState()).toMatchObject({
      template: initialState.template,
      enabledProxyGroups: ["select"],
      hiddenProxyGroups: ["ai", "adult"],
      customProxyGroups: [
        {
          id: "existing-group",
          name: "Existing",
          emoji: "",
          groupType: "select",
        },
      ],
      customRules: [{ id: "existing-rule", type: "DOMAIN", value: "example.org", target: "Proxy" }],
      customRuleSets: [{ id: "custom-ai", name: "Custom AI", behavior: "domain", path: "geosite/custom-ai.mrs", target: "🤖 AI 服务" }],
      builtinRuleEdits: { "module:ai:openai": { enabled: false } },
      ruleOrder: ["module:ai:openai"],
      cnIpNoResolve: true,
      experimentalCnUseCnRuleSet: false,
      dialerProxyGroups: [{ id: "existing-dialer", name: "Existing Dialer", relayNodes: [], type: "select", targetNodes: [] }],
      proxyGroupNameOverrides: { ai: "AI" },
      dnsYaml: "dns: old",
      mixedPort: 7897,
      allowLan: true,
      testUrl: "https://old.example/generate_204",
      testInterval: 300,
      ruleProviderBaseUrl: "https://old.example/rules",
    });
  });
});
