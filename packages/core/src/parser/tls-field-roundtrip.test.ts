import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseSubscription } from "./index";
import { generateClashYaml } from "../generator";

const UUID = "11111111-1111-4111-8111-111111111111";

function importAndExport(input: string) {
  const result = parseSubscription(input);
  expect(result.errors).toEqual([]);
  expect(result.nodes).toHaveLength(1);
  const output = yaml.load(generateClashYaml({ nodes: result.nodes })) as {
    proxies: Array<Record<string, unknown>>;
  };
  expect(output.proxies).toHaveLength(1);
  return output.proxies[0];
}

describe("subscription TLS field round trips", () => {
  it.each(["vless", "vmess", "trojan", "anytls"])(
    "preserves certificate and client fingerprints independently for %s YAML",
    (type) => {
      const proxy = importAndExport(yaml.dump({ proxies: [{
        name: "TLS test", type, server: "local.subboost.test", port: 443,
        uuid: UUID, password: "synthetic-password", cipher: "auto", tls: true,
        fingerprint: "AB".repeat(32), "client-fingerprint": "chrome",
      }] }));
      expect(proxy.fingerprint).toBe("ab".repeat(32));
      expect(proxy["client-fingerprint"]).toBe("chrome");
    },
  );

  it.each([
    ["tfo=true", true], ["tfo=false", false],
    ["fast-open=1", true], ["fast_open=0", false], ["fastOpen=yes", true],
    ["tfo=false&fast-open=true", false],
    ["tfo=invalid", undefined], ["", undefined],
  ])("preserves VLESS transport setting %s through export", (query, expected) => {
    const proxy = importAndExport(
      `vless://${UUID}@local.subboost.test:443?security=tls&${query}#VLESS`,
    );
    expect(proxy.tfo).toBe(expected);
  });
});
