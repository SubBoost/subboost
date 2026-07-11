const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DNS_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export interface MihomoEchOpts {
  enable: true;
  config?: string;
  "query-server-name"?: string;
}

export function isStandardBase64String(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length % 4 === 0 && STANDARD_BASE64_PATTERN.test(trimmed);
}

export function isMihomoEchQueryServerName(value: string): boolean {
  const trimmed = value.trim();
  const hostname = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (!hostname || hostname.length > 253 || !hostname.includes(".") || !/[A-Za-z]/.test(hostname)) return false;

  return hostname.split(".").every((label) => label.length <= 63 && DNS_LABEL_PATTERN.test(label));
}

export function buildMihomoEchOptsFromShareValue(value: unknown): MihomoEchOpts {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return { enable: true };
  if (isStandardBase64String(normalized)) return { enable: true, config: normalized };
  if (isMihomoEchQueryServerName(normalized)) {
    return { enable: true, "query-server-name": normalized };
  }
  return { enable: true };
}
