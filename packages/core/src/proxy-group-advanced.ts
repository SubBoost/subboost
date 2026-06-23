import { getNodeSourceIds } from "@subboost/core/subscription/node-source-state";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  isLoadBalanceStrategy,
} from "@subboost/core/types/config";
import type {
  CustomProxyGroup,
  NodeRegion,
  ProxyGroupAdvancedConfig,
  ProxyGroupGroupType,
  ProxyGroupMemberRef,
} from "@subboost/core/types/config";
import type { ParsedNode } from "@subboost/core/types/node";
import { getProxyGroupMemberKey } from "@subboost/core/proxy-group-targets";

export const REGION_PRESETS: Array<{
  id: NodeRegion;
  label: string;
  emoji: string;
  keywords: string[];
}> = [
  { id: "us", label: "美国", emoji: "🇺🇸", keywords: ["美国", "US", "USA", "United States", "洛杉矶", "纽约", "西雅图"] },
  { id: "hk", label: "香港", emoji: "🇭🇰", keywords: ["香港", "HK", "Hong Kong", "港"] },
  { id: "jp", label: "日本", emoji: "🇯🇵", keywords: ["日本", "JP", "Japan", "东京", "大阪"] },
  { id: "sg", label: "新加坡", emoji: "🇸🇬", keywords: ["新加坡", "SG", "Singapore", "狮城"] },
  { id: "tw", label: "台湾", emoji: "🇹🇼", keywords: ["台湾", "TW", "Taiwan", "台北"] },
  { id: "kr", label: "韩国", emoji: "🇰🇷", keywords: ["韩国", "KR", "Korea", "首尔"] },
  { id: "uk", label: "英国", emoji: "🇬🇧", keywords: ["英国", "UK", "United Kingdom", "London", "伦敦"] },
  { id: "de", label: "德国", emoji: "🇩🇪", keywords: ["德国", "DE", "Germany", "Frankfurt", "法兰克福"] },
  { id: "fr", label: "法国", emoji: "🇫🇷", keywords: ["法国", "FR", "France", "Paris", "巴黎"] },
  { id: "ca", label: "加拿大", emoji: "🇨🇦", keywords: ["加拿大", "CA", "Canada", "Toronto", "多伦多"] },
  { id: "au", label: "澳大利亚", emoji: "🇦🇺", keywords: ["澳大利亚", "AU", "Australia", "Sydney", "悉尼"] },
  { id: "other", label: "其他", emoji: "🌐", keywords: [] },
];

export type ProxyGroupResolvedMemberKind = ProxyGroupMemberRef["kind"];

export interface ProxyGroupResolvedMember {
  ref: ProxyGroupMemberRef;
  key: string;
  name: string;
  kind: ProxyGroupResolvedMemberKind;
}

export interface ResolveProxyGroupMembersOptions {
  defaultProxyNames: string[];
  availableProxyNames?: string[];
  nodes: ParsedNode[];
  moduleNames?: Record<string, string>;
  customProxyGroups?: CustomProxyGroup[];
  advanced?: ProxyGroupAdvancedConfig;
  self?: { kind: "module" | "custom"; id: string; name: string };
}

export interface ResolveProxyGroupMembersResult {
  included: ProxyGroupResolvedMember[];
  excluded: ProxyGroupResolvedMember[];
  proxyNames: string[];
}

const NODE_REGIONS = new Set<NodeRegion>(REGION_PRESETS.map((preset) => preset.id));

function compileRegex(pattern?: string): RegExp | null {
  const raw = typeof pattern === "string" ? pattern.trim() : "";
  if (!raw) return null;
  try {
    return new RegExp(raw, "i");
  } catch {
    return null;
  }
}

function matchesRegion(nodeName: string, regions: NodeRegion[]): boolean {
  if (!Array.isArray(regions) || regions.length === 0) return true;
  const normalized = nodeName.toLowerCase();

  for (const region of regions) {
    if (region === "other") continue;
    const preset = REGION_PRESETS.find((item) => item.id === region);
    if (!preset) continue;
    if (preset.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) return true;
  }

  if (regions.includes("other")) {
    for (const preset of REGION_PRESETS) {
      if (preset.id === "other") continue;
      if (preset.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) return false;
    }
    return true;
  }

  return false;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeRegions(value: unknown): NodeRegion[] {
  if (!Array.isArray(value)) return [];
  const out: NodeRegion[] = [];
  const seen = new Set<NodeRegion>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase() as NodeRegion;
    if (!NODE_REGIONS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function normalizeGroupType(value: unknown): ProxyGroupGroupType | null {
  if (
    value === "select" ||
    value === "url-test" ||
    value === "fallback" ||
    value === "load-balance" ||
    value === "direct-first" ||
    value === "reject-first"
  ) {
    return value;
  }
  return null;
}

export function normalizeProxyGroupMemberRef(value: unknown): ProxyGroupMemberRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.kind === "direct") return { kind: "direct" };
  if (item.kind === "reject") return { kind: "reject" };
  if (item.kind === "node" && typeof item.name === "string" && item.name.trim()) {
    return { kind: "node", name: item.name.trim() };
  }
  if (item.kind === "module" && typeof item.id === "string" && item.id.trim()) {
    return { kind: "module", id: item.id.trim() };
  }
  if (item.kind === "custom" && typeof item.id === "string" && item.id.trim()) {
    return { kind: "custom", id: item.id.trim() };
  }
  return null;
}

function normalizeMemberList(value: unknown): ProxyGroupMemberRef[] {
  if (!Array.isArray(value)) return [];
  const out: ProxyGroupMemberRef[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const ref = normalizeProxyGroupMemberRef(item);
    if (!ref) continue;
    const key = getProxyGroupMemberKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function normalizeProxyGroupAdvancedConfig(value: unknown): ProxyGroupAdvancedConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const item = value as Record<string, unknown>;
  const sourceIds = normalizeStringList(item.sourceIds);
  const regions = normalizeRegions(item.regions);
  const includeRegex = typeof item.includeRegex === "string" ? item.includeRegex.trim() : "";
  const excludeRegex = typeof item.excludeRegex === "string" ? item.excludeRegex.trim() : "";
  const groupType = normalizeGroupType(item.groupType);
  const strategy = groupType === "load-balance" && isLoadBalanceStrategy(item.strategy)
    ? item.strategy
    : groupType === "load-balance"
      ? DEFAULT_LOAD_BALANCE_STRATEGY
      : undefined;
  const extraMembers = normalizeMemberList(item.extraMembers);
  const excludedMembers = normalizeMemberList(item.excludedMembers);
  const memberOrder = normalizeMemberList(item.memberOrder);
  return {
    ...(sourceIds.length > 0 ? { sourceIds } : {}),
    ...(regions.length > 0 ? { regions } : {}),
    ...(includeRegex ? { includeRegex } : {}),
    ...(excludeRegex ? { excludeRegex } : {}),
    ...(groupType ? { groupType } : {}),
    ...(strategy ? { strategy } : {}),
    ...(extraMembers.length > 0 ? { extraMembers } : {}),
    ...(excludedMembers.length > 0 ? { excludedMembers } : {}),
    ...(memberOrder.length > 0 ? { memberOrder } : {}),
  };
}

function buildMemberFromName(
  name: string,
  options: {
    nodeNameSet: Set<string>;
    moduleNameToId: Map<string, string>;
    customNameToId: Map<string, string>;
  }
): ProxyGroupResolvedMember | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  let ref: ProxyGroupMemberRef | null = null;
  if (trimmed === "DIRECT") ref = { kind: "direct" };
  else if (trimmed === "REJECT") ref = { kind: "reject" };
  else if (options.nodeNameSet.has(trimmed)) ref = { kind: "node", name: trimmed };
  else {
    const moduleId = options.moduleNameToId.get(trimmed);
    if (moduleId) ref = { kind: "module", id: moduleId };
    const customId = options.customNameToId.get(trimmed);
    if (!ref && customId) ref = { kind: "custom", id: customId };
  }

  if (!ref) return null;
  return {
    ref,
    key: getProxyGroupMemberKey(ref),
    name: trimmed,
    kind: ref.kind,
  };
}

function buildMemberFromRef(
  ref: ProxyGroupMemberRef,
  options: {
    nodeNameSet: Set<string>;
    moduleNames: Record<string, string>;
    customGroupsById: Map<string, CustomProxyGroup>;
  }
): ProxyGroupResolvedMember | null {
  const key = getProxyGroupMemberKey(ref);
  if (ref.kind === "direct") return { ref, key, name: "DIRECT", kind: ref.kind };
  if (ref.kind === "reject") return { ref, key, name: "REJECT", kind: ref.kind };
  if (ref.kind === "node") {
    const name = ref.name.trim();
    return name && options.nodeNameSet.has(name) ? { ref: { kind: "node", name }, key, name, kind: ref.kind } : null;
  }
  if (ref.kind === "module") {
    const name = options.moduleNames[ref.id]?.trim();
    return name ? { ref, key, name, kind: ref.kind } : null;
  }
  const group = options.customGroupsById.get(ref.id);
  const name = group?.name?.trim();
  return name ? { ref, key, name, kind: ref.kind } : null;
}

function nodePassesAdvancedFilters(
  member: ProxyGroupResolvedMember,
  nodeByName: Map<string, ParsedNode>,
  advanced: ProxyGroupAdvancedConfig
): boolean {
  if (member.ref.kind !== "node") return true;
  const node = nodeByName.get(member.ref.name);
  if (!node) return false;

  const sourceIds = normalizeStringList(advanced.sourceIds);
  if (sourceIds.length > 0) {
    const sourceIdSet = new Set(sourceIds);
    if (!getNodeSourceIds(node).some((id) => sourceIdSet.has(id))) return false;
  }

  const regions = normalizeRegions(advanced.regions);
  if (!matchesRegion(member.ref.name, regions)) return false;

  const includeRe = compileRegex(advanced.includeRegex);
  if (includeRe && !includeRe.test(member.ref.name)) return false;
  const excludeRe = compileRegex(advanced.excludeRegex);
  if (excludeRe && excludeRe.test(member.ref.name)) return false;

  return true;
}

export function resolveProxyGroupMembers(options: ResolveProxyGroupMembersOptions): ResolveProxyGroupMembersResult {
  const advanced = normalizeProxyGroupAdvancedConfig(options.advanced);
  const nodeByName = new Map(options.nodes.map((node) => [node.name, node]));
  const nodeNameSet = new Set(nodeByName.keys());
  const moduleNameToId = new Map<string, string>();
  for (const [id, name] of Object.entries(options.moduleNames || {})) {
    const trimmed = name.trim();
    if (id && trimmed) moduleNameToId.set(trimmed, id);
  }
  const customNameToId = new Map<string, string>();
  const customGroupsById = new Map<string, CustomProxyGroup>();
  for (const group of options.customProxyGroups || []) {
    if (group.enabled === false) continue;
    const name = typeof group.name === "string" ? group.name.trim() : "";
    if (group.id && name) {
      customNameToId.set(name, group.id);
      customGroupsById.set(group.id, group);
    }
  }

  const buildMembersFromNames = (names: string[]) => {
    const out: ProxyGroupResolvedMember[] = [];
    const seen = new Set<string>();
    for (const rawName of names || []) {
      if (typeof rawName !== "string") continue;
      const member = buildMemberFromName(rawName, { nodeNameSet, moduleNameToId, customNameToId });
      if (!member || seen.has(member.key)) continue;
      if (options.self && member.key === `${options.self.kind}:${options.self.id}`) continue;
      seen.add(member.key);
      out.push(member);
    }
    return out;
  };

  const defaultCandidates = buildMembersFromNames(options.defaultProxyNames || []);
  const availableCandidates = buildMembersFromNames(options.availableProxyNames || options.defaultProxyNames || []);
  const availableByKey = new Map(availableCandidates.map((member) => [member.key, member]));
  const candidateMap = new Map(defaultCandidates.map((member) => [member.key, member]));

  for (const ref of advanced.extraMembers || []) {
    const member = availableByKey.get(getProxyGroupMemberKey(ref)) || buildMemberFromRef(ref, {
      nodeNameSet,
      moduleNames: options.moduleNames || {},
      customGroupsById,
    });
    if (!member || candidateMap.has(member.key)) continue;
    if (options.self && member.key === `${options.self.kind}:${options.self.id}`) continue;
    candidateMap.set(member.key, member);
  }

  const candidates = Array.from(candidateMap.values());
  const extraKeys = new Set((advanced.extraMembers || []).map(getProxyGroupMemberKey));
  const excludedKeys = new Set((advanced.excludedMembers || []).map(getProxyGroupMemberKey));
  const includedBase = candidates.filter((member) => {
    if (excludedKeys.has(member.key)) return false;
    if (extraKeys.has(member.key)) return true;
    return nodePassesAdvancedFilters(member, nodeByName, advanced);
  });

  const byKey = new Map(includedBase.map((member) => [member.key, member]));
  const ordered: ProxyGroupResolvedMember[] = [];
  const used = new Set<string>();
  for (const ref of advanced.memberOrder || []) {
    const key = getProxyGroupMemberKey(ref);
    const member = byKey.get(key);
    if (!member || used.has(key)) continue;
    used.add(key);
    ordered.push(member);
  }
  for (const member of includedBase) {
    if (used.has(member.key)) continue;
    used.add(member.key);
    ordered.push(member);
  }

  const includedKeys = new Set(ordered.map((member) => member.key));
  const excludedSource = availableCandidates.length > 0 ? availableCandidates : candidates;
  const excluded = excludedSource.filter((member) => !includedKeys.has(member.key));

  return {
    included: ordered,
    excluded,
    proxyNames: ordered.map((member) => member.name),
  };
}
