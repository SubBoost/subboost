import { describe, expect, it } from "vitest";
import { migrateLegacyConfig } from "./legacy-config";

describe("migrateLegacyConfig", () => {
  it("keeps current configs unchanged", () => {
    const config = {
      customProxyGroups: [],
      customRuleSets: [],
      builtinRuleEdits: {},
    };

    expect(migrateLegacyConfig(config)).toBe(config);
  });

  it("migrates filtered groups and every supported legacy rule shape", () => {
    const result = migrateLegacyConfig({
      filteredProxyGroups: [
        {
          id: "us-only",
          name: "US Only",
          groupType: "url-test",
          sourceIds: ["airport", "airport"],
          regions: ["us"],
          excludedNodeNames: ["Old Node"],
        },
      ],
      customProxyGroups: [
        {
          id: "custom-lab",
          name: "Lab",
          emoji: "🧪",
          groupType: "select",
          rules: [
            {
              id: "lab-provider",
              name: "Lab Provider",
              path: "geosite/lab.mrs",
              behavior: "domain",
            },
          ],
        },
      ],
      customRules: [
        { id: "ordinary", type: "DOMAIN", value: "example.com", target: "US Only" },
        {
          id: "manual-provider",
          type: "RULE-SET",
          value: "geoip/manual.mrs",
          target: "US Only",
        },
      ],
      customRuleSets: [
        {
          id: "existing-provider",
          name: "Existing",
          path: "geosite/existing.mrs",
          behavior: "domain",
          target: "US Only",
        },
      ],
      builtinRuleEdits: {
        "module:youtube:youtube": { target: "US Only" },
      },
      moduleRuleExclusions: {
        ai: ["openai", "anthropic"],
      },
      moduleRuleOverrides: {
        google: [
          {
            id: "openai",
            name: "OpenAI",
            path: "geosite/openai.mrs",
            behavior: "domain",
          },
          {
            id: "new-provider",
            name: "New Provider",
            path: "geoip/new-provider.mrs",
          },
        ],
      },
      allRulesOrderEditingEnabled: true,
      dialerProxyGroups: [{ id: "relay", relayNodes: ["US Only"] }],
      proxyGroupOrder: ["filtered:us-only"],
      ruleOrder: [
        "module:ai:openai",
        "module:google:new-provider",
        "custom-group:custom-lab:lab-provider",
        "custom-rule:manual-provider",
      ],
    });

    expect(result).not.toHaveProperty("filteredProxyGroups");
    expect(result).not.toHaveProperty("moduleRuleExclusions");
    expect(result).not.toHaveProperty("moduleRuleOverrides");
    expect(result).not.toHaveProperty("allRulesOrderEditingEnabled");
    expect(result.proxyGroupAdvancedModeEnabled).toBe(true);
    expect(result.customProxyGroups).toEqual([
      {
        id: "custom-lab",
        name: "Lab",
        emoji: "🧪",
        groupType: "select",
      },
      expect.objectContaining({
        id: "migrated-filtered-us-only",
        name: "US Only",
        memberSource: "filtered-nodes",
        groupType: "url-test",
        advanced: {
          sourceIds: ["airport"],
          regions: ["us"],
          excludedMembers: [{ kind: "node", name: "Old Node" }],
        },
      }),
    ]);
    expect(result.customRules).toEqual([
      {
        id: "ordinary",
        type: "DOMAIN",
        value: "example.com",
        target: { kind: "custom", id: "migrated-filtered-us-only" },
      },
    ]);
    expect(result.customRuleSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing-provider",
          target: { kind: "custom", id: "migrated-filtered-us-only" },
        }),
        expect.objectContaining({
          id: "manual-provider",
          behavior: "ipcidr",
          target: { kind: "custom", id: "migrated-filtered-us-only" },
        }),
        expect.objectContaining({
          id: "lab-provider",
          target: { kind: "custom", id: "custom-lab" },
        }),
        expect.objectContaining({
          id: "new-provider",
          behavior: "ipcidr",
          target: { kind: "module", id: "google" },
        }),
      ])
    );
    expect(result.builtinRuleEdits).toEqual({
      "module:youtube:youtube": {
        target: { kind: "custom", id: "migrated-filtered-us-only" },
      },
      "module:ai:openai": { target: { kind: "module", id: "google" } },
      "module:ai:anthropic": { enabled: false },
    });
    expect(result.dialerProxyGroups).toEqual([{ id: "relay", relayNodes: ["US Only"] }]);
    expect(result.proxyGroupOrder).toEqual(["custom:migrated-filtered-us-only"]);
    expect(result.ruleOrder).toEqual([
      "module:ai:openai",
      "custom-rule-set:new-provider",
      "custom-rule-set:lab-provider",
      "custom-rule-set:manual-provider",
    ]);
  });

  it("lets current builtin edits win when old and new fields overlap", () => {
    const result = migrateLegacyConfig({
      moduleRuleExclusions: { ai: ["openai"] },
      builtinRuleEdits: {
        "module:ai:openai": { target: { kind: "module", id: "select" } },
      },
    });

    expect(result.builtinRuleEdits).toEqual({
      "module:ai:openai": {
        enabled: false,
        target: { kind: "module", id: "select" },
      },
    });
  });
});
