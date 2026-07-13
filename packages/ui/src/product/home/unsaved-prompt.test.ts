import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storeState: { nodes: [] as any[], sources: [] as any[] },
  isSourcePendingImport: vi.fn(),
  listeners: new Map<string, EventListener>(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void | (() => void)) => effect(),
  };
});
vi.mock("zustand/react/shallow", () => ({ useShallow: (selector: unknown) => selector }));
vi.mock("@subboost/ui/product/subscription/source-import-state", () => ({
  isSourcePendingImport: mocks.isSourcePendingImport,
}));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: (selector: (state: typeof mocks.storeState) => unknown) => selector(mocks.storeState),
}));

import { UnsavedPrompt } from "./unsaved-prompt";

function stubBrowser(webdriver = false) {
  mocks.listeners.clear();
  vi.stubGlobal("navigator", { webdriver });
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: EventListener) => mocks.listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => mocks.listeners.delete(type)),
  });
}

describe("UnsavedPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.storeState = { nodes: [], sources: [] };
    mocks.isSourcePendingImport.mockImplementation((source: any) => Boolean(source.pending));
    stubBrowser(false);
  });

  it("registers beforeunload and warns when imported work exists", () => {
    mocks.storeState = { nodes: [{ name: "node-1" }], sources: [] };
    expect(renderToStaticMarkup(React.createElement(UnsavedPrompt))).toBe("");

    const event = { preventDefault: vi.fn(), returnValue: "" } as any;
    mocks.listeners.get("beforeunload")?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("您有未保存的配置更改，确定要离开吗？");
  });

  it("does not warn without pending work and skips automation environments", () => {
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    const event = { preventDefault: vi.fn(), returnValue: "" } as any;
    mocks.listeners.get("beforeunload")?.(event);
    expect(event.preventDefault).not.toHaveBeenCalled();

    stubBrowser(true);
    mocks.storeState = { nodes: [{ name: "node-1" }], sources: [] };
    renderToStaticMarkup(React.createElement(UnsavedPrompt));
    expect(mocks.listeners.has("beforeunload")).toBe(false);
  });
});
