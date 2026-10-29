import { describe, expect, it } from "vitest";
import { parseVLESS } from "./vless";
import { parseSubscription } from "../index";
import { generateClashYaml } from "../../generator";
import * as yaml from "js-yaml";

const uri = `vless://11111111-1111-4111-8111-111111111111@local.subboost.test:443?security=reality&pbk=${"A".repeat(43)}`;
const encryption = "mlkem768x25519plus.native.0rtt.valid_token";
const encryptedUri = `${uri}&encryption=${encryption}`;
const supportKeys = ["support-x25519mlkem768", "support_x25519mlkem768", "supportX25519MLKEM768"];

describe("VLESS Reality key exchange support", () => {
  it.each(["support-x25519mlkem768", "support_x25519mlkem768", "supportX25519MLKEM768"])("imports explicit %s and preserves false", (key) => {
    expect(parseVLESS(`${uri}&${key}=true`)["reality-opts"]?.["support-x25519mlkem768"]).toBe(true);
    expect(parseVLESS(`${uri}&${key}=0`)["reality-opts"]?.["support-x25519mlkem768"]).toBe(false);
  });

  it.each(["", "&support-x25519mlkem768=", "&support-x25519mlkem768=invalid"])("keeps absent, empty or invalid flags unset: %s", (suffix) => {
    expect(parseVLESS(`${uri}${suffix}`)["reality-opts"]).not.toHaveProperty("support-x25519mlkem768");
  });

  it("does not infer Reality from a support flag alone", () => {
    const plain = "vless://11111111-1111-4111-8111-111111111111@local.subboost.test:443";
    expect(parseVLESS(`${plain}?support-x25519mlkem768=1`)).not.toHaveProperty("reality-opts");
    expect(parseVLESS(`${plain}?security=reality&support-x25519mlkem768=1`)).not.toHaveProperty("reality-opts");
  });

  it.each(["native", "xorpub", "random"].flatMap((method) => ["0rtt", "1rtt"].map((rtt) => `${method}.${rtt}`)))(
    "enables hybrid Reality for complete VLESS encryption %s", (mode) => {
      const value = `mlkem768x25519plus.${mode}.100-111-1111.75-0-111.AAAA+BBBB=`;
      const node = parseVLESS(`${uri}&encryption=${encodeURIComponent(value)}`);
      expect(node.encryption).toBe(value);
      expect(node["reality-opts"]?.["support-x25519mlkem768"]).toBe(true);
    });

  it.each(["chrome", "firefox", "safari", "ios", "edge", "android", "random", "chrome120", "custom-fingerprint"])(
    "preserves the supplied %s fingerprint while adding compatibility", (fingerprint) => {
      const node = parseVLESS(`${encryptedUri}&fp=${fingerprint}`);
      expect(node["client-fingerprint"]).toBe(fingerprint);
      expect(node["reality-opts"]?.["support-x25519mlkem768"]).toBe(true);
    });

  it.each(supportKeys.flatMap((key) => ["true", "false", "0", "off", "", "invalid"].map((value) => ({ key, value }))))(
    "does not override explicit $key=$value on an encrypted link", ({ key, value }) => {
      const node = parseVLESS(`${encryptedUri}&${key}=${value}`);
      if (value === "" || value === "invalid") {
        expect(node["reality-opts"]).not.toHaveProperty("support-x25519mlkem768");
      } else {
        expect(node["reality-opts"]?.["support-x25519mlkem768"]).toBe(value === "true");
      }
    });

  it("retains explicit alias precedence", () => {
    expect(parseVLESS(`${encryptedUri}&support-x25519mlkem768=false&support_x25519mlkem768=true`)["reality-opts"])
      .toHaveProperty("support-x25519mlkem768", false);
  });

  it.each(["", "none", "legacy", "mlkem768x25519plus", "mlkem768x25519plus.native.0rtt", "mlkem768x25519plus.unknown.0rtt.token", "mlkem768x25519plus.native.1rtt.bad token"])(
    "keeps Reality defaults for absent or unsupported encryption %s", (value) => {
      expect(parseVLESS(`${uri}&encryption=${encodeURIComponent(value)}`)["reality-opts"])
        .not.toHaveProperty("support-x25519mlkem768");
    });

  it.each(["tls", "none"])("does not add Reality settings to security=%s", (security) => {
    expect(parseVLESS(encryptedUri.replace("security=reality", `security=${security}`)))
      .not.toHaveProperty("reality-opts");
  });

  it.each(["", "invalid", "A".repeat(42), "A".repeat(43) + "="])("does not infer support without a valid public key: %s", (key) => {
    const node = parseVLESS(encryptedUri.replace("A".repeat(43), key));
    expect(node["reality-opts"] ?? {}).not.toHaveProperty("support-x25519mlkem768");
  });

  it.each([undefined, false, true])("leaves native YAML support %s unchanged", (support) => {
    const input = parseVLESS(encryptedUri);
    if (support === undefined) delete input["reality-opts"]!["support-x25519mlkem768"];
    else input["reality-opts"]!["support-x25519mlkem768"] = support;
    const parsed = parseSubscription(yaml.dump({ proxies: [input] }));
    expect(parsed.errors).toEqual([]);
    const output = yaml.load(generateClashYaml({ nodes: parsed.nodes })) as { proxies: Array<Record<string, unknown>> };
    const reality = output.proxies[0]["reality-opts"];
    if (support === undefined) expect(reality).not.toHaveProperty("support-x25519mlkem768");
    else expect(reality).toHaveProperty("support-x25519mlkem768", support);
  });
});
