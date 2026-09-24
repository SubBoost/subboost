import { describe, expect, it } from "vitest";
import {
  getEffectiveModuleRuleItems,
  getEffectiveModuleRules,
  getExcludedModuleRuleIds,
  getModuleRuleById,
  getModuleRuleOrderKey,
  isModuleRuleMovedFrom,
  isPresetModuleRule,
  normalizeHiddenPresetRuleIds,
} from "./module-rules";
import type { ProxyGroupModule, ProxyGroupRule } from "@subboost/core/generator/proxy-group-modules";

const proxyModule: ProxyGroupModule = {
  id: "media",
  name: "Media",
  emoji: "M",
  category: "media",
  description: "Media",
  groupType: "select",
  rules: [
    { id: "youtube", name: "YouTube", behavior: "domain", path: "geosite/youtube.mrs" },
    { id: "netflix", name: "Netflix", behavior: "domain", path: "geosite/netflix.mrs" },
  ],
};

const customRules: ProxyGroupRule[] = [
  { id: "netflix", name: "Duplicate", behavior: "domain", path: "geosite/duplicate.mrs" },
  { id: "hulu", name: "Hulu", behavior: "domain", path: "geosite/hulu.mrs" },
];

describe("module rule helpers", () => {
  it("normalizes hidden preset rule ids and resolves excluded ids", () => {
    expect(
      normalizeHiddenPresetRuleIds({
        " media ": [" youtube ", "youtube", "", 123],
        skip: "bad",
      })
    ).toEqual({ media: ["youtube"] });
    expect(normalizeHiddenPresetRuleIds(null)).toEqual({});
    expect(normalizeHiddenPresetRuleIds([])).toEqual({});
    expect([...getExcludedModuleRuleIds(" media ", { media: [" youtube ", ""] })]).toEqual(["youtube"]);
    expect([...getExcludedModuleRuleIds("   ", { media: ["youtube"] })]).toEqual([]);
  });

  it("finds preset and custom rules without duplicating ids", () => {
    expect(getModuleRuleOrderKey("media", "youtube")).toBe("module:media:youtube");
    expect(isPresetModuleRule(proxyModule, "youtube")).toBe(true);
    expect(isPresetModuleRule(proxyModule, "missing")).toBe(false);
    expect(isPresetModuleRule(proxyModule, " ")).toBe(false);
    expect(getModuleRuleById(proxyModule, "netflix")).toMatchObject({ name: "Netflix" });
    expect(getModuleRuleById(proxyModule, "hulu", { media: customRules })).toMatchObject({ name: "Hulu" });
    expect(getModuleRuleById(proxyModule, "missing", { media: customRules })).toBeNull();
    expect(getModuleRuleById(proxyModule, " ", { media: customRules })).toBeNull();
    expect(getModuleRuleById(proxyModule, "hulu", { media: "bad" as never })).toBeNull();

    expect(
      getEffectiveModuleRuleItems(proxyModule, { media: customRules }, { media: ["youtube"] }).map((rule) => ({
        id: rule.id,
        source: rule.source,
      }))
    ).toEqual([
      { id: "netflix", source: "preset" },
      { id: "hulu", source: "custom" },
    ]);
    expect(
      getEffectiveModuleRuleItems(
        { ...proxyModule, rules: [proxyModule.rules[0], proxyModule.rules[0], { id: "" } as never] },
        { media: [{ id: "" } as never, customRules[1], customRules[1]] }
      ).map((rule) => ({ id: rule.id, source: rule.source }))
    ).toEqual([
      { id: "youtube", source: "preset" },
      { id: "hulu", source: "custom" },
    ]);
    expect(getEffectiveModuleRules(proxyModule, { media: customRules }, { media: ["youtube"] })).toEqual([
      { id: "netflix", name: "Netflix", behavior: "domain", path: "geosite/netflix.mrs" },
      { id: "hulu", name: "Hulu", behavior: "domain", path: "geosite/hulu.mrs" },
    ]);
  });

  it("detects rules moved to another module", () => {
    expect(isModuleRuleMovedFrom("media", "youtube")).toBe(false);
    expect(isModuleRuleMovedFrom("media", "youtube", { other: [null as never, { id: "hulu" }] })).toBe(false);
    expect(isModuleRuleMovedFrom("media", "youtube", { other: [{ id: "youtube" }] })).toBe(true);
    expect(isModuleRuleMovedFrom("media", "youtube", { media: [{ id: "youtube" }] })).toBe(false);
    expect(isModuleRuleMovedFrom("", "youtube", { other: [{ id: "youtube" }] })).toBe(false);
    expect(isModuleRuleMovedFrom("media", " ", { other: [{ id: "youtube" }] })).toBe(false);
    expect(isModuleRuleMovedFrom("media", "youtube", { other: "bad" as never })).toBe(false);
  });

  it("preserves the preset label for incoming rules and keeps user additions custom", () => {
    const incoming = { ...customRules[1], source: "preset" as const };
    const target = { ...proxyModule, rules: [] };
    expect(getEffectiveModuleRuleItems(target, { media: [incoming, customRules[0]] })
      .map(({ id, source }) => ({ id, source }))).toEqual([
      { id: "hulu", source: "preset" },
      { id: "netflix", source: "custom" },
    ]);
    expect(getEffectiveModuleRules(target, { media: [incoming] })).toEqual([customRules[1]]);
  });
});
