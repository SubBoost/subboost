import { describe, expect, it } from "vitest";
import { parseCustomRuleBatchImport, type ParseCustomRuleBatchImportOptions } from "./custom-rule-batch-import";
import { CUSTOM_RULE_TYPES } from "./custom-rule-utils";
import { allocateRuleSetId } from "./rule-model";

const url = "https://local.subboost.test/geosite/udemy.mrs";
function parse(text: string, overrides: Partial<ParseCustomRuleBatchImportOptions> = {}) {
  return parseCustomRuleBatchImport({ text, defaultType: "RULE-SET", defaultTarget: "Proxy", defaultNoResolve: true,
    targetOptions: ["Proxy", "Other", "DIRECT"], existingRules: [], ...overrides });
}

describe("batch import current selections", () => {
  it.each(CUSTOM_RULE_TYPES)("inherits the selected %s type, target and no-resolve for plain values", (defaultType) => {
    const result = parse("value", { defaultType });
    expect(result.canImport).toBe(true);
    expect(result.rules).toEqual([{ id: "", type: defaultType, value: "value", target: "Proxy", noResolve: true }]);
  });
  it("creates named providers for plain URLs and explicit RULE-SET rows, including empty target columns", () => {
    const result = parse(`${url}\nRULE-SET,${url}?v=2,\nRULE-SET,${url}?v=3,Other,no-resolve`, { reservedRuleSetIds: ["udemy"] });
    expect(result.canImport).toBe(true);
    expect(result.rules).toEqual([]);
    expect(result.ruleSets.map((rule) => [rule.id, rule.name, rule.target])).toEqual([
      ["udemy-2", "udemy-2", "Proxy"], ["udemy-3", "udemy-3", "Proxy"], ["udemy-4", "udemy-4", "Other"],
    ]);
    expect(result.items.every((item) => item.rule?.type === "RULE-SET")).toBe(true);
    expect(result.ruleSets.every((rule) => rule.noResolve)).toBe(true);
  });
  it("preserves explicit types in a mixed batch and uses the selected target when omitted", () => {
    const result = parse(`${url}\nDOMAIN,example.com,\nIP-CIDR,203.0.113.0/24,DIRECT,no-resolve`);
    expect(result.canImport).toBe(true);
    expect(result.readyCount).toBe(3);
    expect(result.rules.map((rule) => [rule.type, rule.target])).toEqual([["DOMAIN", "Proxy"], ["IP-CIDR", "DIRECT"]]);
    expect(result.ruleSets[0].id).toBe("udemy");
  });
  it("blocks duplicate providers and invalid targets without silently treating them as domains", () => {
    expect(parse(`${url}\n${url}`)).toMatchObject({ canImport: false, duplicateCount: 1 });
    expect(parse(url, { existingRuleSets: [{ id: "udemy", name: "udemy", path: url, behavior: "domain", target: "Proxy", noResolve: true }] }))
      .toMatchObject({ canImport: false, duplicateCount: 1 });
    expect(parse(url, { defaultTarget: "DIRECT" })).toMatchObject({ canImport: false, errorCount: 1 });
    expect(parse("RULE-SET,unknown")).toMatchObject({ canImport: false, errorCount: 1 });
    expect(parse(url, { ruleSetTargetOptions: ["Other"] })).toMatchObject({ canImport: false, errorCount: 1 });
    expect(parse("value", { defaultType: "DOMAIN", defaultTarget: "" })).toMatchObject({ canImport: false, errorCount: 1 });
  });
  it("allocates readable unique IDs and removes unsafe filename characters", () => {
    expect(allocateRuleSetId("udemy", ["udemy", "udemy-2"])).toBe("udemy-3");
    expect(allocateRuleSetId("../udemy,one", [])).toBe("-udemy-one");
    expect(allocateRuleSetId("...", [])).toBe("ruleset");
  });
});
