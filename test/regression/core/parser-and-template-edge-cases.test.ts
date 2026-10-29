import { describe, expect, it } from "vitest";
import {
  parseHttp,
  parseSimpleProxy,
  parseSocks,
  parseTelegramProxyLink,
} from "@subboost/core/parser/protocols/simple-proxy";
import { parsePlatformProxyLine } from "@subboost/core/parser/platform/parse-platform-proxy-line";
import {
  SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
  validateSubBoostTemplateConfig,
} from "@subboost/core/templates/config-template";

function b64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function validTemplateConfig(): Record<string, unknown> {
  return {
    schema: SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
    template: "standard",
    enabledProxyGroups: ["select"],
    hiddenProxyGroups: [],
    customProxyGroups: [],
    proxyGroupAdvanced: {},
    customRuleSets: [],
    builtinRuleEdits: {},
    customRules: [],
    dialerProxyGroups: [],
    proxyGroupNameOverrides: {},
    ruleOrder: [],
    dnsYaml: "",
    mixedPort: 7890,
    allowLan: true,
    testUrl: "https://example.com/generate_204",
    testInterval: 300,
    ruleProviderBaseUrl: "https://rules.example.com",
  };
}

describe("public core extra branch coverage", () => {
  it("parses additional simple proxy naked, Telegram, and auth branches", () => {
    expect(parseSimpleProxy("naked.example.com:8080:user:p:a:ss", "http")).toMatchObject({
      name: "HTTP-naked.example.com:8080",
      type: "http",
      username: "user",
      password: "p:a:ss",
    });

    expect(parseSimpleProxy("u:p@naked.example.com", "https")).toMatchObject({
      name: "HTTPS-naked.example.com:443",
      type: "https",
      server: "naked.example.com",
      port: 443,
      username: "u",
      password: "p",
    });

    const socksWithRawBase64Username = parseSocks(`socks5://${b64url("user@example.com")}@host.example.com:1080`);
    expect(socksWithRawBase64Username).toMatchObject({
      name: "SOCKS-host.example.com:1080",
      username: b64url("user@example.com"),
    });
    expect(socksWithRawBase64Username).not.toHaveProperty("password");

    expect(parseHttp("http://h.example.com?headers=%7B%22Bad%22%3A1%7D")).toMatchObject({
      name: "HTTP-h.example.com:80",
      headers: { Bad: "1" },
    });

    expect(parseTelegramProxyLink("tg://https?server=tg.example.com&port=443&remark=Secure")).toMatchObject({
      name: "Secure",
      type: "https",
      tls: true,
    });

    expect(parseTelegramProxyLink("https://t.me/socks?server=tg.example.com&port=1080")).toMatchObject({
      name: "SOCKS-tg.example.com:1080",
      type: "socks5",
    });

    expect(() => parseSimpleProxy("host-only", "http")).toThrow("无效的代理格式");
    expect(() => parseSimpleProxy("u@[2001:db8::5]", "socks5")).toThrow("缺少服务器地址");
  });

  it("parses extra Loon WireGuard optional field combinations", () => {
    expect(
      parsePlatformProxyLine(
        'WG Extra = wireguard, interface-ip=10.0.0.3/32, private-key=private, peers=[{endpoint="wg-extra.example.com:51820", allowed-ips="10.0.0.0/8", reserved=""}], dns='
      )
    ).toMatchObject({
      name: "WG Extra",
      type: "wireguard",
      server: "wg-extra.example.com",
      port: 51820,
      ip: "10.0.0.3/32",
      "private-key": "private",
      "allowed-ips": ["10.0.0.0/8"],
      udp: true,
      peers: [
        {
          server: "wg-extra.example.com",
          port: 51820,
          "allowed-ips": ["10.0.0.0/8"],
        },
      ],
    });

    expect(parsePlatformProxyLine('WG Empty = wireguard, peers=[{endpoint="wg-empty.example.com:51820"}]')).toMatchObject({
      name: "WG Empty",
      type: "wireguard",
      server: "wg-empty.example.com",
      port: 51820,
      peers: [{ server: "wg-empty.example.com", port: 51820 }],
    });
  });

  it("normalizes optional template config success branches", () => {
    expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), hiddenProxyGroups: undefined })).toMatchObject({
      ok: true,
      config: expect.objectContaining({ hiddenProxyGroups: [] }),
    });

    expect(
      validateSubBoostTemplateConfig({
        ...validTemplateConfig(),
        customRuleSets: [
          {
            id: "rule-a",
            name: "Rule A",
            behavior: "domain",
            path: "https://rules.example.com/a.mrs",
            target: "Custom Select",
            noResolve: true,
          },
        ],
        customProxyGroups: [
          {
            id: "custom-select",
            name: "Custom Select",
            emoji: "",
            groupType: "select",
          },
          {
            id: "custom-url-test",
            name: "Filtered URL Test",
            emoji: "",
            groupType: "url-test",
            advanced: {},
          },
        ],
        dialerProxyGroups: [
          {
            id: "dialer-url-test",
            name: "Dialer URL Test",
            type: "url-test",
            relayNodes: [],
            targetNodes: [],
          },
        ],
        builtinRuleEdits: {
          "module:cn:cn-ip": { target: "Custom Select" },
        },
      })
    ).toMatchObject({
      ok: true,
      config: expect.objectContaining({
        customProxyGroups: expect.arrayContaining([
          expect.objectContaining({ groupType: "select" }),
          expect.objectContaining({
            id: "custom-url-test",
            name: "Filtered URL Test",
            groupType: "url-test",
            advanced: {},
          }),
        ]),
        dialerProxyGroups: [expect.objectContaining({ type: "url-test" })],
      }),
    });

    expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), enabledProxyGroups: undefined })).toMatchObject({
      ok: false,
      error: "enabledProxyGroups 必须是数组",
    });
  });

  it("rejects malformed nested template config fields", () => {
    const expectInvalid = (patch: Record<string, unknown>, error: string) => {
      expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), ...patch })).toMatchObject({
        ok: false,
        error,
      });
    };

    expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), proxyGroupNameOverrides: undefined })).toMatchObject({
      ok: true,
      config: expect.objectContaining({ proxyGroupNameOverrides: {} }),
    });
    expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), proxyGroupAdvanced: undefined })).toMatchObject({
      ok: true,
      config: expect.objectContaining({ proxyGroupAdvanced: {} }),
    });
    expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), customRuleSets: undefined })).toMatchObject({
      ok: true,
      config: expect.objectContaining({ customRuleSets: [] }),
    });
    expect(validateSubBoostTemplateConfig({ ...validTemplateConfig(), builtinRuleEdits: undefined })).toMatchObject({
      ok: true,
      config: expect.objectContaining({ builtinRuleEdits: {} }),
    });

    expectInvalid({ testUrl: "" }, "testUrl 不能为空");
    expectInvalid({ ruleOrder: [123] }, "ruleOrder 只能包含字符串");
    expectInvalid({ proxyGroupNameOverrides: [] }, "proxyGroupNameOverrides 必须是对象");
    expectInvalid({ proxyGroupNameOverrides: { ai: 123 } }, "proxyGroupNameOverrides 的值必须是字符串");

    expectInvalid({ customRules: [123] }, "customRules 只能包含对象");
    expectInvalid({ customRules: [{ type: "BAD", value: "a.example.com", target: "DIRECT" }] }, "customRules 包含无效类型");
    expectInvalid({ customRules: [{ type: "DOMAIN", value: " ", target: "DIRECT" }] }, "customRules.value 不能为空");
    expectInvalid({ customRules: [{ type: "DOMAIN", value: "a.example.com", target: " " }] }, "customRules.target 不能为空");
    expectInvalid({ customRules: [{ type: "DOMAIN", value: "a.example.com", target: "DIRECT", noResolve: "yes" }] }, "customRules.noResolve 必须是布尔值");

    expectInvalid({ customProxyGroups: [123] }, "customProxyGroups 只能包含对象");
    expectInvalid({ customProxyGroups: [{ id: "", name: "Group", emoji: "", groupType: "select" }] }, "customProxyGroups.id 不能为空");
    expectInvalid({ customProxyGroups: [{ id: "g", name: "Group", emoji: 1, groupType: "select" }] }, "customProxyGroups.emoji 必须是字符串");
    expectInvalid({ customProxyGroups: [{ id: "g", name: "Group", emoji: "", groupType: "bad" }] }, "customProxyGroups.groupType 无效");
    expectInvalid({ customRuleSets: [123] }, "customRuleSets 只能包含对象");
    expectInvalid({ customRuleSets: [{ id: "", name: "Rule", behavior: "domain", path: "https://rules.example.com/a.mrs", target: "DIRECT" }] }, "customRuleSets.id 不能为空");
    expectInvalid({ customRuleSets: [{ id: "r", name: "", behavior: "domain", path: "https://rules.example.com/a.mrs", target: "DIRECT" }] }, "customRuleSets.name 不能为空");
    expectInvalid({ customRuleSets: [{ id: "r", name: "Rule", behavior: "bad", path: "https://rules.example.com/a.mrs", target: "DIRECT" }] }, "customRuleSets.format 或 behavior 无效");
    expectInvalid({ customRuleSets: [{ id: "r", name: "Rule", behavior: "domain", path: "ftp://rules.example.com/a.mrs", target: "DIRECT" }] }, "customRuleSets.path 无效");
    expectInvalid({ customRuleSets: [{ id: "r", name: "Rule", behavior: "domain", path: "https://rules.example.com/a.mrs", target: "DIRECT", noResolve: "yes" }] }, "customRuleSets.noResolve 必须是布尔值");

    expectInvalid({ proxyGroupAdvanced: [] }, "proxyGroupAdvanced 必须是对象");
    expectInvalid({ proxyGroupAdvanced: { missing: {} } }, "proxyGroupAdvanced 包含未知代理组");

    expectInvalid({ dialerProxyGroups: [{ id: "d", name: "Dialer", type: "bad", relayNodes: [], targetNodes: [] }] }, "dialerProxyGroups.type 无效");
    expectInvalid({ dialerProxyGroups: [{ id: "d", name: "Dialer", type: "select", relayNodes: "bad", targetNodes: [] }] }, "dialerProxyGroups.relayNodes 必须是数组");
    expectInvalid({ dialerProxyGroups: [{ id: "d", name: "Dialer", type: "select", relayNodes: [], targetNodes: [123] }] }, "dialerProxyGroups.targetNodes 只能包含字符串");
    expectInvalid({ dialerProxyGroups: [{ id: "d", name: "Dialer", type: "select", relayNodes: [], targetNodes: [], enabled: "yes" }] }, "dialerProxyGroups.enabled 必须是布尔值");

    expectInvalid({ builtinRuleEdits: [] }, "builtinRuleEdits 必须是对象");
    expectInvalid({ builtinRuleEdits: { "module:missing:rule": { enabled: false } } }, "builtinRuleEdits 包含未知内置规则");
    expectInvalid({ builtinRuleEdits: { "module:cn:geolocation-cn": "bad" } }, "builtinRuleEdits 的值必须是对象");
    expectInvalid(
      { builtinRuleEdits: { "module:cn:geolocation-cn": { target: 123 } } },
      "builtinRuleEdits.target 必须是字符串或有效代理组引用"
    );
    expectInvalid({ builtinRuleEdits: { "module:cn:geolocation-cn": { enabled: true } } }, "builtinRuleEdits.enabled 只能是 false");
  });
});
