import type { ConfigState } from "./definitions";
import { safeParseJsonObject } from "@subboost/core/json";
import { getConfigDraftStorageNameForUser } from "./draft-storage";

export {
  CONFIG_DRAFT_GUEST_STORAGE_NAME,
  getConfigDraftStorageNameForUser,
} from "./draft-storage";

export const CONFIG_DRAFT_STORAGE_VERSION = 10;

type ConfigDraftStorage = Pick<Storage, "getItem" | "setItem">;

type PersistedEnvelope = {
  state?: unknown;
  version?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function normalizePersistedConfigState(
  persistedState: unknown,
  options: { discardDraft?: boolean } = {}
): Partial<ConfigState> {
  if (options.discardDraft) return {};
  const state = (isRecord(persistedState) ? persistedState : {}) as Partial<ConfigState>;

  return {
    ...(state.template === "minimal" || state.template === "standard" || state.template === "full"
      ? { template: state.template }
      : {}),
    ...(Array.isArray(state.enabledProxyGroups)
      ? { enabledProxyGroups: state.enabledProxyGroups.filter((item): item is string => typeof item === "string") }
      : {}),
    hiddenProxyGroups: normalizeStringArray(state.hiddenProxyGroups),
    ...(typeof state.dnsYaml === "string" ? { dnsYaml: state.dnsYaml } : {}),
    ...(typeof state.mixedPort === "number" ? { mixedPort: state.mixedPort } : {}),
    ...(typeof state.allowLan === "boolean" ? { allowLan: state.allowLan } : {}),
    ...(typeof state.testUrl === "string" ? { testUrl: state.testUrl } : {}),
    ...(typeof state.testInterval === "number" ? { testInterval: state.testInterval } : {}),
    ...(typeof state.urlTestLazy === "boolean" ? { urlTestLazy: state.urlTestLazy } : {}),
    ...(typeof state.urlTestTolerance === "number" && Number.isInteger(state.urlTestTolerance) && state.urlTestTolerance >= 0
      ? { urlTestTolerance: state.urlTestTolerance }
      : {}),
    ...(typeof state.ruleProviderBaseUrl === "string" ? { ruleProviderBaseUrl: state.ruleProviderBaseUrl } : {}),
    ...(typeof state.proxyGroupAdvancedModeEnabled === "boolean"
      ? { proxyGroupAdvancedModeEnabled: state.proxyGroupAdvancedModeEnabled }
      : {}),
    cnIpNoResolve: typeof state.cnIpNoResolve === "boolean" ? state.cnIpNoResolve : true,
    experimentalCnUseCnRuleSet:
      typeof state.experimentalCnUseCnRuleSet === "boolean" ? state.experimentalCnUseCnRuleSet : true,
  } as Partial<ConfigState>;
}

export function partializeConfigState(state: ConfigState): Partial<ConfigState> {
  return {
    template: state.template,
    enabledProxyGroups: state.enabledProxyGroups,
    hiddenProxyGroups: state.hiddenProxyGroups,
    dnsYaml: state.dnsYaml,
    mixedPort: state.mixedPort,
    allowLan: state.allowLan,
    testUrl: state.testUrl,
    testInterval: state.testInterval,
    ...(state.urlTestLazy !== undefined ? { urlTestLazy: state.urlTestLazy } : {}),
    ...(state.urlTestTolerance !== undefined ? { urlTestTolerance: state.urlTestTolerance } : {}),
    ruleProviderBaseUrl: state.ruleProviderBaseUrl,
    proxyGroupAdvancedModeEnabled: state.proxyGroupAdvancedModeEnabled,
    cnIpNoResolve: state.cnIpNoResolve,
    experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
  };
}

function parsePersistedEnvelope(raw: string | null): PersistedEnvelope | null {
  if (!raw) return null;
  return safeParseJsonObject(raw) as PersistedEnvelope | null;
}

function readPersistedConfigState(storage: ConfigDraftStorage, storageName: string): Partial<ConfigState> | null {
  const envelope = parsePersistedEnvelope(storage.getItem(storageName));
  if (!envelope) return null;
  return normalizePersistedConfigState(envelope.state, {
    discardDraft: envelope.version !== CONFIG_DRAFT_STORAGE_VERSION,
  });
}

export function prepareConfigDraftScope(storage: ConfigDraftStorage, userId: string | null | undefined) {
  const storageName = getConfigDraftStorageNameForUser(userId);

  return {
    storageName,
    state: readPersistedConfigState(storage, storageName) ?? {},
  };
}
