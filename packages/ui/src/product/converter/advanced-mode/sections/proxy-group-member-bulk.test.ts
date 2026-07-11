import { describe, expect, it } from "vitest";
import type { ProxyGroupMemberRef } from "@subboost/core/types/config";
import {
  buildAddAllMembersPatch,
  buildRemoveAllMembersPatch,
  findCycleCreatingProxyGroupKeys,
  isNodeMember,
  isProxyGroupMember,
  type ResolvedMember,
} from "./proxy-group-member-bulk";

function resolved(ref: ProxyGroupMemberRef, name: string): ResolvedMember {
  const key =
    ref.kind === "node"
      ? `node:${ref.name}`
      : ref.kind === "module" || ref.kind === "custom"
        ? `${ref.kind}:${ref.id}`
        : `${ref.kind}:${ref.kind === "direct" ? "DIRECT" : "REJECT"}`;
  return { key, ref, name, kind: ref.kind };
}

describe("proxy group member bulk helpers", () => {
  it("adds every requested member while preserving unrelated member state", () => {
    const direct = resolved({ kind: "direct" }, "DIRECT");
    const select = resolved({ kind: "module", id: "select" }, "Select");
    const oldNode = resolved({ kind: "node", name: "Old" }, "Old");
    const newNode = resolved({ kind: "node", name: "New" }, "New");
    const custom = resolved({ kind: "custom", id: "media" }, "Media");

    expect(
      buildAddAllMembersPatch({
        advanced: {
          extraMembers: [{ kind: "reject" }],
          excludedMembers: [
            { kind: "node", name: "New" },
            { kind: "custom", id: "media" },
            { kind: "module", id: "auto" },
          ],
        },
        currentMembers: [direct, select, oldNode],
        membersToAdd: [newNode, custom],
      }),
    ).toEqual({
      extraMembers: [
        { kind: "reject" },
        { kind: "node", name: "New" },
        { kind: "custom", id: "media" },
      ],
      excludedMembers: [{ kind: "module", id: "auto" }],
      memberOrder: [
        { kind: "direct" },
        { kind: "module", id: "select" },
        { kind: "node", name: "New" },
        { kind: "custom", id: "media" },
        { kind: "node", name: "Old" },
      ],
    });
  });

  it("removes every requested member without changing other member categories", () => {
    const nodeA = resolved({ kind: "node", name: "A" }, "A");
    const nodeB = resolved({ kind: "node", name: "B" }, "B");

    expect(
      buildRemoveAllMembersPatch({
        advanced: {
          extraMembers: [
            { kind: "custom", id: "media" },
            { kind: "node", name: "A" },
          ],
          excludedMembers: [{ kind: "node", name: "B" }],
          memberOrder: [
            { kind: "direct" },
            { kind: "node", name: "A" },
            { kind: "custom", id: "media" },
          ],
        },
        membersToRemove: [nodeA, nodeB],
      }),
    ).toEqual({
      extraMembers: [{ kind: "custom", id: "media" }],
      excludedMembers: [
        { kind: "node", name: "A" },
        { kind: "node", name: "B" },
      ],
      memberOrder: [
        { kind: "direct" },
        { kind: "custom", id: "media" },
      ],
    });
  });

  it("distinguishes nodes and proxy groups from fixed policies", () => {
    const node = resolved({ kind: "node", name: "A" }, "A");
    const moduleMember = resolved({ kind: "module", id: "auto" }, "Auto");
    const custom = resolved({ kind: "custom", id: "media" }, "Media");
    const direct = resolved({ kind: "direct" }, "DIRECT");

    expect(isNodeMember(node)).toBe(true);
    expect(isNodeMember(moduleMember)).toBe(false);
    expect(isProxyGroupMember(moduleMember)).toBe(true);
    expect(isProxyGroupMember(custom)).toBe(true);
    expect(isProxyGroupMember(node)).toBe(false);
    expect(isProxyGroupMember(direct)).toBe(false);
  });

  it("blocks direct and transitive proxy group cycles", () => {
    const directCycle = resolved({ kind: "module", id: "a" }, "A");
    const transitiveCycle = resolved({ kind: "custom", id: "b" }, "B");
    const safe = resolved({ kind: "custom", id: "c" }, "C");

    expect(
      findCycleCreatingProxyGroupKeys({
        candidates: [directCycle, transitiveCycle, safe],
        generatedGroups: [
          { name: "Target", proxies: ["DIRECT"] },
          { name: "A", proxies: ["Target"] },
          { name: "B", proxies: ["A"] },
          { name: "C", proxies: ["D"] },
          { name: "D", proxies: [] },
        ],
        targetName: "Target",
      }),
    ).toEqual(new Set(["module:a", "custom:b"]));
  });
});
