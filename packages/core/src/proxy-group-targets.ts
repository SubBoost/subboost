import type {
  CustomProxyGroup,
  ProxyGroupMemberRef,
  ProxyGroupRuleTarget,
  ProxyGroupTargetRef,
} from "@subboost/core/types/config";

export function isProxyGroupTargetRef(value: unknown): value is ProxyGroupTargetRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    (item.kind === "module" || item.kind === "custom") &&
    typeof item.id === "string" &&
    Boolean(item.id.trim())
  );
}

export function normalizeProxyGroupTargetRef(value: unknown): ProxyGroupTargetRef | null {
  if (!isProxyGroupTargetRef(value)) return null;
  return { kind: value.kind, id: value.id.trim() };
}

export function getProxyGroupTargetKey(target: ProxyGroupTargetRef): string {
  return `${target.kind}:${target.id}`;
}

export function getProxyGroupMemberKey(member: ProxyGroupMemberRef): string {
  switch (member.kind) {
    case "node":
      return `node:${member.name}`;
    case "module":
      return `module:${member.id}`;
    case "custom":
      return `custom:${member.id}`;
    case "provider-inline":
      return `provider-inline:${member.key}`;
    case "provider-group":
      return `provider-group:${member.key}`;
    case "direct":
      return "direct:DIRECT";
    case "reject":
      return "reject:REJECT";
  }
}

export function resolveProxyGroupTargetName(
  target: ProxyGroupRuleTarget,
  options: {
    moduleNames: Record<string, string>;
    customProxyGroups?: CustomProxyGroup[];
    fallbackTarget?: string;
  }
): string {
  if (typeof target === "string") {
    return target.trim() || options.fallbackTarget || "";
  }

  const normalized = normalizeProxyGroupTargetRef(target);
  if (!normalized) return options.fallbackTarget || "";

  if (normalized.kind === "module") {
    return options.moduleNames[normalized.id]?.trim() || options.fallbackTarget || "";
  }

  const customName = (options.customProxyGroups || []).find((group) => group.id === normalized.id)?.name?.trim();
  return customName || options.fallbackTarget || "";
}

export function ruleTargetMatchesName(target: ProxyGroupRuleTarget, name: string): boolean {
  return typeof target === "string" && target.trim() === name.trim();
}
