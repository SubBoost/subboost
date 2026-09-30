import { describe, expect, it } from "vitest";
import { getNodeEndpointError, isValidMieruPortRange } from "./node-endpoint";

const peer = { server: "local.subboost.test", port: 443, "public-key": "A".repeat(43) + "=" };

describe("alternative endpoint input boundaries", () => {
  it.each([123, "0-443", "443-65536", "65536-65537", "443-440", "443", "443-444-445"])("rejects invalid Mieru range %s", (range) => {
    expect(isValidMieruPortRange(range)).toBe(false);
  });

  it.each([
    { type: 123 },
    { type: "wireguard", peers: [] },
    { type: "wireguard", peers: "invalid" },
    { type: "wireguard", peers: [null] },
    { type: "wireguard", peers: [[]] },
    { type: "wireguard", peers: [peer], server: "local.subboost.test" },
  ])("rejects malformed or half-specified endpoints", (node) => {
    expect(getNodeEndpointError(node)).not.toBeNull();
  });

  it("accepts WireGuard peers alongside a complete top-level endpoint", () => {
    expect(getNodeEndpointError({ type: "wireguard", peers: [peer], server: "local.subboost.test", port: 8443 })).toBeNull();
  });
});
