import { describe, expect, it } from "vitest";
import { BaseConfigYamlError, generateClashConfig, generateClashYaml } from "./index";
import type { ParsedNode } from "@subboost/core/types/node";

function ssNode(patch: Partial<ParsedNode> = {}): ParsedNode {
  return {
    name: "Node",
    type: "ss",
    server: "ss.example.com",
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
    ...patch,
  } as ParsedNode;
}

const REALITY_PUBLIC_KEY = "A".repeat(43);

describe("generateClashConfig", () => {
  it("treats explicit empty base YAML as a strict patch instead of re-adding defaults", () => {
    const config = generateClashConfig({
      nodes: [ssNode()],
      userConfig: {
        dnsYaml: "",
      },
    });

    expect(config).not.toHaveProperty("mixed-port");
    expect(config).not.toHaveProperty("allow-lan");
    expect(config).not.toHaveProperty("dns");
    const proxies = config.proxies ?? [];
    expect(proxies).toHaveLength(1);
    expect(proxies[0]).toMatchObject({ name: "Node", type: "ss" });
    expect(config["proxy-groups"] ?? []).not.toHaveLength(0);
  });

  it("deduplicates proxy names and filters nodes unsupported by Mihomo", () => {
    const config = generateClashConfig({
      nodes: [
        ssNode(),
        ssNode({ server: "second.example.com" }),
        { name: "Old Socks", type: "socks4", server: "old.example.com", port: 1080 } as ParsedNode,
      ],
      userConfig: {
        dnsYaml: "",
      },
    });

    const proxies = config.proxies ?? [];
    expect(proxies.map((node) => node.name)).toEqual(["Node", "Node (2)"]);
    expect(proxies.map((node) => node.type)).toEqual(["ss", "ss"]);
  });

  it("normalizes duplicate and blank proxy names before generating dependent sections", () => {
    const config = generateClashConfig({
      nodes: [
        ssNode({ name: "   " }),
        ssNode({ name: "Dup", server: "dup-1.example.com" }),
        ssNode({ name: "Dup (2)", server: "dup-2.example.com" }),
        ssNode({ name: "Dup", server: "dup-3.example.com" }),
      ],
      userConfig: {
        dnsYaml: "",
        listenerPorts: {
          "未命名节点": 12000,
          Dup: 12001,
          "Dup (2)": 12001,
          "Dup (3)": 70000,
        },
      },
    });

    expect(config.proxies?.map((node) => node.name)).toEqual(["未命名节点", "Dup", "Dup (2)", "Dup (3)"]);
    expect(config.listeners).toEqual([
      { name: "mixed0", type: "mixed", port: 12000, proxy: "未命名节点" },
      { name: "mixed1", type: "mixed", port: 12001, proxy: "Dup" },
    ]);
  });

  it("moves root nameserver-policy under dns and merges proxy providers", () => {
    const config = generateClashConfig({
      nodes: [ssNode()],
      proxyProviders: {
        remote: {
          type: "http",
          url: "https://example.com/provider.yaml",
          path: "./remote.yaml",
        },
      },
      userConfig: {
        dnsYaml: [
          "mixed-port: 7898",
          "nameserver-policy:",
          "  '+.example.com': 1.1.1.1",
          "proxy-providers:",
          "  local:",
          "    type: file",
          "    path: ./local.yaml",
        ].join("\n"),
      },
    });

    expect(config["mixed-port"]).toBe(7898);
    expect(config).not.toHaveProperty("nameserver-policy");
    expect(config.dns).toMatchObject({
      "nameserver-policy": {
        "+.example.com": "1.1.1.1",
      },
    });
    expect(config["proxy-providers"]).toMatchObject({
      local: {
        type: "file",
        path: "./local.yaml",
      },
      remote: {
        type: "http",
        url: "https://example.com/provider.yaml",
        path: "./remote.yaml",
      },
    });
  });

  it("keeps existing dns nameserver-policy ahead of top-level policy patches", () => {
    const config = generateClashConfig({
      nodes: [ssNode()],
      userConfig: {
        dnsYaml: [
          "nameserver-policy:",
          "  '+.top.example.com': 1.1.1.1",
          "dns:",
          "  nameserver-policy:",
          "    '+.dns.example.com': 8.8.8.8",
        ].join("\n"),
      },
    });

    expect(config).not.toHaveProperty("nameserver-policy");
    expect(config.dns).toEqual({
      "nameserver-policy": {
        "+.dns.example.com": "8.8.8.8",
      },
    });
  });

  it("rejects base YAML that is not an object or tries to own generated sections", () => {
    expect(() =>
      generateClashConfig({
        nodes: [ssNode()],
        userConfig: { dnsYaml: "just-a-string" },
      })
    ).toThrow(BaseConfigYamlError);

    expect(() =>
      generateClashConfig({
        nodes: [ssNode()],
        userConfig: { dnsYaml: "proxies: []" },
      })
    ).toThrow("这些段由 SubBoost 根据节点、代理组和规则生成");

    expect(() =>
      generateClashConfig({
        nodes: [ssNode()],
        userConfig: { dnsYaml: "dns:\n  nameserver: [" },
      })
    ).toThrow("基础和 DNS 配置 YAML 解析失败");
  });

  it("applies generation-time safeguards for listeners and dialer groups", () => {
    const config = generateClashConfig({
      nodes: [
        ssNode({ name: "Relay", server: "relay.example.com" }),
        {
          name: "Target",
          type: "vless",
          server: "target.example.com",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          tls: true,
          "reality-opts": {
            "public-key": REALITY_PUBLIC_KEY,
            "short-id": "0x7250",
          },
        } as ParsedNode,
        {
          name: "Unsupported",
          type: "socks4",
          server: "old.example.com",
          port: 1080,
        } as ParsedNode,
      ],
      dialerProxyGroups: [
        {
          id: "chain",
          name: "Chain",
          type: "select",
          enabled: true,
          relayNodes: ["Relay", "Missing Relay", "Relay"],
          targetNodes: ["Target", "Missing Target"],
        },
        {
          id: "broken",
          name: "Broken Chain",
          type: "select",
          enabled: true,
          relayNodes: ["Missing Relay"],
          targetNodes: ["Target"],
        },
      ],
      userConfig: {
        dnsYaml: [
          "listeners:",
          "  - name: base",
          "    type: mixed",
          "    port: 7890",
        ].join("\n"),
        listenerPorts: {
          Target: 12000,
          Relay: 12001,
          Missing: 12002,
        },
      },
    });

    expect(config.proxies?.map((proxy) => proxy.name)).toEqual(["Relay", "Target"]);
    expect(config.proxies?.find((proxy) => proxy.name === "Target")).toMatchObject({
      "reality-opts": {
        "short-id": "7250",
      },
      "dialer-proxy": "Chain",
    });
    expect(config.listeners).toEqual([
      { name: "base", type: "mixed", port: 7890 },
      { name: "mixed0", type: "mixed", port: 12001, proxy: "Relay" },
      { name: "mixed1", type: "mixed", port: 12000, proxy: "Target" },
    ]);
    expect(config["proxy-groups"]?.find((group) => group.name === "Chain")).toMatchObject({
      proxies: ["Relay"],
    });
    expect(config["proxy-groups"]?.find((group) => group.name === "Broken Chain")).toBeUndefined();
  });

  it("normalizes base YAML client fingerprints and removes invalid dialer-proxy references", () => {
    const config = generateClashConfig({
      nodes: [
        {
          name: "Plain VMess",
          type: "vmess",
          server: "vmess.example.com",
          port: 80,
          uuid: "11111111-1111-4111-8111-111111111111",
          alterId: 0,
          cipher: "auto",
          tls: false,
          "dialer-proxy": "Ghost",
        } as ParsedNode,
        {
          name: "Trojan",
          type: "trojan",
          server: "trojan.example.com",
          port: 443,
          password: "secret",
        } as ParsedNode,
        {
          name: "AnyTLS",
          type: "anytls",
          server: "anytls.example.com",
          port: 443,
          password: "secret",
        } as ParsedNode,
        {
          name: "Preset VLESS",
          type: "vless",
          server: "vless.example.com",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          "client-fingerprint": "safari",
          "reality-opts": {
            "public-key": REALITY_PUBLIC_KEY,
          },
        } as ParsedNode,
      ],
      dialerProxyGroups: [
        {
          id: "disabled",
          name: "Disabled",
          type: "select",
          enabled: false,
          relayNodes: ["Trojan"],
          targetNodes: ["Plain VMess"],
        },
      ],
      userConfig: {
        dnsYaml: "global-client-fingerprint: chrome",
      },
    });

    const plain = config.proxies?.find((proxy) => proxy.name === "Plain VMess");
    const trojan = config.proxies?.find((proxy) => proxy.name === "Trojan");
    const anytls = config.proxies?.find((proxy) => proxy.name === "AnyTLS");
    const preset = config.proxies?.find((proxy) => proxy.name === "Preset VLESS");

    expect(plain).not.toHaveProperty("client-fingerprint");
    expect(plain).not.toHaveProperty("dialer-proxy");
    expect(trojan).toMatchObject({ "client-fingerprint": "chrome" });
    expect(anytls).toMatchObject({ "client-fingerprint": "chrome" });
    expect(preset).toMatchObject({ "client-fingerprint": "safari" });
    expect(config["proxy-groups"]?.find((group) => group.name === "Disabled")).toBeUndefined();
  });

  it("rejects base YAML sections that cannot be merged safely", () => {
    expect(() =>
      generateClashConfig({
        nodes: [ssNode()],
        userConfig: {
          dnsYaml: ["dns: []", "nameserver-policy:", "  '+.example.com': 1.1.1.1"].join("\n"),
        },
      })
    ).toThrow("dns 必须是对象");

    expect(() =>
      generateClashConfig({
        nodes: [ssNode()],
        userConfig: {
          dnsYaml: "listeners: bad",
          listenerPorts: { Node: 12000 },
        },
      })
    ).toThrow("listeners 必须是数组");

    expect(() =>
      generateClashConfig({
        nodes: [ssNode()],
        proxyProviders: { remote: { type: "http" } },
        userConfig: {
          dnsYaml: "proxy-providers: []",
        },
      })
    ).toThrow("proxy-providers 必须是对象");
  });

  it("keeps explicit empty listener arrays and ignores blank provider names", () => {
    const config = generateClashConfig({
      nodes: [
        ssNode({ name: 1 as never }),
        ssNode({ name: "未命名节点", server: "second.example.com" }),
      ],
      proxyProviders: {
        " ": { type: "http", url: "https://blank.example.com" },
        beta: { type: "http", url: "https://beta.example.com" },
        alpha: { type: "http", url: "https://alpha.example.com" },
      },
      userConfig: {
        dnsYaml: "listeners: []",
        listenerPorts: {
          "未命名节点": "bad" as never,
        },
      },
    });

    expect(config.listeners).toEqual([]);
    expect(config.proxies?.map((proxy) => proxy.name)).toEqual(["1", "未命名节点"]);
    expect(config["proxy-providers"]).toEqual({
      " ": { type: "http", url: "https://blank.example.com" },
      beta: { type: "http", url: "https://beta.example.com" },
      alpha: { type: "http", url: "https://alpha.example.com" },
    });
  });

  it("applies persisted proxy group order across dialer, custom, and module groups", () => {
    const config = generateClashConfig({
      nodes: [ssNode({ name: "Relay" }), ssNode({ name: "Target", server: "target.example.com" })],
      dialerProxyGroups: [
        {
          id: "chain",
          name: "Chain",
          type: "select",
          relayNodes: ["Relay"],
          targetNodes: ["Target"],
        },
      ],
      customProxyGroups: [
        {
          id: "custom",
          name: "Custom",
          emoji: "C",
          groupType: "select",
        },
      ],
      proxyGroupOrder: ["custom:custom", "dialer:chain", "module:auto", "missing", "module:auto"],
      userConfig: {
        dnsYaml: "",
        enabledGroups: ["select", "auto", "global", "final"],
      },
    });

    expect(config["proxy-groups"]?.slice(0, 4).map((group) => group.name)).toEqual([
      "Custom",
      "Chain",
      "⚡ 自动选择",
      "🚀 节点选择",
    ]);
  });

  it("puts dialer groups first when select and auto groups are disabled", () => {
    const config = generateClashConfig({
      nodes: [ssNode({ name: "Relay" }), ssNode({ name: "Target", server: "target.example.com" })],
      proxyProviders: {
        remote: {
          type: "http",
          url: "https://provider.example.com/sub.yaml",
        },
      },
      dialerProxyGroups: [
        {
          id: "chain",
          name: "Chain",
          type: "select",
          enabled: true,
          relayNodes: ["remote", "DIRECT", "Relay", "Relay", " "],
          targetNodes: ["Target", "Missing"],
        },
      ],
      userConfig: {
        dnsYaml: "",
        enabledGroups: ["global", "final"],
      },
    });

    expect(config["proxy-groups"]?.[0]).toMatchObject({
      name: "Chain",
      proxies: ["DIRECT", "Relay"],
    });
    expect(config.proxies?.find((proxy) => proxy.name === "Target")).toMatchObject({
      "dialer-proxy": "Chain",
    });
  });

  it("uses default base config when base YAML is omitted and skips malformed ordered group names", () => {
    const config = generateClashConfig({
      nodes: [ssNode()],
      customProxyGroups: [
        {
          id: "bad-custom",
          name: "" as never,
          emoji: "",
          groupType: "select",
        },
      ],
      proxyGroupOrder: ["custom:bad-custom", "module:auto"],
      userConfig: {
        enabledGroups: ["select", "auto", "global", "final"],
      },
    });

    expect(config).toHaveProperty("mixed-port");
    expect(config["proxy-groups"]?.[0]).toMatchObject({ name: "⚡ 自动选择" });
    expect(config["proxy-groups"]?.some((group) => Object.is((group as { name: unknown }).name, 123))).toBe(false);
  });

  it("generates YAML through the public helper", () => {
    const yaml = generateClashYaml({
      nodes: [ssNode()],
      userConfig: { dnsYaml: "" },
    });

    expect(yaml).toContain("proxies:");
    expect(yaml).toContain("proxy-groups:");
    expect(yaml).toContain("rules:");
  });
});
