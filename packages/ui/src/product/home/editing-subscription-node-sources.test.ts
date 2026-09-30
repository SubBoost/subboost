import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import {
  ensureNodeOriginName,
  ensureNodesHaveValidSourceIds,
  getNodeOriginName,
  getNodeSourceIds,
} from "./editing-subscription-node-sources";

const mocks = vi.hoisted(() => ({
  parseSubscription: vi.fn(),
}));

vi.mock("@subboost/core/parser", () => ({
  parseSubscription: mocks.parseSubscription,
}));

function node(name: string, extra: Record<string, unknown> = {}): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase()}.example.com`,
    port: 443,
    cipher: "aes-128-gcm",
    password: "secret",
    ...extra,
  } as unknown as ParsedNode;
}

function source(overrides: Record<string, unknown>): SubscriptionSource {
  return {
    id: "source-1",
    type: "url",
    content: "",
    name: "",
    ...overrides,
  } as SubscriptionSource;
}

describe("editing subscription node source helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes origin names and source ids", () => {
    const withOrigin = node("Fallback", { _originName: "  Remote  " });
    expect(getNodeOriginName(withOrigin)).toBe("Remote");
    expect(getNodeOriginName(node("Fallback", { _originName: "  " }))).toBe("Fallback");

    const alreadyNormalized = node("Remote", { _originName: "Remote" });
    expect(ensureNodeOriginName(alreadyNormalized)).toBe(alreadyNormalized);
    expect(ensureNodeOriginName(node("Remote"))).toMatchObject({ _originName: "Remote" });

    expect(getNodeSourceIds(node("A", { _sourceIds: [" one ", 3, "", "one", "two"] }))).toEqual([
      "one",
      "two",
    ]);
    expect(getNodeSourceIds(node("A", { _sourceIds: "one" }))).toEqual([]);
  });

  it("keeps valid source ids and removes deleted ones", () => {
    const kept = node("Kept", { _sourceIds: [" valid ", "missing"] });
    const removed = node("Removed", { _sourceIds: ["missing"] });
    const untouched = node("Untouched");

    const result = ensureNodesHaveValidSourceIds([kept, removed, untouched], [
      source({ id: "valid" }),
      source({ id: 99 }),
    ] as unknown as SubscriptionSource[]);

    expect(getNodeSourceIds(result[0])).toEqual(["valid"]);
    expect(result[1]).not.toHaveProperty("_sourceIds");
    expect(result[2]).toBe(untouched);
  });

  it("adds inline source ids by matching parsed origin, server, and port", () => {
    const alpha = node("Alpha", { server: "alpha.example.com", port: 8443 });
    const alreadyTagged = node("Beta", {
      server: "beta.example.com",
      port: 9443,
      _sourceIds: ["inline"],
    });
    mocks.parseSubscription.mockReturnValueOnce({
      nodes: [
        node("Alpha", { server: "alpha.example.com", port: 8443 }),
        node("Beta", { server: "beta.example.com", port: 9443 }),
        node("Miss", { server: "miss.example.com", port: 443 }),
      ],
      errors: [],
      totalParsed: 3,
      totalFailed: 0,
    });

    const result = ensureNodesHaveValidSourceIds([alpha, alreadyTagged], [
      source({ id: "inline", type: "manual", content: " ss://nodes " }),
    ] as unknown as SubscriptionSource[]);

    expect(mocks.parseSubscription).toHaveBeenCalledWith("ss://nodes");
    expect(getNodeSourceIds(result[0])).toEqual(["inline"]);
    expect(result[1]).toBe(alreadyTagged);
  });

  it("ignores empty and unparseable inline sources", () => {
    const original = node("Alpha");
    mocks.parseSubscription.mockImplementationOnce(() => {
      throw new Error("bad input");
    });

    const result = ensureNodesHaveValidSourceIds([original], [
      source({ id: "blank", type: "manual", content: "   " }),
      source({ id: "bad", type: "manual", content: "bad" }),
    ] as unknown as SubscriptionSource[]);

    expect(mocks.parseSubscription).toHaveBeenCalledTimes(1);
    expect(result[0]).toBe(original);
  });

  it("keeps peers-only nodes from different endpoints attached to their own source", () => {
    const make = (port: number) => node("Same", { type: "wireguard", server: undefined, port: undefined,
      peers: [{ server: "local.subboost.test", port, "public-key": "A".repeat(43) + "=" }] });
    mocks.parseSubscription.mockReturnValueOnce({ nodes: [make(443)], errors: [] });
    mocks.parseSubscription.mockReturnValueOnce({ nodes: [make(8443)], errors: [] });
    const result = ensureNodesHaveValidSourceIds([make(443), make(8443)], [
      source({ id: "first", type: "manual", content: "first" }),
      source({ id: "second", type: "manual", content: "second" }),
    ]);
    expect(getNodeSourceIds(result[0])).toEqual(["first"]);
    expect(getNodeSourceIds(result[1])).toEqual(["second"]);
  });

  it("falls back to the only url source when a node has no source id", () => {
    const result = ensureNodesHaveValidSourceIds([node("Remote")], [
      source({ id: " url-source ", type: "url" }),
    ]);

    expect(getNodeSourceIds(result[0])).toEqual(["url-source"]);
  });

  it("reports ambiguous url source fallback without assigning an id", () => {
    const onMissingMultiUrlSourceIds = vi.fn();
    const result = ensureNodesHaveValidSourceIds(
      [node("Remote")],
      [
        source({ id: "url-1", type: "url" }),
        source({ id: "url-2", type: "url" }),
      ],
      { onMissingMultiUrlSourceIds }
    );

    expect(onMissingMultiUrlSourceIds).toHaveBeenCalledOnce();
    expect(getNodeSourceIds(result[0])).toEqual([]);
  });
});
