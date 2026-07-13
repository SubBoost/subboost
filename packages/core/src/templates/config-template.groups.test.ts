import { describe, expect, it } from "vitest";
import { validateSubBoostTemplateConfig } from "./config-template";
import { expectInvalid, validConfig } from "./config-template.test-helpers";

describe("validateSubBoostTemplateConfig custom groups", () => {
  it("rejects invalid custom group fields", () => {
    expectInvalid({ customRules: "bad" as never }, "customRules 必须是数组");
    expectInvalid({ customRules: [1 as never] }, "customRules 只能包含对象");
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "BAD" as never,
            value: "example.com",
            target: "DIRECT",
          },
        ],
      },
      "customRules 包含无效类型"
    );
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "DOMAIN",
            value: " ",
            target: "DIRECT",
          },
        ],
      },
      "customRules.value 不能为空"
    );
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "DOMAIN",
            value: "example.com",
            target: " ",
          },
        ],
      },
      "customRules.target 不能为空"
    );
    expectInvalid(
      {
        customRules: [
          {
            id: "bad",
            type: "DOMAIN",
            value: "example.com",
            target: "DIRECT",
            noResolve: "yes" as never,
          },
        ],
      },
      "customRules.noResolve 必须是布尔值"
    );

    const generatedRuleId = validateSubBoostTemplateConfig(
      validConfig({
        customRules: [
          {
            type: "DOMAIN",
            value: "example.com",
            target: "DIRECT",
          } as never,
        ],
      })
    );
    expect(generatedRuleId.ok).toBe(true);
    if (generatedRuleId.ok) {
      expect(generatedRuleId.config.customRules[0].id).toBe(
        "custom-rule-domain-example-com-direct-1"
      );
    }

    expectInvalid({ customProxyGroups: "bad" as never }, "customProxyGroups 必须是数组");
    expectInvalid({ customProxyGroups: [1 as never] }, "customProxyGroups 只能包含对象");
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "",
            name: "Custom",
            emoji: "C",
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.id 不能为空"
    );
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "",
            emoji: "C",
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.name 不能为空"
    );
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "Custom",
            emoji: 1 as never,
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.emoji 必须是字符串"
    );
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "Custom",
            emoji: "C",
            groupType: "bad" as never,
          },
        ],
      },
      "customProxyGroups.groupType 无效"
    );
    expectInvalid({ proxyGroupAdvanced: [] as never }, "proxyGroupAdvanced 必须是对象");
    expectInvalid(
      {
        proxyGroupAdvanced: {
          missing: {},
        },
      },
      "proxyGroupAdvanced 包含未知代理组"
    );

    expect(
      validateSubBoostTemplateConfig(
        validConfig({
          customProxyGroups: [
            {
              id: "custom",
              name: "Custom",
              emoji: "C",
              memberSource: "filtered-nodes",
              groupType: "load-balance",
              strategy: "bad" as never,
            },
          ],
        })
      )
    ).toEqual({ ok: false, error: "customProxyGroups.strategy 无效" });

    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "Custom",
            emoji: "C",
            memberSource: "bad" as never,
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.memberSource 无效"
    );
    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "custom",
            name: "Custom",
            emoji: "C",
            includeInGroupMembers: "yes" as never,
            groupType: "select",
          },
        ],
      },
      "customProxyGroups.includeInGroupMembers 必须是布尔值"
    );

    expectInvalid(
      {
        customProxyGroups: [
          {
            id: "legacy",
            name: "Legacy",
            emoji: "L",
            groupType: "select",
            rules: [],
          } as never,
        ],
      },
      "模板配置包含已移除字段: customProxyGroups[0].rules"
    );

    const validCustomGroup = validateSubBoostTemplateConfig(
      validConfig({
        customProxyGroups: [
          {
            id: "balance",
            name: "Balance",
            emoji: "B",
            description: "  Media group  ",
            memberSource: "filtered-nodes",
            includeInGroupMembers: false,
            groupType: "load-balance",
            advanced: {
              sourceIds: ["source-a"],
            },
          },
        ],
      })
    );
    expect(validCustomGroup.ok && validCustomGroup.config.customProxyGroups[0]).toMatchObject({
      advanced: { sourceIds: ["source-a"] },
      description: "Media group",
      strategy: "consistent-hashing",
    });

    const validSelectGroup = validateSubBoostTemplateConfig(
      validConfig({
        customProxyGroups: [
          {
            id: "manual",
            name: "Manual",
            emoji: "",
            includeInGroupMembers: true,
            groupType: "select",
          },
        ],
      })
    );
    expect(validSelectGroup.ok).toBe(true);
    if (validSelectGroup.ok) {
      expect(validSelectGroup.config.customProxyGroups[0]).toEqual({
        id: "manual",
        name: "Manual",
        emoji: "",
        includeInGroupMembers: true,
        groupType: "select",
        advanced: {},
      });
    }

    const removedField = `filtered${"ProxyGroups"}`;
    expectInvalid({ [removedField]: [] } as never, `模板配置包含已移除字段: ${removedField}`);
  });
});
