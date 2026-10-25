import type { ParsedNode } from "@subboost/core/types/node";
import { splitWsPathEarlyData } from "@subboost/core/parser/ws-early-data";
import { isMihomoEchQueryServerName, isStandardBase64String } from "./ech";
import { isRealityPublicKey, normalizeRealityShortId } from "./reality";
import { isVlessMlkemEncryption } from "./vless-encryption";
import { normalizeXhttpFields } from "./xhttp";
import { normalizeProtocolFields } from "./protocol-fields";
import { normalizeCertificateFingerprint } from "./certificate-fingerprint";
import { getNodeEndpointError } from "../node-endpoint";
import { MIHOMO_STRING_SCALAR_FIELDS, normalizeMihomoStringScalar } from "./string-scalar";

const WIREGUARD_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const SSH_SERVER_FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}=?$/;
const BOOLEAN_PROXY_FIELDS = new Set([
  "udp",
  "tls",
  "skip-cert-verify",
  "tfo",
  "fast-open",
  "mptcp",
  "reuse",
  "disable-sni",
  "reduce-rtt",
  "authenticated-length",
  "global-padding",
  "udp-over-tcp",
]);
const CLIENT_FINGERPRINT_PROXY_TYPES = new Set(["vmess", "vless", "trojan", "anytls", "trusttunnel"]);
const CLIENT_FINGERPRINT_ALIASES = new Set(["chrome", "firefox", "safari", "ios", "android", "edge", "random", "none"]);
const UNSUPPORTED_MIHOMO_PROXY_TYPES = new Set(["socks4", "h2-connect", "trust-tunnel", "external"]);
const INVALID_MIHOMO_NODE_FLAG = "_subboost-invalid-mihomo-node";
const REQUIRED_STRING_FIELDS_BY_TYPE: Record<string, string[]> = {
  ss: ["cipher", "password"],
  ssr: ["cipher", "password", "protocol", "obfs"],
  vmess: ["uuid"],
  vless: ["uuid"],
  trojan: ["password"],
  anytls: ["password"],
  hysteria2: ["password"],
  snell: ["psk"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseBoolish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeClientFingerprintAlias(value: unknown): string | null {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized || !CLIENT_FINGERPRINT_ALIASES.has(normalized)) return null;
  return normalized;
}

function normalizeWireGuardKey(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized || !WIREGUARD_KEY_PATTERN.test(normalized)) return null;
  return normalized;
}

function normalizePemPrivateKey(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized || !/^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(normalized)) return null;
  return normalized;
}

function isAsciiAlphaNumericOrHyphen(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    const ok = (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || (char >= "0" && char <= "9") || char === "-";
    if (!ok) return false;
  }
  return true;
}

function isBase64Token(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    const ok =
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      (char >= "0" && char <= "9") ||
      char === "+" ||
      char === "/" ||
      char === "=";
    if (!ok) return false;
  }
  return true;
}

function findWhitespaceIndex(value: string): number {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i].trim() === "") return i;
  }
  return -1;
}

function isSupportedSshHostKeyType(value: string): boolean {
  if (value === "ssh-ed25519" || value === "ssh-rsa" || value === "ssh-dss") return true;
  if (["ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521"].includes(value)) return true;
  return value.startsWith("ssh-ecdsa-") && isAsciiAlphaNumericOrHyphen(value.slice("ssh-ecdsa-".length));
}

function isSshHostKey(value: string): boolean {
  const typeEnd = findWhitespaceIndex(value);
  if (typeEnd <= 0) return false;
  const keyType = value.slice(0, typeEnd);
  if (!isSupportedSshHostKeyType(keyType)) return false;

  const rest = value.slice(typeEnd).trimStart();
  if (!rest) return false;
  const keyEnd = findWhitespaceIndex(rest);
  const key = keyEnd === -1 ? rest : rest.slice(0, keyEnd);
  return isBase64Token(key);
}

function normalizeSshHostKeys(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keys = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => isSshHostKey(item));
  return keys.length > 0 ? keys : undefined;
}

function normalizeSshServerFingerprint(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized || !SSH_SERVER_FINGERPRINT_PATTERN.test(normalized)) return null;
  return normalized;
}

export { isStandardBase64String } from "./ech";

export function normalizeMihomoRealityPublicKey(input: unknown): string | null {
  const value = normalizeString(input);
  if (!value || !isRealityPublicKey(value)) return null;
  return value;
}

export function isMihomoSupportedProxyNode(node: unknown): boolean {
  if (!isPlainObject(node)) return false;
  const type = typeof node.type === "string" ? node.type : "";
  if (node[INVALID_MIHOMO_NODE_FLAG]) return false;
  if (!type || UNSUPPORTED_MIHOMO_PROXY_TYPES.has(type)) return false;
  if (getNodeEndpointError(node)) return false;
  try {
    normalizeProtocolFields(node);
  } catch {
    return false;
  }

  const requiredFields = REQUIRED_STRING_FIELDS_BY_TYPE[type] || [];
  for (const field of requiredFields) {
    if (!normalizeString(normalizeMihomoStringScalar(node[field]))) return false;
  }

  if (type === "wireguard") {
    if (!normalizeWireGuardKey(node["private-key"])) return false;
    for (const key of ["public-key", "pre-shared-key"]) {
      if (Object.prototype.hasOwnProperty.call(node, key) && node[key] !== undefined && !normalizeWireGuardKey(node[key])) {
        return false;
      }
    }
    if (Array.isArray(node.peers) && node.peers.some((peer) => !isPlainObject(peer) ||
      !normalizeWireGuardKey(peer["public-key"]) ||
      (peer["pre-shared-key"] !== undefined && !normalizeWireGuardKey(peer["pre-shared-key"])))) return false;
  }

  if (type === "ssh" && !normalizeString(normalizeMihomoStringScalar(node.password)) && !normalizePemPrivateKey(node["private-key"])) {
    return false;
  }
  if (type === "ssh" && hasOwn(node, "host-key") && node["host-key"] !== undefined &&
    !(Array.isArray(node["host-key"]) && node["host-key"].length === 0) && !normalizeSshHostKeys(node["host-key"])) return false;

  if (!isSupportedSsPlugin(node)) return false;

  if (type === "vless") {
    if (hasOwn(node, "reality-opts") && node["reality-opts"] !== undefined && sanitizeRealityOpts(node["reality-opts"]) === undefined) {
      return false;
    }

    if (String(node.network ?? "") === "xhttp") {
      const xhttp = normalizeXhttpOptsForGeneration(node["xhttp-opts"]);
      if (xhttp.invalid) return false;
    }
  }

  return true;
}

function normalizeAlpn(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const protocols = value
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return protocols.length > 0 ? protocols : undefined;
  }

  if (!Array.isArray(value)) return undefined;
  const protocols = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return protocols.length > 0 ? protocols : undefined;
}

function sanitizeEchOpts(value: unknown): unknown {
  if (!isPlainObject(value)) return undefined;

  const out: Record<string, unknown> = {};
  const explicitQueryServerName = normalizeString(value["query-server-name"]);
  for (const [key, raw] of Object.entries(value)) {
    if (key.startsWith("_")) continue;

    if (key === "enable") {
      const normalized = parseBoolish(raw);
      if (normalized !== undefined) out[key] = normalized;
      continue;
    }

    if (key === "config") {
      const config = normalizeString(raw);
      if (config && isStandardBase64String(config)) {
        out[key] = config;
      } else if (config && !explicitQueryServerName && isMihomoEchQueryServerName(config)) {
        out["query-server-name"] = config;
      }
      continue;
    }

    if (key === "query-server-name") {
      if (explicitQueryServerName) out[key] = explicitQueryServerName;
      continue;
    }

    out[key] = raw;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeRealitySupport(out: Record<string, unknown>): void {
  if (!hasOwn(out, "support-x25519mlkem768")) return;
  const support = parseBoolish(out["support-x25519mlkem768"]);
  if (support === undefined) delete out["support-x25519mlkem768"];
  else out["support-x25519mlkem768"] = support;
}

function sanitizeRealityOpts(value: unknown): unknown {
  if (!isPlainObject(value)) return undefined;

  const out: Record<string, unknown> = { ...value };
  const publicKey = normalizeMihomoRealityPublicKey(out["public-key"]);
  if (!publicKey) return undefined;
  out["public-key"] = publicKey;
  sanitizeRealitySupport(out);

  const shortId = normalizeRealityShortId(out["short-id"]);
  if (shortId) out["short-id"] = shortId;
  else delete out["short-id"];

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeWsOpts(value: unknown): unknown {
  if (!isPlainObject(value)) return undefined;

  const out: Record<string, unknown> = { ...value };
  const isHttpUpgrade = parseBoolish(out["v2ray-http-upgrade"]) === true;

  if (isHttpUpgrade) {
    out["v2ray-http-upgrade"] = true;
    delete out["early-data-header-name"];
    delete out["max-early-data"];
    delete out["_v2ray-http-upgrade-ed"];
  }

  const path = normalizeString(out.path);
  if (path) {
    const { path: wsPath, earlyData } = splitWsPathEarlyData(path);
    out.path = wsPath;

    if (earlyData !== undefined) {
      if (!isHttpUpgrade && !hasOwn(out, "early-data-header-name") && !hasOwn(out, "max-early-data")) {
        out["early-data-header-name"] = "Sec-WebSocket-Protocol";
        out["max-early-data"] = earlyData;
      }
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeDownloadRealityOpts(
  value: unknown
): { value?: Record<string, unknown>; invalid: boolean } {
  if (!isPlainObject(value)) return { invalid: true };

  const out: Record<string, unknown> = { ...value };
  const rawPublicKey = normalizeString(out["public-key"]);
  if (!rawPublicKey) {
    if (out["public-key"] === "") {
      return { value: { "public-key": "" }, invalid: false };
    }
    return { invalid: true };
  }

  const publicKey = normalizeMihomoRealityPublicKey(rawPublicKey);
  if (!publicKey) return { invalid: true };
  out["public-key"] = publicKey;
  sanitizeRealitySupport(out);

  const shortId = normalizeRealityShortId(out["short-id"]);
  if (shortId) out["short-id"] = shortId;
  else delete out["short-id"];

  return { value: out, invalid: false };
}

function normalizeXhttpOptsForGeneration(
  value: unknown
): { value?: Record<string, unknown>; invalid: boolean } {
  if (!isPlainObject(value)) return { invalid: false };

  let out: Record<string, unknown>;
  try {
    out = normalizeXhttpFields(value);
  } catch {
    return { invalid: true };
  }
  const mode = normalizeString(out.mode)?.toLowerCase();
  const downloadSettings = isPlainObject(out["download-settings"])
    ? { ...(out["download-settings"] as Record<string, unknown>) }
    : undefined;

  if (mode === "stream-one" && downloadSettings) return { invalid: true };

  if (hasOwn(out, "ech-opts")) {
    const echOpts = sanitizeEchOpts(out["ech-opts"]);
    if (echOpts === undefined) delete out["ech-opts"];
    else out["ech-opts"] = echOpts;
  }

  if (downloadSettings) {
    if (hasOwn(downloadSettings, "ech-opts")) {
      const echOpts = sanitizeEchOpts(downloadSettings["ech-opts"]);
      if (echOpts === undefined) delete downloadSettings["ech-opts"];
      else downloadSettings["ech-opts"] = echOpts;
    }

    if (hasOwn(downloadSettings, "reality-opts")) {
      const reality = sanitizeDownloadRealityOpts(downloadSettings["reality-opts"]);
      if (reality.invalid) return { invalid: true };
      if (reality.value) downloadSettings["reality-opts"] = reality.value;
    }

    out["download-settings"] = downloadSettings;
  }

  return { value: out, invalid: false };
}

function isSupportedSsPlugin(node: Record<string, unknown>): boolean {
  if (node.type !== "ss") return true;
  const plugin = normalizeString(node.plugin)?.toLowerCase();
  if (!plugin || (plugin !== "v2ray-plugin" && plugin !== "xray-plugin")) return true;

  const opts = isPlainObject(node["plugin-opts"]) ? node["plugin-opts"] : undefined;
  const mode = normalizeString(opts?.mode)?.toLowerCase();
  return !mode || mode === "websocket" || mode === "ws";
}

function sanitizeVlessEncryption(value: unknown): unknown {
  const encryption = normalizeString(value);
  if (!encryption) return undefined;
  if (encryption === "none") return encryption;
  if (!encryption.startsWith("mlkem768x25519plus")) return encryption;
  return isVlessMlkemEncryption(encryption) ? encryption : undefined;
}

export function normalizeMihomoVlessForGeneration(node: Record<string, unknown>): Record<string, unknown> {
  if (node.type !== "vless") return node;

  const copy: Record<string, unknown> = { ...node };
  const hasRealityField = hasOwn(copy, "reality-opts") && copy["reality-opts"] !== undefined;
  const realityOpts = hasRealityField ? sanitizeRealityOpts(copy["reality-opts"]) : undefined;

  if (hasRealityField) {
    if (!realityOpts) {
      copy[INVALID_MIHOMO_NODE_FLAG] = true;
    } else {
      copy["reality-opts"] = realityOpts;
      if (copy.tls !== true) copy.tls = true;
      if (!normalizeString(copy["client-fingerprint"])) {
        copy["client-fingerprint"] = "chrome";
      }
    }
  }

  if (String(copy.network ?? "") === "xhttp" && hasOwn(copy, "xhttp-opts")) {
    const xhttp = normalizeXhttpOptsForGeneration(copy["xhttp-opts"]);
    if (xhttp.invalid) {
      copy[INVALID_MIHOMO_NODE_FLAG] = true;
    } else if (xhttp.value) {
      copy["xhttp-opts"] = xhttp.value;
    } else {
      delete copy["xhttp-opts"];
    }
  }

  return copy;
}

export function sanitizeMihomoProxyNode(node: ParsedNode | Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(node)) return node as Record<string, unknown>;

  let copy: Record<string, unknown>;
  try {
    copy = normalizeProtocolFields(node);
  } catch {
    return { ...node, [INVALID_MIHOMO_NODE_FLAG]: true };
  }

  for (const field of MIHOMO_STRING_SCALAR_FIELDS) {
    if (copy[field] === undefined || copy[field] === null) continue;
    const value = normalizeMihomoStringScalar(copy[field]);
    if (value === undefined) copy[INVALID_MIHOMO_NODE_FLAG] = true;
    else copy[field] = value;
  }

  for (const key of BOOLEAN_PROXY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(copy, key)) continue;
    const normalized = parseBoolish(copy[key]);
    if (normalized === undefined) delete copy[key];
    else copy[key] = normalized;
  }

  if (Object.prototype.hasOwnProperty.call(copy, "alpn")) {
    const alpn = normalizeAlpn(copy.alpn);
    if (alpn) copy.alpn = alpn;
    else delete copy.alpn;
  }

  if (Object.prototype.hasOwnProperty.call(copy, "ech-opts")) {
    const echOpts = sanitizeEchOpts(copy["ech-opts"]);
    if (echOpts === undefined) delete copy["ech-opts"];
    else copy["ech-opts"] = echOpts;
  }

  if (Object.prototype.hasOwnProperty.call(copy, "ws-opts")) {
    const wsOpts = sanitizeWsOpts(copy["ws-opts"]);
    if (wsOpts === undefined) delete copy["ws-opts"];
    else copy["ws-opts"] = wsOpts;
  }

  if (copy.type === "https") {
    copy.type = "http";
    if (copy.tls !== false) copy.tls = true;
  }

  const type = typeof copy.type === "string" ? copy.type : "";
  if (Object.prototype.hasOwnProperty.call(copy, "fingerprint")) {
    const clientFingerprint = normalizeClientFingerprintAlias(copy.fingerprint);
    if (clientFingerprint) {
      if (CLIENT_FINGERPRINT_PROXY_TYPES.has(type) && !copy["client-fingerprint"]) {
        copy["client-fingerprint"] = clientFingerprint;
      }
      delete copy.fingerprint;
    } else {
      const certificateFingerprint = normalizeCertificateFingerprint(copy.fingerprint);
      if (certificateFingerprint) copy.fingerprint = certificateFingerprint;
      else delete copy.fingerprint;
    }
  }

  if (type === "vless") {
    const normalized = normalizeMihomoVlessForGeneration(copy);
    Object.keys(copy).forEach((key) => delete copy[key]);
    Object.assign(copy, normalized);

    if (Object.prototype.hasOwnProperty.call(copy, "encryption")) {
      const encryption = sanitizeVlessEncryption(copy.encryption);
      if (encryption === undefined) delete copy.encryption;
      else copy.encryption = encryption;
    }
  }

  if (type === "wireguard") {
    for (const key of ["private-key", "public-key", "pre-shared-key"]) {
      if (!Object.prototype.hasOwnProperty.call(copy, key)) continue;
      const keyValue = normalizeWireGuardKey(copy[key]);
      if (keyValue) copy[key] = keyValue;
      else delete copy[key];
    }

  }

  if (type === "ssh" && Object.prototype.hasOwnProperty.call(copy, "private-key")) {
    const privateKey = normalizePemPrivateKey(copy["private-key"]);
    if (privateKey) copy["private-key"] = privateKey;
    else {
      delete copy["private-key"];
      delete copy["private-key-passphrase"];
    }
  }

  if (type === "ssh" && Object.prototype.hasOwnProperty.call(copy, "host-key") && copy["host-key"] !== undefined) {
    const hostKeys = normalizeSshHostKeys(copy["host-key"]);
    if (hostKeys) copy["host-key"] = hostKeys;
    else if (!Array.isArray(copy["host-key"]) || copy["host-key"].length > 0) {
      copy[INVALID_MIHOMO_NODE_FLAG] = true;
      delete copy["host-key"];
    }
  }

  if (type === "ssh" && Object.prototype.hasOwnProperty.call(copy, "server-fingerprint")) {
    const fingerprint = normalizeSshServerFingerprint(copy["server-fingerprint"]);
    if (fingerprint) copy["server-fingerprint"] = fingerprint;
    else delete copy["server-fingerprint"];
  }

  return copy;
}
