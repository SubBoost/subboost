import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../types/node";
import {
  NODE_NAME_FILTER_MAX_REGEXES,
  NodeNameFilterConfigError,
  normalizeNodeNameFilterConfig,
  parseNodeNameFilterConfig,
  resolveNodeNameFilter,
  validateNodeNameFilterConfig,
} from "./node-name-filter";

function node(name: string, originName?: string): ParsedNode {
  return {
    name,
    type: "trojan",
    server: `${name.toLowerCase()}.example.com`,
    port: 443,
    password: "secret",
    ...(originName === undefined ? {} : { _originName: originName }),
  };
}

function unsafeNestedQuantifierPattern(): string {
  const plus = String.fromCharCode(43);
  return `(a${plus})${plus}$`;
}

describe("node name filter config", () => {
  it("keeps independent switches and patterns across normalization and applies only enabled filters", () => {
    const nodes = [node("日本"), node("日本 过期"), node("美国")];
    const config = { enabled: true, includeEnabled: false, excludeEnabled: false, includeRegexes: ["日本"], excludeRegexes: ["过期"] };
    expect(parseNodeNameFilterConfig(config)).toEqual(config);
    expect(resolveNodeNameFilter(nodes, config).effectiveCount).toBe(3);
    expect(resolveNodeNameFilter(nodes, { ...config, includeEnabled: true }).effectiveCount).toBe(2);
    expect(resolveNodeNameFilter(nodes, { ...config, excludeEnabled: true }).effectiveCount).toBe(2);
    expect(resolveNodeNameFilter(nodes, { ...config, includeEnabled: true, excludeEnabled: true }).effectiveCount).toBe(1);
    expect(validateNodeNameFilterConfig({ ...config, includeEnabled: "yes" }).ok).toBe(false);
    expect(validateNodeNameFilterConfig({ ...config, excludeEnabled: 1 }).ok).toBe(false);
  });
  it("keeps any included original name, with exclusions taking precedence", () => {
    const nodes = [node("renamed", "日本 01"), node("新加坡 02"), node("日本 过期"), node("美国 01")];
    const config = { enabled: true, includeRegexes: [" 日本|新加坡 ", "日本|新加坡"], excludeRegexes: ["过期"] };
    expect(validateNodeNameFilterConfig(config)).toEqual({ ok: true, config: { enabled: true, includeRegexes: ["日本|新加坡"], excludeRegexes: ["过期"] } });
    expect(parseNodeNameFilterConfig(config).includeRegexes).toEqual(["日本|新加坡"]);
    expect(resolveNodeNameFilter(nodes, config).effectiveNodes).toEqual(nodes.slice(0, 2));
    expect(resolveNodeNameFilter(nodes, { ...config, excludeRegexes: [] }).effectiveCount).toBe(3);
    expect(resolveNodeNameFilter(nodes, { ...config, includeRegexes: ["不存在"] }).effectiveCount).toBe(0);
    expect(resolveNodeNameFilter(nodes, { ...config, enabled: false }).effectiveCount).toBe(4);
    expect(validateNodeNameFilterConfig({ ...config, includeRegexes: ["["] })).toMatchObject({
      ok: false, errors: [{ field: "includeRegexes", code: "invalid_regex", line: 1 }],
    });
  });
  it("treats a missing config as disabled and disables an empty enabled config", () => {
    expect(parseNodeNameFilterConfig(undefined)).toEqual({
      enabled: false,
      excludeRegexes: [],
    });
    expect(
      parseNodeNameFilterConfig({
        enabled: true,
        excludeRegexes: ["", "   "],
      })
    ).toEqual({
      enabled: false,
      excludeRegexes: [],
    });
  });

  it("trims rules, ignores empty lines, and deduplicates repeated lines", () => {
    expect(
      parseNodeNameFilterConfig({
        enabled: true,
        excludeRegexes: ["  hk|hong kong  ", "", "hk|hong kong", "  "],
      })
    ).toEqual({
      enabled: true,
      excludeRegexes: ["hk|hong kong"],
    });
  });

  it("keeps valid rules while the filter is disabled", () => {
    expect(
      parseNodeNameFilterConfig({
        enabled: false,
        excludeRegexes: ["expired", "traffic"],
      })
    ).toEqual({
      enabled: false,
      excludeRegexes: ["expired", "traffic"],
    });
  });

  it("reports the original line for invalid, unsafe, and non-string rules", () => {
    const result = validateNodeNameFilterConfig({
      enabled: true,
      excludeRegexes: ["valid", 123, "[", unsafeNestedQuantifierPattern()],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        { code: "invalid_line", line: 2, message: "规则必须是文本" },
        { code: "invalid_regex", line: 3, message: "正则语法无效" },
        { code: "unsafe_regex", line: 4, message: "正则可能导致运行时间过长" },
      ],
    });
  });

  it("enforces the unique rule count and per-rule length limits", () => {
    const tooMany = validateNodeNameFilterConfig({
      enabled: true,
      excludeRegexes: Array.from(
        { length: NODE_NAME_FILTER_MAX_REGEXES + 1 },
        (_, index) => `node-${index}`
      ),
    });
    expect(tooMany).toMatchObject({
      ok: false,
      errors: [
        {
          code: "too_many_regexes",
          line: NODE_NAME_FILTER_MAX_REGEXES + 1,
        },
      ],
    });

    expect(
      validateNodeNameFilterConfig({
        enabled: true,
        excludeRegexes: ["a".repeat(201)],
      })
    ).toMatchObject({
      ok: false,
      errors: [{ code: "regex_too_long", line: 1 }],
    });
  });

  it("counts limits after empty-line removal and deduplication", () => {
    expect(
      parseNodeNameFilterConfig({
        enabled: true,
        excludeRegexes: [
          "",
          ...Array.from({ length: NODE_NAME_FILTER_MAX_REGEXES }, (_, index) => `rule-${index}`),
          "rule-0",
          " ",
        ],
      }).excludeRegexes
    ).toHaveLength(NODE_NAME_FILTER_MAX_REGEXES);
  });

  it("strictly rejects malformed persisted config while normalize offers an explicit fallback", () => {
    expect(() => parseNodeNameFilterConfig({ enabled: "yes", excludeRegexes: [] })).toThrow(
      NodeNameFilterConfigError
    );

    try {
      parseNodeNameFilterConfig({
        enabled: true,
        excludeRegexes: ["(", unsafeNestedQuantifierPattern()],
      });
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NodeNameFilterConfigError);
      expect((error as NodeNameFilterConfigError).errors).toEqual([
        { code: "invalid_regex", line: 1, message: "正则语法无效" },
        { code: "unsafe_regex", line: 2, message: "正则可能导致运行时间过长" },
      ]);
    }

    expect(normalizeNodeNameFilterConfig({ enabled: "yes", excludeRegexes: [] })).toEqual({
      enabled: false,
      excludeRegexes: [],
    });
  });
});

describe("resolveNodeNameFilter", () => {
  it("matches original names case-insensitively and falls back to display names", () => {
    const renamed = node("Japan Premium", "HK IPLC");
    const legacy = node("hK legacy");
    const kept = node("Singapore", "SG IEPL");
    const result = resolveNodeNameFilter(
      [renamed, legacy, kept],
      {
        enabled: true,
        excludeRegexes: ["^hk"],
      }
    );

    expect(result).toEqual({
      rawNodes: [renamed, legacy, kept],
      effectiveNodes: [kept],
      excludedNodes: [renamed, legacy],
      rawCount: 3,
      excludedCount: 2,
      effectiveCount: 1,
    });
  });

  it("does not let display-name edits or duplicate origin names change matching semantics", () => {
    const first = node("Pinned Name", "Expired");
    const second = node("Expired (2)", "Expired");
    const renamedKeep = node("Expired", "Available");
    const result = resolveNodeNameFilter(
      [first, second, renamedKeep],
      {
        enabled: true,
        excludeRegexes: ["^expired$"],
      }
    );

    expect(result.excludedNodes).toEqual([first, second]);
    expect(result.effectiveNodes).toEqual([renamedKeep]);
  });

  it("returns the complete snapshot unchanged when disabled", () => {
    const nodes = [node("Expired")];
    const result = resolveNodeNameFilter(nodes, {
      enabled: false,
      excludeRegexes: ["expired"],
    });

    expect(result.rawNodes).toBe(nodes);
    expect(result.effectiveNodes).toBe(nodes);
    expect(result.excludedNodes).toEqual([]);
  });

  it("rejects invalid rules instead of exposing the unfiltered node list", () => {
    expect(() =>
      resolveNodeNameFilter([node("Node")], {
        enabled: true,
        excludeRegexes: [unsafeNestedQuantifierPattern()],
      })
    ).toThrow(NodeNameFilterConfigError);
  });
});
