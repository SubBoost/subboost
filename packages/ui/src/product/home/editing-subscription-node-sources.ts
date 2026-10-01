import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { parseSubscription } from "@subboost/core/parser";
import type { ParsedNode } from "@subboost/core/types/node";
import { buildNodeEndpointKey } from "@subboost/core/node-endpoint";

const ORIGIN_NAME_KEY = "_originName";
const SOURCE_IDS_KEY = "_sourceIds";

export function getNodeOriginName(node: ParsedNode): string {
  const record = node as unknown as Record<string, unknown>;
  const origin = record[ORIGIN_NAME_KEY];
  return typeof origin === "string" && origin.trim() ? origin.trim() : node.name;
}

export function ensureNodeOriginName(node: ParsedNode): ParsedNode {
  const record = node as unknown as Record<string, unknown>;
  const origin = getNodeOriginName(node);
  return origin === record[ORIGIN_NAME_KEY] ? node : ({ ...record, [ORIGIN_NAME_KEY]: origin } as unknown as ParsedNode);
}

export function getNodeSourceIds(node: ParsedNode): string[] {
  const record = node as unknown as Record<string, unknown>;
  const raw = record[SOURCE_IDS_KEY];
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function withNodeSourceId(node: ParsedNode, sourceId: string): ParsedNode {
  const sid = sourceId.trim();
  if (!sid) return node;
  const record = node as unknown as Record<string, unknown>;
  const current = getNodeSourceIds(node);
  if (current.includes(sid)) return node;
  return ({ ...record, [SOURCE_IDS_KEY]: [...current, sid] } as unknown as ParsedNode);
}

export function ensureNodesHaveValidSourceIds(
  nodes: ParsedNode[],
  sources: SubscriptionSource[],
  options: { onMissingMultiUrlSourceIds?: () => void } = {}
): ParsedNode[] {
  const validSourceIds = new Set(
    sources.map((s) => (typeof s.id === "string" ? s.id.trim() : "")).filter(Boolean)
  );
  const urlSources = sources.filter((s) => s.type === "url");

  const keyOf = (node: ParsedNode) => `${getNodeOriginName(node)}-${buildNodeEndpointKey(node)}`;
  const keyToIndices = new Map<string, number[]>();
  nodes.forEach((node, idx) => {
    const key = keyOf(node);
    const list = keyToIndices.get(key) ?? [];
    list.push(idx);
    keyToIndices.set(key, list);
  });

  const nextNodes = nodes.map((node) => {
    const record = node as unknown as Record<string, unknown>;
    const filteredIds = getNodeSourceIds(node).filter((id) => validSourceIds.has(id));
    if (filteredIds.length === 0) {
      if (!Array.isArray(record[SOURCE_IDS_KEY])) return node;
      const { [SOURCE_IDS_KEY]: _removed, ...rest } = record;
      return rest as unknown as ParsedNode;
    }
    const existing = getNodeSourceIds(node);
    if (existing.length === filteredIds.length && existing.every((v, i) => v === filteredIds[i])) return node;
    return ({ ...record, [SOURCE_IDS_KEY]: filteredIds } as unknown as ParsedNode);
  });

  for (const src of sources) {
    if (src.type === "url") continue;
    const content = typeof src.content === "string" ? src.content.trim() : "";
    if (!content) continue;
    try {
      const parsed = parseSubscription(content);
      for (const n of parsed.nodes) {
        const key = keyOf(n);
        const hit = keyToIndices.get(key);
        if (!hit || hit.length === 0) continue;
        for (const idx of hit) {
          nextNodes[idx] = withNodeSourceId(nextNodes[idx], src.id);
        }
      }
    } catch {
      // Ignore unparseable inline source metadata.
    }
  }

  const remaining = nextNodes
    .map((node, idx) => ({ node, idx }))
    .filter(({ node }) => getNodeSourceIds(node).filter((id) => validSourceIds.has(id)).length === 0);

  if (remaining.length > 0) {
    if (urlSources.length === 1) {
      const sid = urlSources[0].id;
      for (const { idx } of remaining) {
        nextNodes[idx] = withNodeSourceId(nextNodes[idx], sid);
      }
    } else if (urlSources.length > 1) {
      options.onMissingMultiUrlSourceIds?.();
    }
  }

  return nextNodes;
}
