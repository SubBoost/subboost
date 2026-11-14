import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import {
  createTailscaleDraftContent,
  createTailscaleStateDir,
  hasDuplicateTailscaleStateDir,
  isTailscaleFormDirty,
  parseTailscaleSourceDocument,
  serializeTailscaleForm,
  validateTailscaleForm,
  type TailscaleSourceDocument,
} from "./tailscale-yaml-source";

function documentOf(content: string): TailscaleSourceDocument {
  const result = parseTailscaleSourceDocument(content);
  if (!result.ok) throw new Error(`expected eligible document: ${result.reason}`);
  return result.document;
}

function load(content: string): any {
  return yaml.load(content);
}

describe("Tailscale YAML source document", () => {
  it.each([
    ["root proxies mapping", "proxies:\n  - {name: ts, type: tailscale}\n"],
    ["root proxy array", "- name: ts\n  type: tailscale\n"],
    ["single proxy mapping", "name: ts\ntype: tailscale\n"],
  ])("offers the form for a %s", (_label, content) => {
    expect(documentOf(content).initial).toMatchObject({ name: "ts", authKey: "", udp: "default" });
  });

  it.each([
    ["malformed YAML", "proxies: [\n"],
    ["multiple documents", "name: ts\ntype: tailscale\n---\nname: b\n"],
    ["multiple proxies", "proxies:\n  - {name: a, type: tailscale}\n  - {name: b, type: tailscale}\n"],
    ["a non-Tailscale proxy", "proxies:\n  - {name: a, type: ss, server: s.test, port: 1, cipher: aes-128-gcm, password: p}\n"],
    ["anchors and aliases", "x: &a v\nproxies:\n  - {name: ts, type: tailscale, hostname: *a}\n"],
    ["merge keys", "base: &b {udp: true}\nproxies:\n  - {<<: *b, name: ts, type: tailscale}\n"],
    ["explicit scalar tags", "proxies:\n  - {name: ts, type: tailscale, auth-key: !!str 12}\n"],
    ["a non-boolean known boolean", "proxies:\n  - {name: ts, type: tailscale, udp: \"yes\"}\n"],
    ["an integer known string", "proxies:\n  - {name: ts, type: tailscale, auth-key: 123}\n"],
    ["proxy providers", "proxy-providers:\n  p: {type: http, url: 'https://local.subboost.test'}\nproxies:\n  - {name: ts, type: tailscale}\n"],
    ["an invalid explicit value", "proxies:\n  - {name: ts, type: tailscale, control-url: 'ftp://x'}\n"],
    ["root scalar", "just-a-string\n"],
    ["non-mapping proxy item", "proxies:\n  - 123\n"],
    ["non-string mapping key", "proxies:\n  - {1: a, name: ts, type: tailscale}\n"],
    ["duplicate mapping key", "proxies:\n  - {name: ts, type: tailscale, udp: true, udp: false}\n"],
    ["non-scalar string field", "proxies:\n  - {name: ts, type: tailscale, hostname: [a]}\n"],
    ["non-scalar boolean field", "proxies:\n  - {name: ts, type: tailscale, udp: [true]}\n"],
  ])("keeps %s in raw mode", (_label, content) => {
    expect(parseTailscaleSourceDocument(content).ok).toBe(false);
  });

  it("returns the original bytes when nothing was edited", () => {
    const content = "# my node\nproxies:\n  - name: ts   # keep\n    type: tailscale\n    udp: false\n";
    const document = documentOf(content);
    expect(isTailscaleFormDirty(document, document.initial)).toBe(false);
    expect(serializeTailscaleForm(document, { ...document.initial })).toBe(content);
  });

  it("preserves root shape, sibling values and unknown fields on a material edit", () => {
    const content = `proxies:
  - name: ts
    type: tailscale
    ip-version: ipv4
    future-field: {nested: [1, "02"]}
    dialer-proxy: Relay
    udp: false
dns:
  enable: true
  nameserver: ["tailscale://ts"]
mode: rule
version: "1.10"
`;
    const document = documentOf(content);
    const next = serializeTailscaleForm(document, { ...document.initial, hostname: "laptop", authKey: "tskey-auth-placeholder" });
    const before = load(content);
    const after = load(next);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(after.dns).toEqual(before.dns);
    expect(after.version).toBe("1.10");
    expect(after.proxies).toEqual([{ ...before.proxies[0], hostname: "laptop", "auth-key": "tskey-auth-placeholder" }]);
    // The source keeps the raw field; import admission strips it (covered by the import contract).
    expect(after.proxies[0]["dialer-proxy"]).toBe("Relay");
  });

  it("preserves the root array and single-mapping shapes", () => {
    const array = documentOf("- {name: ts, type: tailscale}\n");
    expect(load(serializeTailscaleForm(array, { ...array.initial, name: "renamed" }))).toEqual([{ name: "renamed", type: "tailscale" }]);
    const single = documentOf("name: ts\ntype: tailscale\nx: 1\n");
    expect(load(serializeTailscaleForm(single, { ...single.initial, exitNode: "auto:any" }))).toEqual({ name: "ts", type: "tailscale", x: 1, "exit-node": "auto:any" });
  });

  it("maps the three boolean states to omission, true and false", () => {
    const document = documentOf("- {name: ts, type: tailscale, accept-routes: false, exit-node-allow-lan-access: true, udp: ~, hostname: ~}\n");
    expect(document.initial).toMatchObject({ acceptRoutes: "false", exitNodeAllowLanAccess: "true", ephemeral: "default", udp: "default", hostname: "" });
    const out = load(serializeTailscaleForm(document, { ...document.initial, udp: "false", ephemeral: "true", exitNodeAllowLanAccess: "default" }))[0];
    expect(out).toEqual({ name: "ts", type: "tailscale", "accept-routes": false, udp: false, ephemeral: true, hostname: null });
  });

  it("removes keys for cleared optional inputs and quotes ambiguous strings", () => {
    const document = documentOf("- {name: ts, type: tailscale, hostname: old, state-dir: tailscale/a}\n");
    const out = serializeTailscaleForm(document, { ...document.initial, hostname: "  ", stateDir: "", name: "true", exitNode: "100.64.0.1" });
    expect(load(out)).toEqual([{ name: "true", type: "tailscale", "exit-node": "100.64.0.1" }]);
  });

  it("rejects invalid drafts without producing content", () => {
    const document = documentOf("- {name: ts, type: tailscale}\n");
    expect(validateTailscaleForm({ ...document.initial, name: " ", controlUrl: "nope" })).toEqual({
      name: expect.any(String), controlUrl: expect.any(String),
    });
    expect(() => serializeTailscaleForm(document, { ...document.initial, controlUrl: "nope" })).toThrow();
    expect(validateTailscaleForm({ ...document.initial, controlUrl: "http://10.0.0.2:8080" })).toEqual({});
  });

  it("creates a minimal importable draft with a generated directory", () => {
    const first = createTailscaleStateDir();
    const second = createTailscaleStateDir();
    expect(first).toMatch(/^tailscale\/subboost-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
    const originalRandomUUID = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(createTailscaleStateDir()).toMatch(/^tailscale\/subboost-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: originalRandomUUID, configurable: true });
    }
    const content = createTailscaleDraftContent(first);
    expect(load(content)).toEqual({ proxies: [{ name: "tailscale", type: "tailscale", "state-dir": first }] });
    const document = documentOf(content);
    expect(document.initial.stateDir).toBe(first);
    // Renaming keeps the generated directory.
    expect(load(serializeTailscaleForm(document, { ...document.initial, name: "office" })).proxies[0]["state-dir"]).toBe(first);
  });

  it("warns about obvious shared default directories only", () => {
    expect(hasDuplicateTailscaleStateDir("", [undefined])).toBe(true);
    expect(hasDuplicateTailscaleStateDir("./tailscale", ["tailscale"])).toBe(true);
    expect(hasDuplicateTailscaleStateDir("tailscale/a/", ["./tailscale/a"])).toBe(true);
    expect(hasDuplicateTailscaleStateDir(".", ["./"])).toBe(true);
    expect(hasDuplicateTailscaleStateDir(".", ["", undefined, "tailscale"])).toBe(false);
    expect(hasDuplicateTailscaleStateDir("tailscale/a", ["tailscale/b", "/tailscale/a"])).toBe(false);
  });
});
