import { describe, expect, it } from "vitest";
import { parseSubscription } from "@subboost/core/parser";
import { prepareSourceParsedNodes } from "@subboost/core/subscription/source-node-refresh";
import type { ParsedNode } from "@subboost/core/types/node";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { ensureNodesHaveValidSourceIds, getNodeSourceIds } from "./editing-subscription-node-sources";

function yamlSource(id: string, content: string): SubscriptionSource {
  return { id, type: "yaml", content } as SubscriptionSource;
}

/** Simulates nodes saved by an earlier import whose source metadata was lost. */
function storedNodesFrom(content: string, tag?: string): ParsedNode[] {
  return prepareSourceParsedNodes(parseSubscription(content).nodes, { currentTag: tag, currentNameTemplate: tag ? "{tag}-{name}" : undefined })
    .map((node) => {
      const { _sourceIds: _ignored, ...rest } = node as unknown as Record<string, unknown>;
      return rest as unknown as ParsedNode;
    });
}

const first = "proxies:\n  - {name: ts, type: tailscale, auth-key: tskey-auth-first, state-dir: tailscale/a}\n";
const second = "proxies:\n  - {name: ts, type: tailscale, auth-key: tskey-auth-second, state-dir: tailscale/a}\n";

describe("Tailscale source ownership reconstruction", () => {
  it("keeps same-name nodes that differ only by auth key attached to their own source", () => {
    const nodes = [...storedNodesFrom(first, "A"), ...storedNodesFrom(second, "B")];
    const result = ensureNodesHaveValidSourceIds(nodes, [yamlSource("first", first), yamlSource("second", second)]);
    expect(result.map(getNodeSourceIds)).toEqual([["first"], ["second"]]);
  });

  it("keeps same-name nodes that differ only by exit preference separate", () => {
    const a = "- {name: ts, type: tailscale, exit-node: 100.64.0.1}";
    const b = "- {name: ts, type: tailscale, exit-node: auto:any}";
    const result = ensureNodesHaveValidSourceIds([...storedNodesFrom(a), ...storedNodesFrom(b)], [yamlSource("a", a), yamlSource("b", b)]);
    expect(result.map(getNodeSourceIds)).toEqual([["a"], ["b"]]);
  });

  it("matches source YAML with imported dialer controls against the stripped stored node", () => {
    const content = "- {name: ts, type: tailscale, auth-key: tskey-auth-first, dialer-proxy: Relay}";
    const stored = storedNodesFrom(content);
    expect(stored[0]).not.toHaveProperty("dialer-proxy");
    const result = ensureNodesHaveValidSourceIds(stored, [yamlSource("only", content)]);
    expect(result.map(getNodeSourceIds)).toEqual([["only"]]);
  });

  it("keeps combined ownership for genuinely identical content", () => {
    const result = ensureNodesHaveValidSourceIds(storedNodesFrom(first), [yamlSource("x", first), yamlSource("y", first)]);
    expect(result.map(getNodeSourceIds)).toEqual([["x", "y"]]);
  });

  it("leaves an unmatched Tailscale node unresolved instead of guessing from its type", () => {
    const orphan = storedNodesFrom("- {name: ts, type: tailscale, auth-key: tskey-auth-orphan}");
    const result = ensureNodesHaveValidSourceIds(orphan, [yamlSource("first", first)]);
    expect(result.map(getNodeSourceIds)).toEqual([[]]);
  });

  it("keeps valid authoritative source ids", () => {
    const [node] = storedNodesFrom(first);
    const tagged = { ...node, _sourceIds: ["second"] } as unknown as ParsedNode;
    const result = ensureNodesHaveValidSourceIds([tagged], [yamlSource("first", first), yamlSource("second", second)]);
    expect(getNodeSourceIds(result[0])).toEqual(["second"]);
  });
});
