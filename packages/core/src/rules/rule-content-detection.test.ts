import { describe, expect, it } from "vitest";
import { detectRuleContent, RULE_CONTENT_MAX_BYTES } from "./rule-content-detection";

describe("remote rule content detection", () => {
  it.each([
    ["domain", "+.example.test\n*.sub.example.test\n.example.net"],
    ["ipcidr", "203.0.113.0/24\n2001:db8::/32"],
    ["classical", "DOMAIN-SUFFIX,example.test\nIP-CIDR,203.0.113.0/24,no-resolve\nDST-PORT,80/443/8000-8010"],
  ])("recognizes text and YAML %s contents without relying on an extension", (behavior, text) => {
    expect(detectRuleContent(`\ufeff# heading\r\n${text}\r\n`)).toEqual({ format: "text", behavior });
    expect(detectRuleContent(`payload:\n${text.split("\n").map((line) => `  - '${line}'`).join("\n")}`)).toEqual({ format: "yaml", behavior });
  });

  it.each([
    "", "# comments only", "<!doctype html><p>error</p>", '{"error":"Unauthorized"}',
    "payload: []", "payload: [1]", "payload: [null]", "payload: [a, [b]]", "payload: [",
    "payload:\n  - example.test\nproxies: []", "payload: &x [*x]", "payload: [example.test]\n---\npayload: [example.net]",
    "example.test\n203.0.113.0/24", "example.test\nDOMAIN,example.net", "300.1.1.1/24", "203.0.113.1/33", "2001:db8::/129",
    "203.0.113.0/24/", "203.0.113.0/24//garbage", "IP-CIDR,203.0.113.0/24/", "payload: ['203.0.113.0/24/']",
    "IP-CIDR,2001:db8::/32", "IP-CIDR6,203.0.113.0/24", "DOMAIN,example.test,DIRECT", "GEOIP,CN,REJECT",
    "DST-PORT,65536", "SRC-PORT,90-80", "RULE-SET,other", "SUB-RULE,other", "UNKNOWN,example.test",
    "https://example.test/rules", "foo..example.test", "<html>", "\0example.test", "payload:\n  - 'example.test\n    extra'",
  ])("rejects unsupported or malformed content: %s", (text) => {
    expect(() => detectRuleContent(text)).toThrow();
  });

  it("validates the entire file and bounds bytes, lines and entries", () => {
    expect(() => detectRuleContent("example.test\n".repeat(100000) + "bad rule")).toThrow();
    expect(() => detectRuleContent("x".repeat(8193))).toThrow(/过长/);
    expect(() => detectRuleContent(" ".repeat(RULE_CONTENT_MAX_BYTES + 1))).toThrow(/10 MiB/);
  });
  it("recognizes a quoted YAML payload key", () => {
    expect(detectRuleContent('"payload":\n  - +.example.test')).toEqual({ format: "yaml", behavior: "domain" });
  });
});
