import type { ParsedNode } from "../types/node";

export type NodeNameRenameMap = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

type ReconcileNodeNameReferencesOptions = {
  nodes: ParsedNode[];
  renameMap?: NodeNameRenameMap;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRenameMap(value?: NodeNameRenameMap): Map<string, string> {
  const entries = value instanceof Map ? value.entries() : Object.entries(value ?? {});
  const out = new Map<string, string>();
  for (const [rawFrom, rawTo] of entries) {
    const from = rawFrom.trim();
    const to = rawTo.trim();
    if (!from || !to || from === to) continue;
    out.set(from, to);
  }
  return out;
}

function resolveRenamedNodeName(name: string, renameMap: ReadonlyMap<string, string>): string {
  let current = name;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const next = renameMap.get(current);
    if (!next) break;
    current = next;
  }
  return current;
}

export function composeNodeNameRenameMaps(
  existing?: NodeNameRenameMap,
  next?: NodeNameRenameMap
): Map<string, string> {
  const existingMap = toRenameMap(existing);
  const nextMap = toRenameMap(next);
  const out = new Map<string, string>();

  for (const [from, to] of existingMap) {
    const resolved = resolveRenamedNodeName(resolveRenamedNodeName(to, existingMap), nextMap);
    if (from !== resolved) out.set(from, resolved);
  }
  for (const [from, to] of nextMap) {
    if (out.has(from)) continue;
    const resolved = resolveRenamedNodeName(to, nextMap);
    out.set(from, resolved);
  }

  return out;
}

function remapNameList(
  value: unknown,
  renameMap: ReadonlyMap<string, string>,
  availableNames: ReadonlySet<string>,
  options: { keepDirect?: boolean } = {}
): unknown {
  if (!Array.isArray(value)) return value;
  const out: unknown[] = [];
  const seenNames = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      out.push(item);
      continue;
    }
    const name = item.trim();
    if (!name) continue;
    if (options.keepDirect && name === "DIRECT") {
      if (!seenNames.has(name)) out.push(name);
      seenNames.add(name);
      continue;
    }
    const nextName = resolveRenamedNodeName(name, renameMap);
    if (!availableNames.has(nextName) || seenNames.has(nextName)) continue;
    seenNames.add(nextName);
    out.push(nextName);
  }
  return out;
}

function remapAdvancedMemberList(
  value: unknown,
  renameMap: ReadonlyMap<string, string>,
  availableNames: ReadonlySet<string>
): unknown {
  if (!Array.isArray(value)) return value;
  const out: unknown[] = [];
  const seenNodeNames = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || item.kind !== "node" || typeof item.name !== "string") {
      out.push(item);
      continue;
    }
    const nextName = resolveRenamedNodeName(item.name.trim(), renameMap);
    if (!nextName || !availableNames.has(nextName) || seenNodeNames.has(nextName)) continue;
    seenNodeNames.add(nextName);
    out.push(nextName === item.name ? item : { ...item, name: nextName });
  }
  return out;
}

function remapProxyGroupAdvanced(
  value: unknown,
  renameMap: ReadonlyMap<string, string>,
  availableNames: ReadonlySet<string>
): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([groupId, rawAdvanced]) => {
      if (!isRecord(rawAdvanced)) return [groupId, rawAdvanced];
      return [
        groupId,
        {
          ...rawAdvanced,
          ...(Object.hasOwn(rawAdvanced, "extraMembers")
            ? { extraMembers: remapAdvancedMemberList(rawAdvanced.extraMembers, renameMap, availableNames) }
            : {}),
          ...(Object.hasOwn(rawAdvanced, "excludedMembers")
            ? { excludedMembers: remapAdvancedMemberList(rawAdvanced.excludedMembers, renameMap, availableNames) }
            : {}),
          ...(Object.hasOwn(rawAdvanced, "memberOrder")
            ? { memberOrder: remapAdvancedMemberList(rawAdvanced.memberOrder, renameMap, availableNames) }
            : {}),
        },
      ];
    })
  );
}

export function reconcileNodeNameReferences<T extends object>(
  config: T,
  options: ReconcileNodeNameReferencesOptions
): T {
  const rawConfig = config as Record<string, unknown>;
  const renameMap = toRenameMap(options.renameMap);
  const availableNames = new Set(options.nodes.map((node) => node.name.trim()).filter(Boolean));

  const listenerPorts = isRecord(rawConfig.listenerPorts)
    ? Object.fromEntries(
        Object.entries(rawConfig.listenerPorts)
          .map(([name, port]) => [resolveRenamedNodeName(name, renameMap), port] as const)
          .filter(
            ([name, port]) =>
              availableNames.has(name) &&
              typeof port === "number" &&
              Number.isInteger(port) &&
              port >= 1 &&
              port <= 65535
          )
      )
    : rawConfig.listenerPorts;

  const dialerProxyGroups = Array.isArray(rawConfig.dialerProxyGroups)
    ? rawConfig.dialerProxyGroups.map((rawGroup) => {
        if (!isRecord(rawGroup)) return rawGroup;
        return {
          ...rawGroup,
          relayNodes: remapNameList(rawGroup.relayNodes, renameMap, availableNames, { keepDirect: true }),
          targetNodes: remapNameList(rawGroup.targetNodes, renameMap, availableNames),
        };
      })
    : rawConfig.dialerProxyGroups;

  return {
    ...rawConfig,
    ...(Object.hasOwn(rawConfig, "listenerPorts") ? { listenerPorts } : {}),
    ...(Object.hasOwn(rawConfig, "dialerProxyGroups") ? { dialerProxyGroups } : {}),
    ...(Object.hasOwn(rawConfig, "proxyGroupAdvanced")
      ? { proxyGroupAdvanced: remapProxyGroupAdvanced(rawConfig.proxyGroupAdvanced, renameMap, availableNames) }
      : {}),
  } as T;
}
