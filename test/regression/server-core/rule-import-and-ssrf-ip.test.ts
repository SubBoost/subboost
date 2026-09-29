import { describe, expect, it, vi } from "vitest";
import {
  buildCnRuleVariantIds,
  buildLocalCnRuleCandidates,
  buildCnRuleCandidatesFromSources,
  collectCnCandidateParents,
  normalizeRuleListLines,
} from "../../../packages/core/src/rules/cn-candidate-utils";
import { parseCustomRuleBatchImport } from "../../../packages/core/src/rules/custom-rule-batch-import";
import { isPrivateOrReservedIp } from "../../../packages/server-core/src/subscription/ssrf-ip";

describe("public rule and SSRF edge branch coverage", () => {
  it("parses sparse custom-rule batch imports without losing row diagnostics", () => {
    const result = parseCustomRuleBatchImport({
      text: [
        "-   ",
        "- # yaml comment",
        ",DIRECT",
        "DOMAIN,three-column.example.com,DIRECT",
        "DOMAIN,two-column.example.com",
        "one-column.example.com",
      ].join("\n"),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "DIRECT",
      defaultNoResolve: true,
      targetOptions: ["DIRECT"],
      existingRules: [],
    });

    expect(result.items.map((item) => `${item.status}:${item.message}`)).toEqual([
      "skipped:空 YAML 列表项",
      "skipped:注释",
      "error:规则为空",
      "ready:可导入",
      "ready:可导入",
      "ready:可导入",
    ]);
    expect(result.rules).toEqual([
      expect.objectContaining({ type: "DOMAIN", value: "three-column.example.com", noResolve: false }),
      expect.objectContaining({ type: "DOMAIN", value: "two-column.example.com", noResolve: true }),
      expect.objectContaining({ type: "DOMAIN-SUFFIX", value: "one-column.example.com", noResolve: true }),
    ]);
  });

  it("sorts CN candidates across module, parent, variant, and lexical fallback branches", () => {
    expect(normalizeRuleListLines([undefined as never, " DOMAIN,a.com ", "DOMAIN,a.com", "# skip"])).toEqual([
      "DOMAIN,a.com",
    ]);

    const candidates = buildCnRuleCandidatesFromSources(
      [
        {
          id: "same@cn",
          parentModuleId: "z-module",
          parentRuleId: "same",
          variantKind: "at-cn",
          lines: ["DOMAIN,same.example"],
        },
        {
          id: "same-cn-b",
          parentModuleId: "z-module",
          parentRuleId: "same",
          variantKind: "dash-cn",
          lines: ["DOMAIN,same.example"],
        },
        {
          id: "same-cn-a",
          parentModuleId: "z-module",
          parentRuleId: "same",
          variantKind: "dash-cn",
          lines: ["DOMAIN,same.example"],
        },
        {
          id: "covered-cn",
          parentModuleId: "a-module",
          parentRuleId: "covered",
          variantKind: "dash-cn-at-cn",
          lines: ["DOMAIN,covered.example"],
        },
        {
          id: "empty-cn",
          parentModuleId: "a-module",
          parentRuleId: "empty",
          variantKind: "dash-cn",
          lines: ["", "# only comments"],
        },
      ],
      ["DOMAIN,covered.example"],
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "covered-cn",
      "empty-cn",
      "same-cn-a",
      "same-cn-b",
      "same@cn",
    ]);
    expect(candidates.find((candidate) => candidate.id === "same-cn-a")).toMatchObject({
      canonicalId: "same-cn-a",
      actionable: true,
    });
    expect(candidates.find((candidate) => candidate.id === "same-cn-b")).toMatchObject({
      duplicateOf: "same-cn-a",
      actionable: false,
    });
    expect(candidates.find((candidate) => candidate.id === "covered-cn")).toMatchObject({
      coveredByGeolocationCn: true,
      actionable: false,
    });
    expect(candidates.find((candidate) => candidate.id === "empty-cn")).toMatchObject({
      empty: true,
      actionable: false,
    });
  });

  it("builds local CN variants and filters parent candidates without duplicating aliases", () => {
    expect(buildCnRuleVariantIds("")).toEqual([]);
    expect(buildCnRuleVariantIds("google-!cn").map((item) => item.id)).toEqual([
      "google-!cn-cn",
      "google-!cn@cn",
      "google-!cn-cn@cn",
      "google-cn",
      "google@cn",
      "google-cn@cn",
    ]);

    const parents = collectCnCandidateParents(["", "youtube", "youtube"], {
      excludedRuleKeys: ["youtube:youtube"],
      defaultToAll: false,
    });
    expect(parents.some((parent) => parent.parentModuleId === "youtube" && parent.parentRuleId === "youtube")).toBe(false);

    const candidates = buildLocalCnRuleCandidates({ moduleIds: ["youtube"], excludedRuleKeys: [] });
    expect(candidates.every((candidate) => candidate.path.startsWith("geosite/"))).toBe(true);
    expect(candidates.map((candidate) => candidate.id)).toEqual([...candidates.map((candidate) => candidate.id)].sort());
  });

  it("reports every custom-rule import branch with actionable diagnostics", () => {
    const result = parseCustomRuleBatchImport({
      text: [
        "rules:",
        "-",
        "\"unterminated",
        "UNKNOWN,value,DIRECT",
        "DOMAIN,,DIRECT",
        "DOMAIN,missing-target,",
        "DOMAIN,unknown-target,UNKNOWN",
        "IP-CIDR,10.0.0.0/8,DIRECT,bad-tail",
        "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
        "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
        "DOMAIN,existing.example,DIRECT",
      ].join("\n"),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "DIRECT",
      defaultNoResolve: false,
      targetOptions: ["DIRECT"],
      existingRules: [
        { id: "existing", type: "DOMAIN", value: "existing.example", target: "DIRECT", noResolve: false },
      ],
    });

    expect(result.items.map((item) => `${item.status}:${item.message}`)).toEqual([
      "skipped:rules 块标记",
      "skipped:空 YAML 列表项",
      "error:引号未闭合",
      "error:未知规则类型：UNKNOWN",
      "error:规则值不能为空",
      "ready:可导入",
      "error:未知目标：UNKNOWN",
      "error:不支持的尾列：bad-tail",
      "ready:可导入",
      "duplicate:与本次导入的规则重复",
      "duplicate:与现有规则重复",
    ]);
    expect(result).toMatchObject({
      readyCount: 2,
      skippedCount: 2,
      errorCount: 5,
      duplicateCount: 2,
      canImport: false,
    });
  });

  it("classifies SSRF IP boundary values that exercise mapped IPv6 fallbacks", () => {
    expect(isPrivateOrReservedIp("0.0.0.0")).toBe(true);
    expect(isPrivateOrReservedIp("192.88.99.1")).toBe(true);
    expect(isPrivateOrReservedIp("223.255.255.255")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:0")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:0:0:0")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:0a00:0001")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:0808:0808")).toBe(false);
    expect(isPrivateOrReservedIp("fe7f::1")).toBe(true);
  });

  it("formats local CN candidates with controlled rule metadata and stable sort order", async () => {
    vi.resetModules();
    vi.doMock("@subboost/core/generator/proxy-group-modules", () => ({
      PROXY_GROUP_MODULES: [
        {
          id: "beta",
          category: "media",
          rules: [
            { id: "same", behavior: "domain", path: "geosite/same.mrs" },
            { id: "empty-name", behavior: "domain", path: "geosite/empty-name.mrs" },
          ],
        },
        {
          id: "alpha",
          category: "media",
          rules: [
            { id: "same", behavior: "domain", path: "geosite/same.mrs" },
            { id: "other", behavior: "domain", path: "geosite/other.mrs" },
          ],
        },
        {
          id: "core",
          category: "core",
          rules: [{ id: "core-only", behavior: "domain", path: "geosite/core-only.mrs" }],
        },
      ],
    }));
    vi.doMock("@subboost/core/rules-database", () => ({
      ALL_RULES: [
        { id: "same-cn", name: "Same", nameZh: "同名", behavior: "domain" },
        { id: "same@cn", name: "Same At", nameZh: "Same At", behavior: "domain" },
        { id: "same-cn@cn", name: "   ", nameZh: "Alias", behavior: "domain" },
        { id: "other-cn", name: "Other", nameZh: "", behavior: "domain" },
        { id: "empty-name-cn", name: "   ", nameZh: "   ", behavior: "domain" },
      ],
    }));

    try {
      const { buildLocalCnRuleCandidates } = await import(
        "../../../packages/core/src/rules/cn-candidate-utils"
      );

      const candidates = buildLocalCnRuleCandidates({
        moduleIds: ["beta", "alpha"],
        excludedRuleKeys: [],
      });

      expect(candidates.map((candidate) => `${candidate.parentModuleId}:${candidate.parentRuleId}:${candidate.id}`)).toEqual([
        "alpha:other:other-cn",
        "alpha:same:same-cn",
        "alpha:same:same@cn",
        "alpha:same:same-cn@cn",
        "beta:empty-name:empty-name-cn",
        "beta:same:same-cn",
        "beta:same:same@cn",
        "beta:same:same-cn@cn",
      ]);
      expect(candidates.map((candidate) => candidate.name)).toEqual([
        "Other",
        "Same（同名）",
        "Same At",
        "same-cn@cn（Alias）",
        "empty-name-cn",
        "Same（同名）",
        "Same At",
        "same-cn@cn（Alias）",
      ]);
    } finally {
      vi.doUnmock("@subboost/core/generator/proxy-group-modules");
      vi.doUnmock("@subboost/core/rules-database");
      vi.resetModules();
    }
  });
});
