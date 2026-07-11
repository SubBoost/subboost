import { getProxyGroupMemberKey } from "@subboost/core/proxy-group-targets";
import type {
  ProxyGroupAdvancedConfig,
  ProxyGroupMemberRef,
} from "@subboost/core/types/config";

export type ResolvedMember = {
  key: string;
  ref: ProxyGroupMemberRef;
  name: string;
  kind: ProxyGroupMemberRef["kind"];
};

export function normalizeList<T>(value: readonly T[] | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function withoutMember(
  list: readonly ProxyGroupMemberRef[] | undefined,
  key: string,
): ProxyGroupMemberRef[] {
  return normalizeList(list).filter(
    (member) => getProxyGroupMemberKey(member) !== key,
  );
}

export function withMember(
  list: readonly ProxyGroupMemberRef[] | undefined,
  member: ProxyGroupMemberRef,
): ProxyGroupMemberRef[] {
  const key = getProxyGroupMemberKey(member);
  return [...withoutMember(list, key), member];
}

const PROTECTED_INSERT_KEYS = new Set([
  "direct:DIRECT",
  "reject:REJECT",
  "module:auto",
  "module:select",
]);

function uniqueMemberRefs(members: readonly ProxyGroupMemberRef[]): ProxyGroupMemberRef[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    const key = getProxyGroupMemberKey(member);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function insertMembersAfterProtected(
  currentMembers: readonly ResolvedMember[],
  members: readonly ProxyGroupMemberRef[],
): ProxyGroupMemberRef[] {
  const additions = uniqueMemberRefs(members);
  const additionKeys = new Set(additions.map(getProxyGroupMemberKey));
  const current = currentMembers
    .map((item) => item.ref)
    .filter((item) => !additionKeys.has(getProxyGroupMemberKey(item)));
  let insertAt = 0;
  current.forEach((item, index) => {
    if (PROTECTED_INSERT_KEYS.has(getProxyGroupMemberKey(item))) {
      insertAt = index + 1;
    }
  });
  const protectedAdditions = additions.filter((item) =>
    PROTECTED_INSERT_KEYS.has(getProxyGroupMemberKey(item)),
  );
  const regularAdditions = additions.filter(
    (item) => !PROTECTED_INSERT_KEYS.has(getProxyGroupMemberKey(item)),
  );
  return [
    ...current.slice(0, insertAt),
    ...protectedAdditions,
    ...regularAdditions,
    ...current.slice(insertAt),
  ];
}

export function insertMemberAfterProtected(
  currentMembers: readonly ResolvedMember[],
  member: ProxyGroupMemberRef,
): ProxyGroupMemberRef[] {
  return insertMembersAfterProtected(currentMembers, [member]);
}

export function isNodeMember(member: ResolvedMember): boolean {
  return member.kind === "node";
}

export function isProxyGroupMember(member: ResolvedMember): boolean {
  return member.kind === "module" || member.kind === "custom";
}

export function buildAddAllMembersPatch(options: {
  advanced: ProxyGroupAdvancedConfig;
  currentMembers: readonly ResolvedMember[];
  membersToAdd: readonly ResolvedMember[];
}): Partial<ProxyGroupAdvancedConfig> {
  let extraMembers = normalizeList(options.advanced.extraMembers);
  let excludedMembers = normalizeList(options.advanced.excludedMembers);
  for (const member of options.membersToAdd) {
    extraMembers = withMember(extraMembers, member.ref);
    excludedMembers = withoutMember(excludedMembers, member.key);
  }
  return {
    extraMembers,
    excludedMembers,
    memberOrder: insertMembersAfterProtected(
      options.currentMembers,
      options.membersToAdd.map((member) => member.ref),
    ),
  };
}

export function buildRemoveAllMembersPatch(options: {
  advanced: ProxyGroupAdvancedConfig;
  membersToRemove: readonly ResolvedMember[];
}): Partial<ProxyGroupAdvancedConfig> {
  const keys = new Set(options.membersToRemove.map((member) => member.key));
  let excludedMembers = normalizeList(options.advanced.excludedMembers);
  for (const member of options.membersToRemove) {
    excludedMembers = withMember(excludedMembers, member.ref);
  }
  return {
    extraMembers: normalizeList(options.advanced.extraMembers).filter(
      (member) => !keys.has(getProxyGroupMemberKey(member)),
    ),
    excludedMembers,
    memberOrder: normalizeList(options.advanced.memberOrder).filter(
      (member) => !keys.has(getProxyGroupMemberKey(member)),
    ),
  };
}

export function findCycleCreatingProxyGroupKeys(options: {
  candidates: readonly ResolvedMember[];
  generatedGroups: readonly { name: string; proxies?: string[] }[];
  targetName: string;
}): Set<string> {
  const groupNames = new Set(options.generatedGroups.map((group) => group.name));
  const dependencies = new Map(
    options.generatedGroups.map((group) => [
      group.name,
      (group.proxies ?? []).filter((name) => groupNames.has(name)),
    ]),
  );

  const reachesTarget = (start: string): boolean => {
    const pending = [start];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      if (current === options.targetName) return true;
      visited.add(current);
      pending.push(...(dependencies.get(current) ?? []));
    }
    return false;
  };

  return new Set(
    options.candidates
      .filter((member) => reachesTarget(member.name))
      .map((member) => member.key),
  );
}
