/** Normalize a full-certificate SHA256 fingerprint, not a client uTLS name or HPKP pin. */
export function normalizeCertificateFingerprint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const withoutPrefix = raw
    .replace(/^sha256\s+fingerprint\s*=\s*/i, "")
    .replace(/^sha256[:=]\s*/i, "");
  const compact = withoutPrefix.replace(/:/g, "").toLowerCase();
  return /^[A-Fa-f0-9]{64}$/.test(compact) ? compact : null;
}
