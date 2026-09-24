import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../types/node";
import {
  composeNodeNameRenameMaps,
  reconcileNodeNameReferences,
} from "./node-name-references";

function node(name: string): ParsedNode {
  return { name, type: "ss", server: "example.com", port: 443, cipher: "aes-128-gcm", password: "x" };
}

describe("node name references", () => {
  it("composes sequential renames transitively", () => {
    expect(
      Array.from(
        composeNodeNameRenameMaps(
          new Map([["Old", "Middle"]]),
          new Map([["Middle", "New"]])
        )
      )
    ).toEqual([
      ["Old", "New"],
      ["Middle", "New"],
    ]);
  });

  it("reconciles listener, dialer, and advanced node references", () => {
    const config = {
      untouched: true,
      listenerPorts: { Old: 12000, Missing: 12001 },
      dialerProxyGroups: [
        {
          id: "chain",
          name: "Chain",
          relayNodes: ["DIRECT", "Old", "Old", "Missing"],
          targetNodes: ["Old", "Missing"],
        },
      ],
      proxyGroupAdvanced: {
        auto: {
          extraMembers: [{ kind: "node", name: "Old" }, { kind: "direct" }],
          excludedMembers: [{ kind: "node", name: "Missing" }],
          memberOrder: [{ kind: "node", name: "Old" }, { kind: "node", name: "Old" }],
        },
      },
    };

    expect(
      reconcileNodeNameReferences(config, {
        nodes: [node("New")],
        renameMap: new Map([["Old", "New"]]),
      })
    ).toEqual({
      untouched: true,
      listenerPorts: { New: 12000 },
      dialerProxyGroups: [
        {
          id: "chain",
          name: "Chain",
          relayNodes: ["DIRECT", "New"],
          targetNodes: ["New"],
        },
      ],
      proxyGroupAdvanced: {
        auto: {
          extraMembers: [{ kind: "node", name: "New" }, { kind: "direct" }],
          excludedMembers: [],
          memberOrder: [{ kind: "node", name: "New" }],
        },
      },
    });
  });

  it("keeps references for nodes hidden only by the name filter", () => {
    const config = {
      listenerPorts: { Hidden: 12000 },
      dialerProxyGroups: [{ relayNodes: ["Hidden"], targetNodes: ["Hidden"] }],
    };
    expect(reconcileNodeNameReferences(config, { nodes: [node("Hidden")] })).toEqual(config);
  });

  it("preserves valid proxy groups as relays while keeping targets node-only", () => {
    const migratedCustomGroupName = "🧩 筛选组  美国";
    const config = {
      customProxyGroups: [
        { id: "legacy-us", name: migratedCustomGroupName, enabled: true },
        { id: "default-enabled", name: " 🧩 默认启用 " },
        { id: "disabled", name: "🧩 已停用", enabled: false },
      ],
      proxyGroupNameOverrides: { auto: "自定义自动", adult: "私密" },
      dialerProxyGroups: [
        {
          id: "chain",
          name: "Chain",
          relayNodes: [
            migratedCustomGroupName,
            migratedCustomGroupName,
            "⚡ 自定义自动",
            "🧩 默认启用",
            "DIRECT",
            "Old Node",
            "🧩 已停用",
            "🧩 不存在",
            "🔞 私密",
          ],
          targetNodes: [migratedCustomGroupName, "⚡ 自定义自动", "DIRECT", "Old Node", "Missing"],
        },
      ],
    };

    expect(
      reconcileNodeNameReferences(config, {
        nodes: [node("New Node")],
        renameMap: new Map([
          ["Old Node", "New Node"],
          [migratedCustomGroupName, "New Node"],
        ]),
      }).dialerProxyGroups
    ).toEqual([
      {
        id: "chain",
        name: "Chain",
        relayNodes: [migratedCustomGroupName, "⚡ 自定义自动", "🧩 默认启用", "DIRECT", "New Node"],
        targetNodes: ["New Node"],
      },
    ]);
  });

  it("uses the active template defaults only when enabled groups are omitted", () => {
    const dialerProxyGroups = [
      {
        relayNodes: ["⚡ 自动选择", "🤖 AI 服务"],
        targetNodes: [],
      },
    ];

    expect(
      reconcileNodeNameReferences({ template: "minimal", dialerProxyGroups }, { nodes: [] })
        .dialerProxyGroups[0].relayNodes
    ).toEqual(["⚡ 自动选择"]);
    expect(
      reconcileNodeNameReferences({ template: "full", dialerProxyGroups }, { nodes: [] })
        .dialerProxyGroups[0].relayNodes
    ).toEqual(["⚡ 自动选择", "🤖 AI 服务"]);
  });

  it("normalizes object rename maps and ignores blank or self mappings", () => {
    expect(
      Array.from(
        composeNodeNameRenameMaps(
          { " Old ": " Middle ", " ": "Ignored", Same: "Same" },
          { Middle: "New", New: "New", Empty: " " }
        )
      )
    ).toEqual([
      ["Old", "New"],
      ["Middle", "New"],
    ]);
    expect(Array.from(composeNodeNameRenameMaps())).toEqual([]);
    expect(Array.from(composeNodeNameRenameMaps({ A: "B" }, { B: "A" }))).toEqual([["B", "A"]]);
    expect(
      Array.from(
        composeNodeNameRenameMaps(
          { Old: "Middle", Middle: "Final", Shared: "Existing" },
          { Shared: "Replacement" }
        )
      )
    ).toEqual([
      ["Old", "Final"],
      ["Middle", "Final"],
      ["Shared", "Existing"],
    ]);
  });

  it("preserves unknown shapes while pruning invalid listener values", () => {
    const unknownGroup = null;
    expect(
      reconcileNodeNameReferences(
        {
          listenerPorts: { Valid: 1, Float: 1.5, Low: 0, High: 65536, Text: "12000" },
          dialerProxyGroups: [
            unknownGroup,
            {
              relayNodes: ["", 7, "DIRECT", "DIRECT", "Valid"],
              targetNodes: "legacy",
            },
          ],
          proxyGroupAdvanced: {
            invalid: null,
            valid: {
              extraMembers: "legacy",
              excludedMembers: [null, { kind: "node" }, { kind: "module", id: "auto" }],
              memberOrder: [{ kind: "node", name: "Valid" }],
            },
          },
        },
        { nodes: [node("Valid"), node(" ")] }
      )
    ).toEqual({
      listenerPorts: { Valid: 1 },
      dialerProxyGroups: [
        unknownGroup,
        {
          relayNodes: [7, "DIRECT", "Valid"],
          targetNodes: "legacy",
        },
      ],
      proxyGroupAdvanced: {
        invalid: null,
        valid: {
          extraMembers: "legacy",
          excludedMembers: [null, { kind: "node" }, { kind: "module", id: "auto" }],
          memberOrder: [{ kind: "node", name: "Valid" }],
        },
      },
    });
  });

  it("leaves absent or non-record relationship sections untouched", () => {
    expect(reconcileNodeNameReferences({ unrelated: true }, { nodes: [] })).toEqual({ unrelated: true });
    expect(
      reconcileNodeNameReferences(
        { listenerPorts: null, dialerProxyGroups: "legacy", proxyGroupAdvanced: [] },
        { nodes: [] }
      )
    ).toEqual({ listenerPorts: null, dialerProxyGroups: "legacy", proxyGroupAdvanced: [] });
  });
});
