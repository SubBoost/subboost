import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { CUSTOM_RULE_TYPES, getCustomRuleDefinition, getSourceIpRuleType, hasCommaPayload, isCustomRuleType, supportsNoResolve } from "../../../packages/core/src/rules/custom-rule-types";
import { normalizeCustomRuleValue, normalizeLogicRulePayload } from "../../../packages/core/src/rules/custom-rule-value";
import { parseCustomRuleBatchImport } from "../../../packages/core/src/rules/custom-rule-batch-import";
import { buildGenerateOptionsFromConfig } from "../../../packages/core/src/subscription/config-utils";
import { generateClashConfig } from "../../../packages/core/src/generator";
import { configToYaml } from "../../../packages/core/src/generator/yaml";
import { validateSubBoostTemplateConfig } from "../../../packages/core/src/templates/config-template";
import { validConfig } from "../../../packages/core/src/templates/config-template.test-helpers";

function parse(text: string, defaultType: (typeof CUSTOM_RULE_TYPES)[number] = "DOMAIN") {
  return parseCustomRuleBatchImport({ text, defaultType, defaultTarget: "DIRECT", defaultNoResolve: true, targetOptions: ["DIRECT", "REJECT"], existingRules: [] });
}

describe("Mihomo stable custom rule round trips", () => {
  it.each(CUSTOM_RULE_TYPES)("preserves %s through import, template, saved JSON and YAML", (type) => {
    const value = getCustomRuleDefinition(type).example;
    const imported = parse(`${type},${value},DIRECT${supportsNoResolve(type) ? ",no-resolve" : ""}`);
    expect(imported.canImport).toBe(true);
    const template = validateSubBoostTemplateConfig(validConfig({ customRules: imported.rules }));
    expect(template.ok).toBe(true);
    if (!template.ok) throw new Error(template.error);
    const options = buildGenerateOptionsFromConfig(JSON.parse(JSON.stringify({
      template: "full", enabledGroups: [], enabledRules: [], customRules: template.config.customRules,
    })), { nodes: [] });
    const rule = options.userConfig?.customRules?.[0];
    expect(rule).toMatchObject({ type, value, noResolve: supportsNoResolve(type) });
    const yaml = load(configToYaml(generateClashConfig(options))) as { rules: string[] };
    expect(yaml.rules).toContain(`${type},${value},DIRECT${supportsNoResolve(type) ? ",no-resolve" : ""}`);
  });

  it("keeps regex commas, balanced parentheses, case flags, quotes and Windows paths", () => {
    const regex = String.raw`(?i)^(foo|bar){1,3}\\app"name\.exe$`;
    expect(parse(`PROCESS-PATH-REGEX,${regex},REJECT`).rules[0]).toMatchObject({ value: regex, target: "REJECT" });
    expect(parse('DOMAIN-REGEX,"quoted",DIRECT').rules[0]?.value).toBe('"quoted"');
    expect(parse('"DOMAIN-REGEX","quoted,regex",DIRECT', "AND").rules[0]?.value).toBe("quoted,regex");
    expect(parse(regex, "PROCESS-PATH-REGEX").rules[0]?.value).toBe(regex);
    const path = String.raw`C:\Program Files\App (x64)\app.exe`;
    expect(parse(`PROCESS-PATH,${path},DIRECT`).rules[0]?.value).toBe(path);
    const logical = `((DOMAIN-REGEX,^(foo|bar){1,3}\\.test$),(PROCESS-PATH,${path}))`;
    expect(normalizeLogicRulePayload("AND", logical)).toEqual({ ok: true, value: logical });
    expect(parse(`AND,${logical},DIRECT`).rules[0]?.value).toBe(logical);
  });

  it("accepts single-child AND/OR, nested conditions, lowercase types and IP parameters", () => {
    expect(normalizeLogicRulePayload("AND", "((NETWORK,udp))").ok).toBe(true);
    expect(normalizeLogicRulePayload("OR", "((AND,((network,tcp))))")).toEqual({ ok: true, value: "((AND,((NETWORK,tcp))))" });
    const value = "((IP-ASN,64512,src),(IP-SUFFIX,203.0.113.1/24,no-resolve),(RULE-SET,configured,src))";
    expect(normalizeLogicRulePayload("OR", value)).toEqual({ ok: true, value });
  });

  it.each([
    ["AND", "()"], ["AND", "((NETWORK,tcp)),((NETWORK,udp))"],
    ["OR", "((UNKNOWN,x))"], ["OR", "((SUB-RULE,x))"],
    ["OR", "((NETWORK,tcp,no-resolve))"], ["OR", "((IP-CIDR,203.0.113.0/24,invalid))"],
    ["DOMAIN", "a,b"], ["DOMAIN", "a\nb"], ["PROCESS-PATH", "a\0b"],
  ])("rejects unsafe or invalid structure: %s %s", (type, value) => {
    expect(normalizeCustomRuleValue(type, value).ok).toBe(false);
  });

  it("does not add no-resolve to source IP, domain, process or logic rules", () => {
    for (const type of ["SRC-IP-CIDR", "DOMAIN", "PROCESS-NAME", "AND"] as const) {
      const value = getCustomRuleDefinition(type).example;
      const result = validateSubBoostTemplateConfig(validConfig({ customRules: [{ id: type, type, value, target: "DIRECT", noResolve: true }] }));
      expect(result.ok && result.config.customRules[0].noResolve).toBe(false);
    }
    expect(supportsNoResolve("RULE-SET")).toBe(true);
    expect(supportsNoResolve("unknown")).toBe(false);
    expect(hasCommaPayload("unknown")).toBe(false);
    expect(isCustomRuleType("MATCH")).toBe(false);
    expect(isCustomRuleType("SUB-RULE")).toBe(false);
    expect(isCustomRuleType("toString")).toBe(false);
    expect(getSourceIpRuleType("unknown")).toBeUndefined();
  });

  it("canonicalizes imported type names and compares legacy flags by their effect", () => {
    expect(parse("domain,local.subboost.test,DIRECT").rules[0]?.type).toBe("DOMAIN");
    const result = parseCustomRuleBatchImport({ text: "DOMAIN,local.subboost.test,DIRECT", defaultType: "DOMAIN", defaultTarget: "DIRECT", defaultNoResolve: false, targetOptions: ["DIRECT"], existingRules: [{ id: "old", type: "DOMAIN", value: "local.subboost.test", target: "DIRECT", noResolve: true }] });
    expect(result.duplicateCount).toBe(1);
  });

  it.each([
    ["AND,((NETWORK,tcp))", "AND", "((NETWORK,tcp))"],
    ["OR,((AND,((NETWORK,tcp))),(DOMAIN,local.subboost.test)),", "OR", "((AND,((NETWORK,tcp))),(DOMAIN,local.subboost.test))"],
    ["NOT,((NETWORK,udp))", "NOT", "((NETWORK,udp))"],
    ["DOMAIN-REGEX,^local{1,3}", "DOMAIN-REGEX", "^local{1,3}"],
    ["DOMAIN-REGEX,^local{1,3},", "DOMAIN-REGEX", "^local{1,3}"],
    ["PROCESS-NAME-REGEX,^(curl,wget){1,3}$", "PROCESS-NAME-REGEX", "^(curl,wget){1,3}$"],
    ["DOMAIN-REGEX,^[a,b]{1,}$", "DOMAIN-REGEX", "^[a,b]{1,}$"],
    ["DOMAIN-REGEX,^[]a,b]{1,3}$", "DOMAIN-REGEX", "^[]a,b]{1,3}$"],
    ["DOMAIN-REGEX,^[^]a,b]{1,3}$", "DOMAIN-REGEX", "^[^]a,b]{1,3}$"],
    [String.raw`DOMAIN-REGEX,^local\,subboost$`, "DOMAIN-REGEX", String.raw`^local\,subboost$`],
    [String.raw`DOMAIN-REGEX,^local[\],]{3}$`, "DOMAIN-REGEX", String.raw`^local[\],]{3}$`],
    ['"DOMAIN-REGEX","^local,subboost$"', "DOMAIN-REGEX", "^local,subboost$"],
    ['"DOMAIN-REGEX","^local,subboost$",', "DOMAIN-REGEX", "^local,subboost$"],
    ['DOMAIN-REGEX,^"local"{1,3}', "DOMAIN-REGEX", '^"local"{1,3}'],
  ])("inherits the target without splitting payload commas: %s", (text, type, value) => {
    const result = parse(text);
    expect(result.canImport).toBe(true);
    expect(result.rules[0]).toMatchObject({ type, value, target: "DIRECT" });
  });

  it.each([
    "AND,((NETWORK,tcp)),Missing",
    "DOMAIN-REGEX,^local{1,3},Missing",
    "DOMAIN-REGEX,^local,Missing",
    '"DOMAIN-REGEX","^local,subboost$",Missing',
  ])("does not absorb an unknown explicit target into the payload: %s", (text) => {
    const result = parse(text);
    expect(result.canImport).toBe(false);
    expect(result.items[0]?.message).toBe("未知目标：Missing");
  });

  it.each([
    ["IP-CIDR", "203.0.113.0/24", "SRC-IP-CIDR"],
    ["IP-CIDR6", "203.0.113.0/24", "SRC-IP-CIDR"],
    ["IP-SUFFIX", "203.0.113.1/24", "SRC-IP-SUFFIX"],
    ["IP-ASN", "64512", "SRC-IP-ASN"],
    ["GEOIP", "cn", "SRC-GEOIP"],
  ])("normalizes %s src parameters through saved config and YAML", (type, value, sourceType) => {
    for (const params of ["src", "no-resolve,src", "src,no-resolve"]) {
      const imported = parse(`${type},${value},DIRECT,${params}`);
      expect(imported.canImport).toBe(true);
      expect(imported.rules[0]).toMatchObject({ type: sourceType, value, target: "DIRECT", noResolve: false });
      const template = validateSubBoostTemplateConfig(validConfig({ customRules: imported.rules }));
      expect(template.ok).toBe(true);
      if (!template.ok) throw new Error(template.error);
      const options = buildGenerateOptionsFromConfig(JSON.parse(JSON.stringify({
        template: "full", enabledGroups: [], enabledRules: [], customRules: template.config.customRules,
      })), { nodes: [] });
      expect((load(configToYaml(generateClashConfig(options))) as { rules: string[] }).rules)
        .toContain(`${sourceType},${value},DIRECT`);
    }
  });

  it("inherits an empty target with src and compares the canonical source matcher for duplicates", () => {
    expect(parse("IP-CIDR,203.0.113.0/24,,src").rules[0]).toMatchObject({ type: "SRC-IP-CIDR", target: "DIRECT" });
    const duplicate = parseCustomRuleBatchImport({ text: "IP-CIDR6,203.0.113.0/24,DIRECT,no-resolve,src", defaultType: "DOMAIN", defaultTarget: "DIRECT", defaultNoResolve: false, targetOptions: ["DIRECT"], existingRules: [{ id: "old", type: "SRC-IP-CIDR", value: "203.0.113.0/24", target: "DIRECT" }] });
    expect(duplicate.duplicateCount).toBe(1);
    expect(parse("DOMAIN,local.subboost.test,DIRECT,src").errorCount).toBe(1);
    expect(parse("RULE-SET,https://local.subboost.test/list.mrs,DIRECT,no-resolve,src").errorCount).toBe(1);
  });

  it("handles long malformed regex delimiter input in bounded time", () => {
    const started = performance.now();
    expect(parse(`DOMAIN-REGEX,^local${"{".repeat(100_000)},Missing`).items[0]?.message).toBe("未知目标：Missing");
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it.each([
    "^local[[:alpha:],]$",
    "^local[^[:alpha:],]$",
    "^local[[:^alpha:],]$",
    "^local[[:alpha:][:digit:],]$",
  ])("preserves POSIX character classes and their commas: %s", (value) => {
    for (const suffix of ["", ",", ",REJECT"]) {
      const result = parse(`DOMAIN-REGEX,${value}${suffix}`);
      expect(result.canImport).toBe(true);
      expect(result.rules[0]).toMatchObject({ type: "DOMAIN-REGEX", value, target: suffix === ",REJECT" ? "REJECT" : "DIRECT" });
    }
    const unknown = parse(`DOMAIN-REGEX,${value},Missing`);
    expect(unknown.canImport).toBe(false);
    expect(unknown.items[0]?.message).toBe("未知目标：Missing");
  });

  it.each(["SRC", "sRc", "NO-RESOLVE", "No-Resolve", "no-Resolve"])("rejects case-changing parameter %s without activating it", (param) => {
    for (const params of [param, `no-resolve,${param}`, `src,${param}`]) {
      const result = parse(`IP-CIDR,203.0.113.0/24,DIRECT,${params}`);
      expect(result.canImport).toBe(false);
      expect(result.rules).toEqual([]);
      expect(result.items[0]?.message).toContain("大小写");
    }
  });

  it("scans long repeated POSIX classes without revisiting their contents", () => {
    const started = performance.now();
    const value = `^local[${"[:alpha:]".repeat(20_000)},]$`;
    expect(parse(`DOMAIN-REGEX,${value},Missing`).items[0]?.message).toBe("未知目标：Missing");
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it.each([
    "^local(?# [note)$",
    "^local(?# (note)$",
    String.raw`^local(?# \)[(,]$`,
    "^local(?# [, {1,3} (note)$",
    "(?x)^local# [ ( {",
    "(?X)^local# [ ( {",
    "(?im-sx+x)^local# [ ( {",
    "(?x)^local(?-x:#literal[(,])# [ ( {",
    "(?x:^local)#literal[(,]$",
    "(?<app>local(?x))#literal[(,]$",
    "(?x)(?-x)^local#[(,]$",
    String.raw`(?x)^local\#[(,]$`,
    "(?x)^local[#,()]$",
    "^local(?# (?x)[,]#literal[(,]$",
  ])("preserves regexp2 comment and option boundaries through saved YAML: %s", (value) => {
    for (const type of ["DOMAIN-REGEX", "PROCESS-NAME-REGEX", "PROCESS-PATH-REGEX"]) {
      for (const suffix of ["", ",", ",REJECT"]) {
        const target = suffix === ",REJECT" ? "REJECT" : "DIRECT";
        const imported = parse(`${type},${value}${suffix}`);
        expect(imported.canImport).toBe(true);
        expect(imported.rules[0]).toMatchObject({ type, value, target, noResolve: false });
        const template = validateSubBoostTemplateConfig(validConfig({ customRules: imported.rules }));
        expect(template.ok).toBe(true);
        if (!template.ok) throw new Error(template.error);
        const options = buildGenerateOptionsFromConfig(JSON.parse(JSON.stringify({
          template: "full", enabledGroups: [], enabledRules: [], customRules: template.config.customRules,
        })), { nodes: [] });
        expect(options.userConfig?.customRules?.[0]).toMatchObject({ type, value, target });
        const yaml = load(configToYaml(generateClashConfig(options))) as { rules: string[] };
        expect(yaml.rules.filter((rule) => rule.startsWith(`${type},`))).toEqual([`${type},${value},${target}`]);
      }
      const unknown = parse(`${type},${value},Missing`);
      expect(unknown.canImport).toBe(false);
      expect(unknown.items[0]?.message).toBe("未知目标：Missing");
    }
  });

  it("uses quoted CSV to disambiguate commas in x-mode line comments", () => {
    const value = "(?x)^local# [ ( ,REJECT";
    for (const suffix of ["", ",", ",REJECT"]) {
      expect(parse(`\"DOMAIN-REGEX\",\"${value}\"${suffix}`).rules[0])
        .toMatchObject({ value, target: suffix === ",REJECT" ? "REJECT" : "DIRECT" });
    }
    expect(parse(`DOMAIN-REGEX,${value}`).rules[0])
      .toMatchObject({ value: "(?x)^local# [ (", target: "REJECT" });
    expect(parse("DOMAIN-REGEX,(?x)^local# [,] (,Missing").items[0]?.message).toBe("未知目标：Missing");
  });

  it("rejects an unterminated regexp2 block comment without inferring a target", () => {
    const result = parse("DOMAIN-REGEX,^local(?# [note,REJECT");
    expect(result.canImport).toBe(false);
    expect(result.rules).toEqual([]);
    expect(result.items[0]?.message).toContain("注释未闭合");
  });

  it.each(["Group (?#", "Group # [", "Group (?x"])("keeps policy syntax separate from regex syntax: %s", (target) => {
    for (const value of ["^local", "(?x)^local# ["]) {
      const result = parseCustomRuleBatchImport({
        text: `DOMAIN-REGEX,${value},${target}`, defaultType: "DOMAIN", defaultTarget: "DIRECT",
        defaultNoResolve: false, targetOptions: ["DIRECT", target], existingRules: [],
      });
      expect(result.canImport).toBe(true);
      expect(result.rules[0]).toMatchObject({ value, target });
      expect(parse(`DOMAIN-REGEX,${value},${target}`).items[0]?.message).toBe(`未知目标：${target}`);
    }
  });

  it("scans long regexp2 comments and option sequences in bounded time", () => {
    const started = performance.now();
    const comments = `^local${"(?# [(\\)".repeat(20_000)}$`;
    const options = `(?${"x+".repeat(50_000)}x)^local# [ ( {`;
    for (const value of [comments, options]) {
      expect(parse(`DOMAIN-REGEX,${value},Missing`).items[0]?.message).toBe("未知目标：Missing");
    }
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
