import type { ConfigActions } from "../definitions";
import { initialState } from "../definitions";
import { computeGeneratedYamlResult } from "../generated-yaml";
import { normalizeNodeNameFilterConfig } from "@subboost/core/subscription/node-name-filter";
import type { GetState, SetState } from "../store-types";

type HistoryActions = Pick<
  ConfigActions,
  "generateConfig" | "setGeneratedYaml" | "pushHistory" | "undo" | "redo" | "reset"
>;

function restoreHistoryEntry(
  entry: ReturnType<GetState>["history"][number]
): Partial<ReturnType<GetState>> {
  if (typeof entry === "string") {
    return {
      generatedYaml: entry,
      generatedYamlError: null,
    };
  }

  return {
    generatedYaml: entry.yaml,
    generatedYamlError: null,
    nodeNameFilter: normalizeNodeNameFilterConfig(entry.nodeNameFilter),
  };
}

export function createHistoryActions(set: SetState, get: GetState): HistoryActions {
  return {
    generateConfig: () => {
      const { yaml, error } = computeGeneratedYamlResult(get());
      set((state) =>
        state.generatedYaml === yaml && state.generatedYamlError === error
          ? state
          : { generatedYaml: yaml, generatedYamlError: error }
      );
      return yaml;
    },

    setGeneratedYaml: (yaml: string) => {
      set({ generatedYaml: yaml, generatedYamlError: null });
    },

    pushHistory: () => {
      const state = get();
      const currentYaml = state.generatedYaml;

      if (!currentYaml) return;

      set((state) => {
        const newHistory = [
          ...state.history.slice(0, state.historyIndex + 1),
          {
            yaml: currentYaml,
            nodeNameFilter: normalizeNodeNameFilterConfig(state.nodeNameFilter),
          },
        ].slice(-50); // 最多保留 50 条历史

        return {
          history: newHistory,
          historyIndex: newHistory.length - 1,
        };
      });
    },

    undo: () => {
      set((state) => {
        if (state.historyIndex > 0) {
          const historyIndex = state.historyIndex - 1;
          return {
            historyIndex,
            ...restoreHistoryEntry(state.history[historyIndex]),
          };
        }
        return state;
      });
    },

    redo: () => {
      set((state) => {
        if (state.historyIndex < state.history.length - 1) {
          const historyIndex = state.historyIndex + 1;
          return {
            historyIndex,
            ...restoreHistoryEntry(state.history[historyIndex]),
          };
        }
        return state;
      });
    },

    reset: () => {
      set((state) => ({ ...initialState, draftRevision: (state.draftRevision ?? 0) + 1 }));
    },
  };
}
