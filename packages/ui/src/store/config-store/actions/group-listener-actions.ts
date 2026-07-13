import type { GroupListenerBinding } from "@subboost/core/types/config";
import type { ConfigActions } from "../definitions";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type GroupListenerActions = Pick<
  ConfigActions,
  "addGroupListener" | "updateGroupListener" | "removeGroupListener"
>;

export function createGroupListenerActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): GroupListenerActions {
  return {
    addGroupListener: (binding?: Partial<Omit<GroupListenerBinding, "id">>) => {
      const id = `group-listener-${Date.now()}`;
      setAndGenerateConfig((state) => ({
        groupListeners: [
          ...state.groupListeners,
          {
            id,
            target: binding?.target ?? "",
            port: binding?.port ?? 0,
          },
        ],
      }));
    },

    updateGroupListener: (id: string, patch: Partial<Omit<GroupListenerBinding, "id">>) => {
      setAndGenerateConfig((state) => ({
        groupListeners: state.groupListeners.map((binding) =>
          binding.id === id ? { ...binding, ...patch } : binding
        ),
      }));
    },

    removeGroupListener: (id: string) => {
      setAndGenerateConfig((state) => ({
        groupListeners: state.groupListeners.filter((binding) => binding.id !== id),
      }));
    },
  };
}
