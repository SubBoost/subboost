import { describe, expect, it } from "vitest";
import {
  normalizeProxyGroupAdvancedConfig,
  normalizeProxyGroupMemberRef,
  resolveProxyGroupMembers,
} from "./proxy-group-advanced";
import { withNodeSourceId } from "./subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

describe("resolveProxyGroupMembers", () => {
  it("normalizes advanced config and member refs conservatively", () => {
    expect(normalizeProxyGroupMemberRef({ kind: "node", name: " Node A " })).toEqual({ kind: "node", name: "Node A" });
    expect(normalizeProxyGroupMemberRef({ kind: "module", id: " auto " })).toEqual({ kind: "module", id: "auto" });
    expect(normalizeProxyGroupMemberRef({ kind: "custom", id: " media " })).toEqual({ kind: "custom", id: "media" });
    expect(normalizeProxyGroupMemberRef({ kind: "provider-inline", key: " lxy " })).toEqual({ kind: "provider-inline", key: "lxy" });
    expect(normalizeProxyGroupMemberRef({ kind: "provider-group", key: " lxy " })).toEqual({ kind: "provider-group", key: "lxy" });
    expect(normalizeProxyGroupMemberRef({ kind: "provider-inline", key: " " })).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "provider-group" })).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "direct" })).toEqual({ kind: "direct" });
    expect(normalizeProxyGroupMemberRef({ kind: "reject" })).toEqual({ kind: "reject" });
    expect(normalizeProxyGroupMemberRef(null)).toBeNull();
    expect(normalizeProxyGroupMemberRef("DIRECT")).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "node", name: "" })).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "module", id: " " })).toBeNull();
    expect(normalizeProxyGroupMemberRef({ kind: "custom", id: " " })).toBeNull();
    expect(normalizeProxyGroupMemberRef([])).toBeNull();

    expect(
      normalizeProxyGroupAdvancedConfig({
        sourceIds: [" source-a ", "source-a", "", 1],
        regions: ["US", "other", "bad", "us"],
        includeRegex: " IEPL ",
        excludeRegex: " 测试 ",
        groupType: "load-balance",
        strategy: "bad",
        extraMembers: [{ kind: "direct" }, { kind: "direct" }, { kind: "node", name: "Node A" }],
        excludedMembers: [{ kind: "reject" }, { kind: "node", name: "" }],
        memberOrder: [{ kind: "node", name: "Node A" }, { kind: "node", name: "Node A" }],
      }),
    ).toEqual({
      sourceIds: ["source-a"],
      regions: ["us", "other"],
      includeRegex: "IEPL",
      excludeRegex: "测试",
      groupType: "load-balance",
      strategy: "consistent-hashing",
      extraMembers: [{ kind: "direct" }, { kind: "node", name: "Node A" }],
      excludedMembers: [{ kind: "reject" }],
      memberOrder: [{ kind: "node", name: "Node A" }],
    });

    expect(normalizeProxyGroupAdvancedConfig(null)).toEqual({});
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "select", strategy: "round-robin" })).toEqual({
      groupType: "select",
    });
    expect(normalizeProxyGroupAdvancedConfig([])).toEqual({});
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "url-test" })).toEqual({ groupType: "url-test" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "fallback" })).toEqual({ groupType: "fallback" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "direct-first" })).toEqual({ groupType: "direct-first" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "reject-first" })).toEqual({ groupType: "reject-first" });
    expect(normalizeProxyGroupAdvancedConfig({ groupType: "unknown" })).toEqual({});
    expect(
      normalizeProxyGroupAdvancedConfig({
        sourceIds: "source-a",
        regions: "us",
        includeRegex: 1,
        excludeRegex: 2,
        groupType: "load-balance",
        strategy: "round-robin",
        extraMembers: "bad",
        excludedMembers: "bad",
        memberOrder: "bad",
      }),
    ).toEqual({
      groupType: "load-balance",
      strategy: "round-robin",
    });
  });

  it("filters self custom references without dropping a node with the same name", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Self Group", "Other Node"],
      availableProxyNames: ["Self Group", "Other Node", "Peer Group"],
      nodes: [node("Self Group"), node("Other Node")],
      customProxyGroups: [
        { id: "self", name: "Self Group", emoji: "", groupType: "select" },
        { id: "peer", name: "Peer Group", emoji: "", groupType: "select" },
      ],
      advanced: {
        extraMembers: [
          { kind: "custom", id: "self" },
          { kind: "custom", id: "peer" },
        ],
        memberOrder: [
          { kind: "node", name: "Self Group" },
          { kind: "custom", id: "self" },
          { kind: "custom", id: "peer" },
        ],
      },
      self: { kind: "custom", id: "self", name: "Self Group" },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "node:Self Group",
      "custom:peer",
      "node:Other Node",
    ]);
    expect(result.proxyNames).toEqual(["Self Group", "Peer Group", "Other Node"]);
    expect(result.included.map((member) => member.key)).not.toContain("custom:self");
  });

  it("applies source, region, regex, exclusion, and extra-member filters together", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: [
        "US Source",
        "US Other",
        "Japan Source",
        "Mars Source",
        "DIRECT",
        "REJECT",
      ],
      nodes: [
        withNodeSourceId(node("US Source"), "source-a"),
        withNodeSourceId(node("US Other"), "source-b"),
        withNodeSourceId(node("Japan Source"), "source-a"),
        withNodeSourceId(node("Mars Source"), "source-a"),
      ],
      advanced: {
        sourceIds: ["source-a"],
        regions: ["us", "other"],
        includeRegex: "Source|DIRECT",
        excludeRegex: "Mars",
        extraMembers: [{ kind: "direct" }],
        excludedMembers: [{ kind: "reject" }],
      },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "node:US Source",
      "direct:DIRECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual([
      "node:US Other",
      "node:Japan Source",
      "node:Mars Source",
      "reject:REJECT",
    ]);

    const invalidRegexResult = resolveProxyGroupMembers({
      defaultProxyNames: ["US Source"],
      nodes: [withNodeSourceId(node("US Source"), "source-a")],
      advanced: {
        sourceIds: ["source-a"],
        includeRegex: "[",
        excludeRegex: "[",
      },
    });

    expect(invalidRegexResult.proxyNames).toEqual(["US Source"]);
  });

  it("resolves module/custom members, unavailable refs, and explicit ordering", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Auto", "Custom", "Unknown", "DIRECT"],
      availableProxyNames: ["Auto", "Custom", "Other Node", "REJECT"],
      nodes: [node("Other Node")],
      moduleNames: { auto: "Auto" },
      customProxyGroups: [
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      advanced: {
        extraMembers: [
          { kind: "node", name: "Other Node" },
          { kind: "custom", id: "missing" },
          { kind: "custom", id: "disabled" },
          { kind: "reject" },
        ],
        memberOrder: [
          { kind: "reject" },
          { kind: "node", name: "Other Node" },
          { kind: "module", id: "auto" },
        ],
      },
      self: { kind: "module", id: "self", name: "Self" },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "reject:REJECT",
      "node:Other Node",
      "module:auto",
      "custom:custom",
      "direct:DIRECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual([]);
  });

  it("covers fallback members, unmatched regions, and unavailable candidate handling", () => {
    const unmatchedRegion = resolveProxyGroupMembers({
      defaultProxyNames: ["France Node"],
      nodes: [node("France Node")],
      advanced: { regions: ["jp"] },
    });
    const otherRegion = resolveProxyGroupMembers({
      defaultProxyNames: ["US Relay", "Relay X"],
      nodes: [node("US Relay"), node("Relay X")],
      advanced: { regions: ["other"] },
    });
    const extraOnly = resolveProxyGroupMembers({
      defaultProxyNames: [],
      nodes: [node("Extra Node")],
      moduleNames: { auto: "Auto" },
      customProxyGroups: [
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
        { id: "empty-name", name: " ", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      advanced: {
        extraMembers: [
          { kind: "direct" },
          { kind: "reject" },
          { kind: "node", name: "Extra Node" },
          { kind: "node", name: "Missing Node" },
          { kind: "module", id: "auto" },
          { kind: "module", id: "missing" },
          { kind: "custom", id: "custom" },
          { kind: "custom", id: "empty-name" },
          { kind: "custom", id: "disabled" },
        ],
        excludedMembers: [{ kind: "reject" }],
        memberOrder: [
          { kind: "custom", id: "custom" },
          { kind: "custom", id: "custom" },
          { kind: "module", id: "missing" },
          { kind: "direct" },
        ],
      },
    });

    expect(unmatchedRegion.included).toEqual([]);
    expect(unmatchedRegion.excluded.map((member) => member.key)).toEqual(["node:France Node"]);
    expect(otherRegion.included.map((member) => member.key)).toEqual(["node:Relay X"]);
    expect(otherRegion.excluded.map((member) => member.key)).toEqual(["node:US Relay"]);
    expect(extraOnly.included.map((member) => member.key)).toEqual([
      "custom:custom",
      "direct:DIRECT",
      "node:Extra Node",
      "module:auto",
    ]);
    expect(extraOnly.excluded.map((member) => member.key)).toEqual(["reject:REJECT"]);
  });

  it("handles malformed names, missing refs, and self guards while resolving extras", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["", "Auto", "Self Module", "Disabled", "Nameless", "Node A", "Node A", "Ghost"],
      nodes: [node("Node A"), node("Allowed")],
      moduleNames: {
        "": "Bad Module",
        auto: "Auto",
        blank: " ",
        self: "Self Module",
      },
      customProxyGroups: [
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
        { id: "", name: "No Id", emoji: "", groupType: "select" },
        { id: "nameless", name: " ", emoji: "", groupType: "select" },
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
      ],
      advanced: {
        extraMembers: [
          { kind: "module", id: "auto" },
          { kind: "module", id: "blank" },
          { kind: "module", id: "missing" },
          { kind: "custom", id: "custom" },
          { kind: "custom", id: "nameless" },
          { kind: "node", name: "Allowed" },
          { kind: "node", name: "Missing Node" },
          { kind: "direct" },
        ],
        excludedMembers: [{ kind: "module", id: "auto" }],
        memberOrder: [
          { kind: "node", name: "Missing Node" },
          { kind: "custom", id: "custom" },
          { kind: "direct" },
        ],
      },
      self: { kind: "module", id: "self", name: "Self Module" },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "custom:custom",
      "direct:DIRECT",
      "node:Node A",
      "node:Allowed",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual(["module:auto"]);
  });

  it("keeps fallback resolution stable for sparse options and filter misses", () => {
    expect(
      normalizeProxyGroupAdvancedConfig({
        regions: [1, "DE"],
        groupType: "load-balance",
        strategy: "sticky-sessions",
      }),
    ).toEqual({
      regions: ["de"],
      groupType: "load-balance",
      strategy: "sticky-sessions",
    });

    const noAvailableNames = resolveProxyGroupMembers({
      defaultProxyNames: ["REJECT", "Missing Node", "German Node", "Hidden Node", 1] as unknown as string[],
      nodes: [withNodeSourceId(node("German Node"), "source-a"), node("Hidden Node")],
      advanced: {
        sourceIds: ["source-b"],
        includeRegex: "Visible",
      },
    });
    const noAdvanced = resolveProxyGroupMembers({
      defaultProxyNames: ["German Node"],
      nodes: [node("German Node")],
    });
    const emptyNames = resolveProxyGroupMembers({
      defaultProxyNames: undefined as unknown as string[],
      availableProxyNames: undefined,
      nodes: [node("German Node")],
      advanced: {},
    });

    expect(noAvailableNames.included.map((member) => member.key)).toEqual(["reject:REJECT"]);
    expect(noAvailableNames.excluded.map((member) => member.key)).toEqual(["node:German Node", "node:Hidden Node"]);
    expect(noAdvanced.proxyNames).toEqual(["German Node"]);
    expect(emptyNames.included).toEqual([]);
    expect(emptyNames.excluded).toEqual([]);
  });

  it("normalizes sparse advanced values and resolves members from fallback references", () => {
    expect(
      normalizeProxyGroupAdvancedConfig({
        sourceIds: ["", " source-a ", "source-b"],
        regions: ["bad", "KR", "kr"],
        includeRegex: " ",
        excludeRegex: "",
        groupType: "load-balance",
        strategy: "sticky-sessions",
        extraMembers: [
          null,
          { kind: "node", name: " Node B " },
          { kind: "node", name: "Node B" },
          { kind: "module", id: " auto " },
          { kind: "custom", id: "custom" },
        ],
        excludedMembers: [
          { kind: "direct" },
          { kind: "direct" },
          { kind: "custom", id: "disabled" },
        ],
        memberOrder: [
          { kind: "custom", id: "custom" },
          { kind: "module", id: "auto" },
          { kind: "direct" },
        ],
      }),
    ).toEqual({
      sourceIds: ["source-a", "source-b"],
      regions: ["kr"],
      groupType: "load-balance",
      strategy: "sticky-sessions",
      extraMembers: [
        { kind: "node", name: "Node B" },
        { kind: "module", id: "auto" },
        { kind: "custom", id: "custom" },
      ],
      excludedMembers: [{ kind: "direct" }, { kind: "custom", id: "disabled" }],
      memberOrder: [
        { kind: "custom", id: "custom" },
        { kind: "module", id: "auto" },
        { kind: "direct" },
      ],
    });

    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["Auto", "Custom", "DIRECT", "REJECT", "Korea Node", "Unknown"],
      availableProxyNames: ["Auto", "Custom", "DIRECT", "REJECT", "Korea Node", "Other Node"],
      nodes: [withNodeSourceId(node("Korea Node"), "source-a"), withNodeSourceId(node("Other Node"), "source-b")],
      moduleNames: { auto: "Auto", blank: " " },
      customProxyGroups: [
        { id: "custom", name: "Custom", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      advanced: {
        sourceIds: ["source-a"],
        regions: ["kr"],
        extraMembers: [
          { kind: "node", name: "Other Node" },
          { kind: "module", id: "auto" },
          { kind: "custom", id: "custom" },
          { kind: "direct" },
          { kind: "custom", id: "disabled" },
        ],
        excludedMembers: [{ kind: "direct" }],
        memberOrder: [
          { kind: "custom", id: "custom" },
          { kind: "module", id: "auto" },
          { kind: "node", name: "Korea Node" },
          { kind: "node", name: "Other Node" },
        ],
      },
    });

    expect(result.included.map((member) => member.key)).toEqual([
      "custom:custom",
      "module:auto",
      "node:Korea Node",
      "node:Other Node",
      "reject:REJECT",
    ]);
    expect(result.excluded.map((member) => member.key)).toEqual(["direct:DIRECT"]);
  });

  it("resolves airport group names as provider-group members when providerGroups is passed", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["DIRECT", "✈️ 香港机场"],
      nodes: [],
      providerGroups: [{ key: "lxy", name: "✈️ 香港机场" }],
    });
    const airport = result.included.find((member) => member.kind === "provider-group");
    expect(airport).toMatchObject({ kind: "provider-group", key: "provider-group:lxy", name: "✈️ 香港机场" });
    expect(airport?.ref).toEqual({ kind: "provider-group", key: "lxy" });
  });

  it("ignores airport group names when providerGroups is not passed (old behavior)", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["DIRECT", "✈️ 香港机场"],
      nodes: [],
    });
    expect(result.proxyNames).toEqual(["DIRECT"]);
    expect(result.included.some((member) => member.kind === "provider-group")).toBe(false);
  });

  it("excludes a default airport group via excludedMembers", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["DIRECT", "✈️ 香港机场"],
      availableProxyNames: ["DIRECT", "✈️ 香港机场"],
      nodes: [],
      providerGroups: [{ key: "lxy", name: "✈️ 香港机场" }],
      advanced: { excludedMembers: [{ kind: "provider-group", key: "lxy" }] },
    });
    expect(result.proxyNames).toEqual(["DIRECT"]);
    expect(result.excluded.some((member) => member.key === "provider-group:lxy")).toBe(true);
  });

  it("reorders a provider-group member via memberOrder", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["DIRECT", "✈️ 香港机场", "REJECT"],
      nodes: [],
      providerGroups: [{ key: "lxy", name: "✈️ 香港机场" }],
      advanced: {
        memberOrder: [
          { kind: "provider-group", key: "lxy" },
          { kind: "direct" },
          { kind: "reject" },
        ],
      },
    });
    expect(result.proxyNames).toEqual(["✈️ 香港机场", "DIRECT", "REJECT"]);
  });

  it("drops an orphan provider-group ref in extraMembers (key not in providerGroups)", () => {
    const result = resolveProxyGroupMembers({
      defaultProxyNames: ["DIRECT"],
      nodes: [],
      providerGroups: [{ key: "lxy", name: "✈️ 香港机场" }],
      advanced: { extraMembers: [{ kind: "provider-group", key: "ghost" }] },
    });
    expect(result.included.some((member) => member.key === "provider-group:ghost")).toBe(false);
  });
});
