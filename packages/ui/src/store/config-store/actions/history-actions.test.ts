import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  computeGeneratedYamlResult: vi.fn(() => ({ yaml: "generated", error: null })),
}));

vi.mock("../generated-yaml", () => ({
  computeGeneratedYamlResult: mocks.computeGeneratedYamlResult,
}));

import { initialState } from "../definitions";
import { createHistoryActions } from "./history-actions";

function createStore(initial: Record<string, unknown>) {
  let state = { ...initial };
  const set = vi.fn((next: any) => {
    const patch = typeof next === "function" ? next(state) : next;
    state = patch === state ? state : { ...state, ...patch };
  });
  const get = vi.fn(() => state);
  return { get, set, state: () => state };
}

describe("config store history actions", () => {
  it("generates YAML only when output changes and supports direct YAML writes", () => {
    const store = createStore({ generatedYaml: "", generatedYamlError: "old" });
    const actions = createHistoryActions(store.set as any, store.get as any);

    expect(actions.generateConfig()).toBe("generated");
    expect(store.state()).toEqual({ generatedYaml: "generated", generatedYamlError: null });

    actions.generateConfig();
    expect(store.set).toHaveBeenLastCalledWith(expect.any(Function));

    actions.setGeneratedYaml("manual");
    expect(store.state()).toEqual({ generatedYaml: "manual", generatedYamlError: null });
  });

  it("pushes bounded history and supports undo/redo boundaries", () => {
    const history = Array.from({ length: 55 }, (_, index) => `yaml-${index}`);
    const store = createStore({
      generatedYaml: "current",
      generatedYamlError: "bad",
      nodeNameFilter: { enabled: true, excludeRegexes: ["expire"] },
      history,
      historyIndex: history.length - 1,
    });
    const actions = createHistoryActions(store.set as any, store.get as any);

    actions.pushHistory();
    expect((store.state().history as unknown[])).toHaveLength(50);
    expect(store.state().historyIndex).toBe(49);
    expect((store.state().history as unknown[]).at(-1)).toEqual({
      yaml: "current",
      nodeNameFilter: { enabled: true, excludeRegexes: ["expire"] },
    });

    actions.undo();
    expect(store.state()).toMatchObject({
      historyIndex: 48,
      generatedYaml: "yaml-54",
      generatedYamlError: null,
      nodeNameFilter: { enabled: true, excludeRegexes: ["expire"] },
    });

    actions.redo();
    expect(store.state()).toMatchObject({
      historyIndex: 49,
      generatedYaml: "current",
      generatedYamlError: null,
      nodeNameFilter: { enabled: true, excludeRegexes: ["expire"] },
    });

    const emptyStore = createStore({ generatedYaml: "", history: [], historyIndex: -1 });
    createHistoryActions(emptyStore.set as any, emptyStore.get as any).pushHistory();
    expect(emptyStore.set).not.toHaveBeenCalled();
  });

  it("restores node-name filters from new snapshots and supports legacy string entries", () => {
    const store = createStore({
      generatedYaml: "filtered",
      generatedYamlError: null,
      nodeNameFilter: { enabled: true, excludeRegexes: ["test"] },
      history: [
        "legacy yaml",
        {
          yaml: "unfiltered",
          nodeNameFilter: { enabled: false, excludeRegexes: [] },
        },
        {
          yaml: "filtered",
          nodeNameFilter: { enabled: true, excludeRegexes: ["test"] },
        },
      ],
      historyIndex: 2,
    });
    const actions = createHistoryActions(store.set as any, store.get as any);

    actions.undo();
    expect(store.state()).toMatchObject({
      historyIndex: 1,
      generatedYaml: "unfiltered",
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
    });

    actions.undo();
    expect(store.state()).toMatchObject({
      historyIndex: 0,
      generatedYaml: "legacy yaml",
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
    });

    actions.redo();
    expect(store.state()).toMatchObject({
      historyIndex: 1,
      generatedYaml: "unfiltered",
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
    });

    actions.redo();
    expect(store.state()).toMatchObject({
      historyIndex: 2,
      generatedYaml: "filtered",
      nodeNameFilter: { enabled: true, excludeRegexes: ["test"] },
    });
  });

  it("returns current state at undo/redo boundaries and resets to initial state", () => {
    const store = createStore({ generatedYaml: "only", history: ["only"], historyIndex: 0 });
    const actions = createHistoryActions(store.set as any, store.get as any);

    actions.undo();
    expect(store.state()).toEqual({ generatedYaml: "only", history: ["only"], historyIndex: 0 });
    actions.redo();
    expect(store.state()).toEqual({ generatedYaml: "only", history: ["only"], historyIndex: 0 });

    actions.reset();
    expect(store.state()).toEqual(expect.objectContaining({ ...initialState, draftRevision: 1 }));
    expect(store.state()).toMatchObject({
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
    });
  });
});
