import { describe, expect, it } from "vitest";
import { sourceTypeInfo, templates } from "./constants";
import { getTemplateList } from "@subboost/core/templates";

describe("quick mode constants", () => {
  it("defines all supported source type labels and placeholders", () => {
    expect(Object.keys(sourceTypeInfo).sort()).toEqual(["nodes", "url", "yaml"]);
    expect(sourceTypeInfo.url).toMatchObject({
      label: "订阅链接",
      placeholder: "https://example.com/sub?token=xxx",
    });
    expect(sourceTypeInfo.yaml.placeholder).toContain("proxies:");
    expect(sourceTypeInfo.nodes.placeholder).toContain("hysteria2");
  });

  it("keeps the quick template picker ordered from minimal to full", () => {
    expect(templates.map((item) => item.id)).toEqual(["minimal", "standard", "full"]);
    expect(templates.map((item) => item.name)).toEqual(["精简版", "标准版", "完整版"]);
    expect(templates[0].groups).toBeLessThan(templates[2].groups);
    expect(templates[0].rules).toBeLessThan(templates[2].rules);
    const currentCounts = new Map(
      getTemplateList().map((template) => [template.id, [template.groupCount, template.ruleCount]])
    );
    for (const template of templates) {
      expect([template.groups, template.rules]).toEqual(currentCounts.get(template.id));
    }
  });
});
