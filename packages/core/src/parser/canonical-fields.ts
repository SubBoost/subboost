import type { ParsedNode } from "@subboost/core/types/node";
import { normalizeCertificateFingerprint } from "@subboost/core/mihomo/certificate-fingerprint";

type FieldPath = readonly string[];

interface AliasRule {
  types?: readonly string[];
  canonical: FieldPath;
  aliases: readonly FieldPath[];
}

const CLIENT_FINGERPRINT_TYPES = ["vmess", "vless", "trojan", "anytls"] as const;
const PACKET_ENCODING_TYPES = ["vmess", "vless"] as const;
const GRPC_SERVICE_NAME_TYPES = ["vmess", "vless", "trojan"] as const;

export const PROTOCOL_FIELD_ALIAS_RULES: readonly AliasRule[] = [
  {
    types: ["vless"],
    canonical: ["reality-opts", "public-key"],
    aliases: [
      ["reality-opts", "pbk"],
      ["reality-opts", "publicKey"],
      ["reality-opts", "public_key"],
      ["pbk"],
      ["public-key"],
      ["publicKey"],
      ["public_key"],
    ],
  },
  {
    types: ["vless"],
    canonical: ["reality-opts", "short-id"],
    aliases: [
      ["reality-opts", "sid"],
      ["reality-opts", "shortId"],
      ["reality-opts", "short_id"],
      ["sid"],
      ["short-id"],
      ["shortId"],
      ["short_id"],
      ["shortid"],
    ],
  },
  {
    types: CLIENT_FINGERPRINT_TYPES,
    canonical: ["client-fingerprint"],
    aliases: [["fp"], ["fingerprint"], ["clientFingerprint"]],
  },
  {
    types: PACKET_ENCODING_TYPES,
    canonical: ["packet-encoding"],
    aliases: [["packetEncoding"], ["packet_encoding"], ["packetencoding"]],
  },
  {
    types: GRPC_SERVICE_NAME_TYPES,
    canonical: ["grpc-opts", "grpc-service-name"],
    aliases: [
      ["grpc-opts", "serviceName"],
      ["grpc-opts", "service_name"],
      ["grpc-opts", "service-name"],
      ["serviceName"],
      ["service_name"],
      ["service-name"],
      ["servicename"],
      ["grpc-service-name"],
    ],
  },
  {
    types: ["wireguard"],
    canonical: ["private-key"],
    aliases: [["privatekey"], ["privateKey"], ["private_key"]],
  },
  {
    types: ["wireguard"],
    canonical: ["public-key"],
    aliases: [["publickey"], ["publicKey"], ["public_key"], ["peer-public-key"], ["peerPublicKey"]],
  },
  {
    types: ["wireguard"],
    canonical: ["pre-shared-key"],
    aliases: [["presharedkey"], ["preshared-key"], ["preSharedKey"], ["pre_shared_key"], ["psk"]],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function pathEquals(a: FieldPath, b: FieldPath): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function getPath(record: Record<string, unknown>, path: FieldPath): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function ensureParent(record: Record<string, unknown>, path: FieldPath): Record<string, unknown> | null {
  let current = record;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (isRecord(next)) {
      const cloned = { ...next };
      current[key] = cloned;
      current = cloned;
      continue;
    }
    const created: Record<string, unknown> = {};
    current[key] = created;
    current = created;
  }
  return current;
}

function setPath(record: Record<string, unknown>, path: FieldPath, value: unknown): void {
  const parent = ensureParent(record, path);
  const key = path[path.length - 1];
  if (!parent || !key) return;
  parent[key] = value;
}

function deletePath(record: Record<string, unknown>, path: FieldPath): void {
  let current: unknown = record;
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current)) return;
    current = current[key];
  }
  if (!isRecord(current)) return;
  delete current[path[path.length - 1]];
}

export function pickAliasValue(record: Record<string, unknown>, aliases: readonly FieldPath[]): unknown {
  for (const path of aliases) {
    const value = getPath(record, path);
    if (hasValue(value)) return value;
  }
  return undefined;
}

function ruleApplies(rule: AliasRule, type: string): boolean {
  return !rule.types || rule.types.includes(type);
}

function normalizeTlsVerification(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return !value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return true;
  if (["1", "true", "yes", "on"].includes(normalized)) return false;
  return undefined;
}

function canonicalizeSkipCertVerify(record: Record<string, unknown>): void {
  if (hasValue(record["skip-cert-verify"])) return;

  const direct = pickAliasValue(record, [
    ["allowInsecure"],
    ["allow_insecure"],
    ["allow-insecure"],
    ["allowinsecure"],
    ["insecure"],
  ]);
  if (hasValue(direct)) {
    record["skip-cert-verify"] = direct;
    for (const key of ["allowInsecure", "allow_insecure", "allow-insecure", "allowinsecure", "insecure"]) {
      delete record[key];
    }
    return;
  }

  const tlsVerification = normalizeTlsVerification(record["tls-verification"]);
  if (tlsVerification !== undefined) {
    record["skip-cert-verify"] = tlsVerification;
    delete record["tls-verification"];
  }
}

export function canonicalizeParsedNode<T extends ParsedNode | Record<string, unknown>>(node: T): T {
  if (!isRecord(node)) return node;
  const type = typeof node.type === "string" ? node.type.trim().toLowerCase() : "";
  const out: Record<string, unknown> = { ...node };
  const hasCertificateFingerprint = normalizeCertificateFingerprint(out.fingerprint) !== null;

  for (const rule of PROTOCOL_FIELD_ALIAS_RULES) {
    if (!ruleApplies(rule, type)) continue;
    // A certificate hash is an independent TLS field, not a client fingerprint alias.
    const aliases = hasCertificateFingerprint
      ? rule.aliases.filter((alias) => !pathEquals(alias, ["fingerprint"]))
      : rule.aliases;
    const value = pickAliasValue(out, [rule.canonical, ...aliases]);
    if (!hasValue(value)) continue;
    setPath(out, rule.canonical, value);
    for (const alias of aliases) {
      if (!pathEquals(alias, rule.canonical)) deletePath(out, alias);
    }
  }

  canonicalizeSkipCertVerify(out);

  return out as T;
}
