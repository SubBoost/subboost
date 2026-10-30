import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import { parseSubscription } from "@subboost/core/parser";
import { configToYaml } from "@subboost/core/generator/yaml";
import { generateClashYaml } from "@subboost/core/generator";
import type { ClashConfig } from "@subboost/core/types/config";
import { validateSubscriptionNodeList } from "./crud";

describe("subscription YAML security round trip", () => {
  it("keeps injected field names inside their original node after save and reload", () => {
    const attack = 'extra}\nexternal-controller: "127.0.0.1:9090"\n#';
    const nested = 'nested}, flag: true}\nsecret: stolen\n#';
    const input = yaml.dump({ proxies: [{
      name: "test", type: "trojan", server: "local.subboost.test", port: 443,
      password: "000123", [attack]: "value", options: { [nested]: "kept", "tab\tkey": "safe" },
    }] });
    const parsed = parseSubscription(input);
    expect(parsed.errors).toEqual([]);
    const saved = JSON.parse(JSON.stringify(validateSubscriptionNodeList(parsed.nodes)));
    const nodes = validateSubscriptionNodeList(saved);
    const output = yaml.load(generateClashYaml({ nodes, userConfig: { dnsYaml: "" } })) as Record<string, unknown>;
    expect(output).not.toHaveProperty("external-controller");
    expect(output).not.toHaveProperty("secret");
    const proxy = (output.proxies as Record<string, unknown>[])[0];
    expect(proxy[attack]).toBe("value");
    expect(proxy.options).toEqual({ [nested]: "kept", "tab\tkey": "safe" });
    expect(proxy.password).toBe("000123");
  });

  it("quotes keys at every mapping emitter, including provider names and nested flow mappings", () => {
    const names = ["a: b", "first\nexternal-controller: bad", "a\tkey", "true", "123", "control\u0001key", "c1\u0085key", ""];
    for (const name of names) {
      const output = configToYaml({
        [name]: { [name]: "base" }, listeners: [{ [name]: { [name]: "listener" } }],
        proxies: [{ name: "safe", type: "reject", [name]: { [name]: "proxy" } }],
        "proxy-groups": [{ name: "select", type: "select", [name]: { [name]: "group" } }],
        "rule-providers": { [name]: { [name]: "provider" } }, rules: [],
      } as unknown as ClashConfig);
      const loaded = yaml.load(output) as Record<string, any>;
      expect(loaded[name][name]).toBe("base");
      expect(loaded.listeners[0][name][name]).toBe("listener");
      expect(loaded.proxies[0][name][name]).toBe("proxy");
      expect(loaded["proxy-groups"][0][name][name]).toBe("group");
      expect(loaded["rule-providers"][name][name]).toBe("provider");
      expect(loaded).not.toHaveProperty("external-controller");
    }
  });

  it("preserves safe aliases, numeric credentials, metadata and unknown fields through persistence", () => {
    const content = `defaults: &extra {headers: {Host: local.subboost.test}, mode: safe}
proxies:
  - {name: ordinary, type: trojan, server: local.subboost.test, port: 443, password: 000123, custom: *extra}
  - {name: '余额 | 10 GB', type: ss, server: local.subboost.test, port: 8388, cipher: aes-128-gcm, password: demo, custom: *extra}`;
    const parsed = parseSubscription(content);
    expect(parsed.errors).toEqual([]);
    const persisted = JSON.parse(JSON.stringify(validateSubscriptionNodeList(parsed.nodes)));
    const reloaded = validateSubscriptionNodeList(persisted);
    const output = yaml.load(generateClashYaml({ nodes: reloaded, userConfig: { dnsYaml: "" } })) as { proxies: Record<string, unknown>[] };
    expect(output.proxies).toHaveLength(2);
    expect(output.proxies[0]).toMatchObject({ password: "000123", custom: { headers: { Host: "local.subboost.test" }, mode: "safe" } });
    expect(output.proxies[1]).toMatchObject({ name: "余额 | 10 GB", custom: { headers: { Host: "local.subboost.test" }, mode: "safe" } });
  });
});
