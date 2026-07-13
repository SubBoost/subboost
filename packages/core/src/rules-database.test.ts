import { describe, expect, it } from "vitest";
import {
  ALL_RULES,
  GEOIP_RULES,
  GEOSITE_RULES,
  RULE_CATEGORIES,
  TOTAL_RULES_COUNT,
} from "./rules-database";

describe("rules database index", () => {
  it("exports a merged rule index and category metadata", () => {
    expect(TOTAL_RULES_COUNT).toBe(GEOSITE_RULES.length + GEOIP_RULES.length);
    expect(ALL_RULES).toHaveLength(TOTAL_RULES_COUNT);
    expect(RULE_CATEGORIES.ai.name).toBe("AI 服务");
    expect(GEOSITE_RULES[0]).toMatchObject({
      behavior: "domain",
      format: "mrs",
    });
    expect(GEOIP_RULES[0]).toMatchObject({
      id: "cn-ip",
      behavior: "ipcidr",
      format: "mrs",
    });
  });
});
