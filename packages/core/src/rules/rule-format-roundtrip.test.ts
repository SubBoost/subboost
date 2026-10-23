import { describe, expect, it } from "vitest";
import { normalizeRuleModelFromConfig } from "./rule-model";
import { parseCustomRuleBatchImport } from "./custom-rule-batch-import";
import { generateRuleProviders } from "../generator/proxy-groups";
import { validateSubBoostTemplateConfig } from "../templates/config-template";
import { validConfig } from "../templates/config-template.test-helpers";
import type { CustomRuleSet } from "../types/config";

const url = "https://local.subboost.test/custom.list?key=fixture";
const rule: CustomRuleSet = { id: "remote", name: "remote", path: url, target: { kind: "module", id: "ai" }, behavior: "classical", format: "yaml" };

describe("rule formats survive configuration round trips", () => {
  it.each(["yaml", "text"] as const)("preserves %s and classical through template validation, normalization and generation", (format) => {
    const original = { ...rule, format };
    const result = validateSubBoostTemplateConfig(validConfig({ customRuleSets: [original] }));
    if (!result.ok) throw new Error(result.error);
    const normalized = normalizeRuleModelFromConfig(JSON.parse(JSON.stringify(result.config)));
    expect(normalized.customRuleSets).toEqual([original]);
    const providers = generateRuleProviders({ nodes: [], enabledModules: ["ai"], testUrl: "https://local.subboost.test/probe", testInterval: 300,
      ruleProviderBaseUrl: "https://local.subboost.test/rules", customRuleSets: normalized.customRuleSets });
    expect(providers.remote).toMatchObject({ url, behavior: "classical", format, path: `./ruleset/remote.${format === "text" ? "txt" : "yaml"}` });
  });

  it("rejects unknown formats and mrs classical while retaining legacy mrs", () => {
    for (const format of ["mrs", "unknown", null]) {
      expect(validateSubBoostTemplateConfig(validConfig({ customRuleSets: [{ ...rule, format } as CustomRuleSet] })).ok).toBe(false);
    }
    expect(normalizeRuleModelFromConfig({ customRuleSets: [{ ...rule, format: undefined, behavior: "domain" }] }).customRuleSets[0]).not.toHaveProperty("format");
  });

  it("defers generic URLs without inventing metadata, then resolves mixed batches atomically", () => {
    const options = { text: `DOMAIN,example.test,DIRECT\nRULE-SET,${url},AI`, defaultType: "DOMAIN" as const,
      defaultTarget: "DIRECT", defaultNoResolve: false, targetOptions: ["DIRECT", "AI"], ruleSetTargetOptions: ["AI"], existingRules: [] };
    const pending = parseCustomRuleBatchImport({ ...options, allowRemoteRuleSets: true });
    expect(pending.canImport).toBe(true);
    expect(pending.ruleSets).toEqual([]);
    expect(pending.pendingRuleSetUrls).toEqual([url]);
    const resolved = parseCustomRuleBatchImport({ ...options, resolvedRuleSets: new Map([[url, rule]]) });
    expect(resolved.pendingRuleSetUrls).toEqual([]);
    expect(resolved.ruleSets[0]).toMatchObject({ path: url, format: "yaml", behavior: "classical", target: "AI" });
    expect(parseCustomRuleBatchImport({ ...options, text: `${options.text}\nRULE-SET,${url},AI`, allowRemoteRuleSets: true }).canImport).toBe(false);
  });
});
