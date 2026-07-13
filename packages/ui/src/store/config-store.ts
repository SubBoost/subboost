/**
 * 配置状态管理 - Zustand Store
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ConfigActions, ConfigState } from "./config-store/definitions";
import { initialState } from "./config-store/definitions";
import { computeGeneratedYamlResult } from "./config-store/generated-yaml";
import { createSourceActions } from "./config-store/source-actions";
import { createNodeActions } from "./config-store/actions/node-actions";
import { createTemplateActions } from "./config-store/actions/template-actions";
import { createCustomActions } from "./config-store/actions/custom-actions";
import { createProxyGroupActions } from "./config-store/actions/proxy-group-actions";
import { createDialerActions } from "./config-store/actions/dialer-actions";
import { createGroupListenerActions } from "./config-store/actions/group-listener-actions";
import { createSettingsActions } from "./config-store/actions/settings-actions";
import { createHistoryActions } from "./config-store/actions/history-actions";
import {
  CONFIG_DRAFT_GUEST_STORAGE_NAME,
  CONFIG_DRAFT_STORAGE_VERSION,
  normalizePersistedConfigState,
  partializeConfigState,
  prepareConfigDraftScope,
} from "./config-store/persistence";

export {
  DEFAULT_BASE_CONFIG_YAML,
  PRESET_RELAY_NAMES,
  getNodeSourceIds,
} from "./config-store/definitions";
export type {
  ConfigActions,
  ConfigState,
  BuiltinRuleEdits,
  CustomRuleSet,
  DialerProxyGroup,
  RuleSetDraft,
  SourceType,
  SubBoostTemplateConfig,
  SubscriptionSource,
} from "./config-store/definitions";
export type { CustomProxyGroup } from "@subboost/core/types/config";

let activeConfigDraftStorageName = CONFIG_DRAFT_GUEST_STORAGE_NAME;

export const useConfigStore = create<ConfigState & ConfigActions>()(
  persist<ConfigState & ConfigActions, [], [], Partial<ConfigState>>(
    (set, get) => {
      type StoreState = ConfigState & ConfigActions;

      const setAndGenerateConfig = (
        updater: (state: StoreState) => Partial<StoreState> | StoreState
      ) => {
        set((state) => {
          const patch = updater(state);
          if (patch === state) return state;

          const next = { ...state, ...(patch as Partial<StoreState>) } as StoreState;
          const { yaml, error } = computeGeneratedYamlResult(next);

          if (yaml === next.generatedYaml && error === next.generatedYamlError) return patch as Partial<StoreState>;
          return { ...(patch as Partial<StoreState>), generatedYaml: yaml, generatedYamlError: error };
        });
      };

      return {
        ...initialState,

        ...createSourceActions(set, get, setAndGenerateConfig),
        ...createNodeActions(set, get, setAndGenerateConfig),
        ...createTemplateActions(set, get, setAndGenerateConfig),
        ...createCustomActions(set, get, setAndGenerateConfig),
        ...createProxyGroupActions(set, get, setAndGenerateConfig),
        ...createDialerActions(set, get, setAndGenerateConfig),
        ...createGroupListenerActions(set, get, setAndGenerateConfig),
        ...createSettingsActions(set, get, setAndGenerateConfig),
        ...createHistoryActions(set, get),
      };
    },
    {
      name: CONFIG_DRAFT_GUEST_STORAGE_NAME,
      version: CONFIG_DRAFT_STORAGE_VERSION,
      storage: createJSONStorage<Partial<ConfigState>>(() => localStorage),
      migrate: (persistedState, version) =>
        normalizePersistedConfigState(persistedState, {
          discardDraft: version !== CONFIG_DRAFT_STORAGE_VERSION,
        }),
      partialize: partializeConfigState,
    }
  )
);

export function setConfigDraftUserScope(userId: string | null | undefined) {
  if (typeof window === "undefined" || !window.localStorage) return;

  const { storageName, state } = prepareConfigDraftScope(window.localStorage, userId);
  if (activeConfigDraftStorageName === storageName) return;

  activeConfigDraftStorageName = storageName;
  useConfigStore.persist.setOptions({ name: storageName });
  useConfigStore.setState({ ...initialState, ...state });
  useConfigStore.getState().generateConfig();
}
