import type { ParseResult, ParsedNode } from "@subboost/core/types/node";
import { isSubscriptionInfoNodeName } from "@subboost/core/subscription/info-node-name";
import { stableJsonStringify } from "@subboost/core/node-identity";
import { isMihomoSupportedProxyNode, sanitizeMihomoProxyNode } from "@subboost/core/mihomo/proxy-sanitizer";
import { looksLikeClientUpdatePlaceholderNodes } from "@subboost/core/parser/placeholder";

export type SnapshotRelation = "equivalent" | "next-superset" | "current-superset" | "divergent" | "field-conflict";
export type SubscriptionSnapshotComparison = {
  relation: SnapshotRelation;
  selected: "current" | "next";
  currentNodeCount: number;
  nextNodeCount: number;
  currentProtocols: string[];
  nextProtocols: string[];
  conflictingNodeCount: number;
};

type NodeFields = { anchor: string; fields: Map<string, string> };
type Snapshot = { nodes: NodeFields[]; protocols: string[]; fieldCount: number; errors: number };

function nodeFields(node: ParsedNode): NodeFields | null {
  if (isSubscriptionInfoNodeName(node.name)) return null;
  const runtime = sanitizeMihomoProxyNode(node);
  if (!isMihomoSupportedProxyNode(runtime)) return null;
  const fields = new Map<string, string>();
  const seen = new WeakMap<object, string>();
  const visit = (value: unknown, path: string) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object") {
      if (seen.has(value)) {
        // Keep the second path visible without expanding cyclic/aliased YAML.
        fields.set(path, stableJsonStringify({ reference: seen.get(value) }));
        return;
      }
      seen.set(value, path);
      for (const [key, child] of Object.entries(value)) {
        if (!key.startsWith("_") && (path !== "" || key !== "name")) visit(child, `${path}/${key}`);
      }
    } else {
      fields.set(path, stableJsonStringify(value));
    }
  };
  visit(runtime, "");
  // Credentials are compared as fields so changes remain visible as conflicts.
  const anchor = stableJsonStringify({ type: runtime.type, server: runtime.server, port: runtime.port,
    peers: Array.isArray(runtime.peers) ? runtime.peers.map((peer) => ({ server: peer.server, port: peer.port })) : runtime.peers,
    "port-range": runtime["port-range"] });
  return { anchor, fields };
}

function summarize(parsed: Pick<ParseResult, "nodes" | "errors">): Snapshot {
  const unique = new Map<string, NodeFields>();
  const protocols = new Set<string>();
  for (const node of looksLikeClientUpdatePlaceholderNodes(parsed.nodes) ? [] : parsed.nodes) {
    const record = nodeFields(node);
    if (!record) continue;
    const key = stableJsonStringify([...record.fields].sort(([a], [b]) => a.localeCompare(b)));
    unique.set(key, record);
    protocols.add(/^[a-z][a-z0-9-]{0,31}$/.test(String(node.type)) ? String(node.type) : "unknown");
  }
  const nodes = [...unique.values()];
  return { nodes, protocols: [...protocols].sort(), fieldCount: nodes.reduce((sum, node) => sum + node.fields.size, 0), errors: parsed.errors.length };
}

function isSubset(left: NodeFields, right: NodeFields): boolean {
  return [...left.fields].every(([path, value]) => right.fields.get(path) === value);
}

function covers(left: Snapshot, right: Snapshot): boolean {
  if (left.nodes.length > right.nodes.length) return false;
  const groups = new Map<string, NodeFields[]>();
  for (const node of right.nodes) {
    const group = groups.get(node.anchor) ?? [];
    group.push(node);
    groups.set(node.anchor, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.fields.size - b.fields.size);
  let comparisons = 0;
  // Require distinct counterparts. Ambiguous/expensive matches stay conservative.
  for (const node of [...left.nodes].sort((a, b) => b.fields.size - a.fields.size)) {
    const group = groups.get(node.anchor);
    const index = group?.findIndex((other) => ++comparisons <= 100_000 && isSubset(node, other)) ?? -1;
    if (index < 0 || comparisons > 100_000) return false;
    group!.splice(index, 1);
  }
  return true;
}

export function hasUsableSubscriptionSnapshot(parsed: Pick<ParseResult, "nodes" | "errors">): boolean {
  return !looksLikeClientUpdatePlaceholderNodes(parsed.nodes) && parsed.nodes.some((node) => nodeFields(node) !== null);
}

export function compareSubscriptionSnapshots(
  current: Pick<ParseResult, "nodes" | "errors">,
  next: Pick<ParseResult, "nodes" | "errors">
): SubscriptionSnapshotComparison {
  const a = summarize(current);
  const b = summarize(next);
  const aCovered = covers(a, b);
  const bCovered = covers(b, a);
  const bByAnchor = new Map<string, NodeFields[]>();
  for (const node of b.nodes) {
    const group = bByAnchor.get(node.anchor) ?? [];
    group.push(node);
    bByAnchor.set(node.anchor, group);
  }
  let conflictComparisons = 0;
  const conflictingNodeCount = a.nodes.filter((node) => {
    const peers = bByAnchor.get(node.anchor);
    return peers?.length && !peers.some((other) => ++conflictComparisons > 100_000 || isSubset(node, other) || isSubset(other, node));
  }).length;
  const relation: SnapshotRelation = aCovered && bCovered ? "equivalent"
    : aCovered ? "next-superset" : bCovered ? "current-superset"
      : conflictingNodeCount ? "field-conflict" : "divergent";
  let selected: "current" | "next" = "current";
  if (relation === "next-superset") selected = "next";
  else if (relation === "equivalent") selected = b.errors < a.errors ? "next" : "current";
  else if (relation === "divergent" || relation === "field-conflict") {
    // A deterministic fallback chooses one snapshot; it never claims set completeness.
    const rankA = [a.nodes.length, a.protocols.length, a.fieldCount, -a.errors];
    const rankB = [b.nodes.length, b.protocols.length, b.fieldCount, -b.errors];
    const difference = rankB.findIndex((value, index) => value !== rankA[index]);
    if (difference >= 0 && rankB[difference] > rankA[difference]) selected = "next";
  }
  return { relation, selected, currentNodeCount: a.nodes.length, nextNodeCount: b.nodes.length,
    currentProtocols: a.protocols, nextProtocols: b.protocols, conflictingNodeCount };
}

export const SUBSCRIPTION_MAX_PROFILE_REQUESTS = 4;
export const SUBSCRIPTION_NEGOTIATION_MAX_TIME_MS = 60_000;

export function createSubscriptionRequestBudget(timeoutMs: number) {
  const deadline = Date.now() + Math.min(Math.max(1, timeoutMs) * SUBSCRIPTION_MAX_PROFILE_REQUESTS, SUBSCRIPTION_NEGOTIATION_MAX_TIME_MS);
  return { remainingTimeout: () => Math.max(0, Math.min(Math.max(1, timeoutMs), deadline - Date.now())) };
}
