import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNodeSourceId } from "@subboost/core/subscription/node-source-state";
import type { ParsedNode } from "@subboost/core/types/node";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  store: {} as Record<string, any>,
}));

vi.mock("lucide-react", () => ({
  Plus: () => React.createElement("span", null, "plus-icon"),
  X: () => React.createElement("span", null, "x-icon"),
}));

vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => mocks.store,
}));

import {
  buildMemberFromName,
  insertMemberAfterProtected,
  memberKindLabel,
  memberLabel,
  normalizeList,
  ProxyGroupAdvancedPanel,
  toggleValue,
  withMember,
  withoutMember,
  type ResolvedMember,
} from "./proxy-group-advanced-panel";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

describe("ProxyGroupAdvancedPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buttons = [];
    mocks.inputs = [];
    mocks.store = {
      nodes: [
        withNodeSourceId(node("US Source"), "source-a"),
        withNodeSourceId(node("Japan Source"), "source-b"),
        node("剩余流量：100GB"),
      ],
      sources: [
        { id: "source-a", type: "url", tag: " Primary " },
        { id: "source-b", type: "yaml", lastParsedTag: " YAML Feed " },
        { id: "unused", type: "nodes" },
      ],
      enabledProxyGroups: ["auto", "select"],
      customProxyGroups: [
        { id: "media", name: "Media", emoji: "", groupType: "select" },
        { id: "disabled", name: "Disabled", emoji: "", groupType: "select", enabled: false },
      ],
      customRuleSets: [],
      proxyGroupAdvanced: {},
      builtinRuleEdits: {},
      proxyGroupNameOverrides: { auto: "Auto" },
      testUrl: "https://cp.example",
      testInterval: 300,
      ruleProviderBaseUrl: "https://rules.example",
    };
  });

  it("renders source, region, enabled, excluded, and rules sections", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupAdvancedPanel, {
        target: { kind: "custom", id: "media", name: "Media" },
        advanced: {
          sourceIds: ["source-a"],
          regions: ["us"],
          includeRegex: "Source",
          excludeRegex: "Japan",
          extraMembers: [{ kind: "direct" }],
        },
        onChange,
        rulesCount: 0,
        rulesContent: React.createElement("div", null, "rules-content"),
      }),
    );

    expect(html).toContain("导入源");
    expect(html).toContain("Primary");
    expect(html).toContain("YAML Feed");
    expect(html).not.toContain("剩余流量");
    expect(html).toContain("US Source");
    expect(html).toContain("DIRECT");
    expect(html).toContain("rules-content");
    expect(html).toContain("还没有分流规则");
    expect(html).toContain("max-h-52 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar");
    expect(mocks.inputs.map((input) => input.value)).toEqual(["Source", "Japan"]);

    mocks.inputs[0].onChange({ target: { value: "IEPL" } });
    const excludeButton = mocks.buttons.find((button) => button.title === "排除");
    excludeButton.onClick();

    expect(onChange).toHaveBeenCalledWith({ includeRegex: "IEPL" });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedMembers: [expect.objectContaining({ kind: expect.any(String) })],
      }),
    );
  });

  it("renders empty states without generated members or source matches", () => {
    mocks.store = {
      ...mocks.store,
      nodes: [],
      sources: [],
      enabledProxyGroups: [],
      customProxyGroups: [],
      proxyGroupAdvanced: {},
      proxyGroupNameOverrides: undefined,
    };

    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupAdvancedPanel, {
        target: { kind: "module", id: "auto", name: "Auto" },
        advanced: {},
        onChange: vi.fn(),
        rulesCount: 2,
        rulesContent: React.createElement("div", null, "existing-rules"),
      }),
    );

    expect(html).toContain("暂无可匹配的导入源");
    expect(html).toContain("暂无已启用的节点或代理组");
    expect(html).toContain("DIRECT");
    expect(html).toContain("REJECT");
    expect(html).toContain("existing-rules");
    expect(html).not.toContain("还没有分流规则");
  });

  it("renders generated source fallback labels when source tags are absent", () => {
    mocks.store = {
      ...mocks.store,
      nodes: [
        withNodeSourceId(node("URL Node"), "url-source"),
        withNodeSourceId(node("YAML Node"), "yaml-source"),
        withNodeSourceId(node("Nodes Node"), "nodes-source"),
      ],
      sources: [
        { id: "url-source", type: "url" },
        { id: "yaml-source", type: "yaml" },
        { id: "nodes-source", type: "nodes" },
      ],
      enabledProxyGroups: ["auto"],
      customProxyGroups: [],
    };

    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupAdvancedPanel, {
        target: { kind: "module", id: "auto", name: "Missing Generated Group" },
        advanced: {},
        onChange: vi.fn(),
        rulesCount: 0,
        rulesContent: React.createElement("div", null, "rules-content"),
      }),
    );

    expect(html).toContain("#1 订阅链接");
    expect(html).toContain("#2 YAML 配置");
    expect(html).toContain("#3 节点链接");
    expect(html).toContain("暂无已启用的节点或代理组");
  });

  it("previews enabled members for a disabled built-in proxy group", () => {
    mocks.store = {
      ...mocks.store,
      enabledProxyGroups: [],
      customProxyGroups: [],
      proxyGroupAdvanced: {},
    };

    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupAdvancedPanel, {
        target: { kind: "module", id: "auto", name: "⚡ Auto" },
        advanced: {},
        onChange: vi.fn(),
        rulesCount: 0,
        rulesContent: null,
      }),
    );

    expect(html).toContain("US Source");
    expect(html).toContain("Japan Source");
    expect(html).toContain("max-h-52 overflow-y-auto pr-1 custom-scrollbar flex flex-wrap gap-1.5");
    expect(html).not.toContain("暂无已启用的节点或代理组");
  });

  it("previews enabled members for a disabled custom proxy group", () => {
    mocks.store = {
      ...mocks.store,
      enabledProxyGroups: [],
      customProxyGroups: [
        { id: "media", name: "Media", emoji: "", groupType: "select", enabled: false },
      ],
      proxyGroupAdvanced: {},
    };

    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupAdvancedPanel, {
        target: { kind: "custom", id: "media", name: "Media" },
        advanced: {},
        onChange: vi.fn(),
        rulesCount: 0,
        rulesContent: null,
      }),
    );

    expect(html).toContain("US Source");
    expect(html).toContain("Japan Source");
    expect(html).not.toContain("暂无已启用的节点或代理组");
  });

  it("normalizes advanced member helpers without rendering the panel", () => {
    const nodes = [node("US Source")];
    const moduleNames = { auto: "Auto", select: "Select" };
    const customProxyGroups = [{ id: "media", name: "Media", emoji: "", groupType: "select" as const }];
    const options = { nodes, moduleNames, customProxyGroups };

    const direct = buildMemberFromName("DIRECT", options);
    const reject = buildMemberFromName("REJECT", options);
    const nodeMember = buildMemberFromName("US Source", options);
    const moduleMember = buildMemberFromName("Auto", options);
    const customMember = buildMemberFromName("Media", options);

    expect(buildMemberFromName(" ", options)).toBeNull();
    expect(buildMemberFromName("Missing", options)).toBeNull();
    expect(direct).toMatchObject({ key: "direct:DIRECT", kind: "direct", name: "DIRECT" });
    expect(reject).toMatchObject({ key: "reject:REJECT", kind: "reject", name: "REJECT" });
    expect(nodeMember).toMatchObject({ key: "node:US Source", kind: "node", name: "US Source" });
    expect(moduleMember).toMatchObject({ key: "module:auto", kind: "module", name: "Auto" });
    expect(customMember).toMatchObject({ key: "custom:media", kind: "custom", name: "Media" });
    expect(memberLabel(direct as ResolvedMember)).toBe("DIRECT");
    expect(memberLabel(customMember as ResolvedMember)).toBe("Media");
    expect(memberKindLabel(nodeMember as ResolvedMember)).toBe("节点");
    expect(memberKindLabel(moduleMember as ResolvedMember)).toBe("内置组");
    expect(memberKindLabel(customMember as ResolvedMember)).toBe("自定义组");
    expect(memberKindLabel(direct as ResolvedMember)).toBe("直连");
    expect(memberKindLabel(reject as ResolvedMember)).toBe("拒绝");
  });

  it("updates list and member order helpers predictably", () => {
    const existing = [
      { kind: "direct" as const },
      { kind: "module" as const, id: "select" },
      { kind: "node" as const, name: "Old" },
    ];
    const resolved = existing.map((ref) => ({
      key: ref.kind === "direct" ? "direct:DIRECT" : ref.kind === "module" ? `module:${ref.id}` : `node:${ref.name}`,
      kind: ref.kind,
      name: ref.kind === "direct" ? "DIRECT" : ref.kind === "module" ? "Select" : ref.name,
      ref,
    })) as ResolvedMember[];

    expect(normalizeList(undefined)).toEqual([]);
    expect(normalizeList(["a"])).toEqual(["a"]);
    expect(toggleValue(undefined, "us")).toEqual(["us"]);
    expect(toggleValue(["us", "jp"], "us")).toEqual(["jp"]);
    expect(withoutMember(existing, "node:Old")).toEqual([{ kind: "direct" }, { kind: "module", id: "select" }]);
    expect(withMember(existing, { kind: "node", name: "Old" })).toEqual(existing);
    expect(withMember(existing, { kind: "custom", id: "media" })).toEqual([
      ...existing,
      { kind: "custom", id: "media" },
    ]);
    expect(insertMemberAfterProtected(resolved, { kind: "custom", id: "media" })).toEqual([
      { kind: "direct" },
      { kind: "module", id: "select" },
      { kind: "custom", id: "media" },
      { kind: "node", name: "Old" },
    ]);
    expect(insertMemberAfterProtected(resolved, { kind: "node", name: "Old" })).toEqual(existing);
  });
});
