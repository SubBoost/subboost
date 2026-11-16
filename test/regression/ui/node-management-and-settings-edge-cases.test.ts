import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any>,
  confirmDialog: vi.fn(),
  interactions: { listenerPortConfigured: vi.fn() } as Record<string, any>,
  store: {} as Record<string, any>,
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  runEffects: false,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), deps?: React.DependencyList) => {
      if (!stateMock.runEffects) return actual.useEffect(effect, deps);
      return effect();
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function"
          ? (next as (previous: unknown) => unknown)(value)
          : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({ List: () => null, Search: () => null }));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: () => null }));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    (mocks.captures.buttons ||= []).push(props);
    return React.createElement("button", { disabled: props.disabled, onClick: props.onClick }, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: mocks.confirmDialog }));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => props.children,
  DialogContent: (props: any) => React.createElement("section", null, props.children),
  DialogFooter: (props: any) => React.createElement("footer", null, props.children),
  DialogBody: (props: any) => React.createElement("div", null, props.children),
  DialogHeader: (props: any) => React.createElement("header", null, props.children),
  DialogTitle: (props: any) => React.createElement("h2", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/form-field", () => ({
  FormField: (props: any) => React.createElement("div", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    (mocks.captures.inputs ||= []).push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/switch-field", () => ({
  SwitchField: (props: any) => {
    (mocks.captures.switches ||= []).push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/core/node-name-template", () => ({ DEFAULT_NODE_NAME_TEMPLATE: "[{tag}] {name}" }));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: Object.assign(() => mocks.store, { getState: () => mocks.store }),
}));
vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));
vi.mock("../../../packages/ui/src/product/converter/advanced-mode/section-header", () => ({
  SectionHeader: (props: any) => {
    mocks.captures.header = props;
    return null;
  },
}));
vi.mock("../../../packages/ui/src/product/converter/advanced-mode/sections/node-management/bulk-edit-dialog", () => ({
  NodeManagementBulkEditDialog: (props: any) => {
    mocks.captures.bulkDialog = props;
    return null;
  },
}));
vi.mock("../../../packages/ui/src/product/converter/advanced-mode/sections/node-management/auto-processing-dialog", () => ({
  NodeManagementAutoProcessingDialog: (props: any) => {
    mocks.captures.autoDialog = props;
    return null;
  },
}));
vi.mock("../../../packages/ui/src/product/converter/advanced-mode/sections/node-management/node-list", () => ({
  NodeManagementNodeList: (props: any) => {
    mocks.captures.nodeList = props;
    return null;
  },
}));
vi.mock("../../../packages/ui/src/product/converter/advanced-mode/sections/proxy-group-type-menu", () => ({
  ProxyGroupTypeMenu: (props: any) => {
    mocks.captures.typeMenu = props;
    return null;
  },
}));

import { NodeManagementSection } from "../../../packages/ui/src/product/converter/advanced-mode/sections/node-management-section";
import { GroupAdvancedSettingsDialog } from "../../../packages/ui/src/product/converter/advanced-mode/sections/group-advanced-settings-dialog";

const alpha = {
  name: "[HK] Alpha",
  type: "ss",
  server: "alpha.test",
  port: 443,
  _sourceIds: ["source"],
};
const beta = {
  name: "Beta",
  type: "vless",
  server: "beta.test",
  port: 8443,
};

function resetState(overrides: Record<number, unknown> = {}, runEffects = false) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.runEffects = runEffects;
  stateMock.setters = [];
  mocks.captures = { buttons: [], inputs: [], switches: [] };
}

function renderNodeSection(overrides: Record<number, unknown> = {}, runEffects = false) {
  resetState(overrides, runEffects);
  try {
    renderToStaticMarkup(React.createElement(NodeManagementSection, { isExpanded: true, onToggle: vi.fn() }));
    return { setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

function renderAdvancedDialog(overrides: Record<number, unknown> = {}, props: Record<string, unknown> = {}, runEffects = false) {
  resetState(overrides, runEffects);
  const onOpenChange = vi.fn();
  const onSave = vi.fn();
  try {
    renderToStaticMarkup(React.createElement(GroupAdvancedSettingsDialog, {
      open: true,
      onOpenChange,
      groupName: "Auto",
      groupType: "select",
      listenerTarget: { kind: "module", id: "auto" },
      conflictState: { dnsYaml: "", mixedPort: 7890, listenerPorts: {}, groupListeners: [] },
      onSave,
      ...props,
    } as any));
    return { onOpenChange, onSave, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

describe("UI component coverage: node management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.confirmDialog.mockResolvedValue(true);
    mocks.store = {
      sources: [{
        id: "source",
        type: "url",
        content: 123,
        useProxyProviders: true,
        tag: "HK",
        lastParsedTag: "HK",
        nameTemplate: "[{tag}] {name}",
      }],
      nodes: [alpha, beta],
      nodeNameFilter: { enabled: false, excludeRegexes: [] },
      deletedNodeNames: [],
      deletedNodes: [],
      removeNode: vi.fn(),
      restoreDeletedNode: vi.fn(),
      renameNode: vi.fn(),
      restoreNodeName: vi.fn(),
      bulkRenameNodes: vi.fn(),
      setNodeOrder: vi.fn(),
      listenerPorts: {},
      setListenerPort: vi.fn(),
      bulkSetListenerPorts: vi.fn(),
      setNodeNameFilter: vi.fn(),
    };
  });

  it("rejects non-string provider content and leaves the listener state off when no port is configured", () => {
    const result = renderNodeSection({}, true);
    expect(mocks.captures.autoDialog.hasProxyProviders).toBe(false);
    expect(result.setters[4]).not.toHaveBeenCalled();
  });

  it("guards invalid and unchanged effective ordering while preserving valid moves", () => {
    renderNodeSection();
    const list = mocks.captures.nodeList;

    list.setNodeOrder("missing", 1);
    list.setNodeOrder(alpha.name, Number.NaN);
    list.setNodeOrder(alpha.name, 1);
    list.moveNode("missing", "up");
    list.moveNode(alpha.name, "up");
    list.moveNode(beta.name, "down");
    expect(mocks.store.setNodeOrder).not.toHaveBeenCalled();

    list.moveNode(beta.name, "up");
    expect(mocks.store.setNodeOrder).toHaveBeenCalledWith(beta.name, 1, [alpha.name, beta.name]);
  });

  it("resolves malformed display data and clears only matching listener UI entries", () => {
    renderNodeSection({ 5: { [alpha.name]: "7891", Keep: "8000" }, 6: { [alpha.name]: "bad", Keep: "bad" } });

    expect(mocks.captures.nodeList.resolveNodeNameParts({ name: 123, _sourceIds: ["source"] })).toEqual(
      expect.objectContaining({ baseName: "", tag: "", canEditBase: true }),
    );
    mocks.captures.bulkDialog.onClearListenerPortUiState([alpha.name]);

    const draftReducer = stateMock.setters[5].mock.calls.at(-1)?.[0];
    const errorReducer = stateMock.setters[6].mock.calls.at(-1)?.[0];
    expect(draftReducer({ [alpha.name]: "7891", Keep: "8000" })).toEqual({ Keep: "8000" });
    expect(errorReducer({ [alpha.name]: "bad", Keep: "bad" })).toEqual({ Keep: "bad" });
  });
});

describe("UI component coverage: group advanced settings dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not rebuild its draft while closed", () => {
    const result = renderAdvancedDialog({}, { open: false }, true);
    expect(result.setters.every((setter) => setter.mock.calls.length === 0)).toBe(true);
  });

  it("rebuilds every draft field from an enabled listener when opened", () => {
    const listenerBinding = {
      id: "listener",
      target: { kind: "module", id: "auto" },
      port: 9010,
      enabled: true,
      allowLan: true,
    };
    const result = renderAdvancedDialog({}, {
      groupType: "load-balance",
      strategy: "round-robin",
      listenerBinding,
    }, true);

    expect(result.setters[0]).toHaveBeenCalledWith("load-balance");
    expect(result.setters[1]).toHaveBeenCalledWith("round-robin");
    expect(result.setters[2]).toHaveBeenCalledWith(true);
    expect(result.setters[3]).toHaveBeenCalledWith("9010");
    expect(result.setters[4]).toHaveBeenCalledWith(true);
  });

  it("uses default drafts without a binding and ignores a missing type-menu strategy", () => {
    const result = renderAdvancedDialog({}, {}, true);
    expect(result.setters[1]).toHaveBeenCalledWith("consistent-hashing");
    expect(result.setters[2]).toHaveBeenCalledWith(false);
    expect(result.setters[3]).toHaveBeenCalledWith("");
    expect(result.setters[4]).toHaveBeenCalledWith(false);

    mocks.captures.typeMenu.onChange({ groupType: "url-test" });
    expect(result.setters[0]).toHaveBeenCalledWith("url-test");
    expect(result.setters[1]).toHaveBeenCalledTimes(1);
  });

  it("saves a non-load-balance group without a listener", () => {
    const result = renderAdvancedDialog({ 0: "fallback", 2: false, 3: "" });
    const save = mocks.captures.buttons.find((button: any) => button.children === "保存");
    save.onClick();
    expect(result.onSave).toHaveBeenCalledWith({ groupType: "fallback", listener: null });
    expect(result.onOpenChange).toHaveBeenCalledWith(false);
  });
});
