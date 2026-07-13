import { describe, expect, it } from "vitest";
import {
  DEFAULT_NODE_NAME_TEMPLATE,
  formatNodeNameFromTemplate,
} from "./node-name-template";
import {
  normalizeGroupNameWithDefaultEmoji,
  resolveProxyGroupModuleName,
  splitLeadingEmoji,
} from "./proxy-group-name";
import {
  buildNodeContentKey,
  buildScopedNodeIdentityKey,
  stableJsonStringify,
} from "./node-identity";
import { getModulesForTemplate } from "./generator/proxy-groups";
import {
  chooseFallbackPolicyTarget,
  createPolicyTargetResolver,
  uniquePolicyTargets,
  withBuiltinPolicyTargets,
} from "./generator/policy-targets";
import {
  builtinIdToType,
  getBuiltinTemplateId,
  getBuiltinTemplateSummaryMetadata,
  isBuiltinTemplateId,
} from "./templates/builtin";
import {
  TEMPLATES,
  getTemplate,
  getTemplateList,
  validateTemplateConfig,
} from "./templates";
import {
  DEFAULT_RULE_PROVIDER_BASE_URL,
  RULE_CATEGORIES,
  RULE_PROVIDER_CONFIG,
} from "./rules/metadata";
import {
  buildRuleSetUrlFromPath,
  collectCustomRoutingRuleSets,
  extractRuleSetPathFromUrl,
  getRuleSetTargetValue,
  normalizeRuleSetPathInput,
  parseRuleSetTargetValue,
} from "./rules/custom-routing-rule-sets";

describe("node and proxy group naming contracts", () => {
  it("formats imported node names from templates", () => {
    expect(DEFAULT_NODE_NAME_TEMPLATE).toBe("[{tag}]{name}");
    expect(formatNodeNameFromTemplate({ originName: " Node ", tag: " Airport " })).toBe("[Airport]Node");
    expect(formatNodeNameFromTemplate({ originName: "Node", tag: "", template: "[{tag}]-{name}" })).toBe("Node");
    expect(formatNodeNameFromTemplate({ originName: "Node", tag: "A", template: "   " })).toBe("[A]Node");
    expect(formatNodeNameFromTemplate({ originName: "   ", tag: "A" })).toBe("");
  });

  it("splits and resolves emoji-prefixed group names", () => {
    expect(splitLeadingEmoji("")).toEqual({
      emoji: "",
      label: "",
      hasEmojiPrefix: false,
    });
    expect(splitLeadingEmoji("🚀 Node Select")).toEqual({
      emoji: "🚀",
      label: "Node Select",
      hasEmojiPrefix: true,
    });
    expect(splitLeadingEmoji("US Node Select")).toEqual({
      emoji: "",
      label: "US Node Select",
      hasEmojiPrefix: false,
    });
    expect(resolveProxyGroupModuleName({ emoji: "🚀", name: "节点选择" }, "Auto")).toBe("🚀 Auto");
    expect(resolveProxyGroupModuleName({ emoji: "🚀", name: "节点选择" }, "🧪 Lab")).toBe("🧪 Lab");
    expect(resolveProxyGroupModuleName({ emoji: "", name: "Plain" }, " ")).toBe("Plain");
    expect(normalizeGroupNameWithDefaultEmoji("Auto", "⚡")).toEqual({ full: "⚡ Auto", emoji: "⚡" });
    expect(normalizeGroupNameWithDefaultEmoji("🧪 Lab", "")).toEqual({ full: "🧪 Lab", emoji: "🧪" });
    expect(normalizeGroupNameWithDefaultEmoji("Name", "")).toEqual({ full: "🧩 Name", emoji: "🧩" });
    expect(normalizeGroupNameWithDefaultEmoji("", "")).toEqual({ full: "", emoji: "🧩" });
  });

  it("builds stable node identity and policy target fallbacks", () => {
    const circular: Record<string, unknown> = { b: 2, a: { z: 1 } };
    circular.self = circular;
    expect(stableJsonStringify(circular)).toBe('{"a":{"z":1},"b":2,"self":null}');

    const node = {
      name: "Display",
      type: "ss",
      server: "ss.example.com",
      port: 8388,
      sni: "sni.example.com",
      servername: "server.example.com",
      _meta: "skip",
    };
    expect(buildNodeContentKey(node as never, { ignoreServer: true, ignorePort: true })).toContain(
      '"servername":"server.example.com"'
    );
    expect(buildNodeContentKey(node as never, { ignoreSni: true, ignoreServername: true })).not.toContain("sni");
    expect(buildScopedNodeIdentityKey(" source-a ", node as never)).toContain("source-a\u0000");

    expect(uniquePolicyTargets([" Proxy ", "Proxy", "", 1 as never, "DIRECT"])).toEqual(["Proxy", "DIRECT"]);
    expect(createPolicyTargetResolver()(" Proxy ")).toBe("Proxy");
    expect(
      createPolicyTargetResolver({
        availablePolicyTargets: ["Proxy", "DIRECT"],
        fallbackPolicyTarget: "Proxy",
      })("Missing")
    ).toBe("Proxy");
    expect(
      createPolicyTargetResolver({
        availablePolicyTargets: ["DIRECT"],
        fallbackPolicyTarget: "Missing",
      })("Missing")
    ).toBe("DIRECT");
    expect(chooseFallbackPolicyTarget([" ", "Proxy"], ["DIRECT", "Proxy"])).toBe("Proxy");
    expect(chooseFallbackPolicyTarget(["Missing"], ["Proxy"])).toBe("DIRECT");
    expect(withBuiltinPolicyTargets(["Proxy", "DIRECT"])).toEqual(["Proxy", "DIRECT", "REJECT"]);
  });
});

describe("builtin template contracts", () => {
  it("maps builtin ids and returns stable public metadata", () => {
    expect(getBuiltinTemplateId("minimal")).toBe("builtin-minimal");
    expect(builtinIdToType("builtin-standard")).toBe("standard");
    expect(builtinIdToType("missing")).toBeNull();
    expect(isBuiltinTemplateId("builtin-full")).toBe(true);
    expect(isBuiltinTemplateId("custom-template")).toBe(false);
    expect(getBuiltinTemplateSummaryMetadata()).toEqual({
      downloads: 0,
      engagementCount: 0,
      createdAt: "2026-06-01T00:00:00.000Z",
      tags: ["内置"],
      isOfficial: true,
      isPublic: true,
    });
  });

  it("lists and validates preset templates", () => {
    const list = getTemplateList();

    expect(list.map((item) => item.id)).toEqual(["minimal", "standard", "full"]);
    expect(list[0]).toMatchObject({
      id: "minimal",
      name: TEMPLATES.minimal.name,
      groupCount: getModulesForTemplate("minimal").length,
    });
    expect(list[0].ruleCount).toBeGreaterThan(0);
    expect(getTemplate("minimal")).toBe(TEMPLATES.minimal);
    expect(getTemplate("missing" as never)).toBe(TEMPLATES.standard);
    expect(validateTemplateConfig({ name: "Custom", groups: ["select", "final"] })).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateTemplateConfig({ name: " ", groups: [] })).toEqual({
      valid: false,
      errors: [
        "模板名称不能为空",
        "至少需要选择一个代理组",
        '必须包含 "select" 代理组',
        '必须包含 "final" 代理组',
      ],
    });
  });
});

describe("custom routing rule set contracts", () => {
  it("normalizes rule set targets, paths, and URLs", () => {
    expect(getRuleSetTargetValue({ kind: "module", id: "select" })).toBe("module:select");
    expect(parseRuleSetTargetValue(" custom: group-a ")).toEqual({ kind: "custom", id: "group-a" });
    expect(parseRuleSetTargetValue(" filtered: fast ")).toBeNull();
    expect(parseRuleSetTargetValue("module:")).toBeNull();
    expect(parseRuleSetTargetValue("bad:value")).toBeNull();
    expect(extractRuleSetPathFromUrl("https://example.com/geo/geosite/youtube.mrs?raw=1")).toBe(
      "https://example.com/geo/geosite/youtube.mrs?raw=1"
    );
    expect(normalizeRuleSetPathInput("/geoip/private.mrs")).toBe("geoip/private.mrs");
    expect(buildRuleSetUrlFromPath("geosite/youtube.mrs", "https://rules.example.com/geo/")).toBe(
      "https://rules.example.com/geo/geosite/youtube.mrs"
    );
    expect(buildRuleSetUrlFromPath("https://cdn.example.com/geosite/youtube.mrs", DEFAULT_RULE_PROVIDER_BASE_URL)).toBe(
      "https://cdn.example.com/geosite/youtube.mrs"
    );
  });

  it("collects module and custom routing rule sets", () => {
    const moduleId = getModulesForTemplate("minimal")[0];
    const items = collectCustomRoutingRuleSets({
      proxyGroupNameOverrides: {
        [moduleId]: "Renamed",
      },
      customProxyGroups: [
        {
          id: "custom",
          name: "Custom",
          emoji: "C",
          groupType: "select",
        },
      ],
      customRuleSets: [
        {
          id: "private",
          name: "",
          behavior: "ipcidr",
          path: "https://rules.example.com/geo/geoip/private.mrs",
          target: "🚀 Renamed",
          noResolve: true,
        },
        {
          id: "youtube",
          name: "YouTube",
          behavior: "domain",
          path: "https://rules.example.com/geo/geosite/youtube.mrs?download=1",
          target: "Custom",
        },
        {
          id: "telegram",
          name: "Telegram",
          behavior: "ipcidr",
          path: "geoip/telegram.mrs",
          target: { kind: "custom", id: "custom" },
          noResolve: true,
        },
      ],
    });

    expect(items).toContainEqual({
      key: "custom-rule-set:private",
      source: { kind: "custom-rule-set", id: "private" },
      id: "private",
      name: "private",
      behavior: "ipcidr",
      path: "https://rules.example.com/geo/geoip/private.mrs",
      target: {
        kind: "module",
        id: moduleId,
        name: expect.stringContaining("Renamed"),
        value: `module:${moduleId}`,
      },
      noResolve: true,
    });
    expect(items).toContainEqual({
      key: "custom-rule-set:youtube",
      source: { kind: "custom-rule-set", id: "youtube" },
      id: "youtube",
      name: "YouTube",
      behavior: "domain",
      path: "https://rules.example.com/geo/geosite/youtube.mrs?download=1",
      target: {
        kind: "custom",
        id: "custom",
        name: "Custom",
        value: "custom:custom",
      },
      noResolve: false,
    });
    expect(items.filter((item) => item.id === "telegram")).toHaveLength(1);
    expect(items.find((item) => item.id === "telegram")?.target).toMatchObject({
      kind: "custom",
      id: "custom",
      name: "Custom",
      value: "custom:custom",
    });
  });

  it("exposes stable rule provider metadata", () => {
    expect(DEFAULT_RULE_PROVIDER_BASE_URL).toBe(RULE_PROVIDER_CONFIG.baseUrl);
    expect(RULE_PROVIDER_CONFIG.directories).toEqual({ geosite: "geosite", geoip: "geoip" });
    expect(RULE_CATEGORIES.ads).toEqual({ name: "广告拦截", emoji: "🛑" });
  });
});
