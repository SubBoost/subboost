import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storeState: {} as any,
  isSourcePendingImport: vi.fn(),
  listeners: new Map<string, EventListener>(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => effect(),
  };
});
vi.mock("@subboost/ui/product/subscription/source-import-state", () => ({
  isSourcePendingImport: mocks.isSourcePendingImport,
}));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: { getState: () => mocks.storeState },
}));

import { useUIStore, useUnappliedInputGuard } from "@subboost/ui/store/ui-store";
import { UnsavedPrompt, markDraftSaved } from "./unsaved-prompt";

const WARNING = "您有未保存的配置更改，确定要离开吗？";

function draft(overrides: Record<string, unknown> = {}) {
  return { nodes: [], sources: [], generatedYaml: "", appliedTemplateId: "minimal", ...overrides };
}

function stubBrowser(webdriver = false) {
  mocks.listeners.clear();
  vi.stubGlobal("navigator", { webdriver });
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: EventListener) => mocks.listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => mocks.listeners.delete(type)),
  });
}

function leave() {
  const event = { preventDefault: vi.fn(), returnValue: "" } as any;
  mocks.listeners.get("beforeunload")?.(event);
  return event;
}

describe("UnsavedPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.storeState = draft();
    mocks.isSourcePendingImport.mockImplementation((source: any) => Boolean(source.pending));
    useUIStore.setState({ savedDraftSignature: null, unappliedInputCount: 0 });
    stubBrowser(false);
  });

  it("warns when imported work has never been saved", () => {
    mocks.storeState = draft({ nodes: [{ name: "node-1" }], generatedYaml: "proxies: [node-1]" });
    expect(renderToStaticMarkup(React.createElement(UnsavedPrompt))).toBe("");

    const event = leave();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe(WARNING);
  });

  it("leaves quietly right after a save and warns again once the config changes", () => {
    const saved = draft({ nodes: [{ name: "node-1" }], generatedYaml: "proxies: [node-1]", proxyGroupAdvancedModeEnabled: false });
    mocks.storeState = saved;
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    markDraftSaved();
    expect(leave().preventDefault).not.toHaveBeenCalled();

    // Derived output, history and actions are not part of what a save stores.
    mocks.storeState = { ...saved, generatedYaml: "regenerated", history: [{}], historyIndex: 1, generateConfig: () => {} };
    expect(leave().preventDefault).not.toHaveBeenCalled();

    mocks.storeState = { ...saved, nodes: [{ name: "node-1" }, { name: "node-2" }] };
    expect(leave().returnValue).toBe(WARNING);

    // A saved setting that never reaches the generated YAML still counts.
    mocks.storeState = { ...saved, proxyGroupAdvancedModeEnabled: true };
    expect(leave().returnValue).toBe(WARNING);
  });

  it("still warns while a source import is pending, even after a save", () => {
    mocks.storeState = draft({ sources: [{ id: "a", pending: true }] });
    markDraftSaved();
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    expect(leave().returnValue).toBe(WARNING);
  });

  it("warns while a dialog holds input not yet applied, even when the editor matches the save", () => {
    mocks.storeState = draft({ nodes: [{ name: "node-1" }] });
    markDraftSaved();
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    const Dialog = ({ dirty }: { dirty: boolean }) => {
      useUnappliedInputGuard(dirty);
      return null;
    };

    renderToStaticMarkup(React.createElement(Dialog, { dirty: false }));
    expect(leave().preventDefault).not.toHaveBeenCalled();

    // An empty editor still warns: the dialog may be adding its first node.
    mocks.storeState = draft();
    renderToStaticMarkup(React.createElement(Dialog, { dirty: true }));
    expect(leave().returnValue).toBe(WARNING);

    useUIStore.getState().changeUnappliedInputCount(-1);
    expect(leave().preventDefault).not.toHaveBeenCalled();
  });

  it("does not warn without pending work and skips automation environments", () => {
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    expect(leave().preventDefault).not.toHaveBeenCalled();

    stubBrowser(true);
    mocks.storeState = draft({ nodes: [{ name: "node-1" }] });
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    expect(mocks.listeners.has("beforeunload")).toBe(false);
  });
});
