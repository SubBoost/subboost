import { describe, expect, it } from "vitest";
import { resolveProxyGroupMembers } from "./proxy-group-advanced";
import { withNodeSourceId } from "@subboost/core/subscription/node-source-state";
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
});
