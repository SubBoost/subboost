import { describe, expect, it } from "vitest";
import type { CustomRule } from "../types/config";
import {
  buildCnRuleCandidatesFromSources,
  buildLocalCnRuleCandidates,
  buildCnRuleVariantIds,
  collectCnCandidateParents,
  normalizeRuleListLines,
} from "./cn-candidate-utils";
import { parseCustomRuleBatchImport } from "./custom-rule-batch-import";
import {
  ensureCustomRuleId,
  ensureCustomRulesHaveIds,
  getCustomRuleOrderKey,
  isCustomRuleType,
  listEditableRuleOrderKeys,
} from "./custom-rule-utils";

describe("custom rule helpers", () => {
  it("normalizes custom rule ids and editable order keys", () => {
    const rule = ensureCustomRuleId(
      { id: " ", type: "DOMAIN-SUFFIX", value: "Example.COM", target: "DIRECT" },
      2
    );
    const existing = ensureCustomRuleId({
      id: "custom-id",
      type: "DOMAIN",
      value: "example.org",
      target: "Proxy",
    });

    expect(isCustomRuleType("DOMAIN-SUFFIX")).toBe(true);
    expect(isCustomRuleType("BAD")).toBe(false);
    expect(rule.id).toBe("custom-rule-domain-suffix-example-com-direct-3");
    expect(existing.id).toBe("custom-id");
    expect(ensureCustomRulesHaveIds([rule, { type: "DOMAIN", value: "x.com", target: "DIRECT" }])).toHaveLength(2);
    expect(getCustomRuleOrderKey("r1")).toBe("custom-rule:r1");
    expect(
      listEditableRuleOrderKeys(
        [rule],
        [
          {
            id: "nested",
            name: "Nested",
            behavior: "domain",
            path: "https://rules.example.com/a.mrs",
            target: "Group",
          },
        ]
      )
    ).toEqual([
      "custom-rule:custom-rule-domain-suffix-example-com-direct-3",
      "custom-rule-set:nested",
    ]);
  });

  it("previews batch custom rule imports with ready, skipped, error, and duplicate rows", () => {
    const existingRules: CustomRule[] = [
      {
        id: "existing",
        type: "DOMAIN",
        value: "exists.com",
        target: "DIRECT",
        noResolve: false,
      },
    ];
    const result = parseCustomRuleBatchImport({
      text: [
        "# comment",
        "single.example.com",
        'DOMAIN-SUFFIX,"quoted,example.com",Proxy,no-resolve',
        "BAD,value,DIRECT",
        "DOMAIN,exists.com,DIRECT",
        "DOMAIN,dup.com,DIRECT",
        "DOMAIN,dup.com,DIRECT",
        'DOMAIN,"broken',
      ].join("\n"),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "DIRECT",
      defaultNoResolve: false,
      targetOptions: ["DIRECT", "Proxy"],
      existingRules,
    });

    expect(result.readyCount).toBe(3);
    expect(result.skippedCount).toBe(1);
    expect(result.errorCount).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.canImport).toBe(false);
    expect(result.items.map((item) => item.status)).toEqual([
      "skipped",
      "ready",
      "ready",
      "error",
      "duplicate",
      "ready",
      "duplicate",
      "error",
    ]);
    expect(result.rules[1]).toMatchObject({
      type: "DOMAIN-SUFFIX",
      value: "quoted,example.com",
      target: "Proxy",
      noResolve: true,
    });
  });

  it("reports batch import column and target validation errors", () => {
    const result = parseCustomRuleBatchImport({
      text: [
        "// comment",
        "",
        "DOMAIN-SUFFIX,too,many,columns,here",
        "DOMAIN-SUFFIX,,DIRECT",
        "DOMAIN-SUFFIX,example.com,",
        "DOMAIN-SUFFIX,example.com,Unknown",
        "DOMAIN-SUFFIX,example.com,DIRECT,bad-tail",
      ].join("\n"),
      defaultType: "DOMAIN",
      defaultTarget: "DIRECT",
      defaultNoResolve: false,
      targetOptions: ["DIRECT"],
      existingRules: [],
    });

    expect(result.skippedCount).toBe(2);
    expect(result.errorCount).toBe(5);
    expect(result.canImport).toBe(false);
    expect(result.items.map((item) => item.message)).toContain("规则列数过多");
    expect(result.items.map((item) => item.message)).toContain("规则值不能为空");
    expect(result.items.map((item) => item.message)).toContain("目标不能为空");
    expect(result.items.map((item) => item.message)).toContain("未知目标：Unknown");
    expect(result.items.map((item) => item.message)).toContain("不支持的尾列：bad-tail");
  });

  it("rejects manual RULE-SET rows in Clash rules block imports", () => {
    const result = parseCustomRuleBatchImport({
      text: [
        "rules:",
        "  - RULE-SET,google@ads,Proxy",
        "- RULE-SET,google@search,🔍 谷歌服务",
        "RULE-SET,google@video,🔍 谷歌服务",
      ].join("\n"),
      defaultType: "DOMAIN",
      defaultTarget: "DIRECT",
      defaultNoResolve: false,
      targetOptions: ["DIRECT", "Proxy", "🔍 谷歌服务"],
      existingRules: [],
    });

    expect(result.readyCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.errorCount).toBe(3);
    expect(result.canImport).toBe(false);
    expect(result.items[0]).toMatchObject({ status: "skipped", message: "rules 块标记" });
    expect(result.items.slice(1).map((item) => item.message)).toEqual([
      "未知规则类型：RULE-SET",
      "未知规则类型：RULE-SET",
      "未知规则类型：RULE-SET",
    ]);
    expect(result.rules).toEqual([]);
  });
});

describe("CN rule candidate helpers", () => {
  it("builds CN variant ids from normal and negative-CN parent ids", () => {
    expect(buildCnRuleVariantIds("youtube")).toEqual([
      { id: "youtube-cn", variantKind: "dash-cn" },
      { id: "youtube@cn", variantKind: "at-cn" },
      { id: "youtube-cn@cn", variantKind: "dash-cn-at-cn" },
    ]);
    expect(buildCnRuleVariantIds("youtube-!cn")).toEqual([
      { id: "youtube-!cn-cn", variantKind: "dash-cn" },
      { id: "youtube-!cn@cn", variantKind: "at-cn" },
      { id: "youtube-!cn-cn@cn", variantKind: "dash-cn-at-cn" },
      { id: "youtube-cn", variantKind: "dash-cn" },
      { id: "youtube@cn", variantKind: "at-cn" },
      { id: "youtube-cn@cn", variantKind: "dash-cn-at-cn" },
    ]);
  });

  it("dedupes rule list lines and marks duplicate, empty, and geolocation-covered candidates", () => {
    expect(normalizeRuleListLines([" # ignored", "domain:a.com", "domain:a.com", "", "domain:b.com"])).toEqual([
      "domain:a.com",
      "domain:b.com",
    ]);

    const candidates = buildCnRuleCandidatesFromSources(
      [
        {
          id: "media-cn",
          parentModuleId: "media",
          parentRuleId: "media",
          variantKind: "dash-cn",
          lines: ["domain:a.com", "domain:b.com"],
        },
        {
          id: "media@cn",
          parentModuleId: "media",
          parentRuleId: "media",
          variantKind: "at-cn",
          lines: ["domain:b.com", "domain:a.com"],
        },
        {
          id: "empty-cn",
          parentModuleId: "media",
          parentRuleId: "media",
          variantKind: "dash-cn-at-cn",
          lines: ["# empty"],
        },
        {
          id: "covered-cn",
          parentModuleId: "media",
          parentRuleId: "media",
          variantKind: "dash-cn-at-cn",
          lines: ["domain:covered.com"],
        },
      ],
      ["domain:covered.com"]
    );
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    expect(byId.get("media-cn")).toMatchObject({
      canonicalId: "media-cn",
      actionable: true,
    });
    expect(byId.get("media@cn")).toMatchObject({
      canonicalId: "media-cn",
      duplicateOf: "media-cn",
      actionable: false,
    });
    expect(byId.get("empty-cn")).toMatchObject({
      empty: true,
      actionable: false,
    });
    expect(byId.get("covered-cn")).toMatchObject({
      coveredByGeolocationCn: true,
      actionable: false,
    });
  });

  it("collects local CN candidate parents with filters", () => {
    const parents = collectCnCandidateParents(["youtube"], {
      excludedRuleKeys: ["youtube:youtube"],
    });
    const localCandidates = buildLocalCnRuleCandidates({
      moduleIds: ["youtube"],
      excludedRuleKeys: ["youtube:youtube"],
    });

    expect(parents.some((parent) => parent.parentRuleId === "youtube")).toBe(false);
    expect(localCandidates.every((candidate) => candidate.parentModuleId === "youtube")).toBe(true);
    expect(localCandidates.every((candidate) => candidate.path.startsWith("geosite/"))).toBe(true);
  });
});
