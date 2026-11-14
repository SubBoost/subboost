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
vi.mock("@subboost/ui/product/converter/tailscale-draft-dialog", () => ({
  TailscaleDraftDialog: (props: any) => {
    mocks.captures.tailscaleDraftDialog = props;
    return null;
  },
}));

import { InputSection } from "./input-section";

// The controller's state order: add menu, expanded source, editor snapshot, Tailscale draft.
const EXPANDED_STATE_INDEX = 1;
const DRAFT_STATE_INDEX = 3;

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

describe("advanced mode InputSection Tailscale draft lifecycle", () => {
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

  it("opens a local draft without creating a source and cancels without persisting", () => {
    const { setters } = renderSection({ 0: true });
    mocks.captures.addSourceMenus[0].onAddTailscale();
    expect(setters[0]).toHaveBeenCalledWith(false);
    const draft = (setters[DRAFT_STATE_INDEX] as any).lastValue;
    expect(draft.initial).toMatchObject({ name: "tailscale", stateDir: expect.stringMatching(/^tailscale\/subboost-/) });
    expect(mocks.store.setSources).not.toHaveBeenCalled();

    renderSection({ [DRAFT_STATE_INDEX]: draft });
    expect(mocks.captures.tailscaleDraftDialog.draft).toBe(draft);
    mocks.captures.tailscaleDraftDialog.onCancel();
    expect(stateMock.setters[DRAFT_STATE_INDEX]).toHaveBeenCalledWith(null);
    expect(mocks.store.setSources).not.toHaveBeenCalled();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
  });

  it("generates a distinct directory for each new draft", () => {
    const { setters } = renderSection();
    mocks.captures.addSourceMenus[0].onAddTailscale();
    const first = (setters[DRAFT_STATE_INDEX] as any).lastValue.initial.stateDir;
    const again = renderSection();
    mocks.captures.addSourceMenus[0].onAddTailscale();
    expect((again.setters[DRAFT_STATE_INDEX] as any).lastValue.initial.stateDir).not.toBe(first);
  });

  it("applies a draft as one ordinary YAML source and imports it once", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(777);
    try {
      renderSection({ [DRAFT_STATE_INDEX]: { content: "x", initial: {} } });
      mocks.captures.tailscaleDraftDialog.onApply("proxies:\n  - {name: ts, type: tailscale}\n");
      expect(mocks.store.setSources).toHaveBeenCalledTimes(1);
      expect(mocks.store.setSources).toHaveBeenCalledWith([
        urlSource,
        nodesSource,
        { id: "777", type: "yaml", content: "proxies:\n  - {name: ts, type: tailscale}\n", nameTemplate: DEFAULT_NODE_NAME_TEMPLATE },
      ]);
      expect(mocks.store.parseSingleSource).toHaveBeenCalledTimes(1);
      expect(mocks.store.parseSingleSource).toHaveBeenCalledWith("777");
      expect(stateMock.setters[DRAFT_STATE_INDEX]).toHaveBeenCalledWith(null);
      expect(mocks.interactions.sourceAdded).toHaveBeenCalledWith({ mode: "advanced", sourceType: "yaml", sourceCount: 3 });
    } finally {
      now.mockRestore();
    }
  });

  it("respects the YAML source quota when starting and applying", () => {
    mocks.userStore = { user: { isAdmin: false, quota: { maxImportSourcesPerType: 1 } } };
    mocks.store.sources = [urlSource, { ...nodesSource, id: "y1", type: "yaml" }];
    const { setters } = renderSection();
    mocks.captures.addSourceMenus[0].onAddTailscale();
    expect(mocks.toast).toHaveBeenCalledWith({ title: "每种导入方式最多 1 个", variant: "warning" });
    expect(setters[DRAFT_STATE_INDEX]).not.toHaveBeenCalled();

    renderSection({ [DRAFT_STATE_INDEX]: { content: "x", initial: {} } });
    mocks.captures.tailscaleDraftDialog.onApply("- {name: ts, type: tailscale}");
    expect(mocks.store.setSources).not.toHaveBeenCalled();
    expect(mocks.store.parseSingleSource).not.toHaveBeenCalled();
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
