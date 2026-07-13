import { describe, expect, it } from "vitest";
import { getModulesForTemplate } from "../generator/proxy-groups";
import {
  SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
  validateSubBoostTemplateConfig,
} from "./config-template";
import { DEFAULT_LOAD_BALANCE_STRATEGY } from "@subboost/core/types/config";
import { expectInvalid, validConfig } from "./config-template.test-helpers";

describe("validateSubBoostTemplateConfig", () => {
  it("accepts a minimal v1 config template", () => {
    const result = validateSubBoostTemplateConfig(validConfig());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.schema).toBe(SUBBOOST_TEMPLATE_CONFIG_SCHEMA);
      expect(result.config.template).toBe("minimal");
      expect(result.config.enabledProxyGroups.length).toBeGreaterThan(0);
    }
  });

  it("rejects non-object and wrong-template configs", () => {
    expect(validateSubBoostTemplateConfig(null).ok).toBe(false);
    expect(validateSubBoostTemplateConfig(validConfig({ schema: "legacy" as never }))).toEqual({
      ok: false,
      error: "模板配置 schema 无效",
    });
    expect(validateSubBoostTemplateConfig(validConfig({ template: "bad" as never })).ok).toBe(false);
  });

  it("rejects invalid numeric fields", () => {
    expectInvalid({ mixedPort: 0 }, "mixedPort 必须是正整数");
    expect(validateSubBoostTemplateConfig(validConfig({ mixedPort: 70000 })).ok).toBe(false);
    expectInvalid({ testInterval: 1.5 }, "testInterval 必须是正整数");
    expect(validateSubBoostTemplateConfig(validConfig({ testInterval: -1 })).ok).toBe(false);
  });

  it("rejects invalid array fields", () => {
    const result = validateSubBoostTemplateConfig({
      ...validConfig(),
      enabledProxyGroups: "minimal",
    });

    expect(result.ok).toBe(false);
    expectInvalid({ enabledProxyGroups: [] }, "至少需要一个代理组");
    expectInvalid({ enabledProxyGroups: ["missing"] }, "enabledProxyGroups 包含未知代理组");
    expectInvalid({ hiddenProxyGroups: ["missing"] }, "hiddenProxyGroups 包含未知代理组");
    expectInvalid({ ruleOrder: [1 as never] }, "ruleOrder 只能包含字符串");
  });

  it("normalizes rich template config fields", () => {
    const moduleId = "ai";
    const result = validateSubBoostTemplateConfig(
      validConfig({
        enabledProxyGroups: [...getModulesForTemplate("minimal"), moduleId],
        hiddenProxyGroups: [],
        customProxyGroups: [
          {
            id: "custom",
            name: "Custom",
            emoji: "",
            enabled: false,
            memberSource: "filtered-nodes",
            includeInGroupMembers: false,
            groupType: "load-balance",
          },
        ],
        customRuleSets: [
          {
            id: "custom-rule",
            name: "Custom Rule",
            behavior: "domain",
            path: "https://rules.example.com/custom.mrs",
            target: { kind: "custom", id: "custom" },
            noResolve: false,
          },
          {
            id: "extra",
            name: "Extra",
            behavior: "ipcidr",
            path: "geoip/private.mrs",
            target: "Renamed",
            noResolve: true,
          },
        ],
        customRules: [
          {
            id: "custom-rule-a",
            type: "DOMAIN-SUFFIX",
            value: " example.com ",
            target: { kind: "module", id: "select" },
            noResolve: true,
          },
        ],
        dialerProxyGroups: [
          {
            id: "relay",
            name: "Relay",
            type: "url-test",
            relayNodes: ["Relay A", "Relay A", ""],
            targetNodes: ["Target A", "Target A"],
            enabled: false,
          },
        ],
        builtinRuleEdits: {
          [`module:${moduleId}:openai`]: { enabled: false, target: { kind: "custom", id: "custom" } },
        },
        proxyGroupNameOverrides: {
          [moduleId]: " Renamed ",
          empty: " ",
        },
        ruleOrder: ["missing", "missing"],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.customProxyGroups[0]).toMatchObject({
      id: "custom",
      name: "Custom",
      emoji: "",
      memberSource: "filtered-nodes",
      includeInGroupMembers: false,
      enabled: false,
      groupType: "load-balance",
      strategy: DEFAULT_LOAD_BALANCE_STRATEGY,
    });
    expect(result.config.customRuleSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "custom-rule",
          name: "Custom Rule",
          behavior: "domain",
          path: "https://rules.example.com/custom.mrs",
          target: { kind: "custom", id: "custom" },
        }),
        expect.objectContaining({
          id: "extra",
          behavior: "ipcidr",
          path: "geoip/private.mrs",
          noResolve: true,
        }),
      ])
    );
    expect(result.config.proxyGroupAdvancedModeEnabled).toBe(true);
    expect(result.config.customRules[0]).toMatchObject({
      id: "custom-rule-a",
      value: "example.com",
      noResolve: true,
      target: { kind: "module", id: "select" },
    });
    expect(result.config.dialerProxyGroups[0]).toMatchObject({
      id: "relay",
      type: "url-test",
      relayNodes: ["Relay A"],
      targetNodes: ["Target A"],
      enabled: false,
    });
    expect(result.config.builtinRuleEdits?.[`module:${moduleId}:openai`]).toEqual({
      enabled: false,
      target: { kind: "custom", id: "custom" },
    });
    expect(result.config.proxyGroupNameOverrides).toEqual({ [moduleId]: "Renamed" });
    expect(result.config).not.toHaveProperty("moduleRuleOverrides");
    expect(result.config).not.toHaveProperty("moduleRuleExclusions");
    expect(result.config).not.toHaveProperty("allRulesOrderEditingEnabled");
  });

  it("uses defaults when optional compatibility fields are omitted", () => {
    const [moduleId] = getModulesForTemplate("minimal");
    const result = validateSubBoostTemplateConfig(
      validConfig({
        hiddenProxyGroups: undefined as never,
        proxyGroupAdvanced: {
          [moduleId]: {
            sourceIds: ["source-a"],
          },
        },
        customRuleSets: undefined as never,
        builtinRuleEdits: undefined as never,
        ruleOrder: undefined as never,
        proxyGroupNameOverrides: undefined as never,
        cnIpNoResolve: undefined as never,
        experimentalCnUseCnRuleSet: undefined as never,
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.hiddenProxyGroups).toEqual([]);
    expect(result.config.proxyGroupAdvanced?.[moduleId]).toEqual({ sourceIds: ["source-a"] });
    expect(result.config.customRuleSets).toEqual([]);
    expect(result.config.builtinRuleEdits).toEqual({});
    expect(result.config.proxyGroupNameOverrides).toEqual({});
    expect(result.config).not.toHaveProperty("cnIpNoResolve");
    expect(result.config).not.toHaveProperty("experimentalCnUseCnRuleSet");
  });

  it("rejects removed rule-model compatibility fields", () => {
    expectInvalid({ moduleRuleOverrides: {} } as never, "模板配置包含已移除字段: moduleRuleOverrides");
    expectInvalid({ moduleRuleExclusions: {} } as never, "模板配置包含已移除字段: moduleRuleExclusions");
    expectInvalid({ allRulesOrderEditingEnabled: true } as never, "模板配置包含已移除字段: allRulesOrderEditingEnabled");
    const removedFilteredGroupsField = `filtered${"ProxyGroups"}`;
    expectInvalid(
      { [removedFilteredGroupsField]: [] } as never,
      `模板配置包含已移除字段: ${removedFilteredGroupsField}`
    );
    expectInvalid(
      { customProxyGroups: [{ id: "custom", name: "Custom", emoji: "", groupType: "select", rules: [] }] } as never,
      "模板配置包含已移除字段: customProxyGroups[0].rules"
    );
  });

  it("rejects template configs that hide every enabled module", () => {
    const enabledProxyGroups = getModulesForTemplate("minimal");
    const result = validateSubBoostTemplateConfig(
      validConfig({
        enabledProxyGroups,
        hiddenProxyGroups: enabledProxyGroups,
      })
    );

    expect(result).toEqual({ ok: false, error: "至少需要一个可见代理组" });
  });
});
