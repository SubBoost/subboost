import { describe, expect, it } from "vitest";
import { normalizeRealityShortId } from "../../../packages/core/src/mihomo/reality";
import { stableJsonStringify } from "../../../packages/core/src/node-identity";
import { formatNodeNameFromTemplate } from "../../../packages/core/src/node-name-template";
import { isClientUpdatePlaceholderNode } from "../../../packages/core/src/parser/placeholder";
import { normalizePortsSpecValue } from "../../../packages/core/src/parser/port-spec";
import { buildCnRuleCandidatesFromSources } from "../../../packages/core/src/rules/cn-candidate-utils";
import { parseCustomRuleBatchImport } from "../../../packages/core/src/rules/custom-rule-batch-import";
import { collectCustomRoutingRuleSets } from "../../../packages/core/src/rules/custom-routing-rule-sets";
import { builtinIdToType, getBuiltinTemplateId } from "../../../packages/core/src/templates/builtin";
import { buildGenerateOptionsFromConfig } from "../../../packages/core/src/subscription/config-utils";
import {
  createSubscriptionImportErrorInfo,
  extractHttpStatus,
  getSubscriptionImportErrorBadgeText,
  normalizeSubscriptionImportErrorInfo,
} from "../../../packages/core/src/subscription/import-error";
import {
  NodeNameFilterConfigError,
  normalizeNodeNameFilterConfig,
  resolveNodeNameFilter,
  validateNodeNameFilterConfig,
} from "../../../packages/core/src/subscription/node-name-filter";
import {
  getNodeSourceIds,
  withNodeSourceId,
} from "../../../packages/core/src/subscription/node-source-state";
import {
  hasSubscriptionUserInfo,
  isPlausibleSubscriptionUserInfo,
  mergeSubscriptionUserInfo,
  normalizeSubscriptionUserInfo,
  parseSubscriptionUserInfo,
  resolveSubscriptionUserInfo,
} from "../../../packages/core/src/subscription/subscription-userinfo";
import { normalizeSubscriptionUrlInput } from "../../../packages/core/src/subscription/url-input";
import type { CustomProxyGroup, CustomRule } from "../../../packages/core/src/types/config";
import type { ParsedNode } from "../../../packages/core/src/types/node";

function infoNode(name: unknown): ParsedNode {
  return { name, type: "direct" } as never;
}

function ssNode(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase()}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  };
}

describe("core subscription and helper edge regressions", () => {
  it("parses sparse userinfo fields and rejects non-finite numeric text", () => {
    expect(parseSubscriptionUserInfo("=1; upload=; download=1e999; total=10; expire=2026-02-19")).toEqual({
      upload: undefined,
      download: undefined,
      total: 10,
      expire: Math.floor(Date.UTC(2026, 1, 19, 12) / 1000),
    });
    expect(parseSubscriptionUserInfo("upload=1;download=1;total=10")).toEqual({
      upload: 1,
      download: 1,
      total: 10,
      expire: undefined,
    });
  });

  it("uses node hints once and ignores non-string names", () => {
    const resolved = resolveSubscriptionUserInfo(
      {},
      [
        null as never,
        infoNode(7),
        infoNode("剩余流量: 8 GB"),
        infoNode("剩余订阅流量: 7 GB"),
        infoNode("套餐到期: 2026-03-01"),
        infoNode("订阅到期: 2026-04-01"),
        infoNode("总流量: 10 GB"),
      ],
    );
    expect(resolved).toMatchObject({
      upload: 2 * 1024 ** 3,
      download: 0,
      total: 10 * 1024 ** 3,
      expire: Math.floor(Date.UTC(2026, 2, 1, 12) / 1000),
    });
  });

  it("normalizes and merges partial traffic snapshots", () => {
    expect(hasSubscriptionUserInfo({ download: 0 })).toBe(true);
    expect(isPlausibleSubscriptionUserInfo({ total: 10, upload: 1, download: 1 })).toBe(false);
    expect(normalizeSubscriptionUserInfo({ upload: Number.POSITIVE_INFINITY, download: 2, total: 3 })).toEqual({
      download: 2,
      total: 3,
    });
    expect(mergeSubscriptionUserInfo({ download: 1 }, { download: 2 })).toEqual({ download: 3 });
  });

  it("normalizes structured import errors with empty and non-array optional values", () => {
    expect(extractHttpStatus("no HTTP status here")).toBeNull();
    expect(
      createSubscriptionImportErrorInfo({
        category: "network",
        message: " ",
        detail: "connection refused",
      }),
    ).toMatchObject({ message: "" });
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "security",
        message: "blocked",
        suggestedActions: [],
        at: 1,
      }),
    ).toBe("安全");
    expect(
      normalizeSubscriptionImportErrorInfo({
        category: "network",
        message: "connection refused",
        suggestedActions: "retry",
        at: "later",
      }),
    ).toMatchObject({
      category: "network",
      message: "connection refused",
      suggestedActions: expect.any(Array),
    });
  });

  it("reports invalid node-filter containers and only one too-many error", () => {
    expect(validateNodeNameFilterConfig("bad")).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "invalid_config" })],
    });
    expect(
      validateNodeNameFilterConfig({
        enabled: true,
        excludeRegexes: Array.from({ length: 23 }, (_, index) => `rule-${index}`),
      }),
    ).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "too_many_regexes", line: 21 })],
    });
    expect(normalizeNodeNameFilterConfig("bad")).toEqual({ enabled: false, excludeRegexes: [] });
    expect(() => resolveNodeNameFilter([ssNode("Node")], { enabled: true, excludeRegexes: ["("] })).toThrow(
      NodeNameFilterConfigError,
    );
  });

  it("imports YAML-list and sparse custom rules with target validation", () => {
    const existingRules: CustomRule[] = [
      { id: "existing", type: "DOMAIN", value: "existing.example", target: "DIRECT" },
    ];
    const result = parseCustomRuleBatchImport({
      text: [
        "-",
        "- # nested comment",
        "DOMAIN,two-column.example",
        "DOMAIN,explicit.example,DIRECT,no-resolve",
        "DOMAIN,existing.example,DIRECT",
        "DOMAIN,value,",
      ].join("\n"),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "DIRECT",
      defaultNoResolve: true,
      targetOptions: ["DIRECT"],
      existingRules,
    });
    expect(result.items.map((item) => item.status)).toEqual([
      "skipped",
      "skipped",
      "ready",
      "ready",
      "duplicate",
      "ready",
    ]);
  });

  it("collects only resolvable custom routing rule sets", () => {
    const customProxyGroups = [
      { id: "valid", name: "Valid", emoji: "", groupType: "select" },
      { id: "blank", name: " ", emoji: "", groupType: "select" },
    ] as CustomProxyGroup[];
    const items = collectCustomRoutingRuleSets({
      customProxyGroups,
      customRuleSets: [
        { id: "module", name: "", behavior: "domain", path: "geosite/test.mrs", target: { kind: "module", id: "auto" } },
        { id: "custom", name: "", behavior: "domain", path: "geosite/custom.mrs", target: { kind: "custom", id: "valid" } },
        { id: "missing", name: "", behavior: "domain", path: "geosite/missing.mrs", target: { kind: "custom", id: "missing" } },
      ],
      proxyGroupNameOverrides: { auto: "Auto" },
    });
    expect(items.map((item) => item.id)).toEqual(["module", "custom"]);
  });

  it("normalizes sparse persisted generator configuration", () => {
    const options = buildGenerateOptionsFromConfig(
      {
        builtinRuleEdits: { " ": { enabled: true }, valid: null, disabled: { enabled: false } },
        listenerPorts: { " ": 12000, valid: 12001 },
        proxyGroupNameOverrides: { " ": "bad", valid: " Valid " },
        groupListeners: [null, { id: "", target: { kind: "module", id: "" }, port: 0 }],
      },
      { nodes: [ssNode("Node")] },
    );
    expect(options.userConfig?.listenerPorts).toEqual({ valid: 12001 });
    expect(options.proxyGroupNameOverrides).toEqual({ valid: "Valid" });
    expect(options.builtinRuleEdits).toEqual({ disabled: { enabled: false } });
  });

  it("keeps small utility fallbacks deterministic", () => {
    expect(stableJsonStringify({ b: [2, { z: 1, a: 0 }], a: 1 })).toBe('{"a":1,"b":[2,{"a":0,"z":1}]}');
    expect(normalizeSubscriptionUrlInput("https://example.com/sub&token=1")).toBe("https://example.com/sub?token=1");
    expect(normalizePortsSpecValue(7 as never)).toBe("7");
    expect(formatNodeNameFromTemplate({ template: " ", tag: "", originName: "Origin" })).toBe("Origin");
    expect(normalizeRealityShortId("a".repeat(17))).toBeNull();
    expect(builtinIdToType(getBuiltinTemplateId("minimal"))).toBe("minimal");
    expect(isClientUpdatePlaceholderNode({ name: 7 } as never)).toBe(false);
    const node = ssNode("Node");
    expect(withNodeSourceId(node, " ")).toBe(node);
    expect(getNodeSourceIds(withNodeSourceId(node, "source"))).toEqual(["source"]);
  });

  it("deduplicates CN candidates before stable priority sorting", () => {
    const candidates = buildCnRuleCandidatesFromSources(
      [
        { id: "z@cn", parentModuleId: "z", parentRuleId: "z", variantKind: "at-cn", lines: ["domain:z.example"] },
        { id: "a-cn", parentModuleId: "a", parentRuleId: "a", variantKind: "dash-cn", lines: ["domain:a.example"] },
        { id: "a-cn", parentModuleId: "a", parentRuleId: "a", variantKind: "dash-cn", lines: ["domain:a.example"] },
      ],
      [],
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(["a-cn", "a-cn", "z@cn"]);
  });
});
