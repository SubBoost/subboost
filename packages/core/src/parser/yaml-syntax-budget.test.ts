import { describe, expect, it } from "vitest";
import { parseSubscription } from "./index";
import { loadSubscriptionYaml } from "./yaml-scalars";
import { checkYamlSyntaxBudget } from "./yaml-syntax-budget";
import { parseEvents } from "js-yaml";

const punctuation = ",".repeat(250_001);

describe("YAML syntax budget", () => {
  it("accepts a large ordinary subscription with punctuation inside quoted WebSocket paths", () => {
    const path = `/ws?${Array.from({ length: 10 }, (_, index) => `p${index}=x`).join("&")}`;
    const nodes = Array.from({ length: 9_000 }, (_, index) =>
      `  - {name: n${index}, type: trojan, server: n${index}.local.subboost.test, port: 443, password: demo, network: ws, ws-opts: {path: '${path}'}}`,
    );
    const parsed = parseSubscription(`proxies:\n${nodes.join("\n")}`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.nodes).toHaveLength(9_000);
    expect(parsed.nodes[8_999]).toMatchObject({ name: "n8999", "ws-opts": { path } });
  });

  it("does not charge quoted scalar contents, escaped quotes or comments as syntax", () => {
    const source = [
      `# ${punctuation}`,
      `single: 'a''b${punctuation}'`,
      `double: "a\\"b${punctuation}"`,
      `plain: https://local.subboost.test/${punctuation}`,
    ].join("\n");
    const parsed = loadSubscriptionYaml(source) as Record<string, string>;
    expect(parsed.single).toBe(`a'b${punctuation}`);
    expect(parsed.double).toBe(`a"b${punctuation}`);
    expect(parsed.plain).toBe(`https://local.subboost.test/${punctuation}`);
  });

  it("does not charge block-scalar contents and resumes scanning after dedent", () => {
    const source = `proxies:\r\n  - name: a\r\n    type: reject\r\n    custom: |2-\r\n      ${punctuation}\r\n`;
    const parsed = parseSubscription(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.nodes[0]).toMatchObject({ name: "a", custom: punctuation });
    const tooMany = `note: |2\n  ${punctuation}\nproxies: [${"x,".repeat(250_001)}x]`;
    expect(() => checkYamlSyntaxBudget(tooMany)).toThrow("YAML 结构数量超过上限");
  });

  it("rejects excessive actual structure before loading YAML", () => {
    const source = `proxies: [${"x,".repeat(250_001)}x]`;
    expect(() => checkYamlSyntaxBudget(source)).toThrow("YAML 结构数量超过上限");
    expect(parseSubscription(source)).toMatchObject({ nodes: [], errors: [expect.stringContaining("YAML 结构数量超过上限")] });
    expect(() => checkYamlSyntaxBudget(`--- [${"x,".repeat(250_001)}x]`)).toThrow("YAML 结构数量超过上限");
    expect(() => checkYamlSyntaxBudget(`proxies: [{? [${"x,".repeat(250_001)}x] : y}]`)).toThrow("YAML 结构数量超过上限");
  });

  it("does not mistake quotes embedded in a plain scalar for an open quoted scalar", () => {
    const source = `label: plain 'unfinished\nproxies: [${"x,".repeat(250_001)}x]`;
    expect(() => checkYamlSyntaxBudget(source)).toThrow("YAML 结构数量超过上限");
  });

  it.each(["\u00a0", "\u0085", "\u2003", "\u2028", "\u2029", "\ufeff"])(
    "does not treat non-ASCII scalar characters as YAML separation: %j", (char) => {
      const makeSource = (array: string) => `label: plain:${char}'unfinished\nvalues: ${array}`;
      expect(() => parseEvents(makeSource("[x,x]"), {})).not.toThrow();
      expect(() => checkYamlSyntaxBudget(makeSource(`[${"x,".repeat(250_001)}x]`))).toThrow("YAML 结构数量超过上限");
    },
  );

  it.each([
    (array: string) => `--- ${array}`,
    (array: string) => `\uFEFF${array}`,
    (array: string) => `\uFEFF--- ${array}`,
    (array: string) => `note: |\n  text\n\uFEFF--- ${array}`,
    (array: string) => `%YAML 1.2\n--- ${array}`,
    (array: string) => `values: &values ${array}`,
    (array: string) => `? ${array}\n: value`,
    (array: string) => `values: [{? ${array} : value}]`,
    (array: string) => `- key:\n    child: ${array}`,
    (array: string) => `values: &values\n  - ${array}`,
    (array: string) => `note: >\n  text\n\nvalues: ${array}`,
    (array: string) => `label: plain 'unclosed\nvalues: ${array}`,
    (array: string) => `values: !!seq ${array}`,
  ])("counts structure across YAML node prefixes and contexts", (makeSource) => {
    expect(() => parseEvents(makeSource("[x,x]"), {})).not.toThrow();
    const source = makeSource(`[${"x,".repeat(250_001)}x]`);
    expect(() => checkYamlSyntaxBudget(source)).toThrow("YAML 结构数量超过上限");
  });

  it("preserves platform configuration detection despite punctuation in comments and paths", () => {
    const path = `/ws?${Array.from({ length: 10 }, (_, index) => `p${index}=x`).join("&")}`;
    const nodes = Array.from({ length: 9_000 }, (_, index) =>
      `n${index} = vmess, n${index}.local.subboost.test, 443, username=11111111-1111-4111-8111-111111111111, vmess-aead=true, ws=true, ws-path=${path}, tls=true`,
    );
    const parsed = parseSubscription(`[Proxy]\n${nodes.join("\n")}\n# ${punctuation}`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.nodes).toHaveLength(9_000);
    expect(parsed.nodes[8_999]).toMatchObject({ name: "n8999", "ws-opts": { path } });
  });
});
