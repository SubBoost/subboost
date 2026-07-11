import { describe, expect, it } from "vitest";
import { configToYaml } from "../../generator/yaml";
import type { ClashConfig } from "../../types/config";
import type { ParsedNode } from "../../types/node";
import { parseAnyTLS } from "./anytls";
import { parseTrojan } from "./trojan";
import { parseVLESS } from "./vless";
import { parseVMess } from "./vmess";

const UUID = "11111111-1111-4111-8111-111111111111";

function parseVmessEch(value: string): ParsedNode {
  const payload = Buffer.from(
    JSON.stringify({
      v: "2",
      ps: "VMess ECH",
      add: "vmess-ech.example.com",
      port: "443",
      id: UUID,
      aid: "0",
      scy: "auto",
      net: "ws",
      tls: "tls",
      ech: value,
    })
  ).toString("base64");
  return parseVMess(`vmess://${payload}`);
}

const protocolCases: Array<[string, (value: string) => ParsedNode]> = [
  [
    "VLESS",
    (value) =>
      parseVLESS(
        `vless://${UUID}@vless-ech.example.com:443?security=tls&type=ws&ech=${encodeURIComponent(value)}#VLESS%20ECH`
      ),
  ],
  [
    "Trojan",
    (value) =>
      parseTrojan(`trojan://secret@trojan-ech.example.com:443?type=ws&ech=${encodeURIComponent(value)}#Trojan%20ECH`),
  ],
  ["AnyTLS", (value) => parseAnyTLS(`anytls://secret@anytls-ech.example.com:443?ech=${encodeURIComponent(value)}#AnyTLS%20ECH`)],
  ["VMess", parseVmessEch],
];

describe("ECH share-link protocol contracts", () => {
  it.each(protocolCases)("classifies %s ECH values and preserves the DNS name in generated YAML", (_protocol, parse) => {
    const domainNode = parse("cloudflare-ech.com");
    expect(domainNode["ech-opts"]).toEqual({
      enable: true,
      "query-server-name": "cloudflare-ech.com",
    });

    const generated = configToYaml({
      proxies: [domainNode],
      "proxy-groups": [],
      "rule-providers": {},
      rules: [],
    } as unknown as ClashConfig);
    expect(generated).toContain("ech-opts: {enable: true, query-server-name: cloudflare-ech.com}");

    expect(parse("+w==")["ech-opts"]).toEqual({ enable: true, config: "+w==" });
    expect(parse("")["ech-opts"]).toEqual({ enable: true });
    expect(parse("not base64!")["ech-opts"]).toEqual({ enable: true });
  });
});
