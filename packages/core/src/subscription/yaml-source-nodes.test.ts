import { describe, expect, it } from "vitest";
import { COLLECTION_STYLE, type MappingNode } from "js-yaml";
import { MAX_SUBSCRIPTION_CONTENT_LENGTH, MAX_SUBSCRIPTION_LINES, MAX_YAML_EXPANDED_NODES } from "../parser/limits";
import { appendYamlSourceNode, readYamlSource, replaceYamlSourceNode, type YamlSourceDocument } from "./yaml-source-nodes";

const str = (value: string) => ({ kind: "scalar" as const, tag: "tag:yaml.org,2002:str", tagged: false, style: 1 as const, value });

function proxy(name: string, style: 1 | 2 = COLLECTION_STYLE.BLOCK): MappingNode {
  return { kind: "mapping", tag: "tag:yaml.org,2002:map", tagged: false, style, items: [
    { key: str("name"), value: str(name) },
    { key: str("type"), value: str("direct") },
  ] };
}

function read(content: string): YamlSourceDocument {
  const result = readYamlSource(content);
  if (!result.ok) throw new Error(`expected readable YAML: ${result.reason}`);
  return result.document;
}

const MIXED = `# my nodes
proxies:
  - {name: hk, type: ss, server: 203.0.113.1, port: 443, cipher: aes-128-gcm, password: "p"}  # flow
  - name: ts   # mine
    type: tailscale

  # backups below
  - name: jp
    type: direct
rules: [MATCH,DIRECT]
`;

describe("YAML source nodes", () => {
  it("lists every proxy with its name and protocol, in order", () => {
    expect(read(MIXED).entries.map(({ index, name, type }) => ({ index, name, type }))).toEqual([
      { index: 0, name: "hk", type: "ss" },
      { index: 1, name: "ts", type: "tailscale" },
      { index: 2, name: "jp", type: "direct" },
    ]);
    expect(read("- name: a\n  type: Tailscale\n").entries[0]).toMatchObject({ name: "a", type: "tailscale" });
    expect(read("name: solo\ntype: direct\n").entries).toHaveLength(1);
    expect(read("- {name: 1, type: direct}\n").entries[0].name).toBe("");
    expect(read("rules: []\n").entries).toEqual([]);
    expect(read("").entries).toEqual([]);
  });

  it.each([
    ["malformed YAML", "proxies: [{name: a}\n"],
    ["multiple documents", "proxies: []\n---\nproxies: []\n"],
    ["anchors and aliases", "x: &a v\nproxies:\n  - {name: ts, type: direct, hostname: *a}\n"],
    ["explicit tags", "proxies:\n  - {name: !!str ts, type: direct}\n"],
    ["a root scalar", "'text'\n"],
    ["proxies that are not a list", "proxies: {a: 1}\n"],
    ["a flow-style root mapping", "{proxies: [{name: a, type: direct}]}\n"],
    ["an empty list item", "proxies:\n  -\n  - name: a\n    type: direct\n"],
  ])("leaves %s to the raw editor", (_label, content) => {
    expect(readYamlSource(content).ok).toBe(false);
  });

  it("applies the subscription input and syntax budgets", () => {
    expect(readYamlSource(`proxies: []${"\n".repeat(MAX_SUBSCRIPTION_LINES)}`)).toEqual({ ok: false, reason: expect.stringMatching(/行数/) });
    expect(readYamlSource(`proxies: []\n#${"x".repeat(MAX_SUBSCRIPTION_CONTENT_LENGTH)}`)).toEqual({ ok: false, reason: expect.stringMatching(/大小/) });
    expect(readYamlSource(`x: ${"[".repeat(MAX_YAML_EXPANDED_NODES)}`)).toEqual({ ok: false, reason: expect.stringMatching(/结构/) });
  });

  it("rewrites only the edited entry and keeps every other byte", () => {
    const editable = MIXED.replace("   # mine", "").replace("  # flow", "");
    const out = replaceYamlSourceNode(read(editable), 1, proxy("office"));
    expect(out).toBe(editable.replace("  - name: ts\n    type: tailscale\n", "  - name: office\n    type: direct\n"));
    // Flow entries stay flow; the trailing comment of the last entry's neighbour survives.
    const first = replaceYamlSourceNode(read(editable), 0, proxy("hk2", COLLECTION_STYLE.FLOW));
    expect(first).toBe(editable.replace(/ {2}- \{name: hk[^\n]*\n/, "  - {name: hk2, type: direct}\n"));
    const last = replaceYamlSourceNode(read(MIXED), 2, proxy("jp2"));
    expect(last).toBe(MIXED.replace("  - name: jp\n    type: direct\n", "  - name: jp2\n    type: direct\n"));
  });

  it("protects comments inside a rewritten range and keeps other entries editable", () => {
    const document = read(MIXED);
    expect(() => replaceYamlSourceNode(document, 0, proxy("hk2", COLLECTION_STYLE.FLOW))).toThrow(/注释/);
    expect(() => replaceYamlSourceNode(document, 1, proxy("ts2"))).toThrow(/注释/);
    expect(document.entries[2].replaceBlockedReason).toBeNull();
    expect(() => replaceYamlSourceNode(read("# root comment\nname: a\ntype: direct\n"), 0, proxy("b"))).toThrow(/注释/);
  });

  it("keeps the source's line endings and a missing final newline", () => {
    const crlf = "proxies:\r\n  - name: a\r\n    type: direct\r\n";
    expect(replaceYamlSourceNode(read(crlf), 0, proxy("b"))).toBe("proxies:\r\n  - name: b\r\n    type: direct\r\n");
    expect(replaceYamlSourceNode(read("- name: a\n  type: direct"), 0, proxy("b"))).toBe("- name: b\n  type: direct");
  });

  it("rewrites a root-level single proxy as a whole", () => {
    expect(replaceYamlSourceNode(read("name: a\ntype: direct\n"), 0, proxy("b"))).toBe("name: b\ntype: direct\n");
  });

  it("appends after the last entry, before trailing comments and the next key", () => {
    const content = "proxies:\n  - name: a\n    type: direct\n  # end of list\nrules: []\n";
    expect(appendYamlSourceNode(read(content), proxy("b"))).toBe(
      "proxies:\n  - name: a\n    type: direct\n  - name: b\n    type: direct\n  # end of list\nrules: []\n"
    );
    expect(appendYamlSourceNode(read("- name: a\n  type: direct"), proxy("b"))).toBe("- name: a\n  type: direct\n- name: b\n  type: direct\n");
    expect(appendYamlSourceNode(read("proxies:\n- name: a\n  type: direct\n"), proxy("b"))).toBe("proxies:\n- name: a\n  type: direct\n- name: b\n  type: direct\n");
  });

  it("creates the proxies list when the source has none", () => {
    expect(appendYamlSourceNode(read(""), proxy("a"))).toBe("proxies:\n  - name: a\n    type: direct\n");
    expect(appendYamlSourceNode(read("# notes\n"), proxy("a"))).toBe("# notes\nproxies:\n  - name: a\n    type: direct\n");
    expect(appendYamlSourceNode(read("rules: []"), proxy("a"))).toBe("rules: []\nproxies:\n  - name: a\n    type: direct\n");
    expect(appendYamlSourceNode(read("rules: []\nproxies:"), proxy("a"))).toBe("rules: []\nproxies:\n  - name: a\n    type: direct\n");
    expect(appendYamlSourceNode(read("proxies:   # empty\nrules: []\n"), proxy("a"))).toBe(
      "proxies:   # empty\n  - name: a\n    type: direct\nrules: []\n"
    );
    // Trailing spaces and blank lines stay; under `|+` the blank lines are part of the value.
    expect(appendYamlSourceNode(read("rules: []\n# note  \n\n\n"), proxy("a"))).toBe(
      "rules: []\n# note  \n\n\nproxies:\n  - name: a\n    type: direct\n"
    );
    expect(appendYamlSourceNode(read("note: |+\r\n  kept\r\n\r\n"), proxy("a"))).toBe(
      "note: |+\r\n  kept\r\n\r\nproxies:\r\n  - name: a\r\n    type: direct\r\n"
    );
  });

  it("explains layouts it cannot change in place", () => {
    const inline = read("proxies: [{name: a, type: direct}]\n");
    expect(inline.entries).toHaveLength(1);
    expect(() => replaceYamlSourceNode(inline, 0, proxy("b"))).toThrow(/行内列表/);
    expect(() => appendYamlSourceNode(inline, proxy("b"))).toThrow(/行内列表/);
    const flowRoot = read("[{name: a, type: direct}]\n");
    expect(flowRoot.entries).toHaveLength(1);
    expect(() => appendYamlSourceNode(flowRoot, proxy("b"))).toThrow(/行内列表/);
    expect(() => appendYamlSourceNode(read("name: a\ntype: direct\n"), proxy("b"))).toThrow(/proxies 列表/);
    expect(() => appendYamlSourceNode(read("proxies: ~\n"), proxy("b"))).toThrow(/无法追加/);
    expect(() => replaceYamlSourceNode(read("proxies:\n  - name: a\n    type: direct\n"), 3, proxy("b"))).toThrow(/找不到/);
  });

  it("refuses output that would change anything besides the target entry", () => {
    // A key that only reads as a list item at a deeper indent cannot be located safely.
    expect(readYamlSource("proxies:\n  -\n    # lead\n    name: a\n    type: direct\n")).toEqual({ ok: false, reason: expect.any(String) });
  });
});
