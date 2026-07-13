import { describe, expect, it, vi } from "vitest";
import {
  buildRuleSetUrlFromPath,
  collectCustomRoutingRuleSets,
  extractRuleSetPathFromUrl,
  getRuleSetTargetValue,
  normalizeRuleSetPathInput,
  parseRuleSetTargetValue,
} from "./custom-routing-rule-sets";
import { parseCustomRuleBatchImport } from "./custom-rule-batch-import";
import {
  createCustomRuleId,
  ensureCustomRuleId,
  ensureCustomRulesHaveIds,
  getCustomRuleOrderKey,
  isCustomRuleType,
  listEditableRuleOrderKeys,
} from "./custom-rule-utils";
import type { CustomProxyGroup, CustomRule, CustomRuleSet } from "@subboost/core/types/config";

describe("custom routing rule set helpers", () => {
  it("parses, normalizes, and builds rule-set targets and paths", () => {
    expect(getRuleSetTargetValue({ kind: "module", id: "select" })).toBe("module:select");
    expect(parseRuleSetTargetValue(" module: select ")).toEqual({ kind: "module", id: "select" });
    expect(parseRuleSetTargetValue("custom:custom-a")).toEqual({ kind: "custom", id: "custom-a" });
    expect(parseRuleSetTargetValue("module: ")).toBeNull();
    expect(parseRuleSetTargetValue("custom: ")).toBeNull();
    expect(parseRuleSetTargetValue("other:select")).toBeNull();

    expect(extractRuleSetPathFromUrl("https://cdn.example/rules/geosite/openai.mrs?token=1")).toBe(
      "https://cdn.example/rules/geosite/openai.mrs?token=1"
    );
    expect(extractRuleSetPathFromUrl("plain/rule.txt")).toBe("plain/rule.txt");
    expect(normalizeRuleSetPathInput(" /geoip/cn.mrs ")).toBe("geoip/cn.mrs");
    expect(buildRuleSetUrlFromPath("geosite/openai.mrs", "https://rules.example/base/")).toBe(
      "https://rules.example/base/geosite/openai.mrs"
    );
    expect(buildRuleSetUrlFromPath("https://cdn.example/plain-rule.txt", "https://rules.example")).toBe(
      "https://cdn.example/plain-rule.txt"
    );
  });

  it("collects module and custom rule-set items while skipping incomplete rows", () => {
    const customProxyGroups = [
      {
        id: "custom-a",
        name: "Custom A",
        emoji: "",
        groupType: "select",
      },
      { id: "", name: "skip", emoji: "", groupType: "select" },
    ] as CustomProxyGroup[];

    const items = collectCustomRoutingRuleSets({
      customProxyGroups,
      customRuleSets: [
        {
          id: "module-rule",
          name: "",
          behavior: "ipcidr",
          path: "/geoip/private.mrs",
          target: "🚀 Custom Select",
          noResolve: true,
        },
        {
          id: "custom-rule",
          name: "",
          behavior: "domain",
          path: "https://cdn.example/geosite/custom.mrs",
          target: "Custom A",
          noResolve: true,
        },
        { id: "", name: "skip", behavior: "domain", path: "geosite/skip.mrs", target: "Custom A" },
        { id: "missing-path", name: "missing path", behavior: "domain", path: "", target: "Custom A" },
        { id: "missing-module", name: "missing module", behavior: "domain", path: "geosite/missing.mrs", target: { kind: "module", id: "missing" } },
        { id: "missing-custom", name: "missing custom", behavior: "domain", path: "geosite/missing.mrs", target: { kind: "custom", id: "missing" } },
        { id: "blank-custom", name: "blank custom", behavior: "domain", path: "geosite/blank.mrs", target: { kind: "custom", id: "" } },
        { id: "blank-target", name: "blank target", behavior: "domain", path: "geosite/blank-target.mrs", target: " " },
      ],
      proxyGroupNameOverrides: { select: "Custom Select" },
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "custom-rule-set:module-rule",
          source: { kind: "custom-rule-set", id: "module-rule" },
          id: "module-rule",
          name: "module-rule",
          behavior: "ipcidr",
          path: "geoip/private.mrs",
          target: expect.objectContaining({ id: "select", value: "module:select" }),
          noResolve: true,
        }),
        expect.objectContaining({
          key: "custom-rule-set:custom-rule",
          source: { kind: "custom-rule-set", id: "custom-rule" },
          id: "custom-rule",
          name: "custom-rule",
          path: "https://cdn.example/geosite/custom.mrs",
          target: expect.objectContaining({ id: "custom-a", value: "custom:custom-a" }),
          noResolve: true,
        }),
      ])
    );
    expect(items).toHaveLength(2);
  });
});

describe("custom rule id and order helpers", () => {
  it("creates, fills, lists, and reconciles editable rule ids", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(createCustomRuleId()).toBe("custom-rule-123-i");
    vi.restoreAllMocks();

    const ruleWithoutId = ensureCustomRuleId(
      { type: "DOMAIN", value: "Example.COM", target: "Proxy" },
      1
    );
    expect(ruleWithoutId.id).toBe("custom-rule-domain-example-com-proxy-2");
    expect(ensureCustomRuleId({ type: "" as never, value: "!!!", target: "" }, 0).id).toBe(
      "custom-rule-item-item-item-1"
    );
    expect(ensureCustomRuleId({ id: " existing ", type: "DOMAIN", value: "a.com", target: "Proxy" }).id).toBe(
      "existing"
    );
    expect(ensureCustomRulesHaveIds("bad" as never)).toEqual([]);
    expect(isCustomRuleType("DOMAIN")).toBe(true);
    expect(isCustomRuleType("BAD")).toBe(false);

    const customRules = [ruleWithoutId];
    const customRuleSets = [
      {
        id: "rule-a",
        name: "Rule A",
        behavior: "domain",
        path: "geosite/a.mrs",
        target: "Group A",
      },
      {
        id: " ",
        name: "Skip",
        behavior: "domain",
        path: "geosite/b.mrs",
        target: "Group A",
      },
    ] as CustomRuleSet[];

    expect(getCustomRuleOrderKey("r1")).toBe("custom-rule:r1");
    expect(listEditableRuleOrderKeys(customRules, customRuleSets)).toEqual([
      `custom-rule:${ruleWithoutId.id}`,
      "custom-rule-set:rule-a",
    ]);
  });
});

describe("custom rule batch import", () => {
  it("previews ready, skipped, error, and duplicate rows", () => {
    const existingRules: CustomRule[] = [
      { id: "existing", type: "DOMAIN", value: "existing.com", target: "PROXY", noResolve: false },
    ];
    const result = parseCustomRuleBatchImport({
      text: [
        "",
        "# comment",
        "// comment",
        "\"unterminated",
        "example.org",
        "UNKNOWN,value,PROXY",
        "DOMAIN,,PROXY",
        "DOMAIN,example.com,",
        "DOMAIN,example.net,REJECT",
        "DOMAIN,example.com,PROXY,no-resolve,extra",
        "DOMAIN,example.com,PROXY,bad",
        "DOMAIN,existing.com,PROXY",
        "DOMAIN,batch.com,PROXY",
        "DOMAIN,batch.com,PROXY",
        "\"DOMAIN-SUFFIX\",\"quoted,domain\",\"DIRECT\"",
        "\"DOMAIN\",\"a\"\"b.com\",\"PROXY\"",
      ].join("\r\n"),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "PROXY",
      defaultNoResolve: true,
      targetOptions: ["DIRECT", "PROXY"],
      existingRules,
    });

    expect(result.readyCount).toBe(4);
    expect(result.skippedCount).toBe(3);
    expect(result.errorCount).toBe(7);
    expect(result.duplicateCount).toBe(2);
    expect(result.canImport).toBe(false);
    expect(result.items.map((item) => item.status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "error",
      "ready",
      "error",
      "error",
      "error",
      "error",
      "error",
      "error",
      "duplicate",
      "ready",
      "duplicate",
      "ready",
      "ready",
    ]);
    expect(result.rules).toEqual([
      expect.objectContaining({ type: "DOMAIN-SUFFIX", value: "example.org", target: "PROXY", noResolve: true }),
      expect.objectContaining({ type: "DOMAIN", value: "batch.com", target: "PROXY", noResolve: false }),
      expect.objectContaining({ type: "DOMAIN-SUFFIX", value: "quoted,domain", target: "DIRECT", noResolve: false }),
      expect.objectContaining({ type: "DOMAIN", value: "a\"b.com", target: "PROXY", noResolve: false }),
    ]);
  });

  it("handles YAML list edge cases and all-ready imports", () => {
    const skipped = parseCustomRuleBatchImport({
      text: ["rules:", "-", "- # nested comment", "- // nested comment"].join("\n"),
      defaultType: "DOMAIN",
      defaultTarget: "PROXY",
      defaultNoResolve: false,
      targetOptions: ["PROXY"],
      existingRules: [],
    });

    expect(skipped.items.map((item) => item.message)).toEqual(["rules 块标记", "空 YAML 列表项", "注释", "注释"]);
    expect(skipped.canImport).toBe(false);

    const ready = parseCustomRuleBatchImport({
      text: ["- DOMAIN,example.com", "- DOMAIN-SUFFIX,example.org,PROXY"].join("\n"),
      defaultType: "DOMAIN",
      defaultTarget: "PROXY",
      defaultNoResolve: true,
      targetOptions: ["PROXY"],
      existingRules: [],
    });

    expect(ready.items.map((item) => item.status)).toEqual(["ready", "ready"]);
    expect(ready.rules).toEqual([
      expect.objectContaining({ type: "DOMAIN", value: "example.com", target: "PROXY", noResolve: true }),
      expect.objectContaining({ type: "DOMAIN-SUFFIX", value: "example.org", target: "PROXY", noResolve: false }),
    ]);
    expect(ready.canImport).toBe(true);
  });

  it("defaults two-column rules and matches duplicate object targets", () => {
    const result = parseCustomRuleBatchImport({
      text: [
        "DOMAIN,two-column.example",
        "DOMAIN,object.example,custom:custom-a",
      ].join("\n"),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "PROXY",
      defaultNoResolve: true,
      targetOptions: ["PROXY", "custom:custom-a"],
      existingRules: [
        {
          id: "existing-object",
          type: "DOMAIN",
          value: "object.example",
          target: { kind: "custom", id: "custom-a" },
          noResolve: false,
        } as CustomRule,
      ],
    });

    expect(result.items.map((item) => item.status)).toEqual([
      "ready",
      "duplicate",
    ]);
    expect(result.rules).toEqual([
      expect.objectContaining({
        type: "DOMAIN",
        value: "two-column.example",
        target: "PROXY",
        noResolve: true,
      }),
    ]);
  });
});
