import { describe, expect, it } from "vitest";
import { DEFAULT_NODE_NAME_FILTER_CONFIG } from "@subboost/core/subscription/node-name-filter";
import { initialState } from "./definitions";
import {
  CONFIG_DRAFT_STORAGE_VERSION,
  normalizePersistedConfigState,
  partializeConfigState,
  prepareConfigDraftScope,
} from "./persistence";

describe("config store persistence", () => {
  it("round-trips the normalized node-name filter without persisting node snapshots", () => {
    const state = {
      ...structuredClone(initialState),
      nodes: [{ name: "完整节点快照" }],
      nodeNameFilter: {
        enabled: true,
        excludeRegexes: ["  expire  ", "expire", "", "test"],
      },
    } as typeof initialState;

    const persisted = partializeConfigState(state);

    expect(persisted).toMatchObject({
      nodeNameFilter: {
        enabled: true,
        excludeRegexes: ["expire", "test"],
      },
    });
    expect(persisted).not.toHaveProperty("nodes");
    expect(normalizePersistedConfigState(persisted).nodeNameFilter).toEqual({
      enabled: true,
      excludeRegexes: ["expire", "test"],
    });
  });

  it("defaults missing or malformed node-name filter data without a storage-version bump", () => {
    expect(CONFIG_DRAFT_STORAGE_VERSION).toBe(11);
    expect(normalizePersistedConfigState({}).nodeNameFilter).toEqual(
      DEFAULT_NODE_NAME_FILTER_CONFIG
    );
    expect(
      normalizePersistedConfigState({
        nodeNameFilter: {
          enabled: "yes",
          excludeRegexes: "expire",
        },
      }).nodeNameFilter
    ).toEqual(DEFAULT_NODE_NAME_FILTER_CONFIG);
  });

  it("restores the filter only from the current draft envelope", () => {
    const storageName = "subboost-config:user:user-1";
    const storage = {
      getItem: (key: string) =>
        key === storageName
          ? JSON.stringify({
              version: CONFIG_DRAFT_STORAGE_VERSION,
              state: {
                nodeNameFilter: {
                  enabled: true,
                  excludeRegexes: ["test"],
                },
              },
            })
          : null,
      setItem: () => undefined,
    };

    expect(prepareConfigDraftScope(storage, "user-1").state.nodeNameFilter).toEqual({
      enabled: true,
      excludeRegexes: ["test"],
    });
  });
});
