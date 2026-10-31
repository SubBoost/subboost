import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveModuleName } from "@subboost/core/generator/rules";
import { initialState } from "@subboost/ui/store/config-store/definitions";

const mocks = vi.hoisted(() => ({ store: {} as Record<string, any>, buttons: [] as any[], icons: [] as any[],
  state: { enabled: false, index: 0, values: {} as Record<number, unknown> } }));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    if (!mocks.state.enabled) return actual.useState(initial);
    const index = mocks.state.index++;
    return [Object.hasOwn(mocks.state.values, index) ? mocks.state.values[index] : initial, vi.fn()];
  } };
});
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.store }));
vi.mock("@subboost/ui/product/api-adapter", () => ({ useProductApiAdapter: () => ({ rules: {} }) }));
vi.mock("./use-rule-set-resolution", () => ({ useRuleSetOperation: () => vi.fn(), resolveRuleSetUrl: vi.fn() }));
vi.mock("@subboost/ui/components/ui/button", () => ({ Button: (props: any) => { mocks.buttons.push(props); return null; } }));
vi.mock("@subboost/ui/components/ui/icon-button", () => ({ IconButton: (props: any) => { mocks.icons.push(props); return null; } }));
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => props.children, SelectContent: (props: any) => props.children,
  SelectItem: (props: any) => React.createElement("span", null, props.children),
  SelectTrigger: (props: any) => props.children, SelectValue: () => null,
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({ Switch: () => null }));

import { ProxyGroupsAddedRuleSets } from "./proxy-groups-added-rule-sets";

function renderEditor(values: Record<number, unknown> = {}) {
  mocks.state.enabled = true;
  mocks.state.index = 0;
  mocks.state.values = values;
  mocks.buttons = [];
  mocks.icons = [];
  try { return renderToStaticMarkup(React.createElement(ProxyGroupsAddedRuleSets, { totalRules: null })); }
  finally { mocks.state.enabled = false; }
}

describe("literal rule-set editor", () => {
  beforeEach(() => {
    const name = resolveModuleName("cn");
    mocks.store = { ...structuredClone(initialState), enabledProxyGroups: ["select"],
      customRuleSets: [
        { id: "node", name: "Node rule", behavior: "domain", path: "geosite/node.mrs", target: name },
        { id: "short", name: "Short rule", behavior: "domain", path: "geosite/short.mrs", target: "module:cn" },
        { id: "direct", name: "Direct rule", behavior: "domain", path: "geosite/direct.mrs", target: "DIRECT" },
        { id: "unknown", name: "Unknown rule", behavior: "domain", path: "geosite/unknown.mrs", target: "Missing" },
      ],
      generatedYaml: `proxy-groups:\n  - name: 🚀 节点选择\nproxies:\n  - name: ${name}\n  - name: module:cn\n`,
      updateModuleRule: vi.fn(), moveModuleRule: vi.fn(), removeModuleRule: vi.fn(), toggleProxyGroup: vi.fn() };
  });

  it("lists literal node, direct and fallback targets", () => {
    const html = renderEditor();
    expect(html).toContain("geosite/node");
    expect(html).toContain("geosite/short");
    expect(html).toContain("geosite/direct");
    expect(html).toContain("geosite/unknown");
  });

  it.each([
    ["node", () => resolveModuleName("cn"), () => resolveModuleName("cn")],
    ["short", () => "module:cn", () => "module:cn"],
    ["direct", () => "DIRECT", () => "DIRECT"],
    ["unknown", () => "Missing", () => resolveModuleName("select")],
  ])("preserves %s while editing and deleting", (id, rawTarget, displayTarget) => {
    const raw = rawTarget();
    const displayed = displayTarget();
    renderEditor({ 0: `custom-rule-set:${id}`, 1: { path: `geosite/${id}.mrs`, targetValue: `literal:${displayed}`, noResolve: true } });
    mocks.buttons.find((button) => button.title === "保存规则集").onClick();
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith(displayed, id,
      expect.objectContaining({ id, path: `geosite/${id}.mrs`, noResolve: true }), raw);
    renderEditor();
    const position = ["node", "short", "direct", "unknown"].indexOf(id);
    mocks.icons.filter((button) => button.label === "删除规则集")[position].onClick();
    expect(mocks.store.removeModuleRule).toHaveBeenCalledWith(displayed, id, raw);
  });

  it("moves a literal target only when a different group is explicitly selected", () => {
    const raw = resolveModuleName("cn");
    renderEditor({ 0: "custom-rule-set:node", 1: { path: "geosite/node.mrs", targetValue: "module:cn", noResolve: false } });
    mocks.buttons.find((button) => button.title === "保存规则集").onClick();
    expect(mocks.store.updateModuleRule).toHaveBeenCalledWith(raw, "node", expect.objectContaining({ id: "node" }), raw);
    expect(mocks.store.moveModuleRule).toHaveBeenCalledWith(raw, "node", { kind: "module", id: "cn" }, raw);
    expect(mocks.store.updateModuleRule.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.moveModuleRule.mock.invocationCallOrder[0]);
    expect(mocks.store.toggleProxyGroup).toHaveBeenCalledWith("cn");
  });
});
