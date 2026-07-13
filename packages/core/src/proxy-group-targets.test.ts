import { describe, expect, it } from "vitest";
import {
  getProxyGroupMemberKey,
  getProxyGroupTargetKey,
  isProxyGroupTargetRef,
  normalizeProxyGroupTargetRef,
  resolveProxyGroupTargetName,
  ruleTargetMatchesName,
} from "./proxy-group-targets";

describe("proxy group target helpers", () => {
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
