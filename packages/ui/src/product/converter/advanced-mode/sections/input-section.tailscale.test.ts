import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  store: {} as Record<string, any>,
  userStore: {} as Record<string, any>,
  interactions: { sourceAdded: vi.fn(), sourceImported: vi.fn() },
  markSourceAsPendingImport: vi.fn(),
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index) ? stateMock.overrides[index] : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.store;
  (useConfigStore as any).getState = () => mocks.store;
  return {
    getNodeSourceIds: (node: any) => (Array.isArray(node?._sourceIds) ? node._sourceIds : []),
    useConfigStore,
  };
});
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => mocks.userStore }));
vi.mock("@subboost/ui/product/interactions", () => ({ useProductInteractionAdapter: () => mocks.interactions }));
vi.mock("@subboost/ui/product/subscription/source-import-state", () => ({
  markSourceAsPendingImport: mocks.markSourceAsPendingImport,
}));
vi.mock("@subboost/ui/product/converter/source-controls", () => ({
  AddSourceMenu: (props: any) => {
    mocks.captures.addSourceMenus.push(props);
    return null;
  },
  SourceStatusPopover: () => null,
  SourceTypeChoices: () => null,
}));
vi.mock("../section-header", () => ({ SectionHeader: () => null }));
vi.mock("./input-source-editor-dialog", () => ({
  InputSourceEditorDialog: (props: any) => {
    mocks.captures.editor = props;
    return null;
  },
}));

import { InputSection } from "./input-section";

// The controller's state order: add menu, expanded source, editor snapshot.
const EXPANDED_STATE_INDEX = 1;

const urlSource = { id: "s1", type: "url", content: "https://local.subboost.test/sub", nameTemplate: DEFAULT_NODE_NAME_TEMPLATE };
const nodesSource = { id: "s2", type: "nodes", content: "ss://node", parsed: false, parsing: false };

function renderSection(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures.addSourceMenus = [];
  try {
    renderToStaticMarkup(React.createElement(InputSection, { isExpanded: true, onToggle: vi.fn() }));
    return { setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("advanced mode InputSection Tailscale editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { addSourceMenus: [] };
    mocks.markSourceAsPendingImport.mockImplementation((source) => ({ ...source, pendingImport: true }));
    mocks.store = {
      nodes: [],
      parseErrors: [],
      sources: [urlSource, nodesSource],
      setSources: vi.fn(),
      parseSingleSource: vi.fn(),
    };
    mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 2 } } };
  });

  it("adds Tailscale nodes inside the YAML editor rather than as a separate source", () => {
    renderSection();
    expect(mocks.captures.addSourceMenus[0]).not.toHaveProperty("onAddTailscale");
  });

  it("applies editor form content once and closes the editor", () => {
    const yamlSource = { id: "y1", type: "yaml", content: "- {name: ts, type: tailscale}\n", parsed: true, parsing: false };
    mocks.store.sources = [urlSource, yamlSource];
    mocks.store.nodes = [
      { name: "ts", type: "tailscale", "state-dir": "tailscale/self", _sourceIds: ["y1"] },
      { name: "other", type: "tailscale", "state-dir": "tailscale/other", _sourceIds: ["s1"] },
    ];
    renderSection({ [EXPANDED_STATE_INDEX]: "y1" });
    expect(mocks.captures.editor.tailscaleStateDirs).toEqual(["tailscale/other"]);
    expect(mocks.captures.editor.sourceNodes).toEqual([mocks.store.nodes[0]]);
    mocks.captures.editor.onApplyContent("- {name: renamed, type: tailscale}\n");
    expect(mocks.store.setSources).toHaveBeenCalledTimes(1);
    expect(mocks.markSourceAsPendingImport).toHaveBeenCalledWith(expect.objectContaining({ id: "y1", content: "- {name: renamed, type: tailscale}\n" }));
    expect(mocks.store.parseSingleSource).toHaveBeenCalledTimes(1);
    expect(stateMock.setters[EXPANDED_STATE_INDEX]).toHaveBeenCalledWith(null);

    mocks.store.setSources.mockClear();
    mocks.store.parseSingleSource.mockClear();
    renderSection({ [EXPANDED_STATE_INDEX]: "y1" });
    mocks.captures.editor.onApplyContent(yamlSource.content);
    expect(mocks.store.setSources).not.toHaveBeenCalled();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();

    mocks.store.sources = [urlSource, { ...yamlSource, parsing: true }];
    renderSection({ [EXPANDED_STATE_INDEX]: "y1" });
    mocks.captures.editor.onApplyContent("- {name: while-parsing, type: tailscale}\n");
    expect(mocks.store.setSources).toHaveBeenCalledTimes(1);
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
  });
});
