import type { ConfigState, SourceType, SubscriptionSource } from "./definitions";
import { initialState } from "./definitions";
import { safeParseJsonObject } from "@subboost/core/json";
import { resolveProxyGroupAdvancedModeEnabled } from "@subboost/core/proxy-group-advanced-mode";
import { normalizeRuleModelFromConfig } from "@subboost/core/rules/rule-model";

export const AUTH_CONFIG_HANDOFF_STORAGE_NAME = "subboost-auth-config-handoff";

const AUTH_CONFIG_HANDOFF_VERSION = 1;
const AUTH_CONFIG_HANDOFF_TTL_MS = 10 * 60 * 1000;

type AuthConfigHandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type AuthConfigHandoffEnvelope = {
  version: number;
  createdAt: number;
  state: unknown;
};

function getSessionStorage(): AuthConfigHandoffStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function recordObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function objectArray<T>(value: unknown): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(isRecord);
  return items.length === value.length ? (items as unknown as T[]) : undefined;
}

function validSourceType(value: unknown): value is SourceType {
  return value === "url" || value === "yaml" || value === "nodes";
}

function sourceArray(value: unknown): SubscriptionSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources: SubscriptionSource[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    if (typeof item.id !== "string" || !validSourceType(item.type) || typeof item.content !== "string") {
      return undefined;
    }
    const subscriptionUserInfo = recordObject(item.subscriptionUserInfo);
    sources.push({
      id: item.id,
      type: item.type,
      content: item.content,
      ...(typeof item.name === "string" ? { name: item.name } : {}),
      ...(typeof item.lastParsedContent === "string" ? { lastParsedContent: item.lastParsedContent } : {}),
      ...(typeof item.lastParsedTag === "string" ? { lastParsedTag: item.lastParsedTag } : {}),
      ...(typeof item.lastParsedNameTemplate === "string" ? { lastParsedNameTemplate: item.lastParsedNameTemplate } : {}),
      ...(typeof item.tag === "string" ? { tag: item.tag } : {}),
      ...(typeof item.nameTemplate === "string" ? { nameTemplate: item.nameTemplate } : {}),
      ...(typeof item.useProxyProviders === "boolean" ? { useProxyProviders: item.useProxyProviders } : {}),
      ...(typeof item.userinfoUrl === "string" ? { userinfoUrl: item.userinfoUrl } : {}),
      ...(typeof item.userinfoUserAgent === "string" ? { userinfoUserAgent: item.userinfoUserAgent } : {}),
      ...(typeof item.parsed === "boolean" ? { parsed: item.parsed } : {}),
      ...(typeof item.nodeCount === "number" && Number.isFinite(item.nodeCount) ? { nodeCount: item.nodeCount } : {}),
      ...(subscriptionUserInfo
        ? { subscriptionUserInfo: subscriptionUserInfo as SubscriptionSource["subscriptionUserInfo"] }
        : {}),
    });
  }
  return sources;
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    out[key] = raw;
  }
  return out;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function hasRecordEntries(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function hasMeaningfulConfig(state: ConfigState): boolean {
  return (
    state.sources.some((source) => source.content.trim()) ||
    state.nodes.length > 0 ||
    state.deletedNodeNames.length > 0 ||
    state.deletedNodes.length > 0 ||
    state.customRules.length > 0 ||
    state.customRuleSets.length > 0 ||
    state.customProxyGroups.length > 0 ||
    hasRecordEntries(state.proxyGroupAdvanced as Record<string, unknown>) ||
    hasRecordEntries(state.builtinRuleEdits as Record<string, unknown>) ||
    state.dialerProxyGroups.length > 0 ||
    hasRecordEntries(state.proxyGroupNameOverrides) ||
    state.proxyGroupOrder.length > 0 ||
    state.ruleOrder.length > 0 ||
    state.proxyGroupAdvancedModeEnabled !== initialState.proxyGroupAdvancedModeEnabled ||
    state.moduleRuleEditWarningAccepted !== initialState.moduleRuleEditWarningAccepted ||
    state.appliedTemplateId !== initialState.appliedTemplateId ||
    state.template !== initialState.template ||
    !sameStringArray(state.enabledProxyGroups, initialState.enabledProxyGroups) ||
    state.hiddenProxyGroups.length > 0 ||
    state.dnsYaml !== initialState.dnsYaml ||
    state.mixedPort !== initialState.mixedPort ||
    state.allowLan !== initialState.allowLan ||
    state.testUrl !== initialState.testUrl ||
    state.testInterval !== initialState.testInterval ||
    state.ruleProviderBaseUrl !== initialState.ruleProviderBaseUrl ||
    state.cnIpNoResolve !== initialState.cnIpNoResolve ||
    state.experimentalCnUseCnRuleSet !== initialState.experimentalCnUseCnRuleSet ||
    Object.keys(state.listenerPorts).length > 0
  );
}

function buildHandoffState(state: ConfigState): Partial<ConfigState> {
  return {
    sources: sourceArray(state.sources) ?? [],
    nodes: state.nodes,
    deletedNodeNames: state.deletedNodeNames,
    deletedNodes: state.deletedNodes,
    template: state.template,
    enabledProxyGroups: state.enabledProxyGroups,
    hiddenProxyGroups: state.hiddenProxyGroups,
    customProxyGroups: state.customProxyGroups,
    proxyGroupAdvanced: state.proxyGroupAdvanced,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    customRules: state.customRules,
    dialerProxyGroups: state.dialerProxyGroups,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    proxyGroupOrder: state.proxyGroupOrder,
    ruleOrder: state.ruleOrder,
    proxyGroupAdvancedModeEnabled: state.proxyGroupAdvancedModeEnabled,
    moduleRuleEditWarningAccepted: state.moduleRuleEditWarningAccepted,
    appliedTemplateId: state.appliedTemplateId,
    dnsYaml: state.dnsYaml,
    mixedPort: state.mixedPort,
    allowLan: state.allowLan,
    testUrl: state.testUrl,
    testInterval: state.testInterval,
    ruleProviderBaseUrl: state.ruleProviderBaseUrl,
    cnIpNoResolve: state.cnIpNoResolve,
    experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    listenerPorts: state.listenerPorts,
  };
}

function normalizeHandoffState(raw: unknown): Partial<ConfigState> | null {
  if (!isRecord(raw)) return null;
  const out: Partial<ConfigState> = {};

  const sources = sourceArray(raw.sources);
  if (sources) out.sources = sources;
  const nodes = objectArray<ConfigState["nodes"][number]>(raw.nodes);
  if (nodes) out.nodes = nodes;
  const deletedNodeNames = stringArray(raw.deletedNodeNames);
  if (deletedNodeNames) out.deletedNodeNames = deletedNodeNames;
  const deletedNodes = objectArray<ConfigState["deletedNodes"][number]>(raw.deletedNodes);
  if (deletedNodes) out.deletedNodes = deletedNodes;
  if (raw.template === "minimal" || raw.template === "standard" || raw.template === "full") out.template = raw.template;
  const enabledProxyGroups = stringArray(raw.enabledProxyGroups);
  if (enabledProxyGroups) out.enabledProxyGroups = enabledProxyGroups;
  const hiddenProxyGroups = stringArray(raw.hiddenProxyGroups);
  if (hiddenProxyGroups) out.hiddenProxyGroups = hiddenProxyGroups;
  const ruleModel = normalizeRuleModelFromConfig(raw);
  const customProxyGroups = objectArray<ConfigState["customProxyGroups"][number]>(raw.customProxyGroups);
  if (customProxyGroups || ruleModel.customProxyGroups.length > 0) out.customProxyGroups = ruleModel.customProxyGroups;
  if (isRecord(raw.proxyGroupAdvanced)) {
    out.proxyGroupAdvanced = raw.proxyGroupAdvanced as ConfigState["proxyGroupAdvanced"];
  }
  const proxyGroupAdvancedModeEnabled = resolveProxyGroupAdvancedModeEnabled({
    proxyGroupAdvancedModeEnabled: raw.proxyGroupAdvancedModeEnabled,
    customProxyGroups: out.customProxyGroups,
    proxyGroupAdvanced: out.proxyGroupAdvanced,
  });
  if (typeof raw.proxyGroupAdvancedModeEnabled === "boolean" || proxyGroupAdvancedModeEnabled) {
    out.proxyGroupAdvancedModeEnabled = proxyGroupAdvancedModeEnabled;
  }
  if (Array.isArray(raw.customRuleSets)) {
    out.customRuleSets = ruleModel.customRuleSets;
  }
  if (isRecord(raw.builtinRuleEdits)) {
    out.builtinRuleEdits = ruleModel.builtinRuleEdits;
  }
  const customRules = objectArray<ConfigState["customRules"][number]>(raw.customRules);
  if (customRules) out.customRules = customRules;
  const dialerProxyGroups = objectArray<ConfigState["dialerProxyGroups"][number]>(raw.dialerProxyGroups);
  if (dialerProxyGroups) out.dialerProxyGroups = dialerProxyGroups;
  if (isStringRecord(raw.proxyGroupNameOverrides)) out.proxyGroupNameOverrides = raw.proxyGroupNameOverrides;
  const proxyGroupOrder = stringArray(raw.proxyGroupOrder);
  if (proxyGroupOrder) out.proxyGroupOrder = proxyGroupOrder;
  const ruleOrder = stringArray(raw.ruleOrder);
  if (ruleOrder) out.ruleOrder = ruleOrder;
  if (typeof raw.moduleRuleEditWarningAccepted === "boolean") out.moduleRuleEditWarningAccepted = raw.moduleRuleEditWarningAccepted;
  if (typeof raw.appliedTemplateId === "string" || raw.appliedTemplateId === null) {
    out.appliedTemplateId = raw.appliedTemplateId;
  }
  if (typeof raw.dnsYaml === "string") out.dnsYaml = raw.dnsYaml;
  if (typeof raw.mixedPort === "number" && Number.isFinite(raw.mixedPort)) out.mixedPort = raw.mixedPort;
  if (typeof raw.allowLan === "boolean") out.allowLan = raw.allowLan;
  if (typeof raw.testUrl === "string") out.testUrl = raw.testUrl;
  if (typeof raw.testInterval === "number" && Number.isFinite(raw.testInterval)) out.testInterval = raw.testInterval;
  if (typeof raw.ruleProviderBaseUrl === "string") out.ruleProviderBaseUrl = raw.ruleProviderBaseUrl;
  if (typeof raw.cnIpNoResolve === "boolean") out.cnIpNoResolve = raw.cnIpNoResolve;
  if (typeof raw.experimentalCnUseCnRuleSet === "boolean") {
    out.experimentalCnUseCnRuleSet = raw.experimentalCnUseCnRuleSet;
  }
  const listenerPorts = numberRecord(raw.listenerPorts);
  if (listenerPorts) out.listenerPorts = listenerPorts;

  return out;
}

function parseEnvelope(raw: string | null): AuthConfigHandoffEnvelope | null {
  if (!raw) return null;
  const envelope = safeParseJsonObject(raw);
  if (!isRecord(envelope)) return null;
  if (envelope.version !== AUTH_CONFIG_HANDOFF_VERSION) return null;
  if (typeof envelope.createdAt !== "number" || !Number.isFinite(envelope.createdAt)) return null;
  return { version: envelope.version, createdAt: envelope.createdAt, state: envelope.state };
}

function readHandoff(storage: AuthConfigHandoffStorage): Partial<ConfigState> | null {
  const envelope = parseEnvelope(storage.getItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME));
  if (!envelope) return null;
  if (Date.now() - envelope.createdAt > AUTH_CONFIG_HANDOFF_TTL_MS) return null;
  return normalizeHandoffState(envelope.state);
}

export function captureAuthConfigHandoff(state: ConfigState): void {
  const storage = getSessionStorage();
  if (!storage) return;
  if (!hasMeaningfulConfig(state)) {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return;
  }

  const envelope: AuthConfigHandoffEnvelope = {
    version: AUTH_CONFIG_HANDOFF_VERSION,
    createdAt: Date.now(),
    state: buildHandoffState(state),
  };
  try {
    storage.setItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME, JSON.stringify(envelope));
  } catch {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
  }
}

export function consumeAuthConfigHandoff(): Partial<ConfigState> | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const state = readHandoff(storage);
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return state;
  } catch {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return null;
  }
}

export function hasAuthConfigHandoff(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  try {
    const hasHandoff = Boolean(readHandoff(storage));
    if (!hasHandoff) storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return hasHandoff;
  } catch {
    storage.removeItem(AUTH_CONFIG_HANDOFF_STORAGE_NAME);
    return false;
  }
}
