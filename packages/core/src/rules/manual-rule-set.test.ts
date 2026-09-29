import { describe, expect, it } from "vitest";
import { parseManualRuleSetUrl } from "./rule-model";

describe("manual rule set URL", () => {
  it("takes the display name from the URL filename and preserves its query", () => {
    const path = "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/udemy.mrs?download=1";
    expect(parseManualRuleSetUrl(` ${path} `)).toEqual({ name: "udemy", path, behavior: "domain" });
    expect(parseManualRuleSetUrl("https://rules.example/geoip/%E6%97%A5%E6%9C%AC.mrs")).toMatchObject({ name: "日本", behavior: "ipcidr" });
  });
  it.each(["broken", "ftp://rules.example/geosite/a.mrs", "https://a:b@rules.example/geosite/a.mrs",
    "https://rules.example/geosite/%xx.mrs", "https://rules.example/geosite/a.txt", "https://rules.example/a.mrs"])
  ("rejects unsupported or ambiguous inputs: %s", (value) => expect(() => parseManualRuleSetUrl(value)).toThrow());
});
