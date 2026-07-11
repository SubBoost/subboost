import type { ConfigActions } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type SettingsActions = Pick<
  ConfigActions,
  | "setDnsYaml"
  | "setMixedPort"
  | "setAllowLan"
  | "setTestUrl"
  | "setTestInterval"
  | "setUrlTestLazy"
  | "setUrlTestTolerance"
  | "setRuleProviderBaseUrl"
  | "setProxyGroupAdvancedModeEnabled"
  | "setCnIpNoResolve"
  | "setExperimentalCnUseCnRuleSet"
>;

export function createSettingsActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): SettingsActions {
  return {
    setDnsYaml: (yaml: string) => {
      setAndGenerateConfig(() => ({ dnsYaml: yaml }));
    },

    setMixedPort: (port: number) => {
      setAndGenerateConfig(() => ({ mixedPort: port }));
    },

    setAllowLan: (allow: boolean) => {
      setAndGenerateConfig(() => ({ allowLan: allow }));
    },

    setTestUrl: (url: string) => {
      setAndGenerateConfig(() => ({ testUrl: url }));
    },

    setTestInterval: (interval: number) => {
      setAndGenerateConfig(() => ({ testInterval: interval }));
    },

    setUrlTestLazy: (lazy: boolean | undefined) => {
      setAndGenerateConfig(() => ({ urlTestLazy: lazy }));
    },

    setUrlTestTolerance: (tolerance: number | undefined) => {
      setAndGenerateConfig(() => ({ urlTestTolerance: tolerance }));
    },

    setRuleProviderBaseUrl: (url: string) => {
      setAndGenerateConfig(() => ({ ruleProviderBaseUrl: url }));
    },

    setProxyGroupAdvancedModeEnabled: (value: boolean) => {
      setAndGenerateConfig(() => ({ proxyGroupAdvancedModeEnabled: Boolean(value) }));
    },

    setCnIpNoResolve: (value: boolean) => {
      setAndGenerateConfig(() => ({ cnIpNoResolve: Boolean(value) }));
    },

    setExperimentalCnUseCnRuleSet: (value: boolean) => {
      setAndGenerateConfig(() => ({ experimentalCnUseCnRuleSet: Boolean(value) }));
    },
  };
}
