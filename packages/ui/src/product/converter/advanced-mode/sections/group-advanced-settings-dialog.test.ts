import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any[]>,
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
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
      const setter = vi.fn();
      stateMock.setters[index] = setter;
      return [value, setter];
    },
    useEffect: () => undefined,
  };
});

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", { className: props.className }, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => props.children,
  DialogContent: (props: any) => {
    mocks.captures.dialogContents.push(props);
    return React.createElement("section", { className: props.className }, props.children);
  },
  DialogHeader: (props: any) => React.createElement("header", null, props.children),
  DialogTitle: (props: any) => React.createElement("h2", { className: props.className }, props.children),
  DialogFooter: (props: any) => React.createElement("footer", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/form-field", () => ({
  FormField: (props: any) => {
    mocks.captures.formFields.push(props);
    return React.createElement("div", null, props.label, props.children, props.error ?? null);
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return null;
  },
}));
vi.mock("@subboost/ui/components/ui/switch-field", () => ({
  SwitchField: (props: any) => {
    mocks.captures.switchFields.push(props);
    return React.createElement("div", null, props.label, props.description ?? null);
  },
}));
vi.mock("./proxy-group-type-menu", () => ({
  ProxyGroupTypeMenu: (props: any) => {
    mocks.captures.typeMenus.push(props);
    return React.createElement("div", null, "代理组类型选单");
  },
}));

import { GroupAdvancedSettingsDialog } from "./group-advanced-settings-dialog";

const TARGET = { kind: "module" as const, id: "auto" };
const CONFLICT_STATE = {
  dnsYaml: "",
  mixedPort: 7890,
  listenerPorts: { Node: 9200 },
  groupListeners: [{ id: "gl-other", target: { kind: "custom" as const, id: "c1" }, port: 9300 }],
};

// state 索引：0=draftType 1=draftStrategy 2=listenerOn 3=portInput 4=allowLan 5=draftTestUrl
function renderDialog(overrides: Record<number, unknown> = {}, props: Record<string, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.captures = {
    buttons: [],
    dialogContents: [],
    formFields: [],
    inputs: [],
    switchFields: [],
    typeMenus: [],
  };
  try {
    const html = renderToStaticMarkup(
      React.createElement(GroupAdvancedSettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
        groupName: "⚡ 自动选择",
        groupType: "select",
        listenerTarget: TARGET,
        conflictState: CONFLICT_STATE,
        onSave: vi.fn(),
        ...props,
      } as any)
    );
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("GroupAdvancedSettingsDialog", () => {
  it("saves the group's test URL and rejects invalid input", () => {
    const onSave = vi.fn();
    renderDialog({ 0: "url-test", 5: " https://local.subboost.test/204 " }, { onSave });
    expect(mocks.captures.formFields.some((field) => field.label === "测速地址")).toBe(true);
    mocks.captures.buttons.find((button) => button.children === "保存").onClick();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ testUrl: "https://local.subboost.test/204" }));
    renderDialog({ 0: "url-test", 5: "ftp://local.subboost.test/204" });
    expect(mocks.captures.buttons.find((button) => button.children === "保存").disabled).toBe(true);
    renderDialog({ 0: "select" }, { testUrl: "https://local.subboost.test/204", onSave });
    expect(mocks.captures.formFields.some((field) => field.label === "测速地址")).toBe(false);
    mocks.captures.buttons.find((button) => button.children === "保存").onClick();
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ testUrl: "https://local.subboost.test/204" }));
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses the nested proxy-group type menu for load-balance strategies", () => {
    renderDialog();
    expect(mocks.captures.formFields.map((f: any) => f.label)).toEqual(["代理组类型"]);
    expect(mocks.captures.typeMenus[0]).toEqual(
      expect.objectContaining({
        value: "select",
        strategy: "consistent-hashing",
        showStrategyLabel: true,
      })
    );

    mocks.captures.typeMenus[0].onChange({
      groupType: "load-balance",
      strategy: "round-robin",
    });
    expect(stateMock.setters[0]).toHaveBeenCalledWith("load-balance");
    expect(stateMock.setters[1]).toHaveBeenCalledWith("round-robin");
  });

  it("delegates field spacing to the shared FormField default", () => {
    renderDialog({ 2: true, 3: "7891" });
    expect(
      mocks.captures.formFields.map((field: any) => ({
        label: field.label,
        className: field.className,
      }))
    ).toEqual([
      { label: "代理组类型", className: undefined },
      { label: "端口", className: undefined },
    ]);
  });

  it("saves only on the save button and passes the full draft", () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(
      { 0: "load-balance", 1: "round-robin", 2: true, 3: "7891", 4: true },
      { onSave, onOpenChange }
    );

    const saveButton = mocks.captures.buttons.find((props: any) => props.children === "保存");
    expect(saveButton.disabled).toBe(false);
    saveButton.onClick();
    expect(onSave).toHaveBeenCalledWith({
      groupType: "load-balance",
      strategy: "round-robin",
      listener: { port: 7891, enabled: true, allowLan: true },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels without leaking partial edits", () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ 0: "url-test", 2: true, 3: "7891" }, { onSave, onOpenChange });

    mocks.captures.buttons.find((props: any) => props.children === "取消").onClick();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("blocks saving on port conflicts with an inline error", () => {
    const onSave = vi.fn();
    renderDialog({ 2: true, 3: "9200" }, { onSave });

    const portField = mocks.captures.formFields.find((f: any) => f.label === "端口");
    expect(String(portField.error)).toMatch(/节点监听端口/);
    const saveButton = mocks.captures.buttons.find((props: any) => props.children === "保存");
    expect(saveButton.disabled).toBe(true);
    saveButton.onClick?.();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("removes the listener when the port field is cleared", () => {
    const onSave = vi.fn();
    renderDialog(
      { 2: false, 3: "" },
      { onSave, listenerBinding: { id: "gl-1", target: TARGET, port: 7891 } }
    );

    mocks.captures.buttons.find((props: any) => props.children === "保存").onClick();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ listener: null }));
  });

  it("keeps a disabled listener configuration on save", () => {
    const onSave = vi.fn();
    renderDialog({ 2: false, 3: "7891" }, { onSave });

    mocks.captures.buttons.find((props: any) => props.children === "保存").onClick();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ listener: { port: 7891, enabled: false, allowLan: false } })
    );
  });

  it("saves a paused listener even when its port conflicts elsewhere", () => {
    const onSave = vi.fn();
    // 关闭开关=暂停：端口 9200 与节点监听冲突，但停用绑定不参与生成，应可保存
    renderDialog({ 2: false, 3: "9200" }, { onSave });

    const portField = mocks.captures.formFields.find((f: any) => f.label === "端口");
    expect(portField.error).toBeNull();
    const saveButton = mocks.captures.buttons.find((props: any) => props.children === "保存");
    expect(saveButton.disabled).toBe(false);
    saveButton.onClick();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ listener: { port: 9200, enabled: false, allowLan: false } })
    );
  });

  it("still rejects malformed ports while the listener is paused", () => {
    const onSave = vi.fn();
    renderDialog({ 2: false, 3: "abc" }, { onSave });

    const portField = mocks.captures.formFields.find((f: any) => f.label === "端口");
    expect(String(portField.error)).toMatch(/1-65535/);
    const saveButton = mocks.captures.buttons.find((props: any) => props.children === "保存");
    expect(saveButton.disabled).toBe(true);
    saveButton.onClick?.();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the amber security hint only when allowLan is enabled", () => {
    const withLan = renderDialog({ 2: true, 3: "7891", 4: true });
    expect(withLan.html).toContain(
      "开启后监听 0.0.0.0，如果你的端口能从公网访问，任何人都可以使用你的节点。"
    );
    expect(withLan.html).toContain("amber");
    expect(mocks.captures.switchFields.map((field: any) => field.label)).toEqual([
      "监听端口",
      "允许其他设备访问",
    ]);

    const withoutLan = renderDialog({ 2: true, 3: "7891", 4: false });
    expect(withoutLan.html).not.toContain("amber");
  });

  it("stays within the viewport width on narrow screens", () => {
    renderDialog();
    // w-[calc(100vw-2rem)]：窄屏下弹窗不超过视口宽度，不产生横向滚动
    expect(mocks.captures.dialogContents[0].className).toContain("w-[calc(100vw-2rem)]");
  });
});
