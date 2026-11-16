import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import {
  createTailscaleStateDir,
  hasDuplicateTailscaleStateDir,
  isTailscaleFormDirty,
  newTailscaleFormValues,
  readTailscaleFormValues,
  validateTailscaleForm,
  writeTailscaleNode,
  type TailscaleFormValues,
  type TailscaleNodeTarget,
} from "./tailscale-yaml-source";
import { readYamlSource } from "./yaml-source-nodes";

function valuesAt(content: string, index = 0): TailscaleFormValues {
  const read = readYamlSource(content);
  if (!read.ok) throw new Error(read.reason);
  const result = readTailscaleFormValues(read.document.entries[index].node);
  if (!result.ok) throw new Error(`expected form values: ${result.reason}`);
  return result.values;
}

function target(content: string, index = 0): TailscaleNodeTarget {
  return { index, initial: valuesAt(content, index) };
}

const load = (content: string): any => yaml.load(content);

describe("Tailscale nodes in a YAML source", () => {
  it.each([
    ["root proxies mapping", "proxies:\n  - {name: ts, type: tailscale}\n"],
    ["root proxy array", "- name: ts\n  type: tailscale\n"],
    ["single proxy mapping", "name: ts\ntype: tailscale\n"],
    ["mixed list", "proxies:\n  - {name: a, type: direct}\n  - {name: ts, type: Tailscale}\n"],
  ])("reads form values from a %s", (_label, content) => {
    const read = readYamlSource(content);
    if (!read.ok) throw new Error(read.reason);
    const entry = read.document.entries.find((item) => item.type === "tailscale")!;
    expect(readTailscaleFormValues(entry.node)).toEqual({ ok: true, values: expect.objectContaining({ name: "ts", authKey: "", udp: "default" }) });
  });

  it.each([
    ["merge keys", "- {<<: {udp: true}, name: ts, type: tailscale}\n"],
    ["a lookalike type", "- {name: ts, type: tailscale-next}\n"],
    ["a non-boolean known boolean", "- {name: ts, type: tailscale, udp: \"yes\"}\n"],
    ["an integer known string", "- {name: ts, type: tailscale, auth-key: 123}\n"],
    ["a non-string mapping key", "- {1: a, name: ts, type: tailscale}\n"],
    ["a duplicate key", "- {name: ts, type: tailscale, udp: true, udp: false}\n"],
    ["a non-scalar string field", "- {name: ts, type: tailscale, hostname: [a]}\n"],
    ["a non-scalar boolean field", "- {name: ts, type: tailscale, udp: [true]}\n"],
    ["a non-mapping entry", "- 123\n"],
  ])("leaves %s to the raw editor", (_label, content) => {
    const read = readYamlSource(content);
    if (!read.ok) throw new Error(read.reason);
    expect(readTailscaleFormValues(read.document.entries[0].node).ok).toBe(false);
  });

  it("returns the original bytes when nothing was edited", () => {
    const content = "# my node\nproxies:\n  - name: ts   # keep\n    type: tailscale\n    udp: false\n";
    const node = target(content);
    expect(isTailscaleFormDirty(node.initial, { ...node.initial })).toBe(false);
    expect(writeTailscaleNode(content, node, { ...node.initial })).toBe(content);
  });

  it("edits one node in a mixed source and keeps every other line", () => {
    const content = `# airport and home
proxies:
  - {name: hk, type: ss, server: 203.0.113.1, port: 443, cipher: aes-128-gcm, password: "p"}  # flow
  - name: ts
    type: tailscale
    future-field: {nested: [1, "02"]}
    dialer-proxy: Relay
    udp: false
dns:
  nameserver: ["tailscale://ts"]
version: "1.10"
`;
    const node = target(content, 1);
    const out = writeTailscaleNode(content, node, { ...node.initial, hostname: "laptop", authKey: "tskey-auth-placeholder" });
    expect(out.split("\n").slice(0, 3)).toEqual(content.split("\n").slice(0, 3));
    expect(out.endsWith('dns:\n  nameserver: ["tailscale://ts"]\nversion: "1.10"\n')).toBe(true);
    const ts = load(out).proxies[1];
    expect(ts).toEqual({ ...load(content).proxies[1], hostname: "laptop", "auth-key": "tskey-auth-placeholder" });
    // The source keeps the raw field; import admission strips it (covered by the import contract).
    expect(ts["dialer-proxy"]).toBe("Relay");
  });

  it("maps the three boolean states and removes cleared optional keys", () => {
    const content = "- {name: ts, type: tailscale, accept-routes: false, exit-node-allow-lan-access: true, udp: ~, hostname: old}\n";
    const node = target(content);
    expect(node.initial).toMatchObject({ acceptRoutes: "false", exitNodeAllowLanAccess: "true", udp: "default", hostname: "old" });
    const out = writeTailscaleNode(content, node, { ...node.initial, udp: "false", ephemeral: "true", exitNodeAllowLanAccess: "default", hostname: " ", name: "true", exitNode: "203.0.113.10" });
    expect(load(out)).toEqual([{ name: "true", type: "tailscale", "accept-routes": false, udp: false, ephemeral: true, "exit-node": "203.0.113.10" }]);
  });

  it("appends a new node with only the fields that were set", () => {
    const content = "proxies:\n  - {name: hk, type: direct}\n# trailing note\n";
    const values = { ...newTailscaleFormValues(["hk"], "tailscale/subboost-test"), authKey: "tskey-auth-placeholder", acceptRoutes: "true" as const };
    const out = writeTailscaleNode(content, null, values);
    expect(out).toBe(
      "proxies:\n  - {name: hk, type: direct}\n  - name: tailscale\n    type: tailscale\n    auth-key: tskey-auth-placeholder\n    state-dir: tailscale/subboost-test\n    accept-routes: true\n# trailing note\n"
    );
    expect(writeTailscaleNode("", null, newTailscaleFormValues([], "tailscale/a"))).toBe("proxies:\n  - name: tailscale\n    type: tailscale\n    state-dir: tailscale/a\n");
  });

  it("treats explicit nulls as unset and leaves absent keys alone when clearing", () => {
    expect(valuesAt("- {name: ts, type: tailscale, hostname: ~, udp: ~}\n")).toMatchObject({ hostname: "", udp: "default" });
    const content = "proxies:\n  - name: ts\n    type: tailscale\n";
    const node = target(content);
    expect(writeTailscaleNode(content, node, { ...node.initial, hostname: "  " })).toBe(content);
    expect(() => writeTailscaleNode(content, { ...node, index: 4 }, { ...node.initial, name: "ts2" })).toThrow(/已变化/);
  });

  it("rejects invalid drafts, duplicate names and stale targets without producing content", () => {
    const content = "proxies:\n  - {name: hk, type: direct}\n  - {name: ts, type: tailscale}\n";
    const node = target(content, 1);
    expect(validateTailscaleForm({ ...node.initial, name: " ", controlUrl: "nope" })).toEqual({ name: expect.any(String), controlUrl: expect.any(String) });
    expect(validateTailscaleForm({ ...node.initial, controlUrl: "http://127.0.0.1:8080" })).toEqual({});
    expect(() => writeTailscaleNode(content, node, { ...node.initial, controlUrl: "nope" })).toThrow();
    expect(() => writeTailscaleNode(content, node, { ...node.initial, name: "hk" })).toThrow(/同名/);
    expect(() => writeTailscaleNode(content, null, { ...node.initial, name: "ts" })).toThrow(/同名/);
    expect(() => writeTailscaleNode(content.replace("name: ts", "name: other"), node, { ...node.initial, hostname: "x" })).toThrow(/已变化/);
    expect(() => writeTailscaleNode("proxies: [{name: ts, type: tailscale}]\n", target("proxies: [{name: ts, type: tailscale}]\n"), { ...node.initial, hostname: "x" })).toThrow(/行内列表/);
    expect(() => writeTailscaleNode("proxies: [\n", null, node.initial)).toThrow();
  });

  it("names a new node after the taken ones and generates distinct directories", () => {
    expect(newTailscaleFormValues(["tailscale", "tailscale-2"], "d").name).toBe("tailscale-3");
    const first = createTailscaleStateDir();
    expect(first).toMatch(/^tailscale\/subboost-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(createTailscaleStateDir());
    const originalRandomUUID = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(createTailscaleStateDir()).toMatch(/^tailscale\/subboost-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: originalRandomUUID, configurable: true });
    }
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
