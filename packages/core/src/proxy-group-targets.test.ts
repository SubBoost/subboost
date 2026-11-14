import { describe, expect, it } from "vitest";
import {
  getProxyGroupMemberKey,
  getProxyGroupTargetKey,
  isProxyGroupTargetRef,
  normalizeProxyGroupTargetRef,
  normalizeProxyGroupRuleTarget,
  parseProxyGroupTargetValue,
  isDisabledCustomProxyGroupTarget,
  resolveProxyGroupTargetName,
  resolveProxyGroupTargetContainer,
  ruleTargetMatchesName,
} from "./proxy-group-targets";

describe("proxy group target helpers", () => {
  it("keeps unavailable group identities distinct from active literal policies", () => {
    const disabled = { id: "regional", name: "Regional", emoji: "", groupType: "select" as const, enabled: false };
    const options = { moduleNames: { cn: "Domestic" }, enabledModules: [], customProxyGroups: [disabled] };
    expect(resolveProxyGroupTargetContainer({ kind: "module", id: "missing" }, options)).toBeNull();
    expect(resolveProxyGroupTargetContainer("Regional", options)).toEqual({ kind: "custom", id: "regional" });
    expect(resolveProxyGroupTargetContainer("Regional", { ...options, availablePolicyTargets: ["Regional"] })).toBeNull();
    expect(resolveProxyGroupTargetContainer("Domestic", { moduleNames: options.moduleNames })).toEqual({ kind: "module", id: "cn" });
    expect(isDisabledCustomProxyGroupTarget("Regional", options)).toBe(true);
    expect(isDisabledCustomProxyGroupTarget("Other", options)).toBe(false);
    expect(isDisabledCustomProxyGroupTarget({ kind: "module", id: "cn" }, options)).toBe(false);
    expect(isDisabledCustomProxyGroupTarget({ kind: "custom", id: "regional" }, options)).toBe(true);
    expect(isDisabledCustomProxyGroupTarget("Regional", { moduleNames: {} })).toBe(false);
  });
  it("keeps structured group identity and distinguishes active literal policies", () => {
    const options = { moduleNames: { cn: "Shared" }, enabledModules: [], availablePolicyTargets: ["Shared", "module:cn"],
      literalTargetNames: ["module:cn"], customProxyGroups: [{ id: "custom", name: "Shared", emoji: "", groupType: "select" as const }] };
    expect(resolveProxyGroupTargetContainer({ kind: "module", id: "cn" }, options)).toEqual({ kind: "module", id: "cn" });
    expect(resolveProxyGroupTargetContainer({ kind: "custom", id: "custom" }, options)).toEqual({ kind: "custom", id: "custom" });
    expect(resolveProxyGroupTargetContainer({ kind: "custom", id: "missing" }, options)).toBeNull();
    expect(resolveProxyGroupTargetContainer("Shared", options)).toEqual({ kind: "custom", id: "custom" });
    expect(resolveProxyGroupTargetContainer("module:cn", options)).toBeNull();
    expect(resolveProxyGroupTargetContainer("Shared", { ...options, customProxyGroups: [] })).toBeNull();
    expect(resolveProxyGroupTargetContainer("Shared", { ...options, customProxyGroups: [], enabledModules: ["cn"] })).toEqual({ kind: "module", id: "cn" });
    expect(resolveProxyGroupTargetContainer("Shared", { ...options, customProxyGroups: [], availablePolicyTargets: [] })).toEqual({ kind: "module", id: "cn" });
    expect(resolveProxyGroupTargetContainer("Missing", options)).toBeNull();
  });
  it("parses shorthand references without changing literal names", () => {
    const options = { moduleNames: { auto: "Auto" }, customProxyGroups: [
      { id: "media", name: "Media", emoji: "", groupType: "select" as const },
    ], fallbackTarget: "DIRECT" };
    expect(parseProxyGroupTargetValue(" module: auto ")).toEqual({ kind: "module", id: "auto" });
    expect(parseProxyGroupTargetValue("custom:media")).toEqual({ kind: "custom", id: "media" });
    for (const value of ["module:", "filtered:media", "Proxy"]) expect(parseProxyGroupTargetValue(value)).toBeNull();
    expect(resolveProxyGroupTargetName("module:auto", options)).toBe("Auto");
    expect(resolveProxyGroupTargetName("custom:media", options)).toBe("Media");
    expect(resolveProxyGroupTargetName("module:missing", options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName("custom:missing", options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName("DIRECT", options)).toBe("DIRECT");
    expect(normalizeProxyGroupRuleTarget(" ", options)).toBeNull();
    expect(normalizeProxyGroupRuleTarget("module:auto", { ...options, moduleNames: { auto: "module:auto" } }))
      .toBe("module:auto");
    expect(isDisabledCustomProxyGroupTarget("custom:media", {
      ...options, customProxyGroups: [{ ...options.customProxyGroups[0], enabled: false }],
    })).toBe(true);
  });
  it("validates and normalizes target refs", () => {
    expect(isProxyGroupTargetRef({ kind: "module", id: "auto" })).toBe(true);
    expect(isProxyGroupTargetRef({ kind: "custom", id: "media" })).toBe(true);
    expect(isProxyGroupTargetRef({ kind: "node", id: "auto" })).toBe(false);
    expect(isProxyGroupTargetRef({ kind: "module", id: " " })).toBe(false);
    expect(isProxyGroupTargetRef(null)).toBe(false);
    expect(isProxyGroupTargetRef([])).toBe(false);
    expect(normalizeProxyGroupTargetRef({ kind: "custom", id: " media " })).toEqual({ kind: "custom", id: "media" });
    expect(normalizeProxyGroupTargetRef({ kind: "custom", id: "" })).toBeNull();
    expect(getProxyGroupTargetKey({ kind: "module", id: "auto" })).toBe("module:auto");
  });

  it("builds stable member keys for every supported member kind", () => {
    expect(getProxyGroupMemberKey({ kind: "node", name: "Node A" })).toBe("node:Node A");
    expect(getProxyGroupMemberKey({ kind: "module", id: "auto" })).toBe("module:auto");
    expect(getProxyGroupMemberKey({ kind: "custom", id: "media" })).toBe("custom:media");
    expect(getProxyGroupMemberKey({ kind: "direct" })).toBe("direct:DIRECT");
    expect(getProxyGroupMemberKey({ kind: "reject" })).toBe("reject:REJECT");
  });

  it("resolves rule targets through module/custom names and fallbacks", () => {
    const options = {
      moduleNames: { auto: " Auto " },
      customProxyGroups: [{ id: "media", name: " Media ", emoji: "", groupType: "select" as const }],
      fallbackTarget: "DIRECT",
    };

    expect(resolveProxyGroupTargetName(" Proxy ", options)).toBe("Proxy");
    expect(resolveProxyGroupTargetName(" ", options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName({ kind: "module", id: "auto" }, options)).toBe("Auto");
    expect(resolveProxyGroupTargetName({ kind: "custom", id: "media" }, options)).toBe("Media");
    expect(resolveProxyGroupTargetName({ kind: "custom", id: "missing" }, options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName({ kind: "module", id: "missing" }, options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName({ kind: "module", id: "toString" }, options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName({ kind: "module", id: "constructor" }, options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName({ kind: "module", id: "hasOwnProperty" }, options)).toBe("DIRECT");
    expect(resolveProxyGroupTargetName({ kind: "node" } as never, options)).toBe("DIRECT");
    expect(ruleTargetMatchesName(" Proxy ", "Proxy")).toBe(true);
    expect(ruleTargetMatchesName({ kind: "module", id: "auto" }, "Auto")).toBe(false);
  });
});
