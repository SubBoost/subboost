import { describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import { compareSubscriptionSnapshots, createSubscriptionRequestBudget, hasUsableSubscriptionSnapshot } from "./snapshot-comparison";

const node = (extra: Record<string, unknown> = {}): ParsedNode => ({
  name: "demo", type: "anytls", server: "local.subboost.test", port: 443, password: "secret", ...extra,
} as ParsedNode);
const snapshot = (nodes: ParsedNode[], errors: string[] = []) => ({ nodes, errors });

describe("subscription snapshot comparison", () => {
  it("proves protocol and field supersets in either order", () => {
    const basic = snapshot([node()]);
    const rich = snapshot([node({ alpn: ["h2"] }), node({ type: "trojan", port: 8443 })]);
    expect(compareSubscriptionSnapshots(basic, rich)).toMatchObject({ relation: "next-superset", selected: "next", nextProtocols: ["anytls", "trojan"] });
    expect(compareSubscriptionSnapshots(rich, basic)).toMatchObject({ relation: "current-superset", selected: "current" });
  });

  it("ignores duplicate names, metadata, invalid nodes and empty optional fields", () => {
    const repeated = snapshot([node(), node({ name: "renamed", _sourceId: "ignored" }),
      node({ name: "剩余流量：10 GB", port: 9000 }), node({ password: {} }), node({ type: "trust-tunnel" })]);
    expect(compareSubscriptionSnapshots(snapshot([node({ alpn: [], sni: "" })]), repeated)).toMatchObject({ relation: "equivalent", currentNodeCount: 1, nextNodeCount: 1 });
    expect(hasUsableSubscriptionSnapshot(snapshot([node({ password: {} })]))).toBe(false);
    expect(hasUsableSubscriptionSnapshot(repeated)).toBe(true);
  });

  it("diagnoses credential conflicts without exposing values or combining snapshots", () => {
    const result = compareSubscriptionSnapshots(snapshot([node()]), snapshot([node({ password: "different-secret" })]));
    expect(result).toMatchObject({ relation: "field-conflict", conflictingNodeCount: 1, selected: "current" });
    expect(JSON.stringify(result)).not.toMatch(/secret|local\.subboost|demo/);
  });

  it("diagnoses disjoint sets with deterministic snapshot selection", () => {
    expect(compareSubscriptionSnapshots(snapshot([node()]), snapshot([node({ port: 8443 }), node({ port: 9443 })]))).toMatchObject({ relation: "divergent", selected: "next" });
    expect(compareSubscriptionSnapshots(snapshot([node()]), snapshot([node({ port: 8443 })]))).toMatchObject({ relation: "divergent", selected: "current" });
  });

  it("does not use one enriched node as proof for two distinct nodes", () => {
    const separate = snapshot([node({ sni: "local.subboost.test" }), node({ alpn: ["h2"] })]);
    const combined = snapshot([node({ sni: "local.subboost.test", alpn: ["h2"] })]);
    expect(compareSubscriptionSnapshots(separate, combined).relation).toBe("divergent");
  });

  it("prefers fewer errors only for equivalent runtime information", () => {
    expect(compareSubscriptionSnapshots(snapshot([node()], ["partial"]), snapshot([node()]))).toMatchObject({ relation: "equivalent", selected: "next" });
  });

  it("compares nested peer fields and preserves header names as runtime information", () => {
    const key = "A".repeat(43) + "=";
    const wg = (allowed = false) => node({ type: "wireguard", server: undefined, port: undefined,
      "private-key": key, peers: [{ server: "local.subboost.test", port: 443, "public-key": key,
        ...(allowed ? { "allowed-ips": ["0.0.0.0/0"] } : {}) }] });
    expect(compareSubscriptionSnapshots(snapshot([wg()]), snapshot([wg(true)]))).toMatchObject({ relation: "next-superset", selected: "next" });
    expect(compareSubscriptionSnapshots(snapshot([node({ headers: { name: "one" } })]), snapshot([node({ headers: { name: "two" } })]))).toMatchObject({ relation: "field-conflict" });
  });

  it("excludes update placeholders and redacts unfamiliar protocol labels", () => {
    const placeholder = node({ name: "clash update", server: "127.0.0.1", port: 1 });
    expect(compareSubscriptionSnapshots(snapshot([placeholder]), snapshot([node()])))
      .toMatchObject({ relation: "next-superset", currentNodeCount: 0, selected: "next" });
    const unknown = snapshot([node({ type: "FUTURE_LABEL" })]);
    expect(compareSubscriptionSnapshots(unknown, unknown).currentProtocols).toEqual(["unknown"]);
  });

  it("does not recurse forever through aliased runtime extension objects", () => {
    const headers: Record<string, unknown> = { token: "synthetic" };
    headers.self = headers;
    const parsed = snapshot([node({ headers })]);
    expect(compareSubscriptionSnapshots(parsed, parsed)).toMatchObject({ relation: "equivalent", currentNodeCount: 1 });
  });

  it("does not prove a superset when an aliased option changes at a second path", () => {
    const shared = { token: "one" };
    const aliased = snapshot([node({ options: { first: shared, second: shared } })]);
    const changed = snapshot([node({ options: { first: { token: "one" }, second: { token: "two" } } })]);
    expect(compareSubscriptionSnapshots(aliased, changed).relation).toBe("field-conflict");
  });

  it("bounds the shared wall clock across requests", () => {
    vi.useFakeTimers();
    try {
      const budget = createSubscriptionRequestBudget(30_000);
      expect(budget.remainingTimeout()).toBe(30_000);
      vi.advanceTimersByTime(59_000);
      expect(budget.remainingTimeout()).toBe(1000);
      vi.advanceTimersByTime(1000);
      expect(budget.remainingTimeout()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
