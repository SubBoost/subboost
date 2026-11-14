import { describe, expect, it } from "vitest";
import { loadSubscriptionYaml } from "./yaml-scalars";

describe("subscription YAML scalar semantics", () => {
  it("accepts empty documents and rejects multiple documents", () => {
    expect(loadSubscriptionYaml("")).toBeUndefined();
    expect(loadSubscriptionYaml("# no proxies\n")).toBeNull();
    expect(() => loadSubscriptionYaml("password: 123\n---\npassword: 456"))
      .toThrow("expected a single document");
  });

  it.each([
    ["0xff", "255"], ["-0xff", "-255"], ["+0o17", "15"],
    ["0b101", "5"], ["+000123", "+000123"], ["-000123", "-000123"],
  ])("preserves credential integer %s without rounding", (input, expected) => {
    expect(loadSubscriptionYaml(`password: ${input}\nport: 443`)).toEqual({ password: expected, port: 443 });
  });

  it("leaves an unquoted string credential unchanged", () => {
    expect(loadSubscriptionYaml("password: 9_007_199_254_740_993"))
      .toEqual({ password: "9_007_199_254_740_993" });
  });

  it("preserves merged credentials and numeric mapping keys", () => {
    expect(loadSubscriptionYaml("<<: &defaults {password: 000123, port: 443}\n123: numeric-key"))
      .toEqual({ password: "000123", port: 443, "123": "numeric-key" });
  });

  it("preserves ordinary aliases, timestamps and binary scalars and rejects cycles", () => {
    const value = loadSubscriptionYaml("first: &shared {password: 000123}\nsecond: *shared\nstamp: 2026-01-01\nbinary: !!binary QQ==") as Record<string, unknown>;
    expect(value.first).toEqual({ password: "000123" });
    expect(value.second).toBe(value.first);
    expect(() => loadSubscriptionYaml("cycle: &cycle {self: *cycle}")).toThrow("循环别名");
    expect(value.stamp).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(value.binary).toEqual(new Uint8Array([65]));
  });

  it("keeps prototype-like YAML keys as ordinary own data", () => {
    const value = loadSubscriptionYaml("__proto__: {password: 000123}") as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(value.__proto__).toEqual({ password: "000123" });
  });
});
