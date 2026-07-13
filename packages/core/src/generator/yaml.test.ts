import { describe, expect, it } from "vitest";
import yamlParser from "js-yaml";
import { collectDnsPolicyEntries, configToYaml } from "./yaml";
import type { ClashConfig } from "@subboost/core/types/config";

const REALITY_PUBLIC_KEY = "A".repeat(43);

describe("configToYaml", () => {
  it("serializes generated sections with canonical proxy field cleanup", () => {
    const yaml = configToYaml({
      dns: {
        "nameserver-policy": {
          "+.example.com": ["1.1.1.1", "8.8.8.8"],
        },
      },
      listeners: [
        {
          name: "mixed0",
          type: "mixed",
          port: 7899,
          proxy: "VLESS",
        },
      ],
      proxies: [
        {
          name: "DIRECT-ONLY",
          type: "direct",
          _internal: "drop me",
        },
        {
          name: "VLESS",
          type: "vless",
          server: "vless.example.com",
          port: 443,
          uuid: "11111111-1111-1111-1111-111111111111",
          udp: "yes",
          fingerprint: "chrome",
          "reality-opts": {
            "public-key": REALITY_PUBLIC_KEY,
            "short-id": 7250,
          },
        },
      ],
      "proxy-groups": [
        {
          name: "Select",
          type: "select",
          proxies: ["DIRECT-ONLY", "VLESS"],
          hidden: false,
        },
      ],
      "rule-providers": {},
      rules: ["MATCH,Select"],
    } as unknown as ClashConfig);

    expect(yaml).toContain("listeners:\n  - {name: \"mixed0\", type: mixed, port: 7899, proxy: VLESS}");
    expect(yaml).toContain('  - {name: "DIRECT-ONLY", type: direct}');
    expect(yaml).not.toContain("_internal");
    expect(yaml).toContain("tls: true");
    expect(yaml).toContain("udp: true");
    expect(yaml).toContain("client-fingerprint: chrome");
    expect(yaml).toContain(`reality-opts: {public-key: ${REALITY_PUBLIC_KEY}, short-id: "7250"}`);
    expect(yaml).toContain("rules:\n  - MATCH,Select");
  });

  it("keeps empty generated sections explicit", () => {
    const yaml = configToYaml({
      proxies: [],
      "proxy-groups": [],
      "rule-providers": {},
      rules: [],
    } as unknown as ClashConfig);

    expect(yaml).toBe(["proxies:", "", "proxy-groups:", "", "rule-providers:", "", "rules:"].join("\n"));
  });

  it("quotes rule scalars that YAML would otherwise truncate or reinterpret", () => {
    const rules = [
      "DOMAIN-SUFFIX,example.com,Netflix #1",
      "DOMAIN,example.net,Group: Primary",
      "MATCH,Select",
    ];
    const output = configToYaml({
      proxies: [],
      "proxy-groups": [],
      "rule-providers": {},
      rules,
    } as unknown as ClashConfig);

    expect((yamlParser.load(output) as ClashConfig).rules).toEqual(rules);
    expect(output).toContain('  - "DOMAIN-SUFFIX,example.com,Netflix #1"');
    expect(output).toContain('  - "DOMAIN,example.net,Group: Primary"');
    expect(output).toContain("  - MATCH,Select");
  });

  it("collects DNS policy entries from clean string and array values only", () => {
    expect(collectDnsPolicyEntries(null)).toEqual([]);
    expect(collectDnsPolicyEntries([])).toEqual([]);
    expect(
      collectDnsPolicyEntries({
        "  +.b.example.com ": [" 8.8.8.8 ", "", 1, "1.1.1.1"],
        "+.a.example.com": " 9.9.9.9 ",
        " ": "1.1.1.1",
        "+.empty.example.com": " ",
        "+.bad.example.com": 1,
        "+.empty-list.example.com": [" ", 1],
      })
    ).toEqual([
      ["+.a.example.com", "9.9.9.9"],
      ["+.b.example.com", ["8.8.8.8", "1.1.1.1"]],
    ]);
  });

  it("serializes base fields, listener variants, and YAML-sensitive scalar values", () => {
    const yaml = configToYaml({
      "external-controller": "127.0.0.1:9090",
      secret: "",
      "mode-text": "off",
      "number-text": "1e5",
      note: "line1\nline2\tquoted\"value",
      profile: {
        "store-selected": true,
        empty: {},
        skip: undefined,
      },
      listeners: [],
      proxies: [
        {
          name: "SS Node",
          type: "ss",
          server: "ss.example.com",
          port: 8388,
          cipher: "aes-128-gcm",
          password: "secret",
          "dialer-proxy": "Relay",
          zzz: "last",
          aaa: "first",
          _internal: "drop",
        },
      ],
      "proxy-groups": [
        { _internal: "skip" },
        {
          name: "Select",
          type: "select",
          proxies: ["SS Node"],
          includeAll: undefined,
          "expected-status": "204/200",
        },
      ],
      "rule-providers": {
        remote: {
          type: "http",
          url: "https://rules.example.com/geosite/test.mrs",
          path: undefined,
        },
      },
      rules: ["DOMAIN-SUFFIX,example.com,Select"],
    } as unknown as ClashConfig);

    expect(yaml).toContain('external-controller: "127.0.0.1:9090"');
    expect(yaml).toContain('secret: ""');
    expect(yaml).toContain('mode-text: "off"');
    expect(yaml).toContain('number-text: "1e5"');
    expect(yaml).toContain('note: "line1\\nline2\\tquoted\\"value"');
    expect(yaml).toContain("profile:\n  store-selected: true\n  empty: {}");
    expect(yaml).toContain("listeners: []");
    expect(yaml).toContain(
      '  - {name: "SS Node", type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret, udp: true, aaa: first, zzz: last, dialer-proxy: Relay}'
    );
    expect(yaml).not.toContain("_internal");
    expect(yaml).toContain("    expected-status: 204/200");
    expect(yaml).toContain("  remote: {type: http, url: \"https://rules.example.com/geosite/test.mrs\"}");
  });

  it("serializes non-array listener patches as ordinary YAML fields", () => {
    const yaml = configToYaml({
      listeners: {
        name: "single",
        type: "mixed",
        port: 7890,
      },
      proxies: [],
      "proxy-groups": [],
      "rule-providers": {},
      rules: [],
    } as unknown as ClashConfig);

    expect(yaml).toContain("listeners:\n  name: single\n  type: mixed\n  port: 7890");
  });

  it("serializes unusual scalar values and protocol-specific proxy fields", () => {
    const yaml = configToYaml({
      nullable: null,
      disabled: false,
      "float-text": "1.5",
      fallback: Symbol("fallback"),
      values: ["yes", "plain", null, 1.5, -2, "+3", "a?b"],
      object: {
        name: "Named Child",
        skip: undefined,
      },
      proxies: [
        {
          name: "MIERU",
          type: "mieru",
          server: "mieru.example.com",
          port: 2999,
          username: "user",
          password: "pass",
          transport: "tcp",
          "port-range": "2999-3001",
          multiplexing: "MULTIPLEXING_LOW",
          "handshake-mode": "HANDSHAKE_STANDARD",
        },
        {
          name: "Relay",
          type: "relay",
          proxies: ["MIERU", "DIRECT"],
        },
      ],
      "proxy-groups": [],
      "rule-providers": {},
      rules: [],
    } as unknown as ClashConfig);

    expect(yaml).toContain("nullable: null");
    expect(yaml).toContain("disabled: false");
    expect(yaml).toContain('float-text: "1.5"');
    expect(yaml).toContain("fallback: Symbol(fallback)");
    expect(yaml).toContain('values: ["yes", plain, null, 1.5, -2, "+3", "a?b"]');
    expect(yaml).toContain('object:\n  name: "Named Child"');
    expect(yaml).toContain(
      '  - {name: "MIERU", type: mieru, server: mieru.example.com, port: 2999, username: user, password: pass, transport: tcp, port-range: 2999-3001, multiplexing: MULTIPLEXING_LOW, handshake-mode: HANDSHAKE_STANDARD}'
    );
    expect(yaml).toContain('  - {name: "Relay", type: relay, proxies: [MIERU, DIRECT]}');
  });

  it("keeps generated section headings for partial configs", () => {
    const yaml = configToYaml({
      dns: {
        "nameserver-policy": {
          "+.empty.example.com": [" ", 1],
        },
      },
      proxies: [
        {
          name: 1,
          server: "unknown.example.com",
          port: 443,
          extra: undefined,
        },
      ],
    } as unknown as ClashConfig);

    expect(yaml).toContain("proxies:\n  - {name: 1, server: unknown.example.com, port: 443}");
    expect(yaml).toContain("proxy-groups:");
    expect(yaml).toContain("rule-providers:");
    expect(yaml).toContain("rules:");
  });

  it("keeps unordered proxy, group, and DNS policy fields deterministic", () => {
    const yaml = configToYaml({
      proxies: [
        {
          name: "Sorted Extra",
          type: "http",
          server: "sorted.example.com",
          port: 8080,
          zeta: "z",
          alpha: "a",
          middle: "m",
        },
      ],
      "proxy-groups": [
        {
          name: "Sorted Group",
          type: "select",
          proxies: ["Sorted Extra"],
          zeta: "z",
          alpha: "a",
          middle: "m",
        },
      ],
      "rule-providers": {},
      rules: [],
    } as unknown as ClashConfig);

    expect(yaml.indexOf("alpha: a")).toBeLessThan(yaml.indexOf("middle: m"));
    expect(yaml.indexOf("middle: m")).toBeLessThan(yaml.indexOf("zeta: z"));
    expect(yaml.indexOf("    alpha: a")).toBeLessThan(yaml.indexOf("    middle: m"));
    expect(yaml.indexOf("    middle: m")).toBeLessThan(yaml.indexOf("    zeta: z"));
    expect(
      collectDnsPolicyEntries({
        "+.z.example.com": "9.9.9.9",
        "+.a.example.com": "1.1.1.1",
        "+.m.example.com": "8.8.8.8",
      })
    ).toEqual([
      ["+.a.example.com", "1.1.1.1"],
      ["+.m.example.com", "8.8.8.8"],
      ["+.z.example.com", "9.9.9.9"],
    ]);
  });
});
