import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseClashYaml, parseSubscription } from "@subboost/core/parser";
import { generateClashYaml } from "@subboost/core/generator";
import { validateSubscriptionNodeList } from "./crud";
import { parsePlatformConfigContent } from "@subboost/core/parser/platform/parse-platform-config";

const endpoint = "server: local.subboost.test, port: '443'";
const key = "A".repeat(43) + "=";
const protocols = [
  ["ss", "cipher: aes-128-gcm"],
  ["ssr", "cipher: aes-256-cfb, protocol: origin, obfs: plain"],
  ["anytls", "client-fingerprint: chrome"],
  ["trojan", "sni: local.subboost.test"],
  ["hysteria2", "sni: local.subboost.test"],
  ["ssh", "username: user"],
] as const;
const documentPrefixes = [
  "", "\n# subscription\n\n", "# subscription\n---\n",
  "%YAML 1.2\n---\n", "%TAG !e! tag:local.subboost.test,2026:\n---\n",
  "# subscription\n%YAML 1.2\n%TAG !e! tag:local.subboost.test,2026:\n---\t# document\n\n",
];
const mappingKeys = ["type:", "type :", '"type" :', "'type':"];
const documentShapes = ["flow mapping", "block sequence", "flow sequence", "block mapping", "block node sequence"] as const;
const documentCases = documentShapes.flatMap((shape) => documentPrefixes.flatMap((prefix, prefixIndex) =>
  mappingKeys.map((typeKey) => ({ shape, prefix, prefixIndex, typeKey }))));

function nodeDocument(shape: typeof documentShapes[number], typeKey: string): string {
  const fields = ["name: document", `${typeKey} anytls`, '"server" : local.subboost.test', "'port': '443'", "password: 000123", "sni: local.subboost.test", "alpn: [h2, http/1.1]", "client-fingerprint: chrome"];
  const flow = `{${fields.join(", ")}}`;
  if (shape === "flow mapping") return flow;
  if (shape === "block sequence") return `- ${flow}`;
  if (shape === "flow sequence") return `[\n  # node\n  ${flow}\n]`;
  const block = fields.join("\n");
  return shape === "block mapping" ? block : `-\n${block.split("\n").map((line) => `  ${line}`).join("\n")}`;
}

function generated(content: string) {
  const parsed = parseSubscription(content);
  expect(parsed.errors).toEqual([]);
  const nodes = validateSubscriptionNodeList(parsed.nodes);
  return yaml.load(generateClashYaml({ nodes, userConfig: { dnsYaml: "" } })) as { proxies: Record<string, unknown>[] };
}

describe("protocol import through persistence and generation", () => {
  it.each(protocols)("detects single %s mappings with quoted ports", (type, fields) => {
    const content = `name: demo\ntype: ${type}\nserver: local.subboost.test\nport: '443'\npassword: secret\n${fields.split(", ").join("\n")}`;
    expect(generated(content).proxies).toHaveLength(1);
    expect(generated(`{name: demo, type: ${type}, ${endpoint}, password: secret, ${fields}}`).proxies).toHaveLength(1);
  });

  it.each(protocols)("keeps integer credentials for %s", (type, fields) => {
    for (const password of ["123456", "000123", "900719925474099312345"]) {
      const result = generated(`proxies: [{name: demo, type: ${type}, ${endpoint}, password: ${password}, ${fields}}]`);
      expect(result.proxies[0].password).toBe(password);
    }
  });

  it.each([
    ["# subscription\n", "type:"], ["---\n", "type:"],
    ["", "type :"], ["", '"type":'], ["# subscription\n---\n", "'type' :"],
  ])("detects flow mappings after %j with key %s", (prefix, typeKey) => {
    expect(generated(`${prefix}{name: flow, ${typeKey} anytls, ${endpoint}, password: 000123}`).proxies)
      .toEqual([{ name: "flow", type: "anytls", server: "local.subboost.test", port: 443, password: "000123", udp: true }]);
  });

  it.each(documentCases)("preserves $shape fields with prefix $prefixIndex and $typeKey", ({ shape, prefix, typeKey }) => {
    const content = prefix + nodeDocument(shape, typeKey);
    expect(parseClashYaml(content)).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    expect(generated(content).proxies).toEqual([{
      name: "document", type: "anytls", server: "local.subboost.test", port: 443,
      password: "000123", sni: "local.subboost.test", alpn: ["h2", "http/1.1"],
      "client-fingerprint": "chrome", udp: true,
    }]);
  });

  it("preserves JSON node arrays and mixed YAML sequence entries", () => {
    const proxy = { name: "json", type: "anytls", server: "local.subboost.test", port: "443", password: "000123", alpn: ["h2"] };
    expect(generated(JSON.stringify([proxy])).proxies).toEqual([{ ...proxy, port: 443, udp: true }]);
    expect(generated(`---\n- ignored\n- 123\n- ${JSON.stringify(proxy)}\n- {name: blocked, 'type' : reject}`).proxies)
      .toEqual([{ ...proxy, port: 443, udp: true }, { name: "blocked", type: "reject" }]);
  });

  it.each([
    `&node ${nodeDocument("flow mapping", "type:")}`,
    `!!map ${nodeDocument("flow mapping", "type:")}`,
    nodeDocument("block mapping", '"ty\\u0070e":'),
    nodeDocument("block mapping", "? type\n:"),
    `# subscription\r%YAML 1.2\r---\r${nodeDocument("flow sequence", '"type":')}`,
  ])("lets YAML resolve root properties, escaped keys and explicit keys: %s", (content) => {
    expect(parseClashYaml(content)).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    expect(generated(content).proxies).toMatchObject([{ type: "anytls", password: "000123", port: 443, alpn: ["h2", "http/1.1"] }]);
  });

  it.each(["Proxy", "Server_Local", "Server_Remote", " Proxy ", " Server_Local ", " Server_Remote "])("preserves platform sections after comments and general settings: %s", (section) => {
    const content = `# subscription\n; settings\n[General]\nloglevel = notify\n[${section}]\nNode = ss, local.subboost.test, 443, encrypt-method=aes-128-gcm, password=secret\n[Rule]\nMATCH,DIRECT`;
    expect(generated(content).proxies).toMatchObject([{ name: "Node", type: "ss", server: "local.subboost.test", port: 443, cipher: "aes-128-gcm", password: "secret" }]);
  });

  it.each(["; Profile: generated", "  ; Profile: generated", "# Profile: generated", "; Profile = generated"])("preserves platform comments containing punctuation: %s", (comment) => {
    const content = `${comment}\n[General]\nloglevel = notify\n[Proxy]\nDemo = ss, local.subboost.test, 443, encrypt-method=aes-128-gcm, password=demo`;
    expect(parsePlatformConfigContent(content)).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    expect(generated(content).proxies).toMatchObject([{ name: "Demo", type: "ss", server: "local.subboost.test", port: 443, cipher: "aes-128-gcm", password: "demo" }]);
  });

  it.each(["wg", "wg{hk}", "wg[hk]", "wg{hk}[edge]", "wg: hk", "wg;hk"])("preserves referenced WireGuard section names without restricting punctuation: %s", (section) => {
    const content = `[WireGuard ${section}]\nprivate-key = ${key}\nself-ip = 203.0.113.2\npeer = (public-key = ${key}, endpoint = "local.subboost.test:443")\n[Proxy]\nWG = wireguard, section-name=${section}`;
    expect(parsePlatformConfigContent(content)).toMatchObject({ totalParsed: 1, totalFailed: 0 });
    expect(generated(content).proxies).toMatchObject([{
      name: "WG", type: "wireguard", server: "local.subboost.test", port: 443,
      ip: "203.0.113.2", "private-key": key, "public-key": key,
      peers: [{ server: "local.subboost.test", port: 443, "public-key": key }],
    }]);
  });

  it("preserves peers-only WireGuard and Mieru ranges without inventing endpoints", () => {
    const result = generated(`proxies:
  - {name: wg, type: wireguard, ip: 203.0.113.2, private-key: ${key}, peers: [{server: local.subboost.test, port: '443', public-key: ${key}, allowed-ips: ['0.0.0.0/0']}]}
  - {name: mieru, type: mieru, server: local.subboost.test, port-range: 4000-4010, username: user, password: pass, transport: TCP}
  - {name: block, type: reject}
  - {name: tunnel, type: trusttunnel, server: local.subboost.test, port: 443, username: user, password: pass, quic: true, health-check: true, sni: local.subboost.test, alpn: [h2], max-connections: 8}`);
    expect(result.proxies).toHaveLength(4);
    expect(result.proxies[0]).not.toHaveProperty("server");
    expect(result.proxies[0]).not.toHaveProperty("port");
    expect(result.proxies[1]).not.toHaveProperty("port");
    expect(result.proxies[1]["port-range"]).toBe("4000-4010");
    expect(result.proxies[2]).toMatchObject({ type: "reject" });
    expect(result.proxies[3]).toMatchObject({ type: "trusttunnel", quic: true, "health-check": true, alpn: ["h2"], "max-connections": 8 });
  });

  it("detects top-level flow sequences containing only alternative endpoints", () => {
    expect(generated("- {name: blocked, type: reject}").proxies).toEqual([{ name: "blocked", type: "reject" }]);
    expect(generated(`- {name: wg, type: wireguard, ip: 203.0.113.2, private-key: ${key}, peers: [{server: local.subboost.test, port: 443, public-key: ${key}}]}`).proxies).toHaveLength(1);
  });

  it("keeps ordinary numeric mapping keys while preserving scalar credentials", () => {
    const result = generated("{name: header, type: http, server: local.subboost.test, port: 443, password: 123456, headers: {123: token}}");
    expect(result.proxies[0]).toMatchObject({ password: "123456", headers: { "123": "token" } });
  });

  it("normalizes safe integer credentials from saved JSON before generation", () => {
    const nodes = validateSubscriptionNodeList([{ name: "saved", type: "anytls", server: "local.subboost.test", port: 443, password: 123456 }]);
    const result = yaml.load(generateClashYaml({ nodes, userConfig: { dnsYaml: "" } })) as { proxies: Record<string, unknown>[] };
    expect(result.proxies).toHaveLength(1);
    expect(result.proxies[0].password).toBe("123456");
  });

  it.each([
    { type: "mieru", server: "local.subboost.test", port: 443, "port-range": "4000-4010" },
    { type: "mieru", server: "local.subboost.test", "port-range": "5000-4000" },
    { type: "wireguard", peers: [{ server: "local.subboost.test", port: 0, "public-key": key }] },
    { type: "anytls", server: "local.subboost.test", port: 443, password: {} },
    { type: "anytls", server: "local.subboost.test", port: 443, password: 9007199254740992 },
  ])("rejects invalid nodes with an index before any persistence", (bad) => {
    expect(() => validateSubscriptionNodeList([{ name: "good", type: "reject" }, { name: "bad", ...bad }])).toThrow(/#2/);
  });
});
