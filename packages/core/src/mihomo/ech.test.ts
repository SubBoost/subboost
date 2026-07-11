import { describe, expect, it } from "vitest";
import {
  buildMihomoEchOptsFromShareValue,
  isMihomoEchQueryServerName,
  isStandardBase64String,
} from "./ech";

describe("Mihomo ECH helpers", () => {
  it("classifies share values without promoting arbitrary text", () => {
    expect(buildMihomoEchOptsFromShareValue(null)).toEqual({ enable: true });
    expect(buildMihomoEchOptsFromShareValue(" ")).toEqual({ enable: true });
    expect(buildMihomoEchOptsFromShareValue(" Y29uZmln ")).toEqual({ enable: true, config: "Y29uZmln" });
    expect(buildMihomoEchOptsFromShareValue(" cloudflare-ech.com ")).toEqual({
      enable: true,
      "query-server-name": "cloudflare-ech.com",
    });
    expect(buildMihomoEchOptsFromShareValue("not base64!")).toEqual({ enable: true });
  });

  it("keeps Base64 and DNS-name validation bounded and conservative", () => {
    expect(isStandardBase64String("+w==")).toBe(true);
    expect(isStandardBase64String("dGVzdA")).toBe(false);
    expect(isMihomoEchQueryServerName("ech.example.com")).toBe(true);
    expect(isMihomoEchQueryServerName("ech.example.com.")).toBe(true);
    expect(isMihomoEchQueryServerName("1.1.1.1")).toBe(false);
    expect(isMihomoEchQueryServerName("single-label")).toBe(false);
    expect(isMihomoEchQueryServerName(`bad_label.${"a".repeat(64)}.example.com`)).toBe(false);
    expect(isMihomoEchQueryServerName(`${"a".repeat(100_000)}.example.com`)).toBe(false);
  });
});
