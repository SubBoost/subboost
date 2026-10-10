import type { ParsedNode } from "../types/node";

/** Last successful import, persisted with its source rather than with a whole subscription. */
export interface SourceSnapshot {
  nodes: ParsedNode[];
  config: Record<string, unknown>;
  headers?: Record<string, string>;
  resolvedHosts?: Record<string, string[]>;
}

export function hasUsableSourceConfig(config: Record<string, unknown> | undefined): boolean {
  const providers = config?.["proxy-providers"];
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return false;
  return Object.values(providers).some(provider => {
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) return false;
    const value = provider as Record<string, unknown>;
    return (value.type === "http" && typeof value.url === "string" && /^https?:\/\//.test(value.url))
      || (value.type === "file" && typeof value.path === "string" && Boolean(value.path.trim()))
      || (value.type === "inline" && Array.isArray(value.payload) && value.payload.length > 0);
  });
}

export function normalizeSourceSnapshot(value: unknown): SourceSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.nodes)) return undefined;
  if (!record.nodes.every(node => node && typeof node === "object" && typeof node.name === "string" && typeof node.type === "string")) return undefined;
  const config = record.config && typeof record.config === "object" && !Array.isArray(record.config)
    ? record.config as Record<string, unknown> : {};
  if (record.nodes.length === 0 && !hasUsableSourceConfig(config)) return undefined;
  const headers = record.headers && typeof record.headers === "object" && !Array.isArray(record.headers)
    ? Object.fromEntries(Object.entries(record.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined;
  const resolvedHosts = record.resolvedHosts && typeof record.resolvedHosts === "object" && !Array.isArray(record.resolvedHosts)
    ? Object.fromEntries(Object.entries(record.resolvedHosts).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every(value => typeof value === "string"))) : undefined;
  return { nodes: record.nodes as ParsedNode[], config, ...(headers ? { headers } : {}), ...(resolvedHosts ? { resolvedHosts } : {}) };
}

export function createSourceSnapshot(nodes: ParsedNode[], config?: Record<string, unknown>, headers?: Record<string, string>, resolvedHosts?: Record<string, string[]>, previous?: SourceSnapshot): SourceSnapshot {
  const oldHosts = previous?.config.hosts as Record<string, unknown> | undefined;
  const newHosts = config?.hosts as Record<string, unknown> | undefined;
  const retained = Object.fromEntries(Object.entries(previous?.resolvedHosts ?? {}).filter(([name]) => JSON.stringify(oldHosts?.[name]) === JSON.stringify(newHosts?.[name])));
  const addresses = { ...retained, ...resolvedHosts };
  return structuredClone({ nodes, config: config ?? {}, ...(headers ? { headers } : {}), ...(Object.keys(addresses).length ? { resolvedHosts: addresses } : {}) });
}

export function collectSourceConfigs(sources: unknown): Array<{ id: string; config: Record<string, unknown>; resolvedHosts?: Record<string, string[]> }> {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap(source => {
    const snapshot = normalizeSourceSnapshot(source?.sourceSnapshot);
    return snapshot && typeof source.id === "string" ? [{ id: source.id, config: snapshot.config, ...(snapshot.resolvedHosts ? { resolvedHosts: snapshot.resolvedHosts } : {}) }] : [];
  });
}
