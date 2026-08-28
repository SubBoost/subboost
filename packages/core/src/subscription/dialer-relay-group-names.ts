import { PROXY_GROUP_MODULES } from "../generator/proxy-group-modules";
import { resolveProxyGroupModuleName } from "../proxy-group-name";

type DialerRelayGroupNameConfig = {
  customProxyGroups?: unknown;
  enabledGroups?: unknown;
  proxyGroupNameOverrides?: unknown;
};

type DialerRelayGroupNameOptions = {
  defaultEnabledGroups?: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getValidDialerRelayGroupNames(
  config: DialerRelayGroupNameConfig,
  options: DialerRelayGroupNameOptions = {}
): Set<string> {
  const customGroupNames = Array.isArray(config.customProxyGroups)
    ? config.customProxyGroups
        .filter((group) => isRecord(group) && group.enabled !== false)
        .map((group) => (typeof group.name === "string" ? group.name.trim() : ""))
        .filter(Boolean)
    : [];
  const overrides = isRecord(config.proxyGroupNameOverrides) ? config.proxyGroupNameOverrides : {};
  const configuredEnabledGroups = Array.isArray(config.enabledGroups)
    ? config.enabledGroups
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];
  const enabledGroups = configuredEnabledGroups.length > 0
    ? configuredEnabledGroups
    : [...(options.defaultEnabledGroups ?? [])];
  const enabledGroupIds = new Set(enabledGroups);
  const builtinGroupNames = PROXY_GROUP_MODULES.filter((module) => enabledGroupIds.has(module.id)).map(
    (module) => {
      const override = overrides[module.id];
      return resolveProxyGroupModuleName(module, typeof override === "string" ? override : undefined);
    }
  );
  return new Set([...customGroupNames, ...builtinGroupNames]);
}
