import { describe, expect, it } from "vitest";

import {
  decryptEncryptedFieldV2,
  encryptEncryptedFieldV2,
  isV2EncryptedField,
} from "./encrypted-field";

const masterKey = "unit-test-encryption-key-32-bytes-minimum";

describe("encrypted field crypto", () => {
  it("encrypts and decrypts the shared v2 format with an explicit master key", () => {
    const ciphertext = encryptEncryptedFieldV2("hello subboost", masterKey);

    expect(isV2EncryptedField(ciphertext)).toBe(true);
    expect(ciphertext.split(":")).toHaveLength(4);
    expect(decryptEncryptedFieldV2(ciphertext, masterKey)).toBe("hello subboost");
  });

  it("rejects non-v2 ciphertext", () => {
    const oldShapeCiphertext = "old:0123456789abcdef:0123456789abcdef:abcd";

    expect(isV2EncryptedField(oldShapeCiphertext)).toBe(false);
    expect(() => decryptEncryptedFieldV2(oldShapeCiphertext, masterKey)).toThrow("Invalid ciphertext v2 format");
  });

  it("round-trips an empty plaintext", () => {
    const ciphertext = encryptEncryptedFieldV2("", masterKey);

    expect(ciphertext.endsWith(":")).toBe(true);
    expect(decryptEncryptedFieldV2(ciphertext, masterKey)).toBe("");
  });

  it("rejects missing segments and invalid hex encodings", () => {
    expect(() =>
      decryptEncryptedFieldV2(
        "v2:00112233445566778899aabb:00112233445566778899aabbccddeeff",
        masterKey
      )
    ).toThrow("Invalid ciphertext v2 format");
    expect(() =>
      decryptEncryptedFieldV2(
        "v2:zz112233445566778899aabb:00112233445566778899aabbccddeeff:",
        masterKey
      )
    ).toThrow("Invalid ciphertext v2 encoding");
    expect(() =>
      decryptEncryptedFieldV2(
        "v2:00112233445566778899aabb:00112233445566778899aabbccddeeff:f",
        masterKey
      )
    ).toThrow("Invalid ciphertext v2 encoding");
  });

});
