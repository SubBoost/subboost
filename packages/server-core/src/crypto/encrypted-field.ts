import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const V2_PREFIX = "v2";
const V2_HKDF_SALT = "subboost:encrypted-field:v2";
const V2_HKDF_INFO = "subboost:aes-256-gcm:v2";

function deriveV2Key(masterKey: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(masterKey, "utf8"), V2_HKDF_SALT, V2_HKDF_INFO, KEY_LENGTH));
}

function assertNonEmptyMasterKey(masterKey: string): void {
  if (typeof masterKey !== "string" || masterKey.trim().length === 0) {
    throw new Error("Encryption master key is required");
  }
}

export function isV2EncryptedField(ciphertext: string | null | undefined): boolean {
  return typeof ciphertext === "string" && ciphertext.startsWith(`${V2_PREFIX}:`);
}

export function encryptEncryptedFieldV2(plaintext: string, masterKey: string): string {
  assertNonEmptyMasterKey(masterKey);

  const iv = randomBytes(IV_LENGTH);
  const key = deriveV2Key(masterKey);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return [V2_PREFIX, iv.toString("hex"), authTag.toString("hex"), encrypted].join(":");
}

export function decryptEncryptedFieldV2(ciphertext: string, masterKey: string): string {
  assertNonEmptyMasterKey(masterKey);

  const parts = ciphertext.split(":");
  const [prefix, ivHex, authTagHex, encrypted] = parts;
  if (prefix !== V2_PREFIX || !ivHex || !authTagHex || encrypted === undefined || parts.length !== 4) {
    throw new Error("Invalid ciphertext v2 format");
  }

  if (
    !/^[0-9a-f]{24}$/i.test(ivHex)
    || !/^[0-9a-f]{32}$/i.test(authTagHex)
    || !/^(?:[0-9a-f]{2})*$/i.test(encrypted)
  ) {
    throw new Error("Invalid ciphertext v2 encoding");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
    throw new Error("Invalid ciphertext v2 metadata");
  }

  const decipher = createDecipheriv(ALGORITHM, deriveV2Key(masterKey), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
