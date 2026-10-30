import { describe, expect, it } from "vitest";
import { parseClashYaml, parseSubscription } from "./index";
import { encodeBase64 } from "./base64";
import { MAX_SUBSCRIPTION_ERRORS, MAX_SUBSCRIPTION_ITEMS } from "./limits";
import { preprocessSubscriptionContent } from "./preprocess";

function expectLimited(result: ReturnType<typeof parseSubscription>) {
  expect(result.nodes).toEqual([]);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toMatch(/^订阅解析受限:/);
}

describe("subscription parsing resource limits", () => {
  it("rejects self and indirect YAML cycles without retrying another format", () => {
    const cases = [
      'proxies: [{name: cycle, type: reject, extra: &x {self: *x}}]',
      'proxies: [{name: cycle, type: reject, extra: &x {nested: &y [*x]}}]',
      '[{name: cycle, type: reject, extra: &x [*x]}]',
    ];
    for (const input of cases) {
      expectLimited(parseClashYaml(input));
      expectLimited(parseSubscription(input));
    }
  });

  it("rejects a small exponential alias graph before materializing its expanded tree", () => {
    const lines = ["a0: &a0 [x, x, x, x, x, x, x, x, x, x]"];
    for (let depth = 1; depth <= 6; depth += 1) {
      lines.push(`a${depth}: &a${depth} [${Array(10).fill(`*a${depth - 1}`).join(", ")}]`);
    }
    lines.push("proxies: [{name: malicious, type: reject, extra: *a6}]");
    const input = lines.join("\n");
    expect(input.length).toBeLessThan(1_000);
    expectLimited(parseClashYaml(input));
    expectLimited(parseSubscription(input));
  });

  it("charges repeated scalar aliases and deeply chained aliases", () => {
    const repeated = `data: &data ${"x".repeat(450_000)}\nproxies: [{name: oversized, type: reject, extra: [${Array(12).fill("*data").join(",")}]}]`;
    expectLimited(parseSubscription(repeated));

    const lines = ["a0: &a0 [x]"];
    for (let depth = 1; depth <= 105; depth += 1) lines.push(`a${depth}: &a${depth} [*a${depth - 1}]`);
    lines.push("proxies: [{name: deep, type: reject, extra: *a105}]");
    expectLimited(parseSubscription(lines.join("\n")));
    expectLimited(parseSubscription(`proxies: [${"[".repeat(110)}x${"]".repeat(110)}]`));
  });

  it("treats the YAML constructor merge-work limit as terminal", () => {
    const fields = Array.from({ length: 100 }, (_, index) => `k${index}: v`).join(", ");
    const merged = Array.from({ length: 110 }, (_, index) => `m${index}: {<<: *base}`).join("\n");
    const input = `base: &base {${fields}}\n${merged}\nproxies: []`;
    expectLimited(parseClashYaml(input));
    expectLimited(parseSubscription(input));
  });

  it("bounds errors and segment counts without returning partial nodes", () => {
    const valid = `ss://${encodeBase64("aes-128-gcm:demo")}@local.subboost.test:443#valid`;
    const invalid = Array(MAX_SUBSCRIPTION_ERRORS + 1).fill("ftp://unsupported");
    expectLimited(parseSubscription([valid, ...invalid].join("\n")));
    expectLimited(parseSubscription(Array(MAX_SUBSCRIPTION_ITEMS + 1).fill(valid).join("|")));
    const yaml = `proxies:\n  - {name: valid, type: reject}\n${"  - {name: bad}\n".repeat(MAX_SUBSCRIPTION_ERRORS + 1)}`;
    expectLimited(parseClashYaml(yaml));
    expectLimited(parseSubscription(yaml));
    const provider = `proxies:\n${"  - {name: bad}\n".repeat(MAX_SUBSCRIPTION_ERRORS)}proxy-providers: {remote: {type: http}}`;
    expectLimited(parseClashYaml(provider));
  });

  it("rejects oversized SSD expansion before creating all inherited credentials", () => {
    const data = {
      port: 443, encryption: "aes-128-gcm", password: "x".repeat(400_000),
      servers: Array.from({ length: 40 }, (_, index) => ({ server: `n${index}.local.subboost.test` })),
    };
    const input = `ssd://${encodeBase64(JSON.stringify(data))}`;
    const result = preprocessSubscriptionContent(input);
    expect(result.content).toBe("");
    expect(result.errors[0]).toMatch(/^订阅解析受限:/);
    expectLimited(parseSubscription(input));
  });

  it("bounds SSD and Netch server counts before converting them", () => {
    const servers = Array(MAX_SUBSCRIPTION_ITEMS + 1).fill(null);
    const ssd = `ssd://${encodeBase64(JSON.stringify({ servers }))}`;
    expectLimited(parseSubscription(ssd));
    expectLimited(parseSubscription(JSON.stringify({ ModeFileNameType: 1, Server: servers })));
  });

  it("limits indentation repair before repeated padding can expand it", () => {
    const first = `${" ".repeat(2_000)}- {name: first, type: reject}`;
    const input = `proxies:\n${first}\n${"  - {name: other, type: reject}\n".repeat(8_500)}`;
    expect(input.length).toBeLessThan(500_000);
    expectLimited(parseClashYaml(input));
    expectLimited(parseSubscription(input));
  });

  it("bounds carriage-return-only line lists", () => {
    expectLimited(parseSubscription("# comment\r".repeat(200_001)));
  });
});
