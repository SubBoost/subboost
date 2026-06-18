import { validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import type { SubBoostTemplateConfig } from "@subboost/core/types/template-config";
import type { ConfigState } from "@subboost/ui/store/config-store";

export type ConfigTransferDocument = {
  schema: "subboost-config-transfer/v1";
  exportedAt: string;
  app: "subboost-local";
  config: SubBoostTemplateConfig;
};

export function buildConfigTransferDocument(state: ConfigState): ConfigTransferDocument {
  return {
    schema: "subboost-config-transfer/v1",
    exportedAt: new Date().toISOString(),
    app: "subboost-local",
    config: {
      schema: "subboost-template-config/v1",
      template: state.template,
      enabledProxyGroups: state.enabledProxyGroups,
      hiddenProxyGroups: state.hiddenProxyGroups,
      customProxyGroups: state.customProxyGroups,
      filteredProxyGroups: state.filteredProxyGroups,
      moduleRuleOverrides: state.moduleRuleOverrides,
      moduleRuleExclusions: state.moduleRuleExclusions,
      customRules: state.customRules,
      ruleOrder: state.ruleOrder,
      allRulesOrderEditingEnabled: state.allRulesOrderEditingEnabled,
      dialerProxyGroups: state.dialerProxyGroups,
      proxyGroupNameOverrides: state.proxyGroupNameOverrides,
      dnsYaml: state.dnsYaml,
      mixedPort: state.mixedPort,
      allowLan: state.allowLan,
      testUrl: state.testUrl,
      testInterval: state.testInterval,
      ruleProviderBaseUrl: state.ruleProviderBaseUrl,
      cnIpNoResolve: state.cnIpNoResolve,
      experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
    },
  };
}

export function parseConfigTransferDocument(value: unknown): SubBoostTemplateConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("配置文件格式无效。");
  }

  const record = value as Record<string, unknown>;
  const config = record.schema === "subboost-config-transfer/v1" ? record.config : value;
  const validated = validateSubBoostTemplateConfig(config);
  if (!validated.ok) throw new Error(validated.error);
  return validated.config;
}
