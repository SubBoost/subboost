import { describe, expect, it } from "vitest";
import {
  buildRuleSetUrlFromPath,
  extractRuleSetPathFromUrl,
  isValidRuleSetPathOrUrl,
  normalizeBuiltinRuleEdits,
  normalizeRuleModelFromConfig,
  normalizeRuleSetPathInput,
} from "./rule-model";

describe("rule model normalization", () => {
  it("normalizes rule set paths, URLs, and builtin edits", () => {
    expect(extractRuleSetPathFromUrl(" https://example.com/meta/geosite/google.mrs?download=1 ")).toBe(
      "https://example.com/meta/geosite/google.mrs?download=1"
    );
    expect(extractRuleSetPathFromUrl("custom/list.txt")).toBe("custom/list.txt");
    expect(normalizeRuleSetPathInput("////geoip/private.mrs")).toBe("geoip/private.mrs");
    expect(isValidRuleSetPathOrUrl("geosite/google.mrs")).toBe(true);
    expect(isValidRuleSetPathOrUrl("https://example.com/rules/list.txt")).toBe(true);
    expect(isValidRuleSetPathOrUrl("plain.txt")).toBe(false);
    expect(buildRuleSetUrlFromPath("https://cdn.example.com/custom.mrs", "https://base.example.com/")).toBe("https://cdn.example.com/custom.mrs");
    expect(normalizeRuleSetPathInput("geosite/google.mrs.bak")).toBe("geosite/google.mrs.bak");
    expect(buildRuleSetUrlFromPath("/geosite/google.mrs", "https://base.example.com////")).toBe("https://base.example.com/geosite/google.mrs");
    expect(normalizeBuiltinRuleEdits(null)).toEqual({});
    expect(
      normalizeBuiltinRuleEdits({
        " ": { enabled: false },
        "module:cn:cn-ip": { enabled: false },
        "module:auto:auto": { target: { kind: "module", id: " select " } },
        invalid: "bad",
        empty: {},
      })
    ).toEqual({
      "module:cn:cn-ip": { enabled: false },
      "module:auto:auto": { target: { kind: "module", id: "select" } },
    });
  });

  it("keeps only valid custom groups and rule sets", () => {
    const result = normalizeRuleModelFromConfig({
      customProxyGroups: [
        "bad",
        { id: "", name: "Missing", emoji: "", groupType: "select" },
        {
          id: "select",
          name: " Select ",
          emoji: "S",
          enabled: false,
          description: " Description ",
          memberSource: "filtered-nodes",
          includeInGroupMembers: true,
          groupType: "select",
          advanced: { includeRegex: "Node" },
        },
        {
          id: "balance",
          name: "Balance",
          emoji: "",
          groupType: "load-balance",
          strategy: "bad",
        },
        {
          id: "round",
          name: "Round",
          emoji: "",
          groupType: "load-balance",
          strategy: "round-robin",
        },
        { id: "direct", name: "Direct", emoji: "", groupType: "direct-first" },
        { id: "reject", name: "Reject", emoji: "", groupType: "reject-first" },
        { id: "fallback", name: "Fallback", emoji: "", groupType: "fallback" },
        { id: "url", name: "URL", emoji: "", groupType: "url-test" },
      ],
      customRuleSets: [
        "bad",
        { id: "", name: "Missing", behavior: "domain", path: "geosite/missing.mrs", target: "DIRECT" },
        { id: "invalid", name: "Invalid", behavior: "bad", path: "geosite/invalid.mrs", target: "DIRECT" },
        { id: "path", name: "Path", behavior: "domain", path: "plain.txt", target: "DIRECT" },
        { id: "target", name: "Target", behavior: "domain", path: "geosite/target.mrs", target: "" },
        { id: "dup", name: "", behavior: "domain", path: "geosite/dup.mrs", target: { kind: "custom", id: " select " }, noResolve: false },
        { id: "dup", name: "Duplicate", behavior: "domain", path: "geosite/dup-2.mrs", target: "DIRECT" },
        { id: "ip", name: "IP", behavior: "ipcidr", path: "geoip/private.mrs", target: "DIRECT", noResolve: true },
      ],
      builtinRuleEdits: {
        "module:cn:cn-ip": { enabled: false },
      },
    });

    expect(result.customProxyGroups.map((group) => group.id)).toEqual([
      "select",
      "balance",
      "round",
      "direct",
      "reject",
      "fallback",
      "url",
    ]);
    expect(result.customProxyGroups.find((group) => group.id === "balance")).toMatchObject({
      strategy: "consistent-hashing",
    });
    expect(result.customRuleSets).toEqual([
      {
        behavior: "domain",
        id: "dup",
        name: "dup",
        noResolve: false,
        path: "geosite/dup.mrs",
        target: { kind: "custom", id: "select" },
      },
      {
        behavior: "ipcidr",
        id: "ip",
        name: "IP",
        noResolve: true,
        path: "geoip/private.mrs",
        target: "DIRECT",
      },
    ]);
    expect(result.builtinRuleEdits).toEqual({ "module:cn:cn-ip": { enabled: false } });
    expect(normalizeRuleModelFromConfig(null)).toEqual({
      builtinRuleEdits: {},
      customProxyGroups: [],
      customRuleSets: [],
    });
  });
});
