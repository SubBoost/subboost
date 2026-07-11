import { describe, expect, it } from "vitest";
import { sanitizeMihomoProxyNode } from "./proxy-sanitizer";

describe("Mihomo ECH sanitizer compatibility", () => {
  it("repairs legacy domain-valued config without overriding explicit query server names", () => {
    const legacy = sanitizeMihomoProxyNode({
      name: "Legacy ECH",
      type: "vless",
      server: "legacy.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      "ech-opts": { enable: true, config: " cloudflare-ech.com " },
    });
    const explicitFirst = sanitizeMihomoProxyNode({
      name: "Explicit First",
      type: "vless",
      server: "explicit-first.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      "ech-opts": {
        "query-server-name": "explicit.example.com",
        config: "legacy.example.com",
      },
    });
    const explicitLast = sanitizeMihomoProxyNode({
      name: "Explicit Last",
      type: "vless",
      server: "explicit-last.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      "ech-opts": {
        config: "legacy.example.com",
        "query-server-name": "explicit.example.com",
      },
    });
    const invalid = sanitizeMihomoProxyNode({
      name: "Invalid ECH",
      type: "vless",
      server: "invalid.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      "ech-opts": { enable: true, config: "not base64!" },
    });

    expect(legacy["ech-opts"]).toEqual({ enable: true, "query-server-name": "cloudflare-ech.com" });
    expect(explicitFirst["ech-opts"]).toEqual({ "query-server-name": "explicit.example.com" });
    expect(explicitLast["ech-opts"]).toEqual({ "query-server-name": "explicit.example.com" });
    expect(invalid["ech-opts"]).toEqual({ enable: true });
  });
});
