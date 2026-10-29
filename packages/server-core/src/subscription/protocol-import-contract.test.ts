import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import { parseClashYaml, parseSubscription } from "@subboost/core/parser";
import { generateClashYaml } from "@subboost/core/generator";
import { validateSubscriptionNodeList } from "./crud";
import { parsePlatformConfigContent } from "@subboost/core/parser/platform/parse-platform-config";
import { generateKeyPairSync } from "node:crypto";

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

  it.each(["+.5", "-.5", "+.0", "-.0", "+.5e+2", "-.5E-1"])(
    "preserves leading-dot string credentials through import, save and generation: %s", (password) => {
      const result = generated(`proxies: [{name: demo, type: trojan, ${endpoint}, password: ${password}}]`);
      expect(result.proxies).toHaveLength(1);
      expect(result.proxies[0].password).toBe(password);
    },
  );

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

  it("preserves Reality flags and independent XHTTP settings through save/load", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const extra = { noGRPCHeader: false, scMaxEachPostBytes: "100000-200000", xmux: { maxConnections: "2-4" } };
    const link = `vless://${uuid}@local.subboost.test:443?security=reality&pbk=${"A".repeat(43)}&support-x25519mlkem768=false&type=xhttp&extra=${encodeURIComponent(JSON.stringify(extra))}`;
    expect(generated(link).proxies[0]).toMatchObject({
      "reality-opts": { "support-x25519mlkem768": false },
      "xhttp-opts": { "no-grpc-header": false, "sc-max-each-post-bytes": "100000-200000", "reuse-settings": { "max-connections": "2-4" } },
    });
    const parsed = parseSubscription(link);
    const persisted = JSON.parse(JSON.stringify(validateSubscriptionNodeList(parsed.nodes)));
    const reloaded = validateSubscriptionNodeList(persisted);
    expect(yaml.load(generateClashYaml({ nodes: reloaded, userConfig: { dnsYaml: "" } }))).toEqual(
      yaml.load(generateClashYaml({ nodes: parsed.nodes, userConfig: { dnsYaml: "" } })));
  });

  it.each(["plain", "base64", "base64url"] as const)("retains automatic Reality compatibility through %s import and persistence", (format) => {
    const encryption = "mlkem768x25519plus.native.0rtt.valid_token";
    const link = `vless://11111111-1111-4111-8111-111111111111@local.subboost.test:443?security=reality&pbk=${"A".repeat(43)}&encryption=${encryption}&fp=firefox`;
    const content = format === "plain" ? link : Buffer.from(link).toString(format);
    const parsed = parseSubscription(content);
    expect(parsed.errors).toEqual([]);
    const saved = JSON.parse(JSON.stringify(validateSubscriptionNodeList(parsed.nodes)));
    const output = yaml.load(generateClashYaml({ nodes: validateSubscriptionNodeList(saved) })) as { proxies: Record<string, unknown>[] };
    expect(output.proxies).toHaveLength(1);
    expect(output.proxies[0]).toMatchObject({
      encryption,
      "client-fingerprint": "firefox",
      "reality-opts": { "support-x25519mlkem768": true },
    });
  });

  it("retains Gecko, ECH and packet sizes for Hysteria2", () => {
    expect(generated("hy2://demo@local.subboost.test:443?obfs=gecko&obfs-password=padding&obfs-min-packet-size=100&obfs-max-packet-size=200&ech=QUJDRA%3D%3D").proxies[0])
      .toMatchObject({ obfs: "gecko", "obfs-password": "padding", "obfs-min-packet-size": 100,
        "obfs-max-packet-size": 200, "ech-opts": { enable: true, config: "QUJDRA==" } });
    for (const query of ["obfs=gecko", "obfs=unknown&obfs-password=demo", "obfs=gecko&obfs-password=demo&obfs-min-packet-size=12bad"]) {
      expect(parseSubscription(`hy2://demo@local.subboost.test?${query}`).totalFailed).toBe(1);
    }
  });

  it.each(["tuic://token", "hysteria://"])("separates protocol fast-open from TCP tfo: %s", prefix => {
    const authority = prefix.endsWith("//") ? "local.subboost.test" : `${prefix.split("://")[1]}@local.subboost.test`;
    const scheme = prefix.split("://")[0];
    for (const flag of [true, false]) {
      const node = generated(`${scheme}://${authority}:443?auth=demo&fast-open=${flag}&tfo=${!flag}`).proxies[0];
      expect(node["fast-open"]).toBe(flag);
      expect(node.tfo).toBe(!flag);
    }
  });

  it("normalizes WireGuard URI, platform and saved aliases without replacing canonical zero", () => {
    const uri = `wg://${encodeURIComponent(key)}@local.subboost.test:51820?publickey=${encodeURIComponent(key)}&reserved=U4An&keepalive=25`;
    expect(generated(uri).proxies[0]).toMatchObject({ reserved: [83, 128, 39], "persistent-keepalive": 25 });
    const platform = `[WireGuard test]\nprivate-key = ${key}\nself-ip = 203.0.113.2\nkeepalive = 25\npeer = (public-key = ${key}, endpoint = "local.subboost.test:443")\n[Proxy]\nWG = wireguard, section-name=test`;
    expect(generated(platform).proxies[0]).toMatchObject({ "persistent-keepalive": 25 });
    const saved = [{ name: "wg", type: "wireguard", "private-key": key, ip: "203.0.113.2", keepalive: 25,
      "persistent-keepalive": 0, peers: [{ server: "local.subboost.test", port: 443, "public-key": key, reserved: "U4An" }] }];
    const nodes = validateSubscriptionNodeList(saved);
    const result = yaml.load(generateClashYaml({ nodes, userConfig: { dnsYaml: "" } })) as { proxies: Record<string, unknown>[] };
    expect(result.proxies[0]).toMatchObject({ "persistent-keepalive": 0, peers: [{ reserved: [83, 128, 39] }] });
    expect(result.proxies[0]).not.toHaveProperty("keepalive");
  });

  it("maps Snell ShadowTLS aliases and preserves an explicit standard structure", () => {
    expect(generated("snell://demo@local.subboost.test:443?version=3&shadow-tls-version=3&shadow-tls-sni=local.subboost.test&shadow-tls-password=padding").proxies[0])
      .toMatchObject({ "obfs-opts": { mode: "shadow-tls", version: 3, host: "local.subboost.test", password: "padding" } });
    const source = { name: "snell", type: "snell", server: "local.subboost.test", port: 443, psk: "demo",
      "shadow-tls-password": "legacy", "obfs-opts": { mode: "shadow-tls", version: 3, password: "canonical" } };
    const final = generated(yaml.dump({ proxies: [source] })).proxies[0];
    expect(final["obfs-opts"]).toEqual(source["obfs-opts"]);
    expect(final).not.toHaveProperty("shadow-tls-password");
  });

  it.each(["nistp256", "nistp384", "nistp521"])("preserves valid synthetic SSH ECDSA %s host keys", curve => {
    const namedCurve = { nistp256: "prime256v1", nistp384: "secp384r1", nistp521: "secp521r1" }[curve]!;
    const jwk = generateKeyPairSync("ec", { namedCurve }).publicKey.export({ format: "jwk" });
    const sshString = (value: Buffer | string) => {
      const data = typeof value === "string" ? Buffer.from(value) : value;
      const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
      return Buffer.concat([length, data]);
    };
    const kind = `ecdsa-sha2-${curve}`;
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
    const hostKey = `${kind} ${Buffer.concat([sshString(kind), sshString(curve), sshString(point)]).toString("base64")}`;
    const source = { name: "ssh", type: "ssh", server: "local.subboost.test", port: 22, username: "demo", password: "demo", "host-key": [hostKey] };
    expect(generated(yaml.dump({ proxies: [source] })).proxies[0]["host-key"]).toEqual([hostKey]);
  });

  it("does not downgrade malformed explicit SSH host-key input to unchecked SSH", () => {
    const source = { name: "ssh", type: "ssh", server: "local.subboost.test", port: 22, password: "demo", "host-key": ["invalid"] };
    expect(generated(yaml.dump({ proxies: [source] })).proxies ?? []).toEqual([]);
  });
});
