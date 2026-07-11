import { generateClashYaml } from "@subboost/core/generator";
import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import type { ConfigState } from "./definitions";

function buildProxyProvidersFromSources(
  state: ConfigState
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  for (const source of state.sources) {
    if (!source || source.type !== "url" || !source.useProxyProviders) continue;
    const url = typeof source.content === "string" ? source.content.trim() : "";
    if (!url) continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) continue;

    const name = `url_${source.id}`;
    out[name] = {
      type: "http",
      url,
      interval: 3600,
      path: `./proxy_providers/${name}.yaml`,
      "health-check": {
        enable: true,
        url: state.testUrl,
        interval: state.testInterval,
      },
    };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export type GeneratedYamlResult = {
  yaml: string;
  error: string | null;
};

type GenerateClashYamlOptions = Parameters<typeof generateClashYaml>[0];

function formatGeneratedYamlError(error: unknown): string {
  return error instanceof Error ? error.message : "生成配置失败";
}

function buildGenerateClashYamlOptions(
  state: ConfigState,
  proxyProviders: Record<string, unknown> | undefined
): GenerateClashYamlOptions {
  return {
    nodes: stripImportedNodeControlFieldsFromList(state.nodes),
    proxyProviders,
    template: state.template,
    userConfig: {
      enabledGroups: state.enabledProxyGroups,
      enabledRules: state.enabledProxyGroups, // 规则和组现在使用同一列表
      customRules: state.customRules,
      ruleOrder: state.ruleOrder,
      cnIpNoResolve: state.cnIpNoResolve,
      experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
      dnsYaml: state.dnsYaml,
      mixedPort: state.mixedPort,
      allowLan: state.allowLan,
      listenerPorts: state.listenerPorts,
      testUrl: state.testUrl,
      testInterval: state.testInterval,
      urlTestLazy: state.urlTestLazy,
      urlTestTolerance: state.urlTestTolerance,
      ruleProviderBaseUrl: state.ruleProviderBaseUrl,
      autoSelectStrategy: "url-test",
    },
    dialerProxyGroups: state.dialerProxyGroups,
    customProxyGroups: state.customProxyGroups,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    proxyGroupAdvanced: state.proxyGroupAdvanced,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    proxyGroupOrder: state.proxyGroupOrder,
  };
}

export function computeGeneratedYamlResult(state: ConfigState): GeneratedYamlResult {
  const proxyProviders = buildProxyProvidersFromSources(state);
  const hasPreviewContent = state.nodes.length > 0 || Boolean(proxyProviders);

  try {
    const yaml = generateClashYaml(buildGenerateClashYamlOptions(state, proxyProviders));
    return { yaml: hasPreviewContent ? yaml : "", error: null };
  } catch (error) {
    return { yaml: "", error: formatGeneratedYamlError(error) };
  }
}

export function computeGeneratedYaml(state: ConfigState): string {
  return computeGeneratedYamlResult(state).yaml;
}
