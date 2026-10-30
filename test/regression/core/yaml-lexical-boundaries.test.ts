import { describe, expect, it } from "vitest";
import { parseClashYaml, parseSubscription } from "@subboost/core/parser";
import { loadSubscriptionYaml } from "@subboost/core/parser/yaml-scalars";

describe("subscription YAML lexical boundaries", () => {
  it("preserves a block scalar with explicit indentation and a trailing comment", () => {
    const source = [
      "proxies:", "  - name: block", "    type: reject", "    extra: |2- # producer note", "      first, second", "",
    ].join("\n");
    const result = parseSubscription(source);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toMatchObject([{ name: "block", type: "reject", extra: "first, second" }]);
  });

  it("rejects a malformed block header without accepting earlier nodes", () => {
    const source = "proxies:\n  - {name: good, type: reject}\n  - name: invalid\n    type: reject\n    extra: |oops\n      value";
    const result = parseClashYaml(source);
    expect(result.nodes).toEqual([]);
    expect(result.errors[0]).toContain("YAML 解析错误");
  });

  it("accepts a blank tab line without treating it as an extra node", () => {
    const source = "proxies:\n  - {name: a, type: reject}\n\t  \n";
    expect(loadSubscriptionYaml(source)).toEqual({ proxies: [{ name: "a", type: "reject" }] });
  });

  it("parses a verbatim standard mapping tag and rejects an unterminated one", () => {
    const valid = "proxies: [!<tag:yaml.org,2002:map> {name: tagged, type: reject}]";
    expect(parseSubscription(valid)).toMatchObject({ nodes: [{ name: "tagged", type: "reject" }], errors: [] });
    const invalid = "proxies: [!<tag:yaml.org,2002:map {name: invalid, type: reject}]";
    const result = parseClashYaml(invalid);
    expect(result.nodes).toEqual([]);
    expect(result.errors[0]).toContain("YAML 解析错误");
  });
});
