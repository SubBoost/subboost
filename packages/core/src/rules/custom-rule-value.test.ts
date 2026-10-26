import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { generateClashConfig } from "@subboost/core/generator";
import { configToYaml } from "@subboost/core/generator/yaml";
import { buildGenerateOptionsFromConfig } from "@subboost/core/subscription/config-utils";
import { validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import { validConfig } from "@subboost/core/templates/config-template.test-helpers";
import { normalizeCustomRuleValue, normalizeLogicRulePayload } from "./custom-rule-value";

const TAILSCALE_PAYLOAD = "((PROCESS-NAME,tailscaled),(NETWORK,UDP),(SRC-PORT,41641))";

describe("logic rule payload", () => {
  it("accepts the Clash Verge payload as-is and strips whitespace around tokens", () => {
    expect(normalizeLogicRulePayload("AND", TAILSCALE_PAYLOAD)).toEqual({ ok: true, value: TAILSCALE_PAYLOAD });
    expect(normalizeLogicRulePayload("AND", " ( (PROCESS-NAME, tailscaled) , (NETWORK,UDP),(SRC-PORT , 41641) ) "))
      .toEqual({ ok: true, value: TAILSCALE_PAYLOAD });
  });

  it("keeps sub-rule params and nested logic rules", () => {
    expect(normalizeLogicRulePayload("OR", "((IP-CIDR,203.0.113.0/24,no-resolve),(AND,((DOMAIN,a.com),(NETWORK,TCP))))"))
      .toEqual({ ok: true, value: "((IP-CIDR,203.0.113.0/24,no-resolve),(AND,((DOMAIN,a.com),(NETWORK,TCP))))" });
    expect(normalizeLogicRulePayload("NOT", "((DOMAIN,example.com))")).toEqual({ ok: true, value: "((DOMAIN,example.com))" });
  });

  it.each([
    ["AND", "(PROCESS-NAME,tailscaled),(NETWORK,UDP)", "需形如"],
    ["AND", "((PROCESS-NAME,tailscaled),(NETWORK,UDP)", "需形如"],
    ["OR", "((DOMAIN,a.com),)", "格式错误"],
    ["NOT", "((DOMAIN,a.com),(DOMAIN,b.com))", "只能包含 1 个"],
    ["AND", "((DOMAIN,a.com),(NETWORK))", "缺少值"],
    ["AND", "((DOMAIN,a.com),(UNKNOWN,udp))", "类型无效"],
    ["AND", "((DOMAIN,a.com),(MATCH,x))", "不支持"],
    ["AND", "((DOMAIN,a.com),(NETWORK,))", "不能为空"],
    ["AND", "((DOMAIN,a.com),DOMAIN,b.com)", "括号包裹"],
  ] as const)("rejects %s %s", (type, payload, message) => {
    const result = normalizeLogicRulePayload(type, payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("only validates payload syntax for logic types", () => {
    expect(normalizeCustomRuleValue("DOMAIN", " example.com ")).toEqual({ ok: true, value: "example.com" });
    expect(normalizeCustomRuleValue("DOMAIN", "  ")).toMatchObject({ ok: false });
    expect(normalizeCustomRuleValue("AND", "example.com")).toMatchObject({ ok: false });
  });
});

describe("logic rules through persisted config and generation", () => {
  it("emits AND rules into the generated YAML and drops invalid persisted payloads", () => {
    const options = buildGenerateOptionsFromConfig({
      template: "full",
      enabledGroups: [],
      enabledRules: [],
      customRules: [
        { id: "tailscale", type: "AND", value: "((PROCESS-NAME, tailscaled),(NETWORK,UDP),(SRC-PORT,41641))", target: "DIRECT" },
        { id: "broken", type: "AND", value: "(DOMAIN,a.com)", target: "DIRECT" },
      ],
    }, { nodes: [] });

    expect(options.userConfig?.customRules?.map((rule) => [rule.id, rule.type, rule.value])).toEqual([
      ["tailscale", "AND", TAILSCALE_PAYLOAD],
    ]);
    const parsed = load(configToYaml(generateClashConfig(options))) as { rules: string[] };
    expect(parsed.rules).toContain(`AND,${TAILSCALE_PAYLOAD},DIRECT`);
    expect(parsed.rules.some((rule) => rule.includes("(DOMAIN,a.com)"))).toBe(false);
  });

  it("rejects templates carrying an invalid logic payload", () => {
    const template = (value: string) => validConfig({ customRules: [{ id: "logic", type: "AND", value, target: "DIRECT" }] });
    const accepted = validateSubBoostTemplateConfig(template(" ((PROCESS-NAME,tailscaled),(NETWORK,UDP),(SRC-PORT,41641)) "));
    expect(accepted.ok && accepted.config.customRules[0]?.value).toBe(TAILSCALE_PAYLOAD);
    expect(validateSubBoostTemplateConfig(template("(DOMAIN,a.com)"))).toMatchObject({ ok: false });
  });
});
