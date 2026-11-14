import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import { parseClashYaml, parseSubscription } from "@subboost/core/parser";
import { generateClashYaml } from "@subboost/core/generator";
import { validateSubscriptionNodeList } from "./crud";

type Proxy = Record<string, unknown>;

function generateFrom(nodes: unknown[]): Proxy[] {
  const saved = JSON.parse(JSON.stringify(validateSubscriptionNodeList(nodes)));
  const reloaded = validateSubscriptionNodeList(saved);
  const output = yaml.load(generateClashYaml({ nodes: reloaded, userConfig: { dnsYaml: "" } })) as { proxies: Proxy[] };
  return output.proxies;
}

function importSaveGenerate(content: string): Proxy[] {
  const parsed = parseSubscription(content);
  expect(parsed.errors).toEqual([]);
  return generateFrom(parsed.nodes);
}

// Fields follow the official Mihomo example; values are local placeholders, never real credentials.
const OFFICIAL_EXAMPLE = `proxies:
  - name: tailscale
    type: tailscale
    hostname: subboost-test
    auth-key: tskey-auth-placeholder
    control-url: https://controlplane.tailscale.com
    state-dir: tailscale/subboost-test
    ephemeral: false
    udp: true
    accept-routes: true
    exit-node: 100.64.0.1
    exit-node-allow-lan-access: false
    dialer-proxy: Relay
    ip-version: ipv4
    future-field: kept
`;

describe("Tailscale import, persistence and generation", () => {
  it("imports, saves, reloads and generates the minimal endpointless node", () => {
    const proxies = importSaveGenerate("proxies:\n  - {name: ts, type: tailscale}\n");
    expect(proxies).toEqual([{ name: "ts", type: "tailscale" }]);
  });

  it("accepts minimal single mappings and root sequences", () => {
    expect(importSaveGenerate("name: ts\ntype: tailscale\n")).toEqual([{ name: "ts", type: "tailscale" }]);
    expect(importSaveGenerate("- {name: ts, type: tailscale}\n")).toEqual([{ name: "ts", type: "tailscale" }]);
  });

  it("keeps the official example fields and strips imported dialer controls", () => {
    const [proxy] = importSaveGenerate(OFFICIAL_EXAMPLE);
    expect(proxy).toEqual({
      name: "tailscale",
      type: "tailscale",
      hostname: "subboost-test",
      "auth-key": "tskey-auth-placeholder",
      "control-url": "https://controlplane.tailscale.com",
      "state-dir": "tailscale/subboost-test",
      ephemeral: false,
      udp: true,
      "accept-routes": true,
      "exit-node": "100.64.0.1",
      "exit-node-allow-lan-access": false,
      "ip-version": "ipv4",
      "future-field": "kept",
    });
    expect(proxy).not.toHaveProperty("dialer-proxy");
    expect(proxy).not.toHaveProperty("server");
    expect(proxy).not.toHaveProperty("port");
  });

  const BOOLEAN_FIELDS = ["ephemeral", "udp", "accept-routes", "exit-node-allow-lan-access"] as const;

  it.each(BOOLEAN_FIELDS)("preserves omitted, true and false for %s without injecting udp", (field) => {
    const [omitted] = importSaveGenerate("- {name: ts, type: tailscale}");
    expect(omitted).not.toHaveProperty(field);
    expect(importSaveGenerate(`- {name: ts, type: tailscale, ${field}: true}`)[0][field]).toBe(true);
    expect(importSaveGenerate(`- {name: ts, type: tailscale, ${field}: false}`)[0][field]).toBe(false);
  });

  it.each(BOOLEAN_FIELDS)("normalizes existing boolish aliases for %s", (field) => {
    expect(importSaveGenerate(`- {name: ts, type: tailscale, ${field}: "yes"}`)[0][field]).toBe(true);
    expect(importSaveGenerate(`- {name: ts, type: tailscale, ${field}: 0}`)[0][field]).toBe(false);
  });

  it.each(BOOLEAN_FIELDS)("rejects invalid explicit %s values instead of dropping them", (field) => {
    const parsed = parseClashYaml(`proxies:\n  - {name: ts, type: tailscale, ${field}: maybe}\n`);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.errors.join("\n")).toContain(field);
    expect(() => validateSubscriptionNodeList([{ name: "ts", type: "tailscale", [field]: "maybe" }])).toThrow(field);
  });

  it.each(["hostname", "auth-key", "control-url", "state-dir", "exit-node"])("rejects non-string %s", (field) => {
    expect(parseClashYaml(`- {name: ts, type: tailscale, ${field}: [a]}`).errors.join("\n")).toContain(field);
    expect(() => validateSubscriptionNodeList([{ name: "ts", type: "tailscale", [field]: { a: 1 } }])).toThrow(field);
  });

  it.each(["ftp://control.example", "not a url", "https://"])("rejects syntactically invalid control-url %s", (url) => {
    expect(parseClashYaml(`- {name: ts, type: tailscale, control-url: "${url}"}`).errors.join("\n")).toContain("control-url");
    expect(() => validateSubscriptionNodeList([{ name: "ts", type: "tailscale", "control-url": url }])).toThrow("control-url");
  });

  it("accepts private Headscale URLs and client-local absolute paths without changing them", () => {
    const [proxy] = importSaveGenerate(`- name: ts
  type: tailscale
  control-url: http://192.168.1.10:8080
  state-dir: /var/lib/mihomo/tailscale
`);
    expect(proxy).toMatchObject({ "control-url": "http://192.168.1.10:8080", "state-dir": "/var/lib/mihomo/tailscale" });
    expect(importSaveGenerate("- {name: ts, type: tailscale, control-url: 'http://headscale.local', state-dir: 'C:\\mihomo\\ts'}")[0])
      .toMatchObject({ "control-url": "http://headscale.local", "state-dir": "C:\\mihomo\\ts" });
  });

  it("treats null optional fields as absent", () => {
    expect(importSaveGenerate("- {name: ts, type: tailscale, auth-key: null, udp: ~}")).toEqual([{ name: "ts", type: "tailscale" }]);
  });

  it("applies the same rules to direct API saves", () => {
    expect(validateSubscriptionNodeList([{ name: "ts", type: "tailscale", udp: "true" }])[0]).toMatchObject({ udp: true });
    expect(() => validateSubscriptionNodeList([{ name: "ok", type: "reject" }, { name: "ts", type: "tailscale", "accept-routes": "maybe" }]))
      .toThrow(/#2.*accept-routes/);
  });
});
