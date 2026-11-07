import { normalizeTailscaleNodeFields } from "./tailscale";

export function normalizeWireGuardReserved(value: unknown): number[] | undefined {
  if (typeof value === "string" && /^[A-Za-z0-9+/]{4}$/.test(value.trim())) {
    return Array.from(atob(value.trim()), char => char.charCodeAt(0));
  }
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  if (parts.length !== 3) return undefined;
  const numbers = parts.map(item => typeof item === "number" ? item :
    typeof item === "string" && /^\d+$/.test(item.trim()) ? Number(item.trim()) : NaN);
  return numbers.every(item => Number.isInteger(item) && item >= 0 && item <= 255) ? numbers : undefined;
}

/** Normalize import aliases and saved nodes using the same target fields. */
export function normalizeProtocolFields(node: Record<string, unknown>): Record<string, unknown> {
  if (node.type === "tailscale") return normalizeTailscaleNodeFields(node);
  const out = { ...node };
  if (out.type === "wireguard") {
    const raw = out["persistent-keepalive"] ?? out.keepalive ?? out.persistent_keepalive ?? out.persistentKeepalive;
    if (raw !== undefined) {
      const number = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
      if (!Number.isInteger(number) || number < 0 || number > 65535) throw new Error("WireGuard persistent-keepalive 无效");
      out["persistent-keepalive"] = number;
    }
    for (const key of ["keepalive", "persistent_keepalive", "persistentKeepalive"]) delete out[key];
    if (out.reserved !== undefined) {
      const reserved = normalizeWireGuardReserved(out.reserved);
      if (reserved) out.reserved = reserved;
      else delete out.reserved;
    }
    if (Array.isArray(out.peers)) out.peers = out.peers.map(peer => {
      if (!peer || typeof peer !== "object" || Array.isArray(peer)) return peer;
      const copy = { ...peer } as Record<string, unknown>;
      if (copy.reserved !== undefined) {
        const reserved = normalizeWireGuardReserved(copy.reserved);
        if (reserved) copy.reserved = reserved;
        else delete copy.reserved;
      }
      return copy;
    });
  }
  if (out.type === "snell") {
    const fields = { "shadow-tls-version": "version", "shadow-tls-sni": "host", "shadow-tls-password": "password" };
    const existing = out["obfs-opts"];
    if (Object.keys(fields).some(key => out[key] !== undefined) &&
      (existing === undefined || (existing && typeof existing === "object" && !Array.isArray(existing) &&
        (existing as Record<string, unknown>).mode === "shadow-tls"))) {
      const aliases = Object.fromEntries(Object.entries(fields).filter(([key]) => out[key] !== undefined).map(([key, target]) => [target, out[key]]));
      out["obfs-opts"] = { mode: "shadow-tls", ...aliases, ...(existing as Record<string, unknown> | undefined) };
    }
    for (const key of Object.keys(fields)) delete out[key];
  }
  return out;
}
