import { parseBoolish } from "./boolish";
import { normalizeMihomoStringScalar } from "./string-scalar";

export const TAILSCALE_STRING_FIELDS = ["hostname", "auth-key", "control-url", "state-dir", "exit-node"] as const;
export const TAILSCALE_BOOLEAN_FIELDS = ["ephemeral", "udp", "accept-routes", "exit-node-allow-lan-access"] as const;

export function isValidTailscaleControlUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
}

/**
 * Normalize the modeled Tailscale outbound fields and return a copy.
 * Unknown fields stay untouched; SubBoost never contacts the control server or checks the key.
 */
export function normalizeTailscaleNodeFields(node: Record<string, unknown>): Record<string, unknown> {
  const out = { ...node };
  for (const field of TAILSCALE_STRING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    if (out[field] === undefined || out[field] === null) {
      delete out[field];
      continue;
    }
    const value = normalizeMihomoStringScalar(out[field]);
    if (value === undefined) throw new Error(`Tailscale ${field} 必须是字符串`);
    out[field] = value;
  }
  const controlUrl = out["control-url"];
  if (typeof controlUrl === "string" && controlUrl !== "" && !isValidTailscaleControlUrl(controlUrl)) {
    throw new Error("Tailscale control-url 必须是有效的 HTTP 或 HTTPS 地址");
  }
  for (const field of TAILSCALE_BOOLEAN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    if (out[field] === undefined || out[field] === null) {
      delete out[field];
      continue;
    }
    const value = parseBoolish(out[field]);
    if (value === undefined) throw new Error(`Tailscale ${field} 必须是布尔值`);
    out[field] = value;
  }
  return out;
}

/** Mihomo's directory for an omitted or empty state-dir, relative to its home directory. */
export const TAILSCALE_DEFAULT_STATE_DIR = "tailscale";
/** tsnet's control server when control-url is omitted. */
export const TAILSCALE_DEFAULT_CONTROL_URL = "https://controlplane.tailscale.com";

/**
 * Conservative comparison key for a state directory. Only straightforward relative spellings
 * (`./`, repeated or trailing separators) are folded; absolute paths, symlinks, case and drive
 * semantics are left to the client runtime.
 */
export function tailscaleStateDirComparisonKey(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return TAILSCALE_DEFAULT_STATE_DIR;
  if (raw.startsWith("/") || raw.startsWith("~") || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) return raw;
  const segments = raw.split("/").filter((segment) => segment !== "" && segment !== ".");
  return segments.length ? segments.join("/") : TAILSCALE_DEFAULT_STATE_DIR;
}

/**
 * Representation used only for comparisons: runtime-equivalent defaults are omitted.
 * `ephemeral` and `udp` are plain booleans in Mihomo, so `false` equals omission; the pointer
 * preferences `accept-routes` and `exit-node-allow-lan-access` keep explicit `false`.
 */
export function tailscaleComparisonFields(node: Record<string, unknown>): Record<string, unknown> {
  const out = { ...node };
  const stateDir = tailscaleStateDirComparisonKey(out["state-dir"]);
  if (stateDir === TAILSCALE_DEFAULT_STATE_DIR) delete out["state-dir"];
  else out["state-dir"] = stateDir;
  const controlUrl = typeof out["control-url"] === "string" ? out["control-url"].trim().replace(/\/+$/, "") : "";
  if (!controlUrl || controlUrl.toLowerCase() === TAILSCALE_DEFAULT_CONTROL_URL) delete out["control-url"];
  for (const key of ["ephemeral", "udp"]) if (out[key] === false) delete out[key];
  return out;
}
