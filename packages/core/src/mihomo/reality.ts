export function isRealityPublicKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function normalizeRealityShortId(input: unknown): string | null {
  const raw = (() => {
    if (typeof input === "string") return input;
    if (typeof input === "number" || typeof input === "bigint") return String(input);
    return "";
  })().trim();
  if (!raw) return null;

  let normalized = raw;
  if (normalized.startsWith("0x") || normalized.startsWith("0X")) {
    normalized = normalized.slice(2);
  }

  normalized = normalized.replace(/[\s:_-]/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-fA-F]+$/.test(normalized)) return null;

  normalized = normalized.toLowerCase();
  if (normalized.length % 2 === 1) normalized = `0${normalized}`;
  if (normalized.length > 16) return null;

  return normalized;
}

