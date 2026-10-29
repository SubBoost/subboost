import { describe, expect, it } from "vitest";
import { shareHealthChecks } from "./shared-health-checks";
import { canonicalizeProxy } from "./yaml";

const nodes = ["A", "B"].map((name) => ({ name, type: "ss", server: "203.0.113.1", port: 443,
  cipher: "aes-128-gcm", password: "fixture", _sourceIds: ["source"] }));
const group = (name: string, extra = {}) => ({ name, type: "url-test", proxies: ["A", "B"],
  url: "https://local.subboost.test/check", interval: 300, lazy: false, tolerance: 50, ...extra });

describe("shared health checks", () => {
  it("shares equivalent probes while preserving members, ordering and direct references", () => {
    const config = { proxies: nodes, "proxy-groups": [group("one"), group("two", { tolerance: 100 })],
      rules: ["DOMAIN,local.subboost.test,A"], listeners: [{ name: "listen", proxy: "A" }] };
    const result = shareHealthChecks(config);
    expect(result.proxies).toBe(nodes);
    expect(result.rules).toBe(config.rules);
    expect(result.listeners).toBe(config.listeners);
    expect(result["proxy-providers"]).toEqual({ subboost_shared_1: {
      type: "inline", payload: nodes.map(canonicalizeProxy),
      "health-check": { enable: true, url: group("").url, interval: 300, timeout: 5000, lazy: false },
    } });
    const groups = result["proxy-groups"] as Record<string, unknown>[];
    expect(groups.map((item) => item.use)).toEqual([["subboost_shared_1"], ["subboost_shared_1"]]);
    expect(groups.map((item) => item.tolerance)).toEqual([50, 100]);
    expect(config["proxy-groups"][0].proxies).toEqual(["A", "B"]);
  });

  it.each([
    { url: "https://local.subboost.test/other" }, { interval: 600 }, { timeout: 1000 },
    { "expected-status": "204" }, { lazy: true }, { proxies: ["B", "A"] },
    { proxies: ["A", "DIRECT"] }, { use: ["remote"] }, { filter: "A" },
  ])("does not combine incompatible probes: %j", (extra) => {
    const config = { proxies: nodes, "proxy-groups": [group("one"), group("two", extra)] };
    expect(shareHealthChecks(config)).toBe(config);
  });

  it("keeps existing providers and resolves name collisions", () => {
    const remote = { type: "http", url: "https://local.subboost.test/nodes" };
    const result = shareHealthChecks({ proxies: nodes, "proxy-groups": [group("one"), group("two")],
      "proxy-providers": { subboost_shared_1: remote } });
    expect(result["proxy-providers"]).toMatchObject({ subboost_shared_1: remote, subboost_shared_2: { type: "inline" } });
  });

  it.each([
    {}, { proxies: {}, "proxy-groups": {} }, { proxies: nodes },
    { "proxy-groups": [group("one"), group("two")] },
  ])("leaves configs without eligible groups intact: %j", (config) => {
    expect(shareHealthChecks(config)).toBe(config);
  });

  it.each([
    { type: "select" }, { url: undefined }, { proxies: [] }, { proxies: ["A", "A"] },
    { proxies: [42] }, { interval: "300" }, { interval: 0.5 }, { interval: -1 },
    { "exclude-filter": "A" }, { "include-all": false },
  ])("does not share unsupported group contracts: %j", (extra) => {
    const config = { proxies: nodes, "proxy-groups": [group("one", extra), group("two", extra)] };
    expect(shareHealthChecks(config)).toBe(config);
  });

  it("preserves effective defaults, expected status and unrelated groups", () => {
    const extra = { interval: 0, timeout: 1000, "expected-status": "204" };
    const untouched = group("manual", { type: "select" });
    const result = shareHealthChecks({ proxies: nodes,
      "proxy-groups": [group("one", extra), group("two", extra), untouched] });
    expect(result["proxy-providers"]).toMatchObject({ subboost_shared_1: {
      "health-check": { interval: 300, timeout: 1000, "expected-status": "204" },
    } });
    expect((result["proxy-groups"] as unknown[])[2]).toBe(untouched);
  });
});
