// Mihomo weakly typed string fields accept integers, never arbitrary objects.
export const MIHOMO_STRING_SCALAR_FIELDS = new Set([
  "password", "username", "psk", "auth-str", "token", "private-key-passphrase", "obfs-password",
]);

export function normalizeMihomoStringScalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return undefined;
}
